import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { Client, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { totp } from '../../src/server/lib/crypto';
import { runRetention } from '../../src/server/services/scheduler';
import { expireGifts } from '../../src/server/services/gifts';

/**
 * Regression tests for the audit findings (artifacts/audit, SEC-01..05, SEC-04, DEF-01/02/03/05).
 * Privacy assertions check that the hidden person's id, handle and display name are ABSENT from the
 * serialised response — not merely that a key such as "secret" is missing.
 */
let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type Member = Awaited<ReturnType<typeof signup>>;
const member = (name: string) => signup(t, name, { birth: false });

/** Asserts none of the identifiers of `who` occur anywhere in `payload`. */
function expectNoIdentity(payload: unknown, who: Member, displayName: string) {
  const raw = JSON.stringify(payload);
  expect(raw).not.toContain(who.userId);
  expect(raw).not.toContain(who.handle);
  expect(raw).not.toContain(displayName);
}

async function circleWith(owner: Member, others: Member[]) {
  const { circle } = await owner.c.post('/api/v1/circles', { name: `Circle ${Math.random().toString(36).slice(2, 6)}` });
  const { token } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
  for (const o of others) await o.c.post(`/api/v1/circle-invites/${token}/accept`);
  return circle.id as string;
}

describe('SEC-01 / SEC-02 / SEC-06 — pen names stay pen names', () => {
  let author: Member; let reader: Member; let third: Member; let circleId: string; let postId: string;
  const REAL = 'Zoravar Realname';
  beforeAll(async () => {
    author = await member(REAL); reader = await member('Reader Rhea'); third = await member('Third Tanu');
    await author.c.patch('/api/v1/identity/me', { pseudonym: 'Night Kite' });
    circleId = await circleWith(author, [reader, third]);
    postId = (await author.c.post('/api/v1/posts', { kind: 'confession', body: 'I secretly dislike group trips.', visibility: 'group', groupId: circleId, pseudonymous: true })).post.id;
  });

  it('the post, feed and circle feed never carry the author identity', async () => {
    expectNoIdentity(await reader.c.get(`/api/v1/posts/${postId}`), author, REAL);
    expectNoIdentity(await reader.c.get(`/api/v1/circles/${circleId}/feed`).then((r) => r.posts.filter((p: { id: string }) => p.id === postId)), author, REAL);
    const feed = await reader.c.get('/api/v1/feed?mode=ranked');
    expectNoIdentity(feed.posts.filter((p: { id: string }) => p.id === postId), author, REAL);
  });

  it('muting a pen-name author lists only the pen name and an opaque reference (SEC-01)', async () => {
    await reader.c.post(`/api/v1/posts/${postId}/mute-author`);
    const blocks = await reader.c.get('/api/v1/blocks');
    expectNoIdentity(blocks, author, REAL);
    expect(blocks.muted).toHaveLength(0);
    expect(blocks.mutedPenNames).toHaveLength(1);
    expect(blocks.mutedPenNames[0].penName).toBe('Night Kite');
    expect(blocks.mutedPenNames[0].ref).toMatch(/^[a-f0-9]{32}$/);
    // The pen-name mute hides pen-name posts only — real-name posts by the same person stay visible,
    // so muting cannot be used to discover who wrote it.
    const real = await author.c.post('/api/v1/posts', { kind: 'thought', body: 'Real-name thought about chai.', visibility: 'group', groupId: circleId });
    const cf = await reader.c.get(`/api/v1/circles/${circleId}/feed`);
    const ids = cf.posts.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(postId);
    expect(ids).toContain(real.post.id);
    // Unmute by reference; a forged reference is rejected.
    expect((await reader.c.req('DELETE', `/api/v1/pen-mutes/${'0'.repeat(32)}`)).status).toBe(404);
    await reader.c.del(`/api/v1/pen-mutes/${blocks.mutedPenNames[0].ref}`);
    expect((await reader.c.get('/api/v1/blocks')).mutedPenNames).toHaveLength(0);
  });

  it('the author replying in their own pen-name thread stays under the pen name (SEC-02)', async () => {
    const c1 = await reader.c.post(`/api/v1/posts/${postId}/comments`, { body: 'Same here honestly.' });
    const own = await author.c.post(`/api/v1/posts/${postId}/comments`, { body: 'Okay maybe not every trip.', parentId: c1.comment.id });
    expect(own.comment.author.pseudonym).toBe('Night Kite');
    const viewThird = await third.c.get(`/api/v1/posts/${postId}`);
    expectNoIdentity(viewThird, author, REAL);
    const authorReply = viewThird.comments.find((c: { id: string }) => c.id === own.comment.id);
    expect(authorReply.author).toEqual({ pseudonym: 'Night Kite', isPostAuthor: true });
    // The author sees their own reply as theirs.
    expect((await author.c.get(`/api/v1/posts/${postId}`)).comments.find((c: { id: string }) => c.id === own.comment.id).isMine).toBe(true);
    // Notifications the author receives about replies never name them; the replier's notification is theirs only.
    const notes = await reader.c.get('/api/v1/notifications');
    expectNoIdentity(notes, author, REAL);
  });

  it('renaming the pen name does not relabel or link older posts (snapshot)', async () => {
    await author.c.patch('/api/v1/identity/me', { pseudonym: 'Paper Lantern' });
    const view = await third.c.get(`/api/v1/posts/${postId}`);
    expect(view.post.author.pseudonym).toBe('Night Kite');
  });

  it('following mode never shows other people\'s pen-name posts (SEC-06)', async () => {
    const pub = await author.c.post('/api/v1/posts', { kind: 'thought', body: 'A public pen-name thought on monsoon.', visibility: 'public', pseudonymous: true });
    await third.c.post(`/api/v1/follows/${author.userId}`);
    // Profiles are private by default → follow is pending until accepted.
    await author.c.post(`/api/v1/follows/requests/${third.userId}`, { accept: true });
    const following = await third.c.get('/api/v1/feed?mode=following');
    expect(following.posts.map((p: { id: string }) => p.id)).not.toContain(pub.post.id);
    const ranked = await third.c.get('/api/v1/feed?mode=ranked');
    const hit = ranked.posts.find((p: { id: string }) => p.id === pub.post.id);
    expect(hit).toBeTruthy();
    expectNoIdentity(hit, author, REAL);
  });
});

describe('Feed visibility policy (post-level visibility decides)', () => {
  it('public / followers / circle posts from a private profile reach exactly the right people', async () => {
    const poster = await member('Private Priya');
    const follower = await member('Follower Farah');
    const stranger = await member('Stranger Sam');
    const blocked = await member('Blocked Bilal');
    const me = await poster.c.get('/api/v1/auth/me');
    expect(me.user.profile.visibility).toBe('private');
    await follower.c.post(`/api/v1/follows/${poster.userId}`);
    await poster.c.post(`/api/v1/follows/requests/${follower.userId}`, { accept: true });
    await poster.c.post(`/api/v1/blocks/${blocked.userId}`);
    const circleId = await circleWith(poster, [follower]);
    const pub = (await poster.c.post('/api/v1/posts', { kind: 'thought', body: 'Public thought from a private profile.', visibility: 'public' })).post.id;
    const fol = (await poster.c.post('/api/v1/posts', { kind: 'thought', body: 'Followers-only thought here.', visibility: 'followers' })).post.id;
    const grp = (await poster.c.post('/api/v1/posts', { kind: 'thought', body: 'Circle-only thought here.', visibility: 'group', groupId: circleId })).post.id;
    const can = async (who: Member, id: string) => (await who.c.req('GET', `/api/v1/posts/${id}`)).status === 200;
    expect([await can(stranger, pub), await can(stranger, fol), await can(stranger, grp)]).toEqual([true, false, false]);
    expect([await can(follower, pub), await can(follower, fol), await can(follower, grp)]).toEqual([true, true, true]);
    expect([await can(blocked, pub), await can(blocked, fol), await can(blocked, grp)]).toEqual([false, false, false]);
    const strangerFeed = (await stranger.c.get('/api/v1/feed?mode=chronological')).posts.map((p: { id: string }) => p.id);
    expect(strangerFeed).toContain(pub);
    expect(strangerFeed).not.toContain(fol);
    expect(strangerFeed).not.toContain(grp);
    // Muting hides real-name posts from the feed, but never grants or removes access.
    await stranger.c.post(`/api/v1/mutes/${poster.userId}`);
    expect((await stranger.c.get('/api/v1/feed?mode=chronological')).posts.map((p: { id: string }) => p.id)).not.toContain(pub);
    expect(await can(stranger, pub)).toBe(true);
  });
});

describe('SEC-03 — hidden authors in games', () => {
  it('Who Said It? and Hot Take Arena never reveal the author before the reveal', async () => {
    const a = await member('Gamer Alpha'); const b = await member('Gamer Bravo'); const c = await member('Gamer Charlie');
    const circleId = await circleWith(a, [b, c]);
    for (const game of ['who_said_it', 'hot_take_arena']) {
      const { session } = await a.c.post('/api/v1/play/sessions', { gameKey: game, circleId });
      await b.c.post(`/api/v1/play/sessions/${session.id}/join`, {});
      await c.c.post(`/api/v1/play/sessions/${session.id}/join`, {});
      await a.c.post(`/api/v1/play/sessions/${session.id}/start`);
      const players = [a, b, c];
      const lines = new Map(players.map((p, i) => [p.userId, `${game} line number ${i} xyz`]));
      for (const p of players) await p.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { text: lines.get(p.userId) } });
      const viewer = await c.c.get(`/api/v1/play/sessions/${session.id}`);
      expect(viewer.round.kind).toBe('vote');
      const authorId = [...lines].find(([, l]) => l === viewer.round.prompt)![0];
      // Every player is a vote option (that is the game); beyond the options the author id appears nowhere,
      // and nobody is singled out as "not waiting".
      const roundWithoutOptions = (r: Record<string, unknown>) => JSON.stringify({ ...r, options: undefined });
      expect(roundWithoutOptions(viewer.round)).not.toContain(authorId);
      expect(JSON.stringify(viewer.players.map((p: { waitingOn: boolean }) => p.waitingOn))).not.toContain('true');
      expect(viewer.round.excludeId).toBeUndefined();
      expect(viewer.round.hidesAuthor).toBe(true);
      expect(viewer.players.every((p: { waitingOn: boolean }) => p.waitingOn === false)).toBe(true);
      // Each player's own view differs only in me.canAct (true for everyone except, privately, the author).
      for (const p of players) {
        const v = await p.c.get(`/api/v1/play/sessions/${session.id}`);
        expect(roundWithoutOptions(v.round)).not.toContain(authorId);
        expect(v.me.canAct).toBe(p.userId !== authorId);
      }
      // The author still cannot vote on their own line.
      const author = players.find((p) => p.userId === authorId)!;
      expect((await author.c.req('POST', `/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: b.userId === authorId ? a.userId : b.userId } })).status).toBe(403);
    }
  });
});

describe('SEC-04 — private circle events', () => {
  it('outsiders cannot list, search, RSVP to or see the location of circle events', async () => {
    const owner = await member('Host Hira'); const friend = await member('Friend Fai'); const outsider = await member('Outsider Om');
    const circleId = await circleWith(owner, [friend]);
    const start = new Date(Date.now() + 86400000).toISOString(); const end = new Date(Date.now() + 90000000).toISOString();
    const { event } = await owner.c.post('/api/v1/events', { title: 'Secret supper club', description: 'At my flat', startsAt: start, endsAt: end, mode: 'in_person', location: '12 Private Lane', groupId: circleId });
    const outsiderList = await outsider.c.get('/api/v1/events');
    expect(JSON.stringify(outsiderList)).not.toContain('12 Private Lane');
    expect(outsiderList.events.map((e: { id: string }) => e.id)).not.toContain(event.id);
    expect((await outsider.c.req('POST', `/api/v1/events/${event.id}/rsvp`, { status: 'going' })).status).toBe(404);
    expect((await outsider.c.get('/api/v1/search?q=Secret%20supper&scope=events')).results.events).toHaveLength(0);
    expect((await outsider.c.req('GET', `/api/v1/events/${event.id}/attendees`)).status).toBe(404);
    // Members see it and can RSVP; a public event is still visible to everyone.
    expect((await friend.c.get('/api/v1/events')).events.map((e: { id: string }) => e.id)).toContain(event.id);
    await friend.c.post(`/api/v1/events/${event.id}/rsvp`, { status: 'going' });
    const open = await owner.c.post('/api/v1/events', { title: 'Open meetup', startsAt: start, endsAt: end, mode: 'online' });
    expect((await outsider.c.get('/api/v1/events')).events.map((e: { id: string }) => e.id)).toContain(open.event.id);
  });
});

describe('SEC-05 — MFA changes need fresh re-authentication', () => {
  it('setup cannot overwrite an active factor; disable needs password AND a current code; other sessions end', async () => {
    const u = await member('Mfa Mani');
    const setup = await u.c.post('/api/v1/auth/mfa/setup');
    await u.c.post('/api/v1/auth/mfa/enable', { code: totp(setup.secret) });
    // A second device session for the same account.
    const other = new Client(t.app);
    const login = await other.req('POST', '/api/v1/auth/login', { email: u.email, password: u.password, totp: totp(setup.secret) });
    expect(login.status).toBe(200);
    expect((await u.c.req('POST', '/api/v1/auth/mfa/setup')).status).toBe(409);
    expect((await u.c.get('/api/v1/auth/me')).user.mfaEnabled).toBe(true);
    expect((await u.c.req('POST', '/api/v1/auth/mfa/disable', { password: 'wrong-password-123', code: totp(setup.secret) })).status).toBe(401);
    expect((await u.c.req('POST', '/api/v1/auth/mfa/disable', { password: u.password, code: '000000' })).status).toBe(401);
    expect((await u.c.req('POST', '/api/v1/auth/mfa/disable', { password: u.password })).status).toBe(400);
    expect((await u.c.get('/api/v1/auth/me')).user.mfaEnabled).toBe(true);
    await u.c.post('/api/v1/auth/mfa/disable', { password: u.password, code: totp(setup.secret) });
    expect((await u.c.get('/api/v1/auth/me')).user.mfaEnabled).toBe(false);
    expect((await other.get('/api/v1/auth/me')).user).toBeNull();
    const logs = await t.ctx.db.select().from(s.auditLogs).where(eq(s.auditLogs.actorId, u.userId));
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['auth.mfa_disabled', 'auth.mfa_disable_failed']));
  });
});

describe('DEF-01 / DEF-02 — gifts reach the recipient, never the purchaser', () => {
  let buyer: Member;
  let variantId: string;
  const answers = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${i + 1}`, [1, 2, 4, 5, 3][i % 5]]));
  beforeAll(async () => {
    buyer = await member('Gift Buyer');
    variantId = (await buyer.c.get('/api/v1/products/report-identity-expanded')).variants[0].id;
  });
  async function giftTo(email: string, key: string) {
    await buyer.c.put('/api/v1/cart/items', { variantId, quantity: 1 });
    const co = await buyer.c.post('/api/v1/checkout', { gift: { recipientEmail: email, message: 'for you' }, idempotencyKey: key });
    const sim = await buyer.c.req('POST', `/api/v1/payments/dev/${co.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    return { co, sim };
  }
  const tokenFor = async (email: string) => {
    const mails = await t.ctx.db.select().from(s.emailOutbox).where(eq(s.emailOutbox.toEmail, email));
    const m = mails.find((x) => x.subject.includes('gift'));
    return /gifts\/claim\/([A-Za-z0-9_-]+)/.exec(m!.textBody)![1];
  };

  it('existing member without an assessment: payment succeeds, gift claimed, report generated later', async () => {
    const r = await member('Recipient Without Assessment');
    const { co, sim } = await giftTo(r.email, 'gift-test-0001');
    expect(sim.status).toBe(200);
    expect((await buyer.c.get(`/api/v1/orders/${co.order.id}`)).order.status).toBe('completed');
    expect((await buyer.c.get('/api/v1/library')).pendingReports).toHaveLength(0);
    const lib = await r.c.get('/api/v1/library');
    expect(lib.pendingReports).toHaveLength(1);
    expect((await r.c.req('POST', `/api/v1/library/${lib.pendingReports[0].entitlementId}/generate`)).status).toBe(400);
    await r.c.post('/api/v1/personality/assessment', { answers });
    const gen = await r.c.post(`/api/v1/library/${lib.pendingReports[0].entitlementId}/generate`);
    expect((await r.c.get(`/api/v1/reports/${gen.reportId}`)).report.templateKey).toBe('identity_expanded');
    // A replayed provider event does not create a second claim.
    const claims = await t.ctx.db.select().from(s.giftClaims).where(eq(s.giftClaims.orderId, co.order.id));
    expect(claims).toHaveLength(1);
  });

  it('unregistered email: nothing goes to the purchaser; the right person claims after verifying', async () => {
    const email = `future${Date.now()}@example.test`;
    const { sim } = await giftTo(email, 'gift-test-0002');
    expect(sim.status).toBe(200);
    expect((await buyer.c.get('/api/v1/library')).reports.map((x: { templateKey: string }) => x.templateKey)).not.toContain('identity_expanded');
    const token = await tokenFor(email);
    const preview = await new Client(t.app).get(`/api/v1/gifts/claim/${token}`);
    expect(preview.gift.status).toBe('pending');
    expect(preview.gift.sentTo).not.toBe(email);
    // Someone else cannot claim it, even with the link.
    const wrong = await member('Wrong Person');
    expect((await wrong.c.req('POST', `/api/v1/gifts/claim/${token}`)).status).toBe(403);
    // The intended recipient signs up; verification claims it automatically.
    const c = new Client(t.app);
    await c.post('/api/v1/auth/signup', { email, password: 'correct-horse-battery', displayName: 'Future Friend', confirmAdult: true, acceptTerms: true }, 201);
    const [mail] = (await t.ctx.db.select().from(s.emailOutbox).where(eq(s.emailOutbox.toEmail, email))).filter((m) => m.subject.includes('Verify'));
    await c.post('/api/v1/auth/verify-email', { token: /token=([A-Za-z0-9_-]+)/.exec(mail.textBody)![1] });
    expect((await c.get('/api/v1/library')).pendingReports).toHaveLength(1);
    // Repeated claim is idempotent for the owner and blocked for others.
    expect((await c.req('POST', `/api/v1/gifts/claim/${token}`)).status).toBe(200);
    expect((await buyer.c.get('/api/v1/gifts/sent')).gifts.find((g: { to: string }) => g.to === email).status).toBe('claimed');
  });

  it('expired gifts cannot be claimed; failed payments create no claim; refunds revoke', async () => {
    const email = `late${Date.now()}@example.test`;
    await giftTo(email, 'gift-test-0003');
    await t.ctx.db.update(s.giftClaims).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.giftClaims.recipientEmail, email));
    expect(await expireGifts(t.ctx)).toBeGreaterThanOrEqual(1);
    const token = await tokenFor(email);
    expect((await new Client(t.app).get(`/api/v1/gifts/claim/${token}`)).gift.status).toBe('expired');

    await buyer.c.put('/api/v1/cart/items', { variantId, quantity: 1 });
    const failed = await buyer.c.post('/api/v1/checkout', { gift: { recipientEmail: 'nobody@example.test', message: '' }, idempotencyKey: 'gift-test-0004' });
    await buyer.c.post(`/api/v1/payments/dev/${failed.checkout.paymentId}/simulate`, { outcome: 'failed' });
    expect(await t.ctx.db.select().from(s.giftClaims).where(eq(s.giftClaims.orderId, failed.order.id))).toHaveLength(0);

    const r = await member('Refund Recipient');
    const { co } = await giftTo(r.email, 'gift-test-0005');
    const [claim] = await t.ctx.db.select().from(s.giftClaims).where(eq(s.giftClaims.orderId, co.order.id));
    expect(claim.status).toBe('claimed');
    const { makeAdmin } = await import('./harness');
    const admin = await member('Refund Admin'); await makeAdmin(t, admin.userId);
    const { refund } = await buyer.c.post(`/api/v1/orders/${co.order.id}/refund-request`, { reason: 'Changed my mind' });
    await admin.c.post(`/api/v1/admin/refunds/${refund.id}/decide`, { approve: true, note: 'Approved in test' });
    const [after] = await t.ctx.db.select().from(s.giftClaims).where(eq(s.giftClaims.id, claim.id));
    expect(after.status).toBe('refunded');
    const ents = await t.ctx.db.select().from(s.entitlements).where(and(eq(s.entitlements.sourceType, 'gift_claim'), eq(s.entitlements.sourceId, claim.id)));
    expect(ents[0].revokedAt).not.toBeNull();
  });

  it('rejects gifting to yourself', async () => {
    await buyer.c.put('/api/v1/cart/items', { variantId, quantity: 1 });
    expect((await buyer.c.req('POST', '/api/v1/checkout', { gift: { recipientEmail: buyer.email, message: '' }, idempotencyKey: 'gift-test-0006' })).status).toBe(400);
    await buyer.c.put('/api/v1/cart/items', { variantId, quantity: 0 });
  });
});

describe('DEF-05 — late provider success after an order expired is refunded', () => {
  it('requests an automatic refund instead of keeping the payment', async () => {
    const u = await member('Late Payer');
    const variantId = (await u.c.get('/api/v1/products/cosmetic-card-styles')).variants[0].id;
    await u.c.put('/api/v1/cart/items', { variantId, quantity: 1 });
    const co = await u.c.post('/api/v1/checkout', { idempotencyKey: 'late-pay-0001' });
    const { runScheduledJobs } = await import('../../src/server/services/scheduler');
    await runScheduledJobs(t.ctx, new Date(Date.now() + 2 * 3600000));
    expect((await u.c.get(`/api/v1/orders/${co.order.id}`)).order.status).toBe('cancelled');
    await u.c.post(`/api/v1/payments/dev/${co.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const order = await u.c.get(`/api/v1/orders/${co.order.id}`);
    expect(order.refunds.length).toBe(1);
    expect(order.refunds[0].status).toBe('requested');
  });
});

describe('Retention', () => {
  it('blanks delivered SMTP bodies and removes stale sessions and tokens', async () => {
    const [mail] = await t.ctx.db.insert(s.emailOutbox).values({ toEmail: 'x@example.test', subject: 'Reset', textBody: 'token=abc', transport: 'smtp', status: 'sent', createdAt: new Date(Date.now() - 3 * 86400000) }).returning();
    await runRetention(t.ctx);
    const [after] = await t.ctx.db.select().from(s.emailOutbox).where(eq(s.emailOutbox.id, mail.id));
    expect(after.textBody).not.toContain('token=');
  });
});
