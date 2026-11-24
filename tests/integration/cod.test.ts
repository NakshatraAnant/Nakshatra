import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';

let t: TestApp;
let admin: Awaited<ReturnType<typeof signup>>;
beforeAll(async () => {
  t = await makeApp();
  admin = await signup(t, 'Cod Admin', { birth: false });
  await makeAdmin(t, admin.userId);
});
afterAll(async () => { await t.close(); });

const ADDRESS = { name: 'Tara Iyer', phone: '+91 98765 43210', line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };
let skuN = 0;
async function product(stock: number, price = 49900) {
  const sku = `TEE-${Date.now()}-${skuN++}`;
  const { product } = await admin.c.post('/api/v1/admin/merch/products', { slug: `tee-${Date.now()}-${skuN}`, title: 'Archetype tee', description: 'Cotton', variants: [{ sku, name: 'M', pricePaise: price, stockOnHand: stock }] }, 201);
  const [v] = await t.ctx.db.select().from(s.merchVariants).where(eq(s.merchVariants.productId, product.id));
  return v;
}
const variant = async (id: string) => (await t.ctx.db.select().from(s.merchVariants).where(eq(s.merchVariants.id, id)))[0];
const move = (id: string, to: string, extra: Record<string, string> = {}) => admin.c.post(`/api/v1/admin/merch/orders/${id}/transition`, { to, ...extra });
let key = 0;
const draft = (c: Awaited<ReturnType<typeof signup>>['c'], variantId: string, quantity = 1, address = ADDRESS) =>
  c.req('POST', '/api/v1/merch/orders', { items: [{ variantId, quantity }], address, idempotencyKey: `cod-test-${Date.now()}-${key++}` });

