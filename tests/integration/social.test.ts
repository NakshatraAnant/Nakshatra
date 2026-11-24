import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { Client, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { QUESTIONS } from '../../src/shared/personality';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const answers = (v = 4) => Object.fromEntries(QUESTIONS.map((q, i) => [q.id, ((i + v) % 5) + 1]));
const member = (name: string) => signup(t, name, { birth: false });

async function assess(c: Client) {
  return c.post('/api/v1/personality/assessment', { answers: answers() });
}

async function circleWith(owner: Awaited<ReturnType<typeof member>>, others: Awaited<ReturnType<typeof member>>[]) {
  const { circle } = await owner.c.post('/api/v1/circles', { name: `Circle ${Math.random().toString(36).slice(2, 6)}` });
  const { token } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
  for (const o of others) await o.c.post(`/api/v1/circle-invites/${token}/accept`);
  return circle.id as string;
}

describe('Identity Studio', () => {
  it('scores without storing in preview, and saving completes onboarding without birth details', async () => {
    const anon = new Client(t.app);
    const preview = await anon.post('/api/v1/personality/preview', { answers: answers() });
    expect(preview.result.name).toMatch(/^The /);
    const u = await member('Ira');
    expect((await u.c.get('/api/v1/auth/me')).user.onboardingComplete).toBe(false);
    const saved = await assess(u.c);
    expect(saved.result.key).toBe(preview.result.key);
    const me = (await u.c.get('/api/v1/auth/me')).user;
    expect(me.onboardingComplete).toBe(true);
    expect(me.hasBirthProfile).toBe(false);
    expect(me.hasAssessment).toBe(true);
    const id = await u.c.get('/api/v1/identity/me');
    expect(id.persona.dimensions).toHaveLength(5);
    expect(id.cosmic).toBeNull();
    // Points for discovering an archetype are awarded once.
    await assess(u.c);
    const xp = await t.ctx.db.select().from(s.xpLedger).where(and(eq(s.xpLedger.userId, u.userId), eq(s.xpLedger.rule, 'assessment_completed')));
    expect(xp).toHaveLength(1);
    expect((await u.c.req('POST', '/api/v1/personality/assessment', { answers: { q1: 3 } })).status).toBe(400);
  });

  it('validates labels, pen names and locked card styles on the server', async () => {
    const u = await member('Kabir');
    await assess(u.c);
    await u.c.patch('/api/v1/identity/me', { labels: ['Night owl', 'Foodie'], pseudonym: 'Quiet Comet' });
    expect((await u.c.req('PATCH', '/api/v1/identity/me', { labels: ['Not a real label'] })).status).toBe(400);
    expect((await u.c.req('PATCH', '/api/v1/identity/me', { cardStyle: 'eclipse_ink' })).status).toBe(400);
    expect((await u.c.req('PATCH', '/api/v1/identity/me', { cardStyle: 'aurora' })).status).toBe(400);
    await u.c.patch('/api/v1/identity/me', { cardStyle: 'classic' });
    const other = await member('Nisha');
    expect((await other.c.req('PATCH', '/api/v1/identity/me', { pseudonym: 'quiet comet' })).status).toBe(409);
    expect((await other.c.req('PATCH', '/api/v1/identity/me', { pseudonym: 'call 9876543210' })).status).toBe(400);
  });

  it('public identity respects profile and attribute visibility and never exposes the pen name', async () => {
    const u = await member('Zoya');
    await assess(u.c);
    await u.c.patch('/api/v1/identity/me', { labels: ['Gamer'], pseudonym: 'Hidden Lantern' });
    const anon = new Client(t.app);
    expect((await anon.req('GET', `/api/v1/identity/u/${u.handle}`)).status).toBe(404);
    await u.c.patch('/api/v1/profile', { visibility: 'public' });
    const pub = await anon.get(`/api/v1/identity/u/${u.handle}`);
    expect(pub.persona.name).toBeTruthy();
    expect(pub.labels).toEqual(['Gamer']);
    expect(JSON.stringify(pub)).not.toMatch(/Hidden Lantern|email|birth/i);
    await u.c.patch('/api/v1/identity/me', { visibility: { persona: 'private', labels: 'private' } });
    const hidden = await anon.get(`/api/v1/identity/u/${u.handle}`);
    expect(hidden.persona).toBeNull();
    expect(hidden.labels).toEqual([]);
  });
});

describe('Thought Network', () => {
  it('supports Thought Drop types, pseudonymity boundaries, edits, replies and screening', async () => {
    const a = await member('Arjun');
    const b = await member('Bela');
    await a.c.patch('/api/v1/profile', { visibility: 'public' });
    await b.c.post(`/api/v1/follows/${a.userId}`);
    const { post: q } = await a.c.post('/api/v1/posts', { kind: 'question', body: 'Best street food in Pune?', visibility: 'public', topics: ['food'] });
    expect((await a.c.req('POST', '/api/v1/posts', { kind: 'thought', body: 'x'.repeat(501), visibility: 'public' })).status).toBe(400);
    expect((await a.c.req('POST', '/api/v1/posts', { kind: 'thought', body: 'secret', visibility: 'public', pseudonymous: true })).status).toBe(400);
    await a.c.patch('/api/v1/identity/me', { pseudonym: 'Night Kite' });
    const { post: anon } = await a.c.post('/api/v1/posts', { kind: 'confession', body: 'I still sleep with a nightlight.', visibility: 'public', pseudonymous: true });
    expect(anon.authorId).toBeUndefined();
    expect((await a.c.req('POST', '/api/v1/posts', { kind: 'confession', body: 'text me 9876543210', visibility: 'public', pseudonymous: true })).status).toBe(400);
    expect((await a.c.req('POST', '/api/v1/posts', { kind: 'thought', body: 'just kys', visibility: 'public' })).status).toBe(400);

    const viewed = await b.c.get(`/api/v1/posts/${anon.id}`);
    expect(viewed.post.author).toEqual({ pseudonym: 'Night Kite' });
    expect(JSON.stringify(viewed.post)).not.toContain(a.userId);
    const feed = await b.c.get('/api/v1/feed?mode=ranked');
    const fromFeed = feed.posts.find((p: { id: string }) => p.id === anon.id);
    expect(fromFeed.author.userId).toBeUndefined();
    expect(fromFeed.reasons.join(' ')).not.toMatch(/follow/);
    const profilePosts = await b.c.get(`/api/v1/users/${a.userId}/posts`);
    expect(profilePosts.posts.map((p: { id: string }) => p.id)).not.toContain(anon.id);
    const search = await b.c.get('/api/v1/search?q=nightlight&scope=thoughts');
    expect(search.results.thoughts[0].author).toEqual({ pseudonym: 'Night Kite' });

    // Editing within the window; replies award the author once per replier; threads are bounded.
    await a.c.patch(`/api/v1/posts/${q.id}`, { body: 'Best street food in Pune? Go.' });
    const r1 = await b.c.post(`/api/v1/posts/${q.id}/comments`, { body: 'Vada pav, always.' });
    await b.c.post(`/api/v1/posts/${q.id}/comments`, { body: 'Also misal.' });
    const r2 = await a.c.post(`/api/v1/posts/${q.id}/comments`, { body: 'Where exactly?', parentId: r1.comment.id });
    const r3 = await b.c.post(`/api/v1/posts/${q.id}/comments`, { body: 'Near FC Road.', parentId: r2.comment.id });
    expect((await a.c.req('POST', `/api/v1/posts/${q.id}/comments`, { body: 'too deep', parentId: r3.comment.id })).status).toBe(400);
    const replyXp = await t.ctx.db.select().from(s.xpLedger).where(and(eq(s.xpLedger.userId, a.userId), eq(s.xpLedger.rule, 'reply_received')));
    expect(replyXp).toHaveLength(1);
    // Muting a pseudonymous author works without revealing them.
    await b.c.post(`/api/v1/posts/${anon.id}/mute-author`);
    const after = await b.c.get('/api/v1/feed?mode=chronological');
    expect(after.posts.map((p: { id: string }) => p.id)).not.toContain(anon.id);
  });
});

describe('Circles', () => {
  it('keeps circles private, uses expiring single-hash invites, and enforces roles', async () => {
    const owner = await member('Owner');
    const friend = await member('Friend');
    const outsider = await member('Outsider');
    const { circle } = await owner.c.post('/api/v1/circles', { name: 'Chai Club', theme: 'saffron' });
    expect((await outsider.c.req('GET', `/api/v1/circles/${circle.id}`)).status).toBe(404);
    expect((await outsider.c.req('GET', `/api/v1/circles/${circle.id}/feed`)).status).toBe(404);
    expect((await outsider.c.req('POST', `/api/v1/groups/${circle.id}/join`)).status).toBe(404);
    expect((await outsider.c.get('/api/v1/groups')).groups.map((g: { id: string }) => g.id)).not.toContain(circle.id);
    expect(JSON.stringify(await outsider.c.get('/api/v1/search?q=Chai&scope=groups'))).not.toContain('Chai Club');

    const { token, url } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
    expect(url).toContain('/c/join/');
    const [stored] = await t.ctx.db.select().from(s.circleInvites).where(eq(s.circleInvites.circleId, circle.id));
    expect(stored.tokenHash).not.toBe(token);
    const preview = await new Client(t.app).get(`/api/v1/circle-invites/${token}`);
    expect(preview.circle).toEqual({ name: 'Chai Club', theme: 'saffron', memberCount: 1 });
    expect(JSON.stringify(preview)).not.toMatch(/members"|posts/);
    await friend.c.post(`/api/v1/circle-invites/${token}/accept`);
    const detail = await friend.c.get(`/api/v1/circles/${circle.id}`);
    expect(detail.members).toHaveLength(2);
    expect(detail.me.role).toBe('member');

    // Members post into the circle; outsiders cannot see it.
    const { post } = await friend.c.post('/api/v1/posts', { kind: 'thought', body: 'Who is in for Sunday?', visibility: 'group', groupId: circle.id });
    expect((await friend.c.get(`/api/v1/circles/${circle.id}/feed`)).posts[0].id).toBe(post.id);
    expect((await outsider.c.req('GET', `/api/v1/posts/${post.id}`)).status).toBe(404);

    // Roles: members cannot remove others; the owner cannot leave while others remain.
    expect((await friend.c.req('POST', `/api/v1/circles/${circle.id}/members/${owner.userId}`, { action: 'remove' })).status).toBe(403);
    expect((await owner.c.req('POST', `/api/v1/circles/${circle.id}/leave`)).status).toBe(400);

    // Revoked invites stop working.
    const list = await owner.c.get(`/api/v1/circles/${circle.id}/invites`);
    await owner.c.del(`/api/v1/circles/${circle.id}/invites/${list.invites[0].id}`);
    expect((await outsider.c.req('POST', `/api/v1/circle-invites/${token}/accept`)).status).toBe(410);
    // Expired invites stop working.
    const second = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
    await t.ctx.db.update(s.circleInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.circleInvites.id, second.invite.id));
    expect((await outsider.c.req('GET', `/api/v1/circle-invites/${second.token}`)).status).toBe(410);

    await owner.c.post(`/api/v1/circles/${circle.id}/members/${friend.userId}`, { action: 'remove' });
    expect((await friend.c.req('GET', `/api/v1/circles/${circle.id}`)).status).toBe(404);
  });

  it('rewards the founder only once three members have contributed', async () => {
    const owner = await member('Founder');
    const [x, y] = [await member('X'), await member('Y')];
    const id = await circleWith(owner, [x, y]);
    const xp = () => t.ctx.db.select().from(s.xpLedger).where(and(eq(s.xpLedger.userId, owner.userId), eq(s.xpLedger.rule, 'circle_activated')));
    await owner.c.post('/api/v1/posts', { kind: 'thought', body: 'Hello circle', visibility: 'group', groupId: id });
    await x.c.post('/api/v1/posts', { kind: 'thought', body: 'Hi!', visibility: 'group', groupId: id });
    expect(await xp()).toHaveLength(0);
    await y.c.post('/api/v1/posts', { kind: 'thought', body: 'Hey all', visibility: 'group', groupId: id });
    expect(await xp()).toHaveLength(1);
    const recap = await owner.c.get(`/api/v1/circles/${id}/recap`);
    expect(recap.posts).toBe(3);
    expect(recap.quiet).toBe(false);
  });
});

describe('Play', () => {
  it('runs a full Who Said It? game with hidden authors, scoring, withdrawal and completion points', async () => {
    const host = await member('Host');
    const p2 = await member('Pia');
    const p3 = await member('Raj');
    const circleId = await circleWith(host, [p2, p3]);
    const outsider = await member('Nope');
    const { session } = await host.c.post('/api/v1/play/sessions', { gameKey: 'who_said_it', circleId, allowReuse: true });
    expect((await outsider.c.req('GET', `/api/v1/play/sessions/${session.id}`)).status).toBe(404);
    expect((await host.c.req('POST', `/api/v1/play/sessions/${session.id}/start`)).status).toBe(400);
    await p2.c.post(`/api/v1/play/sessions/${session.id}/join`, { allowReuse: true });
    await p3.c.post(`/api/v1/play/sessions/${session.id}/join`, { allowReuse: true });
    expect((await p2.c.req('POST', `/api/v1/play/sessions/${session.id}/start`)).status).toBe(403);
    await host.c.post(`/api/v1/play/sessions/${session.id}/start`);

    const lines: Record<string, string> = { [host.userId]: 'I can whistle with two fingers', [p2.userId]: 'I name all my plants', [p3.userId]: 'I once won a dance-off' };
    await host.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { text: lines[host.userId] } });
    // Withdraw and resubmit before the round closes.
    await host.c.post(`/api/v1/play/sessions/${session.id}/withdraw`);
    await host.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { text: lines[host.userId] } });
    await p2.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { text: lines[p2.userId] } });
    await p3.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { text: lines[p3.userId] } });

    const players = [host, p2, p3];
    for (let guard = 0; guard < 10; guard++) {
      const view = await host.c.get(`/api/v1/play/sessions/${session.id}`);
      if (view.session.status === 'completed') break;
      expect(view.round.kind).toBe('vote');
      expect(JSON.stringify(view.round)).not.toContain('secret');
      const author = Object.entries(lines).find(([, l]) => l === view.round.prompt)![0];
      for (const p of players) {
        const mine = await p.c.get(`/api/v1/play/sessions/${session.id}`);
        // The round closes automatically once every eligible player has guessed.
        if (mine.session.status !== 'active' || mine.round.index !== view.round.index) break;
        if (!mine.me.canAct) { expect(p.userId).toBe(author); continue; }
        await p.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: author } });
      }
    }
    const done = await host.c.get(`/api/v1/play/sessions/${session.id}`);
    expect(done.session.status).toBe('completed');
    expect(done.history.length).toBe(4);
    expect(done.players.every((p: { score: number }) => p.score === 4)).toBe(true);
    const xp = await t.ctx.db.select().from(s.xpLedger).where(and(eq(s.xpLedger.rule, 'game_completed'), eq(s.xpLedger.sourceKey, session.id)));
    expect(xp).toHaveLength(3);
    expect((await host.c.req('POST', `/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: p2.userId } })).status).toBe(400);
  });

  it('Honest Vote never exposes individual votes; Memory Lane only reuses consented lines', async () => {
    const [h, a, b] = [await member('H1'), await member('A1'), await member('B1')];
    const circleId = await circleWith(h, [a, b]);
    const { session } = await h.c.post('/api/v1/play/sessions', { gameKey: 'honest_vote', circleId });
    await a.c.post(`/api/v1/play/sessions/${session.id}/join`);
    await b.c.post(`/api/v1/play/sessions/${session.id}/join`);
    await h.c.post(`/api/v1/play/sessions/${session.id}/start`);
    for (let i = 0; i < 4; i++) {
      await h.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: a.userId } });
      await a.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: b.userId } });
      await b.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: a.userId } });
    }
    const view = await b.c.get(`/api/v1/play/sessions/${session.id}`);
    expect(view.session.status).toBe('completed');
    const raw = JSON.stringify(view.history);
    expect(raw).toContain('Totals only');
    expect(raw).not.toContain(h.userId);
    // No reusable lines were contributed, so Memory Lane cannot start.
    const ml = await h.c.post('/api/v1/play/sessions', { gameKey: 'memory_lane', circleId });
    await a.c.post(`/api/v1/play/sessions/${ml.session.id}/join`);
    await b.c.post(`/api/v1/play/sessions/${ml.session.id}/join`);
    const res = await h.c.req('POST', `/api/v1/play/sessions/${ml.session.id}/start`);
    expect(res.status).toBe(400);
    expect(res.raw).toMatch(/allow reuse/);
  });

  it('plays a solo game, enforces turn order, and settles play points without touching the ledger', async () => {
    const solo = await member('Solo');
    expect((await solo.c.req('POST', '/api/v1/play/sessions', { gameKey: 'who_said_it' })).status).toBe(400);
    const { session } = await solo.c.post('/api/v1/play/sessions', { gameKey: 'pick_your_chaos' });
    await solo.c.post(`/api/v1/play/sessions/${session.id}/start`);
    for (let i = 0; i < 5; i++) await solo.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: 'a' } });
    expect((await solo.c.get(`/api/v1/play/sessions/${session.id}`)).session.status).toBe('completed');

    const [h, a] = [await member('PH'), await member('PA')];
    const circleId = await circleWith(h, [a]);
    const pt = await h.c.post('/api/v1/play/sessions', { gameKey: 'plot_twist', circleId });
    await a.c.post(`/api/v1/play/sessions/${pt.session.id}/join`);
    await h.c.post(`/api/v1/play/sessions/${pt.session.id}/start`);
    const v = await h.c.get(`/api/v1/play/sessions/${pt.session.id}`);
    const actor = v.round.actorId === h.userId ? h : a;
    const waiting = actor === h ? a : h;
    expect((await waiting.c.req('POST', `/api/v1/play/sessions/${pt.session.id}/submit`, { payload: { text: 'Not my turn' } })).status).toBe(403);
    await actor.c.post(`/api/v1/play/sessions/${pt.session.id}/submit`, { payload: { text: 'Then the lights came back on.' } });
    expect((await h.c.get(`/api/v1/play/sessions/${pt.session.id}`)).round.index).toBe(1);

    const pm = await h.c.post('/api/v1/play/sessions', { gameKey: 'prediction_market', circleId });
    await a.c.post(`/api/v1/play/sessions/${pm.session.id}/join`);
    await h.c.post(`/api/v1/play/sessions/${pm.session.id}/start`);
    const pv = await h.c.get(`/api/v1/play/sessions/${pm.session.id}`);
    const [o0, o1] = pv.round.options.map((o: { id: string }) => o.id);
    await h.c.post(`/api/v1/play/sessions/${pm.session.id}/submit`, { payload: { optionId: o0, stake: 4 } });
    await a.c.post(`/api/v1/play/sessions/${pm.session.id}/submit`, { payload: { optionId: o1, stake: 6 } });
    expect((await a.c.req('POST', `/api/v1/play/sessions/${pm.session.id}/submit`, { payload: { optionId: o0 } })).status).toBe(403);
    await h.c.post(`/api/v1/play/sessions/${pm.session.id}/submit`, { payload: { optionId: o0 } });
    const settled = await h.c.get(`/api/v1/play/sessions/${pm.session.id}`);
    expect(settled.session.status).toBe('completed');
    expect(settled.payouts.find((p: { name: string }) => p.name === 'PH').playPoints).toBe(16);
    const ledger = await t.ctx.db.select().from(s.xpLedger).where(eq(s.xpLedger.userId, h.userId));
    expect(ledger.every((l) => l.amount < 100 || l.rule === 'circle_activated')).toBe(true);
  });
});

describe('Rituals, referrals and offers', () => {
  it('accepts one ritual answer per period and unlocks circle answers only after answering', async () => {
    const [o, f] = [await member('RO'), await member('RF')];
    const circleId = await circleWith(o, [f]);
    const r = await o.c.post('/api/v1/social-rituals/daily_choice/respond', { optionId: 'a' });
    expect(r.results.total).toBeGreaterThanOrEqual(1);
    expect((await o.c.req('POST', '/api/v1/social-rituals/daily_choice/respond', { optionId: 'b' })).status).toBe(409);
    await o.c.post('/api/v1/social-rituals/circle_question/respond', { circleId, text: 'Pizza night!' });
    const before = await f.c.get('/api/v1/social-rituals');
    expect(before.circle[0].answers).toBeNull();
    expect(before.circle[0].answeredCount).toBe(1);
    await f.c.post('/api/v1/social-rituals/circle_question/respond', { circleId, text: 'Board games.' });
    const after = await f.c.get('/api/v1/social-rituals');
    expect(after.circle[0].answers.map((x: { text: string }) => x.text)).toEqual(['Pizza night!', 'Board games.']);
    const outsider = await member('ROut');
    expect((await outsider.c.req('POST', '/api/v1/social-rituals/circle_question/respond', { circleId, text: 'hi' })).status).toBe(404);
  });

  it('approves a referral only after activation and rejects self-referrals', async () => {
    const ref = await member('Referrer');
    const { code } = await ref.c.get('/api/v1/referrals');
    const friend = await signup(t, 'Invited', { birth: false, referralCode: code });
    let hist = await ref.c.get('/api/v1/referrals');
    expect(hist.history[0].status).toBe('pending');
    await assess(friend.c);
    hist = await ref.c.get('/api/v1/referrals');
    expect(hist.history[0].status).toBe('pending');
    await friend.c.post('/api/v1/social-rituals/daily_choice/respond', { optionId: 'b' });
    hist = await ref.c.get('/api/v1/referrals');
    expect(hist.history[0].status).toBe('approved');
    expect(hist.totals.points).toBe(100);

    // Self-referral through an email alias is rejected.
    const selfRef = new Client(t.app);
    const [refUser] = await t.ctx.db.select().from(s.users).where(eq(s.users.id, ref.userId));
    const alias = refUser.email.replace('@', '+alt@');
    await selfRef.post('/api/v1/auth/signup', { email: alias, password: 'correct-horse-battery', displayName: 'Alt', confirmAdult: true, acceptTerms: true, referralCode: code }, 201);
    const [altUser] = await t.ctx.db.select().from(s.users).where(eq(s.users.email, alias));
    await t.ctx.db.update(s.users).set({ emailVerifiedAt: new Date() }).where(eq(s.users.id, altUser.id));
    await selfRef.post('/api/v1/personality/assessment', { answers: answers() });
    hist = await ref.c.get('/api/v1/referrals');
    expect(hist.history.find((h: { name: string }) => h.name === 'Alt').status).toBe('rejected');
  });

  it('gates the identity report on an assessment and unlocks purchased card styles via entitlements', async () => {
    const u = await member('Buyer');
    const { products } = await u.c.get('/api/v1/products');
    const report = products.find((p: { slug: string }) => p.slug === 'report-identity-expanded');
    const pack = products.find((p: { slug: string }) => p.slug === 'cosmetic-card-styles');
    expect(report && pack).toBeTruthy();
    const detail = await u.c.get(`/api/v1/products/${report.slug}`);
    await u.c.put('/api/v1/cart/items', { variantId: detail.variants[0].id, quantity: 1 });
    expect((await u.c.req('POST', '/api/v1/checkout', { idempotencyKey: 'id-report-1' })).status).toBe(400);
    await assess(u.c);
    const order = await u.c.post('/api/v1/checkout', { idempotencyKey: 'id-report-2' });
    expect(order.checkout.isSimulated).toBe(true);
    await u.c.post(`/api/v1/payments/dev/${order.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    const lib = await u.c.get('/api/v1/library');
    expect(JSON.stringify(lib)).toContain('Expanded Identity Report');

    const packDetail = await u.c.get(`/api/v1/products/${pack.slug}`);
    await u.c.put('/api/v1/cart/items', { variantId: packDetail.variants[0].id, quantity: 1 });
    const o2 = await u.c.post('/api/v1/checkout', { idempotencyKey: 'pack-order-1' });
    expect((await u.c.req('PATCH', '/api/v1/identity/me', { cardStyle: 'eclipse_ink' })).status).toBe(400);
    await u.c.post(`/api/v1/payments/dev/${o2.checkout.paymentId}/simulate`, { outcome: 'succeeded' });
    await u.c.patch('/api/v1/identity/me', { cardStyle: 'eclipse_ink' });
    const styles = (await u.c.get('/api/v1/identity/me')).cardStyles;
    expect(styles.find((x: { key: string }) => x.key === 'eclipse_ink').source).toBe('purchased');
    // Purchases never add points.
    const ledger = await t.ctx.db.select().from(s.xpLedger).where(eq(s.xpLedger.userId, u.userId));
    expect(ledger.map((l) => l.rule)).not.toContain('product_ordered');
  });

  it('switching a feature off blocks the API, not just the navigation', async () => {
    const u = await member('Flagged');
    await t.ctx.db.update(s.featureFlags).set({ enabled: false }).where(eq(s.featureFlags.key, 'play'));
    expect((await u.c.req('POST', '/api/v1/play/sessions', { gameKey: 'pick_your_chaos' })).status).toBe(404);
    expect((await u.c.get('/api/v1/features')).features.play).toBe(false);
    await t.ctx.db.update(s.featureFlags).set({ enabled: true }).where(eq(s.featureFlags.key, 'play'));
  });
});
