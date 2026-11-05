import { and, eq, sql } from 'drizzle-orm';
import type { Executor, Tx } from '../db/client';
import { paymentEvents, payments, refunds } from '../db/schema';
import type { Ctx } from './context';
import { audit } from './context';
import { hmac, randomToken, safeEqual } from './crypto';
import { AppError, badRequest, conflict, notFound, unavailable } from './http';
import { createRazorpayOrder, createRazorpayRefund, normalizeRazorpayEvent, verifyRazorpayWebhook } from './razorpay';

/**
 * Payment boundary. Business modules create payments and register fulfilment
 * handlers; payment state changes ONLY through verified provider events
 * (signature-checked, idempotent by provider event id). The development
 * simulator produces events through the same verified path and is labelled as
 * such everywhere in the UI. No card data is ever handled by this application.
 */
export type PaymentPurpose = 'order' | 'booking' | 'subscription' | 'event' | 'vendor_milestone';
export type PaymentStatus = 'created' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';

const TRANSITIONS: Record<string, PaymentStatus[]> = {
  created: ['succeeded', 'failed', 'cancelled'],
  failed: ['succeeded', 'cancelled'],
  succeeded: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded', 'partially_refunded'],
  refunded: [],
  // A provider can confirm a payment after our order expired; the order handler then refunds it.
  cancelled: ['succeeded'],
};

export function canTransition(from: string, to: PaymentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface PaymentHandlers {
  onSucceeded: (ctx: Ctx, tx: Tx, payment: typeof payments.$inferSelect) => Promise<void>;
  onFailed?: (ctx: Ctx, tx: Tx, payment: typeof payments.$inferSelect) => Promise<void>;
  onRefunded?: (ctx: Ctx, tx: Tx, payment: typeof payments.$inferSelect, amountPaise: number) => Promise<void>;
}

const handlers = new Map<PaymentPurpose, PaymentHandlers>();
export function registerPaymentHandlers(purpose: PaymentPurpose, h: PaymentHandlers) {
  handlers.set(purpose, h);
}

export interface CheckoutInfo {
  paymentId: string;
  provider: string;
  amountPaise: number;
  status: string;
  /** For the dev simulator: in-app route to the labelled simulator page. */
  checkoutPath: string | null;
  isSimulated: boolean;
}

export async function createPayment(ctx: Ctx, db: Executor, p: { userId: string; purpose: PaymentPurpose; purposeId: string; amountPaise: number; idempotencyKey: string }): Promise<CheckoutInfo> {
  if (ctx.config.PAYMENT_PROVIDER === 'none') throw unavailable('Payments are not configured for this installation.');
  if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) throw badRequest('Amount must be a positive whole number of paise.');
  if (ctx.config.PAYMENT_PROVIDER === 'razorpay') return createRazorpayPayment(ctx, db, p);
  const existing = await db.select().from(payments).where(eq(payments.idempotencyKey, p.idempotencyKey));
  const row = existing[0] ?? (await db.insert(payments).values({
    userId: p.userId, purpose: p.purpose, purposeId: p.purposeId, amountPaise: p.amountPaise,
    provider: 'dev_simulator', providerRef: `devpay_${randomToken(9)}`, status: 'created', idempotencyKey: p.idempotencyKey,
  }).returning())[0];
  if (row.purposeId !== p.purposeId || row.amountPaise !== p.amountPaise) throw conflict('Idempotency key reused with different parameters.');
  return { paymentId: row.id, provider: row.provider, amountPaise: row.amountPaise, status: row.status, checkoutPath: `/pay/dev/${row.id}`, isSimulated: true };
}

