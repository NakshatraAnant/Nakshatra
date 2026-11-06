import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { approveRefund, requestRefund } from '../../src/server/lib/payments';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const key = () => `k-${crypto.randomUUID()}`;

describe('Creator pages', () => {
  it('profile setup validates links and featured posts; listings collect interest; suspended pages disappear', async () => {
    const cr = await signup(t, 'Mira Creates', { birth: false });
    const fan = await signup(t, 'Mira Fan', { birth: false });
    expect((await cr.c.get('/api/v1/creators/me')).profile).toBeNull();
    const { post } = await cr.c.post('/api/v1/posts', { kind: 'thought', body: 'New zine out this week.', visibility: 'public' });
    const { post: other } = await fan.c.post('/api/v1/posts', { kind: 'thought', body: 'Not yours', visibility: 'public' });
    const base = { headline: 'Zines about small joys', about: 'I draw and write.', categories: ['art', 'writing'], tipsEnabled: true };
    expect((await cr.c.req('PUT', '/api/v1/creators/me', { ...base, links: [{ label: 'Site', url: 'javascript:alert(1)' }] })).status).toBe(400);
    expect((await cr.c.req('PUT', '/api/v1/creators/me', { ...base, links: [{ label: 'Site', url: 'http://example.com' }] })).status).toBe(400);
    expect((await cr.c.req('PUT', '/api/v1/creators/me', { ...base, featuredPostIds: [other.id] })).status).toBe(400);
    await cr.c.put('/api/v1/creators/me', { ...base, links: [{ label: 'Site', url: 'https://example.com/zines' }], featuredPostIds: [post.id] });

    expect((await fan.c.req('POST', '/api/v1/creators/me/offerings', { kind: 'digital', title: 'Nope' })).status).toBe(400);
    const { offering } = await cr.c.post('/api/v1/creators/me/offerings', { kind: 'digital', title: 'Monsoon zine PDF', pricePaise: 9900, status: 'listed' }, 201);
    await cr.c.post('/api/v1/creators/me/offerings', { kind: 'workshop', title: 'Draft workshop' }, 201);

    const page = await fan.c.get(`/api/v1/creators/${cr.handle}`);
    expect(page.creator).toMatchObject({ headline: 'Zines about small joys', isMe: false });
    expect(page.featured.map((p: { id: string }) => p.id)).toEqual([post.id]);
    expect(page.offerings.map((o: { title: string }) => o.title)).toEqual(['Monsoon zine PDF']); // drafts stay private
    expect(page.tips).toMatchObject({ enabled: true, available: true, testMode: true });
    await fan.c.post(`/api/v1/creators/${cr.handle}/offerings/${offering.id}/interest`, { on: true });
    const studio = await cr.c.get('/api/v1/creators/me');
    expect(studio.offerings.find((o: { id: string }) => o.id === offering.id).interested).toBe(1);
    expect(JSON.stringify(studio)).not.toContain(fan.userId); // interest is a count

    expect((await fan.c.get('/api/v1/creators')).creators.map((c: { handle: string }) => c.handle)).toContain(cr.handle);
    expect((await fan.c.req('POST', '/api/v1/reports', { targetType: 'creator', targetId: cr.userId, reason: 'spam' })).status).toBe(200);

    const mod = await signup(t, 'Creator Mod', { birth: false });
    await makeAdmin(t, mod.userId);
    expect((await fan.c.req('GET', '/api/v1/admin/creators')).status).toBe(403);
    await mod.c.post(`/api/v1/admin/creators/${cr.userId}/status`, { status: 'suspended', reason: 'Spam links' });
    expect((await fan.c.req('GET', `/api/v1/creators/${cr.handle}`)).status).toBe(404);
    expect((await cr.c.req('PUT', '/api/v1/creators/me', base)).status).toBe(403);
    expect((await cr.c.get('/api/v1/creators/me')).profile).toMatchObject({ status: 'suspended', tipsEnabled: false });
  });

  it('tips: verified payment → held ledger line (simulated, not counted as earnings); failures and refunds; no self-tips; daily cap', async () => {
    const cr = await signup(t, 'Tip Creator', { birth: false });
    const fan = await signup(t, 'Tip Fan', { birth: false });
    await cr.c.put('/api/v1/creators/me', { headline: 'Songs', tipsEnabled: true });
    expect((await cr.c.req('POST', `/api/v1/creators/${cr.handle}/tips`, { amountPaise: 5000, idempotencyKey: key() })).status).toBe(400);
    expect((await fan.c.req('POST', `/api/v1/creators/${cr.handle}/tips`, { amountPaise: 500, idempotencyKey: key() })).status).toBe(400);

    const r = await fan.c.post(`/api/v1/creators/${cr.handle}/tips`, { amountPaise: 10000, message: 'Loved the last song', showOnWall: true, idempotencyKey: key() });
    expect(r.split).toEqual({ grossPaise: 10000, feePaise: 1000, netPaise: 9000 });
    expect((await cr.c.get('/api/v1/creators/me')).tips).toHaveLength(0); // nothing until the payment is verified
    await fan.c.post(`/api/v1/payments/dev/${r.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const studio = await cr.c.get('/api/v1/creators/me');
    expect(studio.tips[0]).toMatchObject({ from: 'Tip Fan', amountPaise: 10000, simulated: true });
    expect(studio.earnings).toMatchObject({ heldNetPaise: 0, simulatedNetPaise: 9000, simulatedTips: 1, payoutsAvailable: false });
    expect((await fan.c.get(`/api/v1/creators/${cr.handle}`)).supporters).toEqual([expect.objectContaining({ name: 'Tip Fan', message: 'Loved the last song' })]);
    expect(JSON.stringify((await fan.c.get(`/api/v1/creators/${cr.handle}`)).supporters)).not.toContain('10000');
    const pay = await fan.c.get(`/api/v1/payments/${r.checkout.paymentId}`);
    expect(pay.payment.returnPath).toBe(`/creators/${cr.handle}`);

    // Replaying the same success event can't add a second ledger line.
    const lines = () => t.ctx.db.select().from(s.creatorLedger).where(eq(s.creatorLedger.creatorId, cr.userId));
    expect(await lines()).toHaveLength(1);

    const anon = await fan.c.post(`/api/v1/creators/${cr.handle}/tips`, { amountPaise: 5000, anonymous: true, showOnWall: true, idempotencyKey: key() });
    await fan.c.post(`/api/v1/payments/dev/${anon.checkout.paymentId}/simulate`, { outcome: 'failed' });
    expect((await cr.c.get('/api/v1/creators/me')).tips).toHaveLength(1);

    const refund = await requestRefund(t.ctx, t.ctx.db, { paymentId: r.checkout.paymentId, amountPaise: 10000, reason: 'Sent by mistake', requestedBy: fan.userId, idempotencyKey: key() });
    await approveRefund(t.ctx, refund.id, cr.userId);
    expect((await lines()).map((l) => l.netPaise).sort((a, b) => a - b)).toEqual([-9000, 9000]);
    expect((await cr.c.get('/api/v1/creators/me')).earnings.simulatedNetPaise).toBe(0);

    // Daily cap across all creators.
    await t.ctx.db.insert(s.creatorTips).values({ creatorId: cr.userId, fromUserId: fan.userId, amountPaise: 999000, status: 'paid' });
    expect((await fan.c.req('POST', `/api/v1/creators/${cr.handle}/tips`, { amountPaise: 5000, idempotencyKey: key() })).status).toBe(400);
  });

  it('tips are unavailable (not faked) when payments are off', async () => {
    const off = await makeApp({ PAYMENT_PROVIDER: 'none' });
    try {
      const cr = await signup(off, 'Offline Creator', { birth: false });
      const fan = await signup(off, 'Offline Fan', { birth: false });
      await cr.c.put('/api/v1/creators/me', { headline: 'Poems', tipsEnabled: true });
      expect((await fan.c.get(`/api/v1/creators/${cr.handle}`)).tips).toMatchObject({ enabled: true, available: false });
      expect((await fan.c.req('POST', `/api/v1/creators/${cr.handle}/tips`, { amountPaise: 5000, idempotencyKey: key() })).status).toBe(400);
      expect(await off.ctx.db.select().from(s.creatorTips)).toHaveLength(0);
    } finally { await off.close(); }
  });
});
