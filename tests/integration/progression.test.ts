import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { QUESTIONS } from '../../src/shared/personality';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const answers = Object.fromEntries(QUESTIONS.map((q, i) => [q.id, [5, 4, 2, 1, 4][i % 5]]));
type Q = { key: string; complete: boolean; claimed: boolean; claimable: boolean; steps: { value: number; target: number }[] };
const quest = (p: { quests: Q[] }, key: string) => p.quests.find((q) => q.key === key)!;

describe('quests, XP ledger and anti-abuse', () => {
  it('daily vibe quest: complete only after a real check-in, claimed once, XP in the single ledger', async () => {
    const u = await signup(t, 'Quest Qadir', { birth: false });
    let p = await u.c.get('/api/v1/progress');
    expect(quest(p, 'daily_vibe').complete).toBe(false);
    expect((await u.c.req('POST', '/api/v1/quests/daily_vibe/claim')).status).toBe(400);
    expect((await u.c.req('POST', '/api/v1/vibe', { mood: 'euphoric-fake' })).status).toBe(400);
    await u.c.post('/api/v1/vibe', { mood: 'calm' });
    p = await u.c.get('/api/v1/progress');
    expect(p.vibe.today).toBe('calm');
    expect(quest(p, 'daily_vibe').claimable).toBe(true);
    const before = p.xp;
    const r = await u.c.post('/api/v1/quests/daily_vibe/claim');
    expect(r.xp).toBe(5);
    expect(r.total).toBe(before + 5);
    // Repeated and concurrent claims never pay twice.
    const again = await Promise.all([u.c.req('POST', '/api/v1/quests/daily_vibe/claim'), u.c.req('POST', '/api/v1/quests/daily_vibe/claim')]);
    expect(again.map((x) => x.status)).toEqual([409, 409]);
    const rows = await t.ctx.db.select().from(s.xpLedger).where(and(eq(s.xpLedger.userId, u.userId), eq(s.xpLedger.rule, 'quest_reward')));
    expect(rows).toHaveLength(1);
    // The mood is not written to analytics.
    const ev = await t.ctx.db.select().from(s.analyticsEvents).where(and(eq(s.analyticsEvents.userId, u.userId), eq(s.analyticsEvents.name, 'vibe_checked_in')));
    expect(JSON.stringify(ev[0].props)).not.toContain('calm');
  });

  it('reply quest counts replies to other people only (self-replies do not farm it)', async () => {
    const a = await signup(t, 'Poster Pari', { birth: false });
    const b = await signup(t, 'Replier Raghu', { birth: false });
    const own = await b.c.post('/api/v1/posts', { kind: 'thought', body: 'My own thought about mangoes.', visibility: 'public' });
    await b.c.post(`/api/v1/posts/${own.post.id}/comments`, { body: 'Replying to myself.' });
    expect(quest(await b.c.get('/api/v1/progress'), 'daily_reply').complete).toBe(false);
    const other = await a.c.post('/api/v1/posts', { kind: 'question', body: 'Best monsoon snack?', visibility: 'public' });
    await b.c.post(`/api/v1/posts/${other.post.id}/comments`, { body: 'Bhajiya, obviously.' });
    expect(quest(await b.c.get('/api/v1/progress'), 'daily_reply').complete).toBe(true);
  });

  it('multi-step founding quest tracks each step from real circle activity', async () => {
    const owner = await signup(t, 'Founder Farid', { birth: false });
    const f1 = await signup(t, 'Friend One', { birth: false });
    const f2 = await signup(t, 'Friend Two', { birth: false });
    const { circle } = await owner.c.post('/api/v1/circles', { name: 'Founders' });
    let q = quest(await owner.c.get('/api/v1/progress'), 'found_a_circle');
    expect(q.steps.map((x) => x.value)).toEqual([1, 0, 0]);
    const { token } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
    for (const f of [f1, f2]) await f.c.post(`/api/v1/circle-invites/${token}/accept`);
    q = quest(await owner.c.get('/api/v1/progress'), 'found_a_circle');
    expect(q.steps.map((x) => x.value)).toEqual([1, 2, 0]);
    const { session } = await owner.c.post('/api/v1/play/sessions', { gameKey: 'pick_your_chaos', circleId: circle.id });
    await owner.c.post(`/api/v1/play/sessions/${session.id}/start`);
    for (let i = 0; i < 5; i++) {
      const v = await owner.c.get(`/api/v1/play/sessions/${session.id}`);
      if (v.session.status !== 'active') break;
      await owner.c.post(`/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: 'a' } });
    }
    q = quest(await owner.c.get('/api/v1/progress'), 'found_a_circle');
    expect(q.complete).toBe(true);
    expect((await owner.c.post('/api/v1/quests/found_a_circle/claim')).xp).toBe(100);
  });

  it('identity exploration quests grant the Identity Explorer achievement after three claims', async () => {
    const u = await signup(t, 'Explorer Esha', { birth: false });
    await u.c.post('/api/v1/personality/assessment', { answers });
    await u.c.patch('/api/v1/identity/me', { labels: ['Night owl', 'Foodie', 'Bookworm'], pseudonym: 'Lamp Post' });
    for (const k of ['explore_archetype', 'explore_labels', 'explore_pen_name']) await u.c.post(`/api/v1/quests/${k}/claim`);
    const inv = await u.c.get('/api/v1/progress/inventory');
    expect(inv.achievements.find((x: { key: string }) => x.key === 'identity_explorer').earnedAt).not.toBeNull();
  });
});

describe('seasons, inventory and reversals', () => {
  it('season milestone rewards are claimed once into the inventory; premium track is off', async () => {
    const u = await signup(t, 'Season Sia', { birth: false });
    await t.ctx.db.insert(s.xpLedger).values({ userId: u.userId, amount: 120, rule: 'test_seed', sourceKey: 'season-seed' });
    const p = await u.c.get('/api/v1/progress');
    const s1 = p.seasons.find((x: { key: string }) => x.key === 's1-first-light');
    expect(s1.status).toBe('current');
    expect(s1.premiumTrack.enabled).toBe(false);
    expect(s1.milestones[0]).toMatchObject({ at: 100, reached: true, claimable: true });
    expect(s1.milestones[1]).toMatchObject({ at: 300, reached: false, claimable: false });
    expect((await u.c.req('POST', '/api/v1/seasons/s1-first-light/milestones/300/claim')).status).toBe(400);
    const r = await u.c.post('/api/v1/seasons/s1-first-light/milestones/100/claim');
    expect(r.reward.key).toBe('badge_s1_spark');
    expect((await u.c.req('POST', '/api/v1/seasons/s1-first-light/milestones/100/claim')).status).toBe(400);
    const inv = await u.c.get('/api/v1/progress/inventory');
    expect(inv.items.find((i: { key: string }) => i.key === 'badge_s1_spark')).toMatchObject({ unlocked: true, source: 'earned' });
    expect(inv.items.find((i: { key: string }) => i.key === 'badge_s1_ember').unlocked).toBe(false);
  });

  it('staff can reverse an award exactly once; members cannot', async () => {
    const u = await signup(t, 'Reversal Ravi', { birth: false });
    await u.c.post('/api/v1/personality/assessment', { answers });
    const [award] = await t.ctx.db.select().from(s.xpLedger).where(and(eq(s.xpLedger.userId, u.userId), eq(s.xpLedger.rule, 'assessment_completed')));
    expect((await u.c.req('POST', `/api/v1/admin/xp/${award.id}/reverse`, { reason: 'self test' })).status).toBe(403);
    const admin = await signup(t, 'Admin Ada', { birth: false });
    await makeAdmin(t, admin.userId);
    const before = (await u.c.get('/api/v1/progress')).xp;
    await admin.c.post(`/api/v1/admin/xp/${award.id}/reverse`, { reason: 'Duplicate account' });
    expect((await admin.c.req('POST', `/api/v1/admin/xp/${award.id}/reverse`, { reason: 'again' })).status).toBe(409);
    expect((await u.c.get('/api/v1/progress')).xp).toBe(before - award.amount);
  });

  it('streak includes today after any meaningful action', async () => {
    const u = await signup(t, 'Streak Sam', { birth: false });
    expect((await u.c.get('/api/v1/progress')).streak.current).toBe(0);
    await u.c.post('/api/v1/vibe', { mood: 'bright' });
    const p = await u.c.get('/api/v1/progress');
    expect(p.streak).toMatchObject({ current: 1, activeToday: true });
  });
});
