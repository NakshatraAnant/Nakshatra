import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const questions = [
  { text: 'Capital of Kerala?', options: [{ text: 'Kochi' }, { text: 'Thiruvananthapuram', correct: true }] },
  { text: 'Chai or coffee?', options: [{ text: 'Chai', correct: true }, { text: 'Coffee' }] },
  { text: 'Monsoon month?', options: [{ text: 'July', correct: true }, { text: 'January' }] },
];
const inHours = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

/** Pretend the entrant pressed Start `seconds` ago (the server clock is what's measured). */
async function backdate(tournamentId: string, userId: string, seconds: number) {
  await t.ctx.db.update(s.tournamentEntries).set({ startedAt: new Date(Date.now() - seconds * 1000) }).where(and(eq(s.tournamentEntries.tournamentId, tournamentId), eq(s.tournamentEntries.userId, userId)));
}

describe('Tournaments', () => {
  it('invite-only: async invites, server-timed single run, hidden answers, ranking with ties, too-fast held for review', async () => {
    const host = await signup(t, 'Tour Host', { birth: false });
    const p1 = await signup(t, 'Tour Asha', { birth: false });
    const p2 = await signup(t, 'Tour Bilal', { birth: false });
    const p3 = await signup(t, 'Tour Cyrus', { birth: false });
    const stranger = await signup(t, 'Tour Stranger', { birth: false });
    await host.c.patch('/api/v1/profile', { visibility: 'public' });
    for (const p of [p1, p2, p3]) await p.c.post(`/api/v1/follows/${host.userId}`);

    expect((await host.c.req('POST', '/api/v1/play/tournaments', { title: 'Quick fire', questions, access: 'invite', inviteeIds: [stranger.userId], closesAt: inHours(24) })).status).toBe(400);
    expect((await host.c.req('POST', '/api/v1/play/tournaments', { title: 'Too short', questions, access: 'invite', inviteeIds: [p1.userId], closesAt: inHours(0.1) })).status).toBe(400);
    const { tournament } = await host.c.post('/api/v1/play/tournaments', { title: 'Quick fire', questions, access: 'invite', inviteeIds: [p1.userId, p2.userId, p3.userId], closesAt: inHours(24) }, 201);
    const id = tournament.id;

    expect((await stranger.c.req('GET', `/api/v1/play/tournaments/${id}`)).status).toBe(404);
    const notes = await p1.c.get('/api/v1/notifications');
    expect(JSON.stringify(notes)).toContain(`/play/tournaments/${id}`);
    const view = await p1.c.get(`/api/v1/play/tournaments/${id}`);
    expect(view.me).toMatchObject({ state: 'invited', canJoin: true });
    expect(JSON.stringify(view)).not.toContain('Thiruvananthapuram');

    expect((await host.c.req('POST', `/api/v1/play/tournaments/${id}/join`)).status).toBe(400);
    expect((await p1.c.req('POST', `/api/v1/play/tournaments/${id}/start`)).status).toBe(400); // must join first
    for (const p of [p1, p2, p3]) await p.c.post(`/api/v1/play/tournaments/${id}/join`);

    const run = await p1.c.post(`/api/v1/play/tournaments/${id}/start`);
    expect(run.questions).toHaveLength(3);
    expect(JSON.stringify(run)).not.toContain('correct');
    const again = await p1.c.post(`/api/v1/play/tournaments/${id}/start`);
    expect(again.startedAt).toBe(run.startedAt); // the clock doesn't restart

    // Answering three questions in a few milliseconds isn't plausible: kept, but held out of the ranking.
    const fast = await p1.c.post(`/api/v1/play/tournaments/${id}/submit`, { answers: [1, 0, 0] });
    expect(fast).toMatchObject({ score: 3, flag: 'too_fast', rank: null });
    expect((await p1.c.req('POST', `/api/v1/play/tournaments/${id}/submit`, { answers: [1, 0, 0] })).status).toBe(400);
    expect((await p1.c.req('POST', `/api/v1/play/tournaments/${id}/start`)).status).toBe(400);

    await p2.c.post(`/api/v1/play/tournaments/${id}/start`); await backdate(id, p2.userId, 20);
    await p3.c.post(`/api/v1/play/tournaments/${id}/start`); await backdate(id, p3.userId, 20);
    const r2 = await p2.c.post(`/api/v1/play/tournaments/${id}/submit`, { answers: [1, 0, 1] });
    const r3 = await p3.c.post(`/api/v1/play/tournaments/${id}/submit`, { answers: [0, 0, 0] });
    expect(r2).toMatchObject({ score: 2, flag: null, rank: 1 });
    expect(r3).toMatchObject({ score: 2, flag: null });
    // Same score: the quicker run ranks higher; an exact tie shares the rank.
    await t.ctx.db.update(s.tournamentEntries).set({ durationMs: 20000 }).where(eq(s.tournamentEntries.tournamentId, id));
    const mid = await host.c.get(`/api/v1/play/tournaments/${id}`);
    expect(mid.standings.map((r: { rank: number }) => r.rank)).toEqual([1, 1]);
    expect(mid.heldForReview).toBe(1); // host sees a count, not who
    expect(mid.review).toBeNull();

    // A moderator releases the held entry; it joins the ranking at the top.
    await makeAdmin(t, stranger.userId);
    await stranger.c.post(`/api/v1/admin/tournaments/${id}/entries/${p1.userId}/clear`);
    const after = await p1.c.get(`/api/v1/play/tournaments/${id}`);
    expect(after.me).toMatchObject({ rank: 1, flag: null });

    // After close, each entrant sees the answer key next to their own answers — and only their own.
    await t.ctx.db.update(s.tournaments).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(s.tournaments.id, id));
    const closed = await p2.c.get(`/api/v1/play/tournaments/${id}`);
    expect(closed.tournament.status).toBe('closed');
    expect(closed.review[2]).toMatchObject({ chosen: 'January', correct: 'July', right: false });
    const history = await p2.c.get('/api/v1/play/tournaments/history');
    expect(history.history[0]).toMatchObject({ id, score: 2, total: 3, rank: 2, ranked: 3 });
  });

  it('circle tournaments: members join from the circle, outsiders and blocked members cannot; host can cancel', async () => {
    const host = await signup(t, 'Circle Host', { birth: false });
    const member = await signup(t, 'Circle Member', { birth: false });
    const outsider = await signup(t, 'Circle Outsider', { birth: false });
    const { circle } = await host.c.post('/api/v1/circles', { name: `Tourney circle ${Date.now() % 1000}` });
    await t.ctx.db.insert(s.groupMembers).values({ groupId: circle.id, userId: member.userId, role: 'member', status: 'active' });
    expect((await outsider.c.req('POST', '/api/v1/play/tournaments', { title: 'Nope', questions, access: 'circle', circleId: circle.id, closesAt: inHours(5) })).status).toBe(403);
    const { tournament } = await host.c.post('/api/v1/play/tournaments', { title: 'Circle cup', questions, access: 'circle', circleId: circle.id, closesAt: inHours(5) }, 201);
    expect((await member.c.get('/api/v1/play/tournaments')).tournaments.map((x: { id: string }) => x.id)).toContain(tournament.id);
    expect((await outsider.c.req('POST', `/api/v1/play/tournaments/${tournament.id}/join`)).status).toBe(404);
    await member.c.post(`/api/v1/play/tournaments/${tournament.id}/join`);
    expect((await member.c.req('POST', '/api/v1/reports', { targetType: 'tournament', targetId: tournament.id, reason: 'spam' })).status).toBe(200);
    await member.c.post(`/api/v1/blocks/${host.userId}`);
    expect((await member.c.req('GET', `/api/v1/play/tournaments/${tournament.id}`)).status).toBe(404);
    await host.c.post(`/api/v1/play/tournaments/${tournament.id}/cancel`);
    expect((await host.c.get(`/api/v1/play/tournaments/${tournament.id}`)).tournament.status).toBe('cancelled');
  });

  it('season leaderboard: following and circle scopes, hide-me setting, blocks respected, no global board', async () => {
    const me = await signup(t, 'Board Me', { birth: false });
    const friend = await signup(t, 'Board Friend', { birth: false });
    const shy = await signup(t, 'Board Shy', { birth: false });
    for (const u of [friend, shy]) { await u.c.patch('/api/v1/profile', { visibility: 'public' }); await me.c.post(`/api/v1/follows/${u.userId}`); }
    const award = (userId: string, amount: number, key: string) => t.ctx.db.insert(s.xpLedger).values({ userId, amount, rule: 'test_award', sourceKey: key });
    await award(friend.userId, 120, 'a'); await award(shy.userId, 300, 'b'); await award(me.userId, 50, 'c');
    await award(me.userId, 999, 'd').then(() => t.ctx.db.update(s.xpLedger).set({ rule: 'season_reward' }).where(and(eq(s.xpLedger.userId, me.userId), eq(s.xpLedger.sourceKey, 'd'))));

    let board = await me.c.get('/api/v1/play/leaderboards/season?scope=following');
    if (!board.season) return; // outside any configured season: nothing to rank
    expect(board.rows.map((r: { name: string }) => r.name)).toEqual(['Board Shy', 'Board Friend', 'Board Me']);
    expect(board.me).toMatchObject({ rank: 3, points: 50, of: 3 }); // season rewards don't count as points

    await shy.c.put('/api/v1/play/leaderboards/settings', { visible: false });
    board = await me.c.get('/api/v1/play/leaderboards/season?scope=following');
    expect(board.rows.map((r: { name: string }) => r.name)).toEqual(['Board Friend', 'Board Me']);
    expect((await shy.c.get('/api/v1/play/leaderboards/season?scope=following')).me).toMatchObject({ visible: false, of: 1 });

    await friend.c.post(`/api/v1/blocks/${me.userId}`);
    board = await me.c.get('/api/v1/play/leaderboards/season?scope=following');
    expect(board.rows.map((r: { name: string }) => r.name)).toEqual(['Board Me']);
    expect((await me.c.req('GET', `/api/v1/play/leaderboards/season?scope=circle&circleId=${crypto.randomUUID()}`)).status).toBe(404);
  });
});
