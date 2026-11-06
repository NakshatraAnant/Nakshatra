import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type U = Awaited<ReturnType<typeof signup>>;
let k = 0;
async function subscribe(u: U, planKey: string) {
  const r = await u.c.post('/api/v1/subscriptions', { planKey, idempotencyKey: `mem-test-${Date.now()}-${k++}` });
  await u.c.post(`/api/v1/payments/dev/${r.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
  return r.subscription.id as string;
}
const plus = async (u: U) => (await u.c.get('/api/v1/membership')).plus;

describe('Memberships and the entitlement engine', () => {
  it('benefits exist only after a confirmed payment; a failed payment grants nothing', async () => {
    const u = await signup(t, 'Mem Paid', { birth: false });
    const r = await u.c.post('/api/v1/subscriptions', { planKey: 'plus_monthly', idempotencyKey: 'mem-fail-0001' });
    expect((await plus(u)).active).toBe(false); // pending payment
    await u.c.post(`/api/v1/payments/dev/${r.checkout.paymentId}/simulate`, { outcome: 'failed' });
    expect((await plus(u)).active).toBe(false);
    await subscribe(u, 'plus_monthly');
    expect(await plus(u)).toMatchObject({ active: true, via: 'own', planKey: 'plus_monthly' });
  });

  it('Duo: one invite link, one seat; benefits follow the owner; removal ends them at once', async () => {
    const owner = await signup(t, 'Duo Owner', { birth: false });
    const partner = await signup(t, 'Duo Partner', { birth: false });
    const third = await signup(t, 'Duo Third', { birth: false });
    expect((await owner.c.req('POST', '/api/v1/membership/duo/invite')).status).toBe(403); // no Duo yet
    const subId = await subscribe(owner, 'duo_monthly');
    const { link } = await owner.c.post('/api/v1/membership/duo/invite');
    const token = link.split('/').pop();
    expect((await owner.c.req('POST', '/api/v1/membership/duo/join', { token })).status).toBe(400);
    await partner.c.post('/api/v1/membership/duo/join', { token });
    expect(await plus(partner)).toMatchObject({ active: true, via: 'shared', planKey: 'duo_monthly', sharedBy: 'Duo Owner' });
    // The same link can't be used twice, and the Duo is full.
    expect((await third.c.req('POST', '/api/v1/membership/duo/join', { token })).status).toBe(404);
    expect((await owner.c.req('POST', '/api/v1/membership/duo/invite')).status).toBe(409);
    // A seat holder can't also start their own paid plan by accident.
    expect((await partner.c.req('POST', '/api/v1/subscriptions', { planKey: 'plus_monthly', idempotencyKey: 'mem-dup-0001' })).status).toBe(409);
    // Owner's subscription ending ends the member's benefits.
    await t.ctx.db.update(s.subscriptions).set({ status: 'past_due' }).where(eq(s.subscriptions.id, subId));
    expect((await plus(partner)).active).toBe(false);
    await t.ctx.db.update(s.subscriptions).set({ status: 'active' }).where(eq(s.subscriptions.id, subId));
    expect((await plus(partner)).active).toBe(true);
    const me = await owner.c.get('/api/v1/membership');
    expect(me.duo.members).toHaveLength(1);
    await owner.c.post(`/api/v1/membership/duo/members/${me.duo.members[0].id}/end`);
    expect((await plus(partner)).active).toBe(false);
    // Strangers can't end someone else's seat.
    const { link: link2 } = await owner.c.post('/api/v1/membership/duo/invite');
    await third.c.post('/api/v1/membership/duo/join', { token: link2.split('/').pop() });
    const seat = (await owner.c.get('/api/v1/membership')).duo.members[0].id;
    expect((await partner.c.req('POST', `/api/v1/membership/duo/members/${seat}/end`)).status).toBe(404);
    await third.c.post('/api/v1/membership/duo/leave');
    expect((await plus(third)).active).toBe(false);
  });

  it('Student plan needs an institution email and staff approval', async () => {
    const plain = await signup(t, 'Not Student', { birth: false });
    expect((await plain.c.req('POST', '/api/v1/membership/student', { institution: 'Some College' })).status).toBe(400);
    expect((await plain.c.req('POST', '/api/v1/subscriptions', { planKey: 'student_monthly', idempotencyKey: 'mem-stu-0001' })).status).toBe(403);
    const stu = await signup(t, 'Real Student', { birth: false });
    const domainEmail = `stu${Date.now()}@iitm.ac.in`;
    await t.ctx.db.update(s.users).set({ email: domainEmail }).where(eq(s.users.id, stu.userId));
    await stu.c.post('/api/v1/membership/student', { institution: 'IIT Madras' });
    expect((await stu.c.req('POST', '/api/v1/membership/student', { institution: 'IIT Madras' })).status).toBe(409);
    expect((await stu.c.req('POST', '/api/v1/subscriptions', { planKey: 'student_monthly', idempotencyKey: 'mem-stu-0002' })).status).toBe(403);
    const admin = await signup(t, 'Mem Admin', { birth: false });
    await makeAdmin(t, admin.userId);
    const reqs = await admin.c.get('/api/v1/admin/student-verifications');
    const mine = reqs.requests.find((r: { name: string }) => r.name === 'Real Student');
    expect(mine.emailDomain).toBe('iitm.ac.in');
    expect((await stu.c.req('POST', `/api/v1/admin/student-verifications/${mine.id}`, { decision: 'approved' })).status).toBe(403);
    await admin.c.post(`/api/v1/admin/student-verifications/${mine.id}`, { decision: 'approved' });
    await subscribe(stu, 'student_monthly');
    expect((await plus(stu)).planKey).toBe('student_monthly');
  });

  it('Founding plan is capped and its price is locked for renewals', async () => {
    await t.ctx.db.update(s.subscriptionPlans).set({ seatCap: 1 }).where(eq(s.subscriptionPlans.key, 'founding_yearly'));
    const first = await signup(t, 'Founder One', { birth: false });
    const second = await signup(t, 'Founder Two', { birth: false });
    const subId = await subscribe(first, 'founding_yearly');
    expect((await second.c.req('POST', '/api/v1/subscriptions', { planKey: 'founding_yearly', idempotencyKey: 'mem-fnd-0001' })).status).toBe(409);
    expect((await second.c.get('/api/v1/membership')).plans.find((p: { key: string }) => p.key === 'founding_yearly').remaining).toBe(0);
    // A later price rise does not affect the founding member's renewal.
    await t.ctx.db.update(s.subscriptionPlans).set({ pricePaise: 299900 }).where(eq(s.subscriptionPlans.key, 'founding_yearly'));
    await t.ctx.db.update(s.subscriptions).set({ status: 'past_due' }).where(eq(s.subscriptions.id, subId));
    const renew = await first.c.post(`/api/v1/subscriptions/${subId}/renew`);
    expect(renew.checkout.amountPaise).toBe(149900);
  });
});
