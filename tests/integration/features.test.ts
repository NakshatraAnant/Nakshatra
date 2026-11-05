import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, signup, type TestApp } from './harness';
import { QUESTIONS } from '../../src/shared/personality';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const sheet = (v: number[]) => Object.fromEntries(QUESTIONS.map((q, i) => [q.id, v[i % v.length]]));
type M = Awaited<ReturnType<typeof signup>>;
async function circleWith(owner: M, others: M[]) {
  const { circle } = await owner.c.post('/api/v1/circles', { name: `C ${Math.random().toString(36).slice(2, 6)}` });
  const { token } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
  for (const o of others) await o.c.post(`/api/v1/circle-invites/${token}/accept`);
  return circle.id as string;
}

describe('Identity Evolution Timeline', () => {
  it('shows each result with dimension deltas, vibes and milestones — only to its owner', async () => {
    const u = await signup(t, 'Timeline Tara', { birth: false });
    await u.c.post('/api/v1/personality/assessment', { answers: sheet([5, 4, 2, 1, 4]) });
    await u.c.post('/api/v1/personality/assessment', { answers: sheet([1, 2, 4, 5, 2]) });
    await u.c.post('/api/v1/vibe', { mood: 'curious' });
    const tl = await u.c.get('/api/v1/identity/timeline');
    expect(tl.results).toHaveLength(2);
    expect(tl.results[0].dimensions.every((d: { delta: number | null }) => typeof d.delta === 'number')).toBe(true);
    expect(tl.results[1].dimensions.every((d: { delta: number | null }) => d.delta === null)).toBe(true);
    expect(tl.vibes[0].mood).toBe('curious');
    expect(tl.milestones.some((m: { kind: string }) => m.kind === 'achievement')).toBe(true);
  });
});

describe('Common Ground cards', () => {
  it('uses only shared data, gives starters, and is limited to co-members', async () => {
    const a = await signup(t, 'Common Asha', { birth: false });
    const b = await signup(t, 'Common Bilal', { birth: false });
    const outsider = await signup(t, 'Not In Circle', { birth: false });
    for (const m of [a, b]) {
      await m.c.post('/api/v1/personality/assessment', { answers: sheet([5, 4, 2, 1, 4]) });
      await m.c.patch('/api/v1/identity/me', { labels: ['Night owl', 'Foodie'] });
    }
    const circleId = await circleWith(a, [b]);
    const cg = await a.c.get(`/api/v1/circles/${circleId}/common-ground/${b.userId}`);
    expect(cg.sharedLabels).toEqual(['Night owl', 'Foodie']);
    expect(cg.starters.length).toBeGreaterThan(0);
    expect(cg.sameArchetype).toBe(true);
    expect(JSON.stringify(cg)).not.toContain(b.userId);
    // Private labels/archetype are respected.
    await b.c.patch('/api/v1/identity/me', { visibility: { labels: 'private', persona: 'private' } });
    const hidden = await a.c.get(`/api/v1/circles/${circleId}/common-ground/${b.userId}`);
    expect(hidden.sharedLabels).toEqual([]);
    expect(hidden.with.archetype).toBeNull();
    expect(hidden.similarDimensions).toEqual([]);
    expect((await outsider.c.req('GET', `/api/v1/circles/${circleId}/common-ground/${b.userId}`)).status).toBe(404);
    expect((await a.c.req('GET', `/api/v1/circles/${circleId}/common-ground/${outsider.userId}`)).status).toBe(404);
  });
});

describe('Game rematch', () => {
  it('opens a new lobby for a finished game and invites the other players without auto-joining them', async () => {
    const host = await signup(t, 'Rematch Host', { birth: false });
    const p2 = await signup(t, 'Rematch Two', { birth: false });
    const circleId = await circleWith(host, [p2]);
    const { session } = await host.c.post('/api/v1/play/sessions', { gameKey: 'pick_your_chaos', circleId });
    await p2.c.post(`/api/v1/play/sessions/${session.id}/join`, {});
    expect((await p2.c.req('POST', `/api/v1/play/sessions/${session.id}/rematch`)).status).toBe(400);
    await host.c.post(`/api/v1/play/sessions/${session.id}/start`);
    for (let i = 0; i < 12; i++) {
      const v = await host.c.get(`/api/v1/play/sessions/${session.id}`);
      if (v.session.status !== 'active') break;
      for (const p of [host, p2]) await p.c.req('POST', `/api/v1/play/sessions/${session.id}/submit`, { payload: { optionId: 'b' } });
    }
    const r = await p2.c.post(`/api/v1/play/sessions/${session.id}/rematch`);
    expect(r.invited).toBe(1);
    const next = await p2.c.get(`/api/v1/play/sessions/${r.session.id}`);
    expect(next.session.status).toBe('lobby');
    expect(next.players.map((x: { name: string }) => x.name)).toEqual(['Rematch Two']);
    const notes = await host.c.get('/api/v1/notifications');
    expect(JSON.stringify(notes)).toContain('wants a rematch');
  });
});