describe('Cash-on-delivery merch', () => {
  it('runs the full lifecycle; unpaid until delivered; inventory reserved, deducted and never oversold', async () => {
    const u = await signup(t, 'Cod Customer', { birth: false });
    const v = await product(3, 50000);
    const d = await draft(u.c, v.id, 2);
    expect(d.status).toBe(201);
    const o = d.body.order;
    expect(o.status).toBe('draft');
    expect(o.subtotalPaise).toBe(100000);
    expect(o.shippingPaise).toBe(0); // free from ₹999
    expect(o.address.phone).toBe('9876543210');
    expect(o.payment).toMatchObject({ method: 'cash_on_delivery', status: 'not_due' });
    expect((await variant(v.id)).reserved).toBe(0);

    const placed = (await u.c.post(`/api/v1/merch/orders/${o.id}/place`)).order;
    expect(placed.status).toBe('pending_confirmation');
    expect(placed.payment.status).toBe('due_on_delivery');
    expect((await variant(v.id)).reserved).toBe(2);
    // Placing twice is harmless.
    expect((await u.c.post(`/api/v1/merch/orders/${o.id}/place`)).order.status).toBe('pending_confirmation');
    expect((await variant(v.id)).reserved).toBe(2);

    // A second customer cannot reserve more than what is left.
    const other = await signup(t, 'Cod Other', { birth: false });
    const d2 = (await draft(other.c, v.id, 1)).body.order;
    const d3 = (await draft(other.c, v.id, 1)).body.order;
    await other.c.post(`/api/v1/merch/orders/${d2.id}/place`);
    expect((await other.c.req('POST', `/api/v1/merch/orders/${d3.id}/place`)).status).toBe(409);

    // Customers can't advance fulfilment; staff can't skip steps.
    expect((await u.c.req('POST', `/api/v1/admin/merch/orders/${o.id}/transition`, { to: 'confirmed' })).status).toBe(403);
    expect((await admin.c.req('POST', `/api/v1/admin/merch/orders/${o.id}/transition`, { to: 'delivered' })).status).toBe(409);
    await move(o.id, 'confirmed', { note: 'Confirmed by phone' });
    await move(o.id, 'processing');
    await move(o.id, 'packed');
    expect((await admin.c.req('POST', `/api/v1/admin/merch/orders/${o.id}/transition`, { to: 'dispatched' })).status).toBe(400); // courier required
    await move(o.id, 'dispatched', { courierName: 'India Post', trackingRef: 'EE123456789IN' });
    let v2 = await variant(v.id);
    expect(v2.stockOnHand).toBe(1);
    expect(v2.reserved).toBe(1); // the other customer's unit
    expect((await u.c.req('POST', `/api/v1/merch/orders/${o.id}/cancel`)).status).toBe(409); // too late
    await move(o.id, 'out_for_delivery');
    let mine = (await u.c.get(`/api/v1/merch/orders/${o.id}`)).order;
    expect(mine.payment.status).toBe('due_on_delivery');
    expect(mine.trackingRef).toBe('EE123456789IN');
    await move(o.id, 'delivered');
    mine = (await u.c.get(`/api/v1/merch/orders/${o.id}`)).order;
    expect(mine.payment.status).toBe('collected');
    expect(mine.timeline.map((e: { status: string }) => e.status)).toEqual(['draft', 'pending_confirmation', 'confirmed', 'processing', 'packed', 'dispatched', 'out_for_delivery', 'delivered']);
    expect(mine.canReturn).toBe(true);

    // Return → returned (restock) → refunded (recorded by staff).
    expect((await u.c.req('POST', `/api/v1/merch/orders/${o.id}/return`, { reason: '' })).status).toBe(400);
    await u.c.post(`/api/v1/merch/orders/${o.id}/return`, { reason: 'Wrong size' });
    await move(o.id, 'returned', { note: 'Parcel received back' });
    v2 = await variant(v.id);
    expect(v2.stockOnHand).toBe(3);
    await move(o.id, 'refunded', { note: 'UPI refund ref 1234' });
    mine = (await u.c.get(`/api/v1/merch/orders/${o.id}`)).order;
    expect(mine.payment.status).toBe('refunded');
    const audits = await t.ctx.db.select().from(s.auditLogs).where(eq(s.auditLogs.targetId, o.id));
    expect(audits.filter((x) => x.action === 'cod.transition').length).toBe(8);
  });

  it('cancelling before dispatch releases stock; RTO restocks and is never marked paid', async () => {
    const u = await signup(t, 'Cod Canceller', { birth: false });
    const v = await product(2, 29900);
    const a = (await draft(u.c, v.id, 1)).body.order;
    expect(a.shippingPaise).toBe(4900);
    await u.c.post(`/api/v1/merch/orders/${a.id}/place`);
    await move(a.id, 'confirmed');
    await u.c.post(`/api/v1/merch/orders/${a.id}/cancel`, { reason: 'Changed my mind' });
    expect((await variant(v.id)).reserved).toBe(0);

    const b = (await draft(u.c, v.id, 1)).body.order;
    await u.c.post(`/api/v1/merch/orders/${b.id}/place`);
    for (const st of ['confirmed', 'processing', 'packed']) await move(b.id, st);
    await move(b.id, 'dispatched', { courierName: 'Delhivery' });
    expect((await variant(v.id)).stockOnHand).toBe(1);
    await move(b.id, 'rto', { note: 'Customer unreachable' });
    expect((await variant(v.id)).stockOnHand).toBe(2);
    const mine = (await u.c.get(`/api/v1/merch/orders/${b.id}`)).order;
    expect(mine.payment.status).toBe('not_collected');
    expect(mine.trackingRef).toBeNull(); // nothing invented when staff didn't enter one
  });

  it('validates address and phone, protects against duplicates, caps open orders and order value', async () => {
    const u = await signup(t, 'Cod Validator', { birth: false });
    const v = await product(20);
    expect((await draft(u.c, v.id, 1, { ...ADDRESS, phone: '12345' })).status).toBe(400);
    expect((await draft(u.c, v.id, 1, { ...ADDRESS, pincode: '012345' })).status).toBe(400);
    expect((await draft(u.c, v.id, 1, { ...ADDRESS, state: 'Atlantis' })).status).toBe(400);
    expect((await draft(u.c, v.id, 6)).status).toBe(400);
    // Same idempotency key → the same draft, not a second order.
    const body = { items: [{ variantId: v.id, quantity: 1 }], address: ADDRESS, idempotencyKey: 'cod-dup-key-0001' };
    const first = await u.c.req('POST', '/api/v1/merch/orders', body);
    const again = await u.c.req('POST', '/api/v1/merch/orders', body);
    expect(again.body.order.id).toBe(first.body.order.id);
    // At most three open COD orders.
    for (let i = 0; i < 3; i++) { const o = (await draft(u.c, v.id, 1)).body.order; await u.c.post(`/api/v1/merch/orders/${o.id}/place`); }
    const fourth = (await draft(u.c, v.id, 1)).body.order;
    expect((await u.c.req('POST', `/api/v1/merch/orders/${fourth.id}/place`)).status).toBe(409);
    // Value cap.
    const pricey = await product(5, 400000);
    expect((await draft(u.c, pricey.id, 2)).status).toBe(400);
    // Someone else's order is invisible.
    const stranger = await signup(t, 'Cod Stranger', { birth: false });
    expect((await stranger.c.req('GET', `/api/v1/merch/orders/${first.body.order.id}`)).status).toBe(404);
    expect((await stranger.c.req('POST', `/api/v1/merch/orders/${first.body.order.id}/cancel`)).status).toBe(404);
  });

  it('stock adjustments are audited and can never drop below reserved units; module can be switched off', async () => {
    const u = await signup(t, 'Cod Stock', { birth: false });
    const v = await product(2);
    const o = (await draft(u.c, v.id, 2)).body.order;
    await u.c.post(`/api/v1/merch/orders/${o.id}/place`);
    expect((await admin.c.req('POST', `/api/v1/admin/merch/variants/${v.id}/stock`, { delta: -1, note: 'Damaged' })).status).toBe(409);
    await admin.c.post(`/api/v1/admin/merch/variants/${v.id}/stock`, { delta: 10, note: 'New batch' });
    expect((await variant(v.id)).stockOnHand).toBe(12);
    await admin.c.put('/api/v1/admin/flags/merch', { enabled: false, rolloutPercent: 100 });
    expect((await u.c.req('GET', '/api/v1/merch/products')).status).toBe(404);
    // Staff can still fulfil orders already placed.
    expect((await admin.c.req('POST', `/api/v1/admin/merch/orders/${o.id}/transition`, { to: 'confirmed' })).status).toBe(200);
    await admin.c.put('/api/v1/admin/flags/merch', { enabled: true, rolloutPercent: 100 });
  });
});