/** Razorpay: create (or reuse) the payment row and a provider order; the browser then opens Razorpay Checkout. */
async function createRazorpayPayment(ctx: Ctx, db: Executor, p: { userId: string; purpose: PaymentPurpose; purposeId: string; amountPaise: number; idempotencyKey: string }): Promise<CheckoutInfo> {
  const existing = (await db.select().from(payments).where(eq(payments.idempotencyKey, p.idempotencyKey)))[0];
  if (existing) {
    if (existing.purposeId !== p.purposeId || existing.amountPaise !== p.amountPaise) throw conflict('Idempotency key reused with different parameters.');
    if (existing.providerRef) return { paymentId: existing.id, provider: 'razorpay', amountPaise: existing.amountPaise, status: existing.status, checkoutPath: `/pay/razorpay/${existing.id}`, isSimulated: false };
  }
  const row = existing ?? (await db.insert(payments).values({
    userId: p.userId, purpose: p.purpose, purposeId: p.purposeId, amountPaise: p.amountPaise, provider: 'razorpay', status: 'created', idempotencyKey: p.idempotencyKey,
  }).returning())[0];
  const order = await createRazorpayOrder(ctx.config, { amountPaise: p.amountPaise, receipt: row.id, notes: { nakshatra_payment_id: row.id, purpose: p.purpose } });
  if (order.amount !== p.amountPaise) throw new AppError(502, 'payment_provider_error', 'The payment provider returned an unexpected amount.');
  await db.update(payments).set({ providerRef: order.id, updatedAt: new Date() }).where(eq(payments.id, row.id));
  return { paymentId: row.id, provider: 'razorpay', amountPaise: p.amountPaise, status: row.status, checkoutPath: `/pay/razorpay/${row.id}`, isSimulated: false };
}

export function signWebhook(secret: string, body: string): string {
  return hmac(secret, body);
}

export interface ProviderEvent {
  id: string;
  type: 'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'refund.failed';
  providerRef: string;
  refundId?: string;
  amountPaise?: number;
}

/**
 * Processes a provider webhook. Verifies the signature, records the event once
 * (unique provider event id), applies a valid state transition and runs the
 * purpose handler — all in one transaction.
 */
