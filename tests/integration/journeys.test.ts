import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { Client, makeAdmin, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { seedDemoData } from '../../src/server/db/seed';
import { runScheduledJobs } from '../../src/server/services/scheduler';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
  await seedDemoData(t.ctx);
});
afterAll(async () => { await t.close(); });

describe('Journey B — Bonds with consent and revocation', () => {
  it('invites, accepts, computes compatibility, shares, revokes and blocks access', async () => {
    const a = await signup(t, 'Anya');
    const b = await signup(t, 'Bilal', { birth: { date: '1990-12-03', time: '21:10' } });
    const created = await a.c.post('/api/v1/bonds', { kind: 'friend', invite: { handle: b.handle, shareScope: 'chart', requestScope: 'chart', message: 'Compare?' } });
    // Before acceptance the partner's chart is not available.
    expect((await a.c.req('GET', `/api/v1/bonds/${created.bond.id}/compatibility`)).status).toBe(403);
    expect((await b.c.req('GET', `/api/v1/bonds/${created.bond.id}`)).status).toBe(404);
    const list = await b.c.get('/api/v1/bonds');
    expect(list.invitations).toHaveLength(1);
    await b.c.post(`/api/v1/bonds/invitations/${list.invitations[0].id}/respond`, { accept: true, shareScope: 'chart' });
    const compat = await a.c.get(`/api/v1/bonds/${created.bond.id}/compatibility`);
    expect(compat.result.western.map((d: any) => d.key)).toEqual(['emotional', 'communication', 'growth', 'stability']);
    expect(compat.result.vedic.gunaMilan.total).toBeLessThanOrEqual(36);
    expect(compat.result.limitations.join(' ')).toMatch(/not measurements/);
    const share = await a.c.post(`/api/v1/bonds/${created.bond.id}/share-report`, { compatibilityId: compat.compatibilityId, to: { link: true } });
    const token = share.url.split('/').pop();
    const publicReport = await new Client(t.app).get(`/api/v1/shared-reports/link/${token}`);
    expect(publicReport.report.dimensions.length).toBe(4);
    expect(JSON.stringify(publicReport)).not.toMatch(/factors/);
    // Partner sees the bond and can compute from their side.
    expect((await b.c.get(`/api/v1/bonds/${created.bond.id}/compatibility`)).result.western.length).toBe(4);
    // Private notes are private to the author.
    await a.c.post(`/api/v1/bonds/${created.bond.id}/notes`, { body: 'note from Anya' });
    const bView = await b.c.get(`/api/v1/bonds/${created.bond.id}`);
    expect(bView.notes).toHaveLength(0);
    // Revoke → both sides lose access; shared link stops working.
    await b.c.post(`/api/v1/bonds/${created.bond.id}/revoke`);
    expect((await a.c.req('GET', `/api/v1/bonds/${created.bond.id}/compatibility`)).status).toBe(403);
    expect((await b.c.req('GET', `/api/v1/bonds/${created.bond.id}`)).status).toBe(404);
    expect((await new Client(t.app).req('GET', `/api/v1/shared-reports/link/${token}`)).status).toBe(404);
    const graph = await a.c.get('/api/v1/bonds/graph');
    expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('supports private bonds with self-entered data that only the owner can see', async () => {
    const a = await signup(t, 'Priv');
    const other = await signup(t, 'Stranger');
    const r = await a.c.post('/api/v1/bonds', { kind: 'family', private: { label: 'Mum', date: '1965-02-10', time: null, timePrecision: 'unknown', manual: { name: 'Jaipur', latitude: 26.91, longitude: 75.79 }, consentConfirmed: true } });
    const compat = await a.c.get(`/api/v1/bonds/${r.bond.id}/compatibility`);
    expect(compat.result.western.find((d: any) => d.key === 'emotional').missingData.join(' ')).toMatch(/uncertain|unknown/);
    expect((await other.c.req('GET', `/api/v1/bonds/${r.bond.id}`)).status).toBe(404);
  });
});

describe('Journey C — learning, quiz, certificate, achievement', () => {
  it('enrolls in a free course, completes lessons, passes quizzes and earns a certificate once', async () => {
    const u = await signup(t, 'Learner');
    const courses = await u.c.get('/api/v1/courses');
    const free = courses.courses.find((c: any) => c.pricePaise === 0);
    await u.c.post(`/api/v1/courses/${free.id}/enroll`);
    const detail = await u.c.get(`/api/v1/courses/${free.slug}`);
    let cert = null;
    for (const l of detail.lessons) {
      const lesson = await u.c.get(`/api/v1/lessons/${l.id}`);
      const done = await u.c.post(`/api/v1/lessons/${l.id}/complete`);
      if (lesson.quiz) {
        const wrong = await u.c.post(`/api/v1/quizzes/${lesson.quiz.id}/attempt`, { answers: lesson.quiz.questions.map(() => 9) });
        expect(wrong.passed).toBe(false);
        const [quiz] = await t.ctx.db.select().from(s.quizzes).where(eq(s.quizzes.id, lesson.quiz.id));
        const res = await u.c.post(`/api/v1/quizzes/${lesson.quiz.id}/attempt`, { answers: (quiz.questions as any[]).map((q) => q.answer) });
        expect(res.passed).toBe(true);
        cert = res.certificate ?? cert;
      }
      cert = done.certificate ?? cert;
    }
    expect(cert).not.toBeNull();
    const verify = await new Client(t.app).get(`/api/v1/certificates/${cert.serial}`);
    expect(verify.certificate.verified).toBe(true);
    const journey = await u.c.get('/api/v1/journey');
    const keys = journey.achievements.filter((a: any) => a.awardedAt).map((a: any) => a.key);
    expect(keys).toEqual(expect.arrayContaining(['first_lesson', 'scholar', 'course_complete', 'quiz_ace']));
    const certs = await t.ctx.db.select().from(s.certificates).where(eq(s.certificates.userId, u.userId));
    expect(certs).toHaveLength(1);
  });

  it('blocks paid lessons without an entitlement', async () => {
    const u = await signup(t, 'NoPay');
    const courses = await u.c.get('/api/v1/courses');
    const paid = courses.courses.find((c: any) => c.pricePaise > 0);
    const r = await u.c.post(`/api/v1/courses/${paid.id}/enroll`);
    expect(r.requiresPurchase).toBe(true);
    const detail = await u.c.get(`/api/v1/courses/${paid.slug}`);
    const locked = detail.lessons.find((l: any) => !l.isPreview);
    expect((await u.c.req('GET', `/api/v1/lessons/${locked.id}`)).status).toBe(403);
  });
});

describe('Journey D — dating lifecycle', () => {
  it('creates eligible profiles, matches mutually, messages, reports and unmatches', async () => {
    const delhi = (await new Client(t.app).get('/api/v1/places?q=New Delhi')).results[0].id;
    const a = await signup(t, 'Dia', { birth: { date: '1994-02-02' } });
    const b = await signup(t, 'Eshan', { birth: { date: '1993-09-09' } });
    const base = { intent: 'long_term', interests: ['music', 'travel'], placeId: delhi, ageMin: 25, ageMax: 40, maxDistanceKm: 50, acknowledgeSafety: true };
    await a.c.put('/api/v1/dating/profile', { ...base, gender: 'woman', interestedIn: ['man'], bio: 'Loves sunrise walks and old Hindi songs, slowly learning tarot.' });
    await b.c.put('/api/v1/dating/profile', { ...base, gender: 'man', interestedIn: ['woman'], bio: 'Weekend trekker, amateur astronomer, terrible cook.' });
    const discoverA = await a.c.get('/api/v1/dating/discover');
    const cand = discoverA.candidates.find((c: any) => c.userId === b.userId);
    expect(cand).toBeTruthy();
    expect(JSON.stringify(cand)).not.toMatch(/approx_lat|28\.6/);
    expect((await a.c.post('/api/v1/dating/actions', { targetId: b.userId, action: 'like' })).matched).toBe(false);
    const m = await b.c.post('/api/v1/dating/actions', { targetId: a.userId, action: 'like' });
    expect(m.matched).toBe(true);
    await a.c.post(`/api/v1/conversations/${m.conversationId}/messages`, { body: 'Hi Eshan!' });
    const msgs = await b.c.get(`/api/v1/conversations/${m.conversationId}/messages`);
    expect(msgs.messages.some((x: any) => x.body === 'Hi Eshan!')).toBe(true);
    const compat = await a.c.get(`/api/v1/dating/matches/${m.matchId}/compatibility`);
    expect(compat.dimensions.length).toBeGreaterThan(0);
    const third = await signup(t, 'Outsider');
    expect((await third.c.req('GET', `/api/v1/conversations/${m.conversationId}/messages`)).status).toBe(404);
    const msgId = msgs.messages.find((x: any) => x.body === 'Hi Eshan!').id;
    const rep = await b.c.post('/api/v1/reports', { targetType: 'message', targetId: msgId, reason: 'spam' });
    expect(rep.report.status).toBe('open');
    await b.c.post(`/api/v1/dating/matches/${m.matchId}/unmatch`);
    expect((await a.c.req('POST', `/api/v1/conversations/${m.conversationId}/messages`, { body: 'still there?' })).status).toBe(403);
  });

  it('enforces email verification and preference hard filters', async () => {
    const delhi = (await new Client(t.app).get('/api/v1/places?q=New Delhi')).results[0].id;
    const unverified = await signup(t, 'Unv', { verify: false });
    expect((await unverified.c.req('PUT', '/api/v1/dating/profile', { intent: 'dating', gender: 'man', interestedIn: ['woman'], placeId: delhi, ageMin: 20, ageMax: 30, maxDistanceKm: 10, acknowledgeSafety: true })).status).toBe(403);
  });
});

describe('Journey E — expert booking, payment, completion, accounting', () => {
  it('books real availability, pays through the labelled simulator, completes and reviews', async () => {
    const u = await signup(t, 'Client');
    const experts = await u.c.get('/api/v1/experts');
    const ex = experts.experts[0];
    expect(ex.isSample).toBe(true);
    const detail = await u.c.get(`/api/v1/experts/${ex.userId}`);
    const video = detail.services.find((x: any) => x.mode === 'video');
    expect(video.available).toBe(false);
    const chat = detail.services.find((x: any) => x.mode === 'chat');
    const avail = await u.c.get(`/api/v1/experts/${ex.userId}/availability?serviceId=${chat.id}&days=14`);
    expect(avail.slots.length).toBeGreaterThan(0);
    const slot = avail.slots[0];
    const booking = await u.c.post('/api/v1/bookings', { serviceId: chat.id, start: slot.start, idempotencyKey: 'booking-test-1', shareChart: true });
    expect(booking.checkout.isSimulated).toBe(true);
    // The same slot is now held and unavailable to others.
    const other = await signup(t, 'Other client');
    expect((await other.c.req('POST', '/api/v1/bookings', { serviceId: chat.id, start: slot.start, idempotencyKey: 'booking-test-2' })).status).toBe(409);
    // Idempotent retry returns the same booking.
    const retry = await u.c.post('/api/v1/bookings', { serviceId: chat.id, start: slot.start, idempotencyKey: 'booking-test-1' });
    expect(retry.booking.id).toBe(booking.booking.id);
    await u.c.post(`/api/v1/payments/dev/${booking.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const b1 = await u.c.get(`/api/v1/bookings/${booking.booking.id}`);
    expect(b1.booking.status).toBe('confirmed');
    expect(b1.booking.conversationId).toBeTruthy();
    expect(b1.payment.status).toBe('succeeded');
    // Simulate the session time passing, then the expert completes it.
    await t.ctx.db.update(s.bookings).set({ startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() - 1800000) }).where(eq(s.bookings.id, booking.booking.id));
    const expertUser = await t.ctx.db.select().from(s.users).where(eq(s.users.id, ex.userId));
    const ec = new Client(t.app);
    const cred = (await import('node:fs')).existsSync('.data/dev-credentials.json');
    void cred;
    // Log the expert in via a direct session for testing.
    const { sha256, randomToken } = await import('../../src/server/lib/crypto');
    const token = randomToken(32);
    await t.ctx.db.insert(s.sessions).values({ userId: expertUser[0].id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600000), mfaPassed: true });
    await ec.prime();
    ec.cookies.set('nk_session', token);
    const chartForExpert = await ec.get(`/api/v1/bookings/${booking.booking.id}/customer-chart`);
    expect(chartForExpert.vedic.input.latitude).toBeNull();
    await ec.post(`/api/v1/bookings/${booking.booking.id}/complete`);
    expect((await ec.req('GET', `/api/v1/bookings/${booking.booking.id}/customer-chart`)).status).toBe(403);
    await u.c.post(`/api/v1/bookings/${booking.booking.id}/review`, { rating: 5, body: 'Clear and kind.' });
    expect((await u.c.req('POST', `/api/v1/bookings/${booking.booking.id}/review`, { rating: 4 })).status).toBe(409);
    const analytics = await ec.get('/api/v1/expert/analytics');
    expect(analytics.earnings.completedPaise).toBe(Math.round(chat.pricePaise * 0.8));
  });

  it('refunds automatically when cancelled 24h+ in advance', async () => {
    const u = await signup(t, 'Canceller');
    const experts = await u.c.get('/api/v1/experts');
    const ex = experts.experts[1] ?? experts.experts[0];
    const detail = await u.c.get(`/api/v1/experts/${ex.userId}`);
    const chat = detail.services.find((x: any) => x.mode === 'chat');
    const avail = await u.c.get(`/api/v1/experts/${ex.userId}/availability?serviceId=${chat.id}&from=${DateTime.now().plus({ days: 3 }).toISODate()}&days=7`);
    const booking = await u.c.post('/api/v1/bookings', { serviceId: chat.id, start: avail.slots[0].start, idempotencyKey: 'cancel-test' });
    await u.c.post(`/api/v1/payments/dev/${booking.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const cancel = await u.c.post(`/api/v1/bookings/${booking.booking.id}/cancel`, { reason: 'Plans changed' });
    expect(cancel.refundEligible).toBe(true);
    const after = await u.c.get(`/api/v1/bookings/${booking.booking.id}`);
    expect(after.payment.status).toBe('refunded');
    expect(after.booking.status).toBe('refunded');
  });

  it('expires unpaid holds via the scheduler', async () => {
    const u = await signup(t, 'Holder');
    const experts = await u.c.get('/api/v1/experts');
    const detail = await u.c.get(`/api/v1/experts/${experts.experts[0].userId}`);
    const chat = detail.services.find((x: any) => x.mode === 'chat');
    const avail = await u.c.get(`/api/v1/experts/${experts.experts[0].userId}/availability?serviceId=${chat.id}&from=${DateTime.now().plus({ days: 5 }).toISODate()}&days=7`);
    const booking = await u.c.post('/api/v1/bookings', { serviceId: chat.id, start: avail.slots[0].start, idempotencyKey: 'hold-test' });
    await runScheduledJobs(t.ctx, new Date(Date.now() + 20 * 60000));
    const after = await u.c.get(`/api/v1/bookings/${booking.booking.id}`);
    expect(after.booking.status).toBe('expired');
  });
});

describe('Journey F — commerce, digital delivery and refunds', () => {
  it('buys a variant and a generated report, then refunds through admin approval', async () => {
    const u = await signup(t, 'Shopper');
    const list = await u.c.get('/api/v1/products?category=ritual_supplies');
    const diya = await u.c.get(`/api/v1/products/${list.products[0].slug}`);
    const variant = diya.variants[0];
    const stockBefore = variant.stock;
    await u.c.put('/api/v1/cart/items', { variantId: variant.id, quantity: 2 });
    const report = await u.c.get('/api/v1/products/report-complete-vedic');
    await u.c.put('/api/v1/cart/items', { variantId: report.variants[0].id, quantity: 1 });
    const cart = await u.c.get('/api/v1/cart?code=DEVTEST10');
    expect(cart.totals.discountPaise).toBe(Math.floor(cart.totals.subtotalPaise / 10));
    const address = { name: 'Shopper', line1: '1 Test Street', city: 'Delhi', state: 'Delhi', postalCode: '110001', country: 'IN', phone: '+91 99999 00000' };
    const order = await u.c.post('/api/v1/checkout', { shippingAddress: address, discountCode: 'DEVTEST10', idempotencyKey: 'order-test-1' });
    expect(order.order.totalPaise).toBe(cart.totals.totalPaise);
    const v2 = (await u.c.get(`/api/v1/products/${list.products[0].slug}`)).variants[0];
    expect(v2.stock).toBe(stockBefore - 2);
    const dup = await u.c.post('/api/v1/checkout', { shippingAddress: address, idempotencyKey: 'order-test-1' });
    expect(dup.order.id).toBe(order.order.id);
    await u.c.post(`/api/v1/payments/dev/${order.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const detail = await u.c.get(`/api/v1/orders/${order.order.id}`);
    expect(detail.order.status).toBe('fulfilling');
    expect(detail.reports).toHaveLength(1);
    const doc = await u.c.get(`/api/v1/reports/${detail.reports[0].id}`);
    expect(doc.report.content.sections.length).toBeGreaterThan(4);
    const rr = await u.c.post(`/api/v1/orders/${order.order.id}/refund-request`, { reason: 'Changed my mind about the diya set' });
    const admin = await signup(t, 'Admin');
    await makeAdmin(t, admin.userId);
    await admin.c.post(`/api/v1/admin/refunds/${rr.refund.id}/decide`, { approve: true, note: 'Within policy' });
    const after = await u.c.get(`/api/v1/orders/${order.order.id}`);
    expect(after.payment.status).toBe('refunded');
    expect(after.order.status).toBe('refunded');
    expect((await u.c.req('GET', `/api/v1/reports/${detail.reports[0].id}`)).status).toBe(404);
  });

  it('a failed payment cancels the order and restores stock', async () => {
    const u = await signup(t, 'Declined');
    const p = await u.c.get('/api/v1/products/sample-rudraksha-mala');
    const before = p.variants[0].stock;
    await u.c.put('/api/v1/cart/items', { variantId: p.variants[0].id, quantity: 1 });
    const order = await u.c.post('/api/v1/checkout', { shippingAddress: { name: 'Dee', line1: '2 Road', city: 'Pune', state: 'MH', postalCode: '411001', country: 'IN', phone: '+91 90000 00000' }, idempotencyKey: 'order-fail' });
    await u.c.post(`/api/v1/payments/dev/${order.checkout.paymentId}/simulate`, { outcome: 'failed' });
    expect((await u.c.get(`/api/v1/orders/${order.order.id}`)).order.status).toBe('cancelled');
    expect((await u.c.get('/api/v1/products/sample-rudraksha-mala')).variants[0].stock).toBe(before);
  });

  it('activates and renews a subscription through payment state', async () => {
    const u = await signup(t, 'Subscriber');
    const r = await u.c.post('/api/v1/subscriptions', { planKey: 'plus_monthly', idempotencyKey: 'sub-test-1' });
    await u.c.post(`/api/v1/payments/dev/${r.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const subs = await u.c.get('/api/v1/subscriptions');
    expect(subs.subscriptions[0].status).toBe('active');
    const gen = await u.c.post('/api/v1/reports/generate', { templateKey: 'western_natal' });
    expect(gen.report.templateKey).toBe('western_natal');
    await runScheduledJobs(t.ctx, new Date(Date.now() + 31 * 86400000));
    expect((await u.c.get('/api/v1/subscriptions')).subscriptions[0].status).toBe('past_due');
    const renew = await u.c.post(`/api/v1/subscriptions/${r.subscription.id}/renew`);
    await u.c.post(`/api/v1/payments/dev/${renew.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    expect((await u.c.get('/api/v1/subscriptions')).subscriptions[0].status).toBe('active');
  });
});

describe('Journey G — wedding planning with shared permissions', () => {
  it('creates a project, adds a partner, tasks, vendor inquiry, quotation and deposit', async () => {
    const owner = await signup(t, 'Bride');
    const partner = await signup(t, 'Groom');
    const family = await signup(t, 'Aunt');
    const p = await owner.c.post('/api/v1/weddings', { title: 'Our wedding', weddingDate: DateTime.now().plus({ months: 6 }).toISODate(), budgetPaise: 200000000 });
    const inv = await owner.c.post(`/api/v1/weddings/${p.project.id}/members`, { email: partner.email, role: 'partner', permissions: ['view_budget', 'edit_budget', 'manage_guests', 'manage_tasks', 'manage_vendors'] });
    await partner.c.post('/api/v1/weddings/join', { token: inv.joinUrl.split('/').pop() });
    const famInv = await owner.c.post(`/api/v1/weddings/${p.project.id}/members`, { email: family.email, role: 'family', permissions: ['manage_tasks'] });
    await family.c.post('/api/v1/weddings/join', { token: famInv.joinUrl.split('/').pop() });
    const task = await partner.c.post(`/api/v1/weddings/${p.project.id}/tasks`, { title: 'Book mehendi artist' });
    expect(task.task.title).toBe('Book mehendi artist');
    const famView = await family.c.get(`/api/v1/weddings/${p.project.id}`);
    expect(famView.budget).toBeNull();
    expect(famView.guests).toBeNull();
    expect((await family.c.req('POST', `/api/v1/weddings/${p.project.id}/budget`, { category: 'venue', label: 'x', estimatedPaise: 1 })).status).toBe(403);
    const vendors = await partner.c.get('/api/v1/vendors?category=pandit');
    const inq = await partner.c.post(`/api/v1/weddings/${p.project.id}/inquiries`, { vendorId: vendors.vendors[0].id, message: 'Are you available for a morning ceremony?' });
    // Vendor responds with a quotation.
    const [vendorRow] = await t.ctx.db.select().from(s.vendors).where(eq(s.vendors.id, vendors.vendors[0].id));
    const { sha256, randomToken } = await import('../../src/server/lib/crypto');
    const tok = randomToken(32);
    await t.ctx.db.insert(s.sessions).values({ userId: vendorRow.ownerId, tokenHash: sha256(tok), expiresAt: new Date(Date.now() + 3600000), mfaPassed: true });
    const vc = new Client(t.app);
    await vc.prime();
    vc.cookies.set('nk_session', tok);
    const q = await vc.post(`/api/v1/vendor/inquiries/${inq.inquiry.id}/quote`, { amountPaise: 2100000, details: 'Full ceremony with samagri included.', milestones: [{ label: 'Deposit', percent: 30 }, { label: 'Balance', percent: 70 }] });
    const accepted = await owner.c.post(`/api/v1/weddings/${p.project.id}/quotes/${q.quote.id}/respond`, { accept: true });
    expect(accepted.booking.status).toBe('pending_deposit');
    const view = await owner.c.get(`/api/v1/weddings/${p.project.id}`);
    const deposit = view.milestones.find((m: any) => m.label === 'Deposit');
    expect(deposit.amountPaise).toBe(630000);
    const pay = await owner.c.post(`/api/v1/weddings/${p.project.id}/milestones/${deposit.id}/pay`);
    await owner.c.post(`/api/v1/payments/dev/${pay.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const after = await owner.c.get(`/api/v1/weddings/${p.project.id}`);
    expect(after.vendors[0].booking.status).toBe('confirmed');
    const guest = await owner.c.post(`/api/v1/weddings/${p.project.id}/guests`, { name: 'Ravi Uncle', email: 'ravi@example.test', partySize: 2 });
    const invite = await owner.c.post(`/api/v1/weddings/${p.project.id}/guests/${guest.guest.id}/invite`);
    const rsvpToken = invite.rsvpUrl.split('/').pop();
    const anon = new Client(t.app);
    expect((await anon.get(`/api/v1/rsvp/${rsvpToken}`)).guest.name).toBe('Ravi Uncle');
    await anon.post(`/api/v1/rsvp/${rsvpToken}`, { rsvp: 'attending', partySize: 2 });
    expect((await owner.c.get(`/api/v1/weddings/${p.project.id}`)).guestSummary.attending).toBe(2);
    // Revoking the family member removes access.
    const fam = view.members.find((m: any) => m.userId === family.userId);
    await owner.c.patch(`/api/v1/weddings/${p.project.id}/members/${fam.id}`, { revoke: true });
    expect((await family.c.req('GET', `/api/v1/weddings/${p.project.id}`)).status).toBe(404);
  });
});

describe('Journey H — gamification integrity', () => {
  it('awards XP idempotently and never duplicates one-time achievements', async () => {
    const u = await signup(t, 'Gamer');
    const before = await u.c.get('/api/v1/journey');
    await u.c.post('/api/v1/timeline', { kind: 'reflection', title: 'One', eventDate: '2025-05-01' });
    await u.c.post('/api/v1/timeline', { kind: 'reflection', title: 'Two same day', eventDate: '2025-05-01' });
    const after = await u.c.get('/api/v1/journey');
    expect(after.xp - before.xp).toBe(10);
    // Re-saving the birth profile does not re-award Cosmic ID XP or the achievement.
    await u.c.put('/api/v1/birth-profile', { date: '1992-05-14', time: '06:25', timePrecision: 'exact', place: { kind: 'manual', name: 'New Delhi, India', latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' }, consentBirthData: true });
    const again = await u.c.get('/api/v1/journey');
    expect(again.xp).toBe(after.xp);
    const firstLight = await t.ctx.db.select().from(s.userAchievements).where(eq(s.userAchievements.userId, u.userId));
    expect(firstLight.filter((a) => a.achievementKey === 'first_light')).toHaveLength(1);
    expect(again.history.length).toBe(after.history.length);
    // There is no client endpoint that awards XP directly.
    expect((await u.c.req('POST', '/api/v1/journey/xp', { amount: 9999 })).status).toBe(404);
  });
});

describe('Journey I — privacy, export and deletion', () => {
  it('exports account data then deletes the account per retention rules', async () => {
    const u = await signup(t, 'Leaving');
    await u.c.post('/api/v1/timeline', { kind: 'reflection', title: 'mine', eventDate: '2025-01-02' });
    const exp = await u.c.post('/api/v1/privacy/export');
    expect(exp.data.birthProfiles).toHaveLength(1);
    expect(exp.data.timeline).toHaveLength(1);
    expect((await u.c.req('POST', '/api/v1/privacy/delete-account', { password: 'wrong', confirm: 'DELETE' })).status).toBe(401);
    const del = await u.c.post('/api/v1/privacy/delete-account', { password: u.password, confirm: 'DELETE' });
    expect(del.deleted).toBe(true);
    expect((await u.c.req('GET', '/api/v1/charts/me')).status).toBe(401);
    const bps = await t.ctx.db.select().from(s.birthProfiles).where(eq(s.birthProfiles.userId, u.userId));
    expect(bps).toHaveLength(0);
    const [user] = await t.ctx.db.select().from(s.users).where(eq(s.users.id, u.userId));
    expect(user.status).toBe('deleted');
    expect(user.email).not.toBe(u.email);
    expect((await new Client(t.app).req('POST', '/api/v1/auth/login', { email: u.email, password: u.password })).status).toBe(401);
  });

  it('withdrawing birth-data consent removes birth data and charts', async () => {
    const u = await signup(t, 'Withdraw');
    await u.c.post('/api/v1/consents', { purpose: 'birth_data_processing', granted: false });
    expect((await u.c.req('GET', '/api/v1/charts/me')).status).toBe(404);
  });
});

describe('social, matchmaking and family bridge', () => {
  it('feed respects visibility, blocks, ranking explanations and moderation', async () => {
    const a = await signup(t, 'Poster');
    const b = await signup(t, 'Reader');
    await a.c.patch('/api/v1/profile', { visibility: 'public', interests: ['tarot'] });
    await b.c.patch('/api/v1/profile', { interests: ['tarot'] });
    const pub = await a.c.post('/api/v1/posts', { kind: 'text', body: 'Public thoughts on the full moon', topics: ['tarot'], visibility: 'public' });
    const fol = await a.c.post('/api/v1/posts', { kind: 'text', body: 'Followers only update', visibility: 'followers' });
    let feed = await b.c.get('/api/v1/feed');
    expect(feed.posts.some((p: any) => p.id === pub.post.id)).toBe(true);
    expect(feed.posts.some((p: any) => p.id === fol.post.id)).toBe(false);
    expect(feed.posts.find((p: any) => p.id === pub.post.id).reasons.join(' ')).toMatch(/interests/);
    await b.c.post(`/api/v1/follows/${a.userId}`);
    feed = await b.c.get('/api/v1/feed');
    expect(feed.posts.some((p: any) => p.id === fol.post.id)).toBe(true);
    await b.c.post(`/api/v1/posts/${pub.post.id}/comments`, { body: 'Lovely!' });
    const poll = await a.c.post('/api/v1/posts', { kind: 'poll', body: 'Favourite nakshatra?', pollOptions: ['Rohini', 'Revati'], visibility: 'public' });
    const pd = await b.c.get(`/api/v1/posts/${poll.post.id}`);
    await b.c.post(`/api/v1/posts/${poll.post.id}/vote`, { optionId: pd.post.poll[0].id });
    expect((await b.c.req('POST', `/api/v1/posts/${poll.post.id}/vote`, { optionId: pd.post.poll[1].id })).status).toBe(409);
    await b.c.post(`/api/v1/blocks/${a.userId}`);
    feed = await b.c.get('/api/v1/feed');
    expect(feed.posts.some((p: any) => p.authorId === a.userId || p.author.userId === a.userId)).toBe(false);
    expect((await b.c.req('GET', `/api/v1/u/${a.handle}`)).status).toBe(404);
    const report = await a.c.post('/api/v1/reports', { targetType: 'post', targetId: pub.post.id, reason: 'other', details: 'self-test' });
    const admin = await signup(t, 'Mod');
    await makeAdmin(t, admin.userId);
    const queue = await admin.c.get('/api/v1/admin/reports');
    expect(queue.reports.some((r: any) => r.id === report.report.id)).toBe(true);
    await admin.c.post(`/api/v1/admin/reports/${report.report.id}/action`, { action: 'hide_content', reason: 'test hide' });
    const c = await signup(t, 'Third');
    expect((await c.c.req('GET', `/api/v1/posts/${pub.post.id}`)).status).toBe(404);
    const audit = await admin.c.get('/api/v1/admin/audit?action=moderation');
    expect(audit.entries.length).toBeGreaterThan(0);
    // Non-admins cannot reach admin endpoints.
    expect((await c.c.req('GET', '/api/v1/admin/reports')).status).toBe(403);
  });

  it('matchmaking: connect, mutual chart consent for kundli, family permissions', async () => {
    const delhi = (await new Client(t.app).get('/api/v1/places?q=New Delhi')).results[0].id;
    const a = await signup(t, 'Kavya', { birth: { date: '1995-01-15' } });
    const b = await signup(t, 'Arjun', { birth: { date: '1992-06-20' } });
    const base = { placeId: delhi, ageMin: 25, ageMax: 40, values: ['family', 'growth'], acceptTerms: true, about: 'Engineer who loves classical music.' };
    await a.c.put('/api/v1/matchmaking/profile', { ...base, gender: 'woman', seeking: ['man'] });
    await b.c.put('/api/v1/matchmaking/profile', { ...base, gender: 'man', seeking: ['woman'], kundliMatchingImportant: true });
    const disc = await b.c.get('/api/v1/matchmaking/discover?kundli=true');
    const card = disc.results.find((r: any) => r.card.userId === a.userId);
    expect(card.guna).toBeGreaterThanOrEqual(0);
    await b.c.post('/api/v1/matchmaking/shortlist', { targetId: a.userId, note: 'Kind profile' });
    const conn = await b.c.post('/api/v1/matchmaking/connect', { targetId: a.userId, message: 'Namaste', shareChart: true });
    await a.c.post(`/api/v1/matchmaking/connections/${conn.connection.id}/respond`, { accept: true, shareChart: false });
    expect((await a.c.req('GET', `/api/v1/matchmaking/connections/${conn.connection.id}/kundli`)).status).toBe(403);
    await a.c.post(`/api/v1/matchmaking/connections/${conn.connection.id}/share-chart`, { share: true });
    const k = await a.c.get(`/api/v1/matchmaking/connections/${conn.connection.id}/kundli`);
    expect(k.result.vedic.gunaMilan.max).toBe(36);
    // Family Bridge: limited permissions; never messages.
    const mother = await signup(t, 'Mother');
    const fi = await b.c.post('/api/v1/family/invite', { email: mother.email, relation: 'mother', permissions: ['view_shortlist'] });
    await mother.c.post('/api/v1/family/accept', { token: fi.acceptUrl.split('/').pop() });
    const fv = await mother.c.get(`/api/v1/family/view/${b.userId}`);
    expect(fv.shortlist).toHaveLength(1);
    expect(fv.profile).toBeUndefined();
    expect(JSON.stringify(fv)).not.toMatch(/Namaste/);
    expect((await mother.c.req('POST', `/api/v1/family/view/${b.userId}/suggest`, { targetId: a.userId })).status).toBe(404);
    const fam = await b.c.get('/api/v1/family');
    await b.c.patch(`/api/v1/family/${fam.members[0].id}`, { revoke: true });
    expect((await mother.c.req('GET', `/api/v1/family/view/${b.userId}`)).status).toBe(404);
    const stage = await a.c.post(`/api/v1/matchmaking/connections/${conn.connection.id}/stage`, { stage: 'engaged' });
    expect(stage.next.path).toBe('/weddings/new');
  });

  it('admin analytics computes WMCU from meaningful events', async () => {
    const admin = await signup(t, 'Analyst');
    await makeAdmin(t, admin.userId);
    const a = await admin.c.get('/api/v1/admin/analytics');
    expect(a.wmcu.length).toBeGreaterThan(0);
    expect(a.definition).toMatch(/Weekly Meaningful Cosmic Users/);
    expect(a.activationFunnel[0].users).toBeGreaterThan(0);
  });
});

describe('concurrency safeguards', () => {
  it('lets only one of two simultaneous requests book the same expert slot', async () => {
    const u1 = await signup(t, 'Racer One');
    const u2 = await signup(t, 'Racer Two');
    const ex = (await u1.c.get('/api/v1/experts')).experts[1];
    const chat = (await u1.c.get(`/api/v1/experts/${ex.userId}`)).services.find((x: any) => x.mode === 'chat');
    const slot = (await u1.c.get(`/api/v1/experts/${ex.userId}/availability?serviceId=${chat.id}&days=14`)).slots[3];
    const [r1, r2] = await Promise.all([
      u1.c.req('POST', '/api/v1/bookings', { serviceId: chat.id, start: slot.start, idempotencyKey: 'race-booking-0001' }),
      u2.c.req('POST', '/api/v1/bookings', { serviceId: chat.id, start: slot.start, idempotencyKey: 'race-booking-0002' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const rows = await t.ctx.db.select().from(s.bookings).where(eq(s.bookings.startsAt, new Date(slot.start)));
    expect(rows.filter((b) => b.expertId === ex.userId)).toHaveLength(1);
  });

  it('awards XP once when the same action is submitted concurrently', async () => {
    const u = await signup(t, 'Double Tap');
    const course = (await u.c.get('/api/v1/courses')).courses.find((c: any) => c.slug === 'foundations-of-astrology-sample');
    await u.c.post(`/api/v1/courses/${course.id}/enroll`);
    const detail = await u.c.get(`/api/v1/courses/${course.slug}`);
    const lessonId = detail.lessons[0].id;
    await Promise.all([1, 2, 3, 4].map(() => u.c.req('POST', `/api/v1/lessons/${lessonId}/complete`)));
    const xp = await t.ctx.db.select().from(s.xpLedger).where(eq(s.xpLedger.userId, u.userId));
    expect(xp.filter((x) => x.rule === 'lesson_completed')).toHaveLength(1);
  });
});

describe('creator and seller applications', () => {
  it('member applies, staff approves in verification, role grants studio access', async () => {
    const u = await signup(t, 'Would-be Creator');
    expect((await u.c.req('GET', '/api/v1/creator/courses')).status).toBe(403);
    expect((await u.c.req('POST', '/api/v1/role-applications', { role: 'creator', note: 'too short' })).status).toBe(400);
    await u.c.post('/api/v1/role-applications', { role: 'creator', note: 'I have taught nakshatra basics to small groups for five years and want to publish a course.' });
    expect((await u.c.req('POST', '/api/v1/role-applications', { role: 'creator', note: 'Applying again while the first application is pending review.' })).status).toBe(400);
    expect((await u.c.get('/api/v1/role-applications/creator')).application.status).toBe('pending');
    const admin = await signup(t, 'Reviewer');
    await makeAdmin(t, admin.userId);
    const queue = await admin.c.get('/api/v1/admin/verifications?kind=creator');
    const req = queue.requests.find((r: any) => r.userId === u.userId);
    await admin.c.post(`/api/v1/admin/verifications/${req.id}/decide`, { approve: true, note: 'Welcome aboard' });
    const after = await u.c.req('GET', '/api/v1/creator/courses');
    expect(after.status).toBe(200);
  });
});
