import { createHash, createHmac } from 'node:crypto';
import type { AppConfig } from '../config';
import { safeEqual } from './crypto';
import { AppError } from './http';

/**
 * Razorpay adapter (server side only; key secret never reaches the browser).
 * Orders API → Checkout (browser) → signed webhooks are the source of truth for payment state.
 * Docs: https://razorpay.com/docs/api/orders/ , /payments/refunds/ , /webhooks/
 */
const API = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 10_000;

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Tests replace the HTTP client; production always uses global fetch. */
export function setRazorpayFetch(f: Fetch | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

function creds(config: AppConfig) {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) throw new AppError(503, 'payments_unavailable', 'Razorpay is not configured.');
  return { id: config.RAZORPAY_KEY_ID, secret: config.RAZORPAY_KEY_SECRET };
}

async function call<T>(config: AppConfig, path: string, body: unknown): Promise<T> {
  const { id, secret } = creds(config);
  let res: Response;
  try {
    res = await fetchImpl(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError(503, 'payments_unavailable', 'The payment provider could not be reached. Please try again.');
  }
  const text = await res.text();
  if (!res.ok) {
    // Never echo provider error bodies to users; they can contain internal identifiers.
    throw new AppError(502, 'payment_provider_error', `The payment provider rejected the request (${res.status}).`);
  }
  return JSON.parse(text) as T;
}

export interface RazorpayOrder { id: string; amount: number; currency: string; status: string }

export function createRazorpayOrder(config: AppConfig, p: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
  return call<RazorpayOrder>(config, '/orders', { amount: p.amountPaise, currency: 'INR', receipt: p.receipt.slice(0, 40), notes: p.notes });
}

export function createRazorpayRefund(config: AppConfig, p: { razorpayPaymentId: string; amountPaise: number; notes: Record<string, string> }) {
  return call<{ id: string; status: string }>(config, `/payments/${encodeURIComponent(p.razorpayPaymentId)}/refund`, { amount: p.amountPaise, notes: p.notes });
}

/** Webhook signature: hex HMAC-SHA256 of the raw request body with the webhook secret (header X-Razorpay-Signature). */
export function verifyRazorpayWebhook(secret: string, rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  return safeEqual(createHmac('sha256', secret).update(rawBody).digest('hex'), signature);
}

/** Checkout signature: hex HMAC-SHA256 of `${order_id}|${payment_id}` with the key secret. */
export function verifyRazorpayCheckout(keySecret: string, orderId: string, paymentId: string, signature: string): boolean {
  return safeEqual(createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex'), signature);
}

export interface NormalizedEvent {
  id: string;
  type: 'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'refund.failed' | 'ignored';
  providerRef: string | null;
  providerPaymentId?: string;
  refundId?: string;
  amountPaise?: number;
  failureReason?: string;
}

interface RzpEntity { id: string; order_id?: string; payment_id?: string; amount?: number; notes?: Record<string, string> | unknown[]; error_description?: string }
interface RzpWebhook { event: string; payload?: { payment?: { entity: RzpEntity }; refund?: { entity: RzpEntity } } }

const notesOf = (e?: RzpEntity) => (e && e.notes && !Array.isArray(e.notes) ? (e.notes as Record<string, string>) : {});

/**
 * Maps a Razorpay webhook to the internal event shape. `eventId` comes from the X-Razorpay-Event-Id header;
 * if absent, a hash of the body is used so retries of the same delivery stay idempotent.
 */
export function normalizeRazorpayEvent(rawBody: string, eventId: string | undefined): NormalizedEvent {
  const body = JSON.parse(rawBody) as RzpWebhook;
  const id = eventId || `rzp_${createHash('sha256').update(rawBody).digest('hex').slice(0, 32)}`;
  const pay = body.payload?.payment?.entity;
  const ref = body.payload?.refund?.entity;
  switch (body.event) {
    case 'payment.captured':
    case 'order.paid':
      return { id, type: 'payment.succeeded', providerRef: pay?.order_id ?? null, providerPaymentId: pay?.id, amountPaise: pay?.amount };
    case 'payment.failed':
      return { id, type: 'payment.failed', providerRef: pay?.order_id ?? null, providerPaymentId: pay?.id, failureReason: pay?.error_description?.slice(0, 200) };
    case 'refund.processed':
      return { id, type: 'refund.succeeded', providerRef: notesOf(ref).nakshatra_order_ref ?? null, refundId: notesOf(ref).nakshatra_refund_id, amountPaise: ref?.amount };
    case 'refund.failed':
      return { id, type: 'refund.failed', providerRef: notesOf(ref).nakshatra_order_ref ?? null, refundId: notesOf(ref).nakshatra_refund_id };
    default:
      return { id, type: 'ignored', providerRef: pay?.order_id ?? null };
  }
}