export async function processWebhook(ctx: Ctx, provider: string, rawBody: string, signature: string | undefined, eventId?: string): Promise<{ status: 'processed' | 'duplicate' | 'ignored' }> {
  let valid: boolean;
  let event: ProviderEvent & { providerPaymentId?: string; failureReason?: string };
  if (provider === 'dev_simulator' && ctx.config.PAYMENT_PROVIDER === 'dev_simulator' && !ctx.config.isProd) {
    valid = Boolean(signature) && safeEqual(signWebhook(ctx.config.appSecret, rawBody), signature!);
    try { event = JSON.parse(rawBody); } catch { throw badRequest('Malformed webhook body'); }
  } else if (provider === 'razorpay' && ctx.config.PAYMENT_PROVIDER === 'razorpay' && ctx.config.RAZORPAY_WEBHOOK_SECRET) {
    valid = verifyRazorpayWebhook(ctx.config.RAZORPAY_WEBHOOK_SECRET, rawBody, signature);
    let n;
    try { n = normalizeRazorpayEvent(rawBody, eventId); } catch { throw badRequest('Malformed webhook body'); }
    if (!valid) throw new AppError(401, 'invalid_signature', 'Invalid webhook signature.');
    if (n.type === 'ignored' || !n.providerRef) return { status: 'ignored' };
    event = { id: n.id, type: n.type, providerRef: n.providerRef, refundId: n.refundId, amountPaise: n.amountPaise, providerPaymentId: n.providerPaymentId, failureReason: n.failureReason };
  } else {
    throw notFound('Webhook endpoint');
  }
  if (!valid) {
    ctx.log.warn({ provider, eventId: event?.id }, 'webhook signature verification failed');
    throw new AppError(401, 'invalid_signature', 'Invalid webhook signature.');
  }
  return ctx.db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.providerRef, event.providerRef))).for('update');
    const inserted = await tx.insert(paymentEvents).values({
      paymentId: payment?.id ?? null, provider, providerEventId: event.id, type: event.type, signatureValid: true,
      payload: event as unknown as Record<string, unknown>, fromStatus: payment?.status ?? null,
    }).onConflictDoNothing().returning({ id: paymentEvents.id });
    if (!inserted.length) return { status: 'duplicate' as const };
    if (!payment) return { status: 'ignored' as const };
    const h = handlers.get(payment.purpose as PaymentPurpose);

    if (event.type === 'payment.succeeded' || event.type === 'payment.failed') {
      const to: PaymentStatus = event.type === 'payment.succeeded' ? 'succeeded' : 'failed';
      if (!canTransition(payment.status, to)) {
        ctx.log.warn({ paymentId: payment.id, from: payment.status, to }, 'ignored invalid payment transition');
        return { status: 'ignored' as const };
      }
      const [updated] = await tx.update(payments).set({ status: to, updatedAt: new Date(), failureReason: to === 'failed' ? (event.failureReason ?? (provider === 'dev_simulator' ? 'Declined (simulated)' : 'Declined')) : null })
        .where(eq(payments.id, payment.id)).returning();
      await tx.update(paymentEvents).set({ toStatus: to }).where(eq(paymentEvents.id, inserted[0].id));
      if (to === 'succeeded') await h?.onSucceeded(ctx, tx, updated);
      else await h?.onFailed?.(ctx, tx, updated);
      return { status: 'processed' as const };
    }

    if (event.type === 'refund.succeeded' && event.refundId) {
      const [refund] = await tx.select().from(refunds).where(eq(refunds.id, event.refundId)).for('update');
      if (!refund || refund.status !== 'processing') return { status: 'ignored' as const };
      const newRefunded = payment.refundedPaise + refund.amountPaise;
      const to: PaymentStatus = newRefunded >= payment.amountPaise ? 'refunded' : 'partially_refunded';
      if (!canTransition(payment.status, to)) return { status: 'ignored' as const };
      const [updated] = await tx.update(payments).set({ status: to, refundedPaise: newRefunded, updatedAt: new Date() }).where(eq(payments.id, payment.id)).returning();
      await tx.update(refunds).set({ status: 'succeeded', updatedAt: new Date() }).where(eq(refunds.id, refund.id));
      await tx.update(paymentEvents).set({ toStatus: to }).where(eq(paymentEvents.id, inserted[0].id));
      await h?.onRefunded?.(ctx, tx, updated, refund.amountPaise);
      return { status: 'processed' as const };
    }
    if (event.type === 'refund.failed' && event.refundId) {
      await tx.update(refunds).set({ status: 'failed', updatedAt: new Date() }).where(and(eq(refunds.id, event.refundId), eq(refunds.status, 'processing')));
      return { status: 'processed' as const };
    }
    return { status: 'ignored' as const };
  });
}

/** Development simulator: emits a signed provider event through the real webhook path. */
export async function simulateOutcome(ctx: Ctx, paymentId: string, userId: string, outcome: 'succeeded' | 'failed') {
  if (ctx.config.PAYMENT_PROVIDER !== 'dev_simulator' || ctx.config.isProd) throw notFound('Simulator');
  const [p] = await ctx.db.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.userId, userId)));
  if (!p) throw notFound('Payment');
  const body = JSON.stringify({ id: `evt_${randomToken(12)}`, type: `payment.${outcome}`, providerRef: p.providerRef! } satisfies ProviderEvent);
  return processWebhook(ctx, 'dev_simulator', body, signWebhook(ctx.config.appSecret, body));
}

