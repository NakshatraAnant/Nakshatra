import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { approveRefund, requestRefund } from '../../src/server/lib/payments';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const key = () => `k-${crypto.randomUUID()}`;
type U = Awaited<ReturnType<typeof signup>>;

describe('Paid circle tiers', () => {
  it('a pass opens members-only channels only after a verified payment, extends, expires, and refunds remove it', async () => {
    const owner = await signup(t, 'Pass Owner', { birth: false });
    const { circle } = await owner.c.post('/api/v1/circles', { name: 'Pass circle' });
    const join = async (n: string, role = 'member') => { const u = await signup(t, n, { birth: false }); await t.ctx.db.insert(s.groupMembers).values({ groupId: circle.id, userId: u.userId, role, status: 'active' }); return u; };
    const fan: U = await join('Pass Fan');
    const mod: U = await join('Pass Mod', 'moderator');
    const late: U = await join('Pass Late');

    const tier = (await owner.c.post(`/api/v1/circles/${circle.id}/tiers`, { name: 'Supporters' }, 201)).tier;
    expect((await mod.c.req('PATCH', `/api/v1/circles/${circle.id}/tiers/${tier.id}`, { pricePaise: 9900 })).status).toBe(403);
    expect((await owner.c.req('PATCH', `/api/v1/circles/${circle.id}/tiers/${tier.id}`, { pricePaise: 500 })).status).toBe(400);
    expect((await fan.c.req('POST', `/api/v1/circles/${circle.id}/tiers/${tier.id}/purchase`, { idempotencyKey: key() })).status).toBe(400); // not for sale yet
    await owner.c.patch(`/api/v1/circles/${circle.id}/tiers/${tier.id}`, { pricePaise: 9900 });
    const { channel } = await owner.c.post(`/api/v1/circles/${circle.id}/channels`, { name: 'Supporters lounge', tierId: tier.id }, 201);
    const sees = async (u: U) => (await u.c.get(`/api/v1/circles/${circle.id}/channels`)).channels.some((c: { id: string }) => c.id === channel.id);

    const tiers = await fan.c.get(`/api/v1/circles/${circle.id}/tiers`);
    expect(tiers.tiers[0]).toMatchObject({ name: 'Supporters', pricePaise: 9900 });
    expect(tiers).toMatchObject({ paymentsAvailable: true, passDays: 30, myTierId: null });
    expect((await owner.c.req('POST', `/api/v1/circles/${circle.id}/tiers/${tier.id}/purchase`, { idempotencyKey: key() })).status).toBe(400);

    const r = await fan.c.post(`/api/v1/circles/${circle.id}/tiers/${tier.id}/purchase`, { idempotencyKey: key() });
    expect(r.checkout.isSimulated).toBe(true);
    expect(await sees(fan)).toBe(false); // nothing until the payment is verified
    await fan.c.post(`/api/v1/payments/dev/${r.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    expect(await sees(fan)).toBe(true);
    const first = new Date((await fan.c.get(`/api/v1/circles/${circle.id}/tiers`)).myPassEndsAt);
    expect(first.getTime() - Date.now()).toBeGreaterThan(29 * 864e5);

    // Buying again extends from the current end.
    const again = await fan.c.post(`/api/v1/circles/${circle.id}/tiers/${tier.id}/purchase`, { idempotencyKey: key() });
    await fan.c.post(`/api/v1/payments/dev/${again.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const second = new Date((await fan.c.get(`/api/v1/circles/${circle.id}/tiers`)).myPassEndsAt);
    expect(Math.round((second.getTime() - first.getTime()) / 864e5)).toBe(30);

    const earnings = await owner.c.get(`/api/v1/circles/${circle.id}/earnings`);
    expect(earnings).toMatchObject({ passesSold: 2, heldNetPaise: 0, simulatedNetPaise: 2 * 8415, payoutsAvailable: false });
    expect((await mod.c.req('GET', `/api/v1/circles/${circle.id}/earnings`)).status).toBe(403);

    // An ended pass closes the channel again.
    await t.ctx.db.update(s.circleMemberTiers).set({ expiresAt: new Date(Date.now() - 1000) }).where(and(eq(s.circleMemberTiers.circleId, circle.id), eq(s.circleMemberTiers.userId, fan.userId)));
    expect(await sees(fan)).toBe(false);
    expect((await fan.c.get(`/api/v1/circles/${circle.id}/tiers`)).myTierId).toBeNull();

    // A refunded pass is taken away and the owner's share reversed.
    const lp = await late.c.post(`/api/v1/circles/${circle.id}/tiers/${tier.id}/purchase`, { idempotencyKey: key() });
    await late.c.post(`/api/v1/payments/dev/${lp.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    expect(await sees(late)).toBe(true);
    const refund = await requestRefund(t.ctx, t.ctx.db, { paymentId: lp.checkout.paymentId, amountPaise: 9900, reason: 'Changed my mind', requestedBy: late.userId, idempotencyKey: key() });
    await approveRefund(t.ctx, refund.id, owner.userId);
    expect(await sees(late)).toBe(false);
    expect((await owner.c.get(`/api/v1/circles/${circle.id}/earnings`)).simulatedNetPaise).toBe(2 * 8415);

    // Someone given a higher or equal tier can't buy it.
    await owner.c.put(`/api/v1/circles/${circle.id}/members/${late.userId}/tier`, { tierId: tier.id });
    expect((await late.c.req('POST', `/api/v1/circles/${circle.id}/tiers/${tier.id}/purchase`, { idempotencyKey: key() })).status).toBe(409);

    const exp = await fan.c.post('/api/v1/privacy/export', {});
    expect(exp.data.circleTierPasses.filter((p: { status: string }) => p.status === 'paid')).toHaveLength(2);
  });
});

describe('Paid creator unlocks', () => {
  it('unlock content reaches only the creator and paying members; refunds take it away', async () => {
    const cr = await signup(t, 'Unlock Creator', { birth: false });
    const fan = await signup(t, 'Unlock Fan', { birth: false });
    const other = await signup(t, 'Unlock Browser', { birth: false });
    await cr.c.put('/api/v1/creators/me', { headline: 'Recipes from home' });
    const secret = 'Grandma’s chutney: 2 green mangoes, jaggery…';
    expect((await cr.c.req('POST', '/api/v1/creators/me/offerings', { kind: 'workshop', title: 'Not unlockable', pricePaise: 4900, unlockContent: secret })).status).toBe(400);
    expect((await cr.c.req('POST', '/api/v1/creators/me/offerings', { kind: 'digital', title: 'Too cheap', pricePaise: 500, unlockContent: secret })).status).toBe(400);
    expect((await cr.c.req('POST', '/api/v1/creators/me/offerings', { kind: 'digital', title: 'Bad link', pricePaise: 4900, unlockLink: 'http://example.com/x' })).status).toBe(400);
    const { offering } = await cr.c.post('/api/v1/creators/me/offerings', { kind: 'digital', title: 'Chutney recipe card', pricePaise: 4900, unlockContent: secret, unlockLink: 'https://example.com/card.pdf', status: 'listed' }, 201);

    const page = async (u: typeof fan) => (await u.c.get(`/api/v1/creators/${cr.handle}`)).offerings.find((o: { id: string }) => o.id === offering.id);
    expect(await page(fan)).toMatchObject({ buyable: true, owned: false, unlock: null });
    expect(JSON.stringify(await fan.c.get(`/api/v1/creators/${cr.handle}`))).not.toContain('jaggery');

    const r = await fan.c.post(`/api/v1/creators/${cr.handle}/offerings/${offering.id}/purchase`, { idempotencyKey: key() });
    expect((await page(fan)).unlock).toBeNull();
    await fan.c.post(`/api/v1/payments/dev/${r.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    expect(await page(fan)).toMatchObject({ owned: true, unlock: { content: secret, link: 'https://example.com/card.pdf' } });
    expect(JSON.stringify(await other.c.get(`/api/v1/creators/${cr.handle}`))).not.toContain('jaggery');
    expect((await fan.c.req('POST', `/api/v1/creators/${cr.handle}/offerings/${offering.id}/purchase`, { idempotencyKey: key() })).status).toBe(409);
    expect((await cr.c.req('POST', `/api/v1/creators/${cr.handle}/offerings/${offering.id}/purchase`, { idempotencyKey: key() })).status).toBe(400);

    const mine = await fan.c.get('/api/v1/creators/unlocks/mine');
    expect(mine.unlocks[0]).toMatchObject({ title: 'Chutney recipe card', content: secret, simulated: true });
    const studio = await cr.c.get('/api/v1/creators/me');
    expect(studio.offerings.find((o: { id: string }) => o.id === offering.id)).toMatchObject({ unlocks: 1, buyable: true });
    expect(studio.earnings).toMatchObject({ heldNetPaise: 0, simulatedNetPaise: 4165 });

    // Archived offerings stay unlocked for buyers.
    await cr.c.patch(`/api/v1/creators/me/offerings/${offering.id}`, { status: 'archived' });
    expect((await fan.c.get('/api/v1/creators/unlocks/mine')).unlocks).toHaveLength(1);

    const refund = await requestRefund(t.ctx, t.ctx.db, { paymentId: r.checkout.paymentId, amountPaise: 4900, reason: 'Not as described', requestedBy: fan.userId, idempotencyKey: key() });
    await approveRefund(t.ctx, refund.id, cr.userId);
    expect((await fan.c.get('/api/v1/creators/unlocks/mine')).unlocks).toHaveLength(0);
    expect((await cr.c.get('/api/v1/creators/me')).earnings.simulatedNetPaise).toBe(0);
  });

  it('nothing can be bought when payments are off', async () => {
    const off = await makeApp({ PAYMENT_PROVIDER: 'none' });
    try {
      const owner = await signup(off, 'Offline Owner', { birth: false });
      const fan = await signup(off, 'Offline Buyer', { birth: false });
      const { circle } = await owner.c.post('/api/v1/circles', { name: 'Offline circle' });
      await off.ctx.db.insert(s.groupMembers).values({ groupId: circle.id, userId: fan.userId, role: 'member', status: 'active' });
      const tier = (await owner.c.post(`/api/v1/circles/${circle.id}/tiers`, { name: 'Paid' }, 201)).tier;
      await owner.c.patch(`/api/v1/circles/${circle.id}/tiers/${tier.id}`, { pricePaise: 9900 });
      expect((await fan.c.get(`/api/v1/circles/${circle.id}/tiers`)).paymentsAvailable).toBe(false);
      expect((await fan.c.req('POST', `/api/v1/circles/${circle.id}/tiers/${tier.id}/purchase`, { idempotencyKey: key() })).status).toBe(400);
      await owner.c.put('/api/v1/creators/me', { headline: 'Offline' });
      const { offering } = await owner.c.post('/api/v1/creators/me/offerings', { kind: 'digital', title: 'Offline card', pricePaise: 4900, unlockContent: 'x', status: 'listed' }, 201);
      expect((await fan.c.get(`/api/v1/creators/${owner.handle}`)).offerings[0]).toMatchObject({ buyable: false, paidUnlock: true });
      expect((await fan.c.req('POST', `/api/v1/creators/${owner.handle}/offerings/${offering.id}/purchase`, { idempotencyKey: key() })).status).toBe(400);
    } finally { await off.close(); }
  });
});
