import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';
import { seedDemoData } from '../../src/server/db/seed';
import { setRazorpayFetch, verifyRazorpayCheckout, verifyRazorpayWebhook, normalizeRazorpayEvent } from '../../src/server/lib/razorpay';

/**
 * Razorpay adapter against a fake Razorpay HTTP API (no network). The adapter's requests are captured and the
 * provider's webhooks are signed with the configured webhook secret exactly as Razorpay signs them.
 * Live verification needs a merchant account and is NOT covered here.
 */
const KEY_ID = 'rzp_test_localfixture';
const KEY_SECRET = 'test-secret-key-for-fixture-only';
const WEBHOOK_SECRET = 'test-secret-webhook-for-fixture-only';
const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
let orderSeq = 0;

let t: TestApp;
beforeAll(async () => {
  setRazorpayFetch(async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ url, body, auth: String((init?.headers as Record<string, string>).authorization) });
    if (url.endsWith('/orders')) return new Response(JSON.stringify({ id: `order_fixture${++orderSeq}`, amount: body.amount, currency: 'INR', status: 'created' }), { status: 200 });
    if (/\/payments\/.+\/refund$/.test(url)) return new Response(JSON.stringify({ id: 'rfnd_fixture1', status: 'pending' }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
  t = await makeApp({ PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET });
  await seedDemoData(t.ctx);
});
afterAll(async () => { setRazorpayFetch(null); await t.close(); });

const sign = (body: string) => createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
async function webhook(body: object, eventId: string, signature?: string) {
  const raw = JSON.stringify(body);
  return t.app.inject({ method: 'POST', url: '/api/v1/payments/webhook/razorpay', payload: raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature ?? sign(raw), 'x-razorpay-event-id': eventId } });
}

describe('Razorpay adapter', () => {
  it('verifies webhook and checkout signatures', () => {
    const raw = '{"event":"payment.captured"}';
    expect(verifyRazorpayWebhook(WEBHOOK_SECRET, raw, sign(raw))).toBe(true);
    expect(verifyRazorpayWebhook(WEBHOOK_SECRET, raw, sign(raw + ' '))).toBe(false);
    expect(verifyRazorpayWebhook(WEBHOOK_SECRET, raw, undefined)).toBe(false);
    const sig = createHmac('sha256', KEY_SECRET).update('order_1|pay_1').digest('hex');
    expect(verifyRazorpayCheckout(KEY_SECRET, 'order_1', 'pay_1', sig)).toBe(true);
    expect(verifyRazorpayCheckout(KEY_SECRET, 'order_1', 'pay_2', sig)).toBe(false);
    expect(normalizeRazorpayEvent('{"event":"subscription.charged","payload":{}}', 'e1').type).toBe('ignored');
  });

  it('checkout → Razorpay order → signed capture webhook → paid order → refund → signed refund webhook', async () => {
    const u = await signup(t, 'Rzp Buyer');
    const report = await u.c.get('/api/v1/products/report-complete-vedic');
    await u.c.put('/api/v1/cart/items', { variantId: report.variants[0].id, quantity: 1 });
    const order = await u.c.post('/api/v1/checkout', { idempotencyKey: 'rzp-order-0001' });
    expect(order.checkout.checkoutPath).toBe(`/pay/razorpay/${order.checkout.paymentId}`);
    expect(order.checkout.isSimulated).toBe(false);

    // The server created a Razorpay order for the server-side total, authenticated with the key pair.
    const create = calls.find((c) => c.url.endsWith('/orders'))!;
    expect(create.body.amount).toBe(order.order.totalPaise);
    expect(create.auth).toBe(`Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`);
    const cfg = await u.c.get(`/api/v1/payments/${order.checkout.paymentId}/razorpay`);
    expect(cfg.keyId).toBe(KEY_ID);
    expect(JSON.stringify(cfg)).not.toContain(KEY_SECRET);

    // A forged checkout signature is rejected and changes nothing.
    const forged = await u.c.req('POST', `/api/v1/payments/${order.checkout.paymentId}/razorpay/verify`, { razorpay_order_id: cfg.orderId, razorpay_payment_id: 'pay_x', razorpay_signature: 'bad' });
    expect(forged.status).toBe(400);
    const goodSig = createHmac('sha256', KEY_SECRET).update(`${cfg.orderId}|pay_fixture1`).digest('hex');
    const verified = await u.c.post(`/api/v1/payments/${order.checkout.paymentId}/razorpay/verify`, { razorpay_order_id: cfg.orderId, razorpay_payment_id: 'pay_fixture1', razorpay_signature: goodSig });
    expect(verified.verified).toBe(true);
    // Still not paid: only the webhook is authoritative.
    expect((await u.c.get(`/api/v1/payments/${order.checkout.paymentId}`)).payment.status).toBe('created');

    const captured = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_fixture1', order_id: cfg.orderId, amount: order.order.totalPaise, notes: {} } } } };
    expect((await webhook(captured, 'evt_cap_1', 'not-a-signature')).statusCode).toBe(401);
    const ok = await webhook(captured, 'evt_cap_1');
    expect(JSON.parse(ok.body).status).toBe('processed');
    expect(JSON.parse((await webhook(captured, 'evt_cap_1')).body).status).toBe('duplicate');
    const paid = await u.c.get(`/api/v1/orders/${order.order.id}`);
    expect(paid.payment.status).toBe('succeeded');
    expect(paid.order.status).not.toBe('pending_payment');

    // Refund: admin approval asks Razorpay to refund the captured payment id; completion comes by webhook.
    await u.c.post(`/api/v1/orders/${order.order.id}/refund-request`, { reason: 'Changed my mind about the report.' });
    const admin = await signup(t, 'Rzp Admin');
    await makeAdmin(t, admin.userId);
    const refunds = await admin.c.get('/api/v1/admin/refunds');
    const r = refunds.refunds.find((x: { payment: { id: string } }) => x.payment.id === order.checkout.paymentId);
    await admin.c.post(`/api/v1/admin/refunds/${r.id}/decide`, { approve: true, note: 'Within policy' });
    const refundCall = calls.find((c) => c.url.endsWith('/payments/pay_fixture1/refund'))!;
    expect(refundCall.body.amount).toBe(r.amountPaise);
    expect((refundCall.body.notes as Record<string, string>).nakshatra_refund_id).toBe(r.id);
    expect((await u.c.get(`/api/v1/payments/${order.checkout.paymentId}`)).payment.status).toBe('succeeded');

    const processed = { event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_fixture1', payment_id: 'pay_fixture1', amount: r.amountPaise, notes: refundCall.body.notes } } } };
    expect(JSON.parse((await webhook(processed, 'evt_ref_1')).body).status).toBe('processed');
    const after = await u.c.get(`/api/v1/payments/${order.checkout.paymentId}`);
    expect(['refunded', 'partially_refunded']).toContain(after.payment.status);
  });

  it('the development simulator is not reachable when Razorpay is configured', async () => {
    const u = await signup(t, 'Rzp NoSim');
    const res = await u.c.req('POST', '/api/v1/payments/dev/00000000-0000-0000-0000-000000000000/simulate', { outcome: 'succeeded' });
    expect(res.status).toBe(404);
    const devHook = await t.app.inject({ method: 'POST', url: '/api/v1/payments/webhook/dev_simulator', payload: '{}', headers: { 'content-type': 'application/json' } });
    expect(devHook.statusCode).toBe(404);
  });
});