/** Requests a refund (state: requested). Approval and processing are separate, audited steps. */
export async function requestRefund(ctx: Ctx, db: Executor, p: { paymentId: string; amountPaise: number; reason: string; requestedBy: string; idempotencyKey: string }) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, p.paymentId));
  if (!payment) throw notFound('Payment');
  if (!['succeeded', 'partially_refunded'].includes(payment.status)) throw conflict('Only completed payments can be refunded.');
  const [{ pending }] = await db.select({ pending: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` }).from(refunds)
    .where(and(eq(refunds.paymentId, payment.id), sql`${refunds.status} in ('requested','approved','processing')`));
  if (p.amountPaise <= 0 || p.amountPaise + payment.refundedPaise + pending > payment.amountPaise) throw badRequest('Refund amount exceeds the refundable balance.');
  const existing = await db.select().from(refunds).where(eq(refunds.idempotencyKey, p.idempotencyKey));
  if (existing[0]) return existing[0];
  const [r] = await db.insert(refunds).values({
    paymentId: payment.id, amountPaise: p.amountPaise, reason: p.reason, status: 'requested', requestedBy: p.requestedBy, idempotencyKey: p.idempotencyKey,
  }).returning();
  return r;
}

/** Approves and executes a refund through the provider (dev simulator emits a signed refund event). */
export async function approveRefund(ctx: Ctx, refundId: string, adminId: string) {
  const [r] = await ctx.db.select().from(refunds).where(eq(refunds.id, refundId));
  if (!r) throw notFound('Refund');
  if (r.status !== 'requested') throw conflict(`Refund is already ${r.status}.`);
  const [payment] = await ctx.db.select().from(payments).where(eq(payments.id, r.paymentId));
  await ctx.db.update(refunds).set({ status: 'processing', decidedBy: adminId, updatedAt: new Date() }).where(eq(refunds.id, r.id));
  await audit(ctx.db, { actorId: adminId, action: 'refund.approve', targetType: 'refund', targetId: r.id, meta: { amountPaise: r.amountPaise } });
  if (payment.provider === 'dev_simulator') {
    const body = JSON.stringify({ id: `evt_${randomToken(12)}`, type: 'refund.succeeded', providerRef: payment.providerRef!, refundId: r.id, amountPaise: r.amountPaise } satisfies ProviderEvent);
    await processWebhook(ctx, 'dev_simulator', body, signWebhook(ctx.config.appSecret, body));
  }
  if (payment.provider === 'razorpay') {
    // Completion arrives via the signed refund.processed webhook; here we only ask Razorpay to start the refund.
    const [captured] = await ctx.db.select().from(paymentEvents).where(and(eq(paymentEvents.paymentId, payment.id), eq(paymentEvents.type, 'payment.succeeded')));
    const rzpPaymentId = (captured?.payload as { providerPaymentId?: string } | undefined)?.providerPaymentId;
    if (!rzpPaymentId) {
      await ctx.db.update(refunds).set({ status: 'failed', updatedAt: new Date() }).where(eq(refunds.id, r.id));
      throw conflict('The provider payment id for this payment is unknown; refund it from the Razorpay dashboard.');
    }
    try {
      await createRazorpayRefund(ctx.config, { razorpayPaymentId: rzpPaymentId, amountPaise: r.amountPaise, notes: { nakshatra_refund_id: r.id, nakshatra_order_ref: payment.providerRef ?? '' } });
    } catch (e) {
      await ctx.db.update(refunds).set({ status: 'failed', updatedAt: new Date() }).where(eq(refunds.id, r.id));
      throw e;
    }
  }
  const [after] = await ctx.db.select().from(refunds).where(eq(refunds.id, r.id));
  return after;
}

export async function rejectRefund(ctx: Ctx, refundId: string, adminId: string, note: string) {
  const [r] = await ctx.db.update(refunds).set({ status: 'rejected', decidedBy: adminId, updatedAt: new Date() })
    .where(and(eq(refunds.id, refundId), eq(refunds.status, 'requested'))).returning();
  if (!r) throw conflict('Refund cannot be rejected in its current state.');
  await audit(ctx.db, { actorId: adminId, action: 'refund.reject', targetType: 'refund', targetId: r.id, meta: { note } });
  return r;
}
