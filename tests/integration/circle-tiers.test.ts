import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../../src/server/db/schema';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type U = Awaited<ReturnType<typeof signup>>;
const bodies = (r: { posts: { body: string }[] }) => r.posts.map((p) => p.body);

describe('Circle membership tiers', () => {
  it('members-only channels never leak: list, circle feed, main feed, post page, comments, posting; tier order; archive keeps them closed', async () => {
    const owner = await signup(t, 'Tier Owner', { birth: false });
    const { circle } = await owner.c.post('/api/v1/circles', { name: 'Tiered circle' });
    const mk = async (n: string) => { const u = await signup(t, n, { birth: false }); await t.ctx.db.insert(s.groupMembers).values({ groupId: circle.id, userId: u.userId, role: 'member', status: 'active' }); return u; };
    const core: U = await mk('Tier Core');
    const founder: U = await mk('Tier Founder');
    const regular: U = await mk('Tier Regular');

    expect((await regular.c.req('POST', `/api/v1/circles/${circle.id}/tiers`, { name: 'Core' })).status).toBe(403);
    const coreTier = (await owner.c.post(`/api/v1/circles/${circle.id}/tiers`, { name: 'Core crew' }, 201)).tier;
    const founderTier = (await owner.c.post(`/api/v1/circles/${circle.id}/tiers`, { name: 'Founders', color: 'jade' }, 201)).tier; // higher
    await owner.c.put(`/api/v1/circles/${circle.id}/members/${core.userId}/tier`, { tierId: coreTier.id });
    await owner.c.put(`/api/v1/circles/${circle.id}/members/${founder.userId}/tier`, { tierId: founderTier.id });
    expect(JSON.stringify(await core.c.get('/api/v1/notifications'))).toContain('Core crew');

    const { channel } = await owner.c.post(`/api/v1/circles/${circle.id}/channels`, { name: 'Backstage', tierId: coreTier.id }, 201);
    const other = (await owner.c.post('/api/v1/circles', { name: 'Other tiered' })).circle;
    const foreignTier = (await owner.c.post(`/api/v1/circles/${other.id}/tiers`, { name: 'Elsewhere' }, 201)).tier;
    expect((await owner.c.req('POST', `/api/v1/circles/${circle.id}/channels`, { name: 'Bad', tierId: foreignTier.id })).status).toBe(400);

    const secret = (await core.c.post('/api/v1/posts', { kind: 'thought', body: 'Backstage plans for the trip', visibility: 'group', groupId: circle.id, channelId: channel.id })).post;
    await regular.c.post('/api/v1/posts', { kind: 'thought', body: 'Hello everyone', visibility: 'group', groupId: circle.id });
    expect((await regular.c.req('POST', '/api/v1/posts', { kind: 'thought', body: 'Sneaking in', visibility: 'group', groupId: circle.id, channelId: channel.id })).status).toBe(404);

    const names = async (u: U) => (await u.c.get(`/api/v1/circles/${circle.id}/channels`)).channels.map((c: { name: string }) => c.name);
    expect(await names(regular)).toEqual(['General']);
    expect(await names(core)).toEqual(['General', 'Backstage']);
    expect(await names(founder)).toEqual(['General', 'Backstage']); // higher tier sees lower-tier channels

    expect(bodies(await regular.c.get(`/api/v1/circles/${circle.id}/feed`))).toEqual(['Hello everyone']);
    expect((await regular.c.req('GET', `/api/v1/circles/${circle.id}/feed?channel=${channel.id}`)).status).toBe(404);
    expect(bodies(await regular.c.get('/api/v1/feed?mode=chronological'))).not.toContain('Backstage plans for the trip');
    expect((await regular.c.req('GET', `/api/v1/posts/${secret.id}`)).status).toBe(404);
    expect((await regular.c.req('POST', `/api/v1/posts/${secret.id}/comments`, { body: 'me too' })).status).toBe(404);
    expect(bodies(await founder.c.get(`/api/v1/circles/${circle.id}/feed?channel=${channel.id}`))).toEqual(['Backstage plans for the trip']);
    expect(bodies(await owner.c.get('/api/v1/feed?mode=chronological'))).toContain('Backstage plans for the trip'); // admins see all

    // Losing the tier closes the channel again.
    await owner.c.put(`/api/v1/circles/${circle.id}/members/${core.userId}/tier`, { tierId: null });
    expect((await core.c.req('GET', `/api/v1/posts/${secret.id}`)).status).toBe(200); // still their own post
    expect(await names(core)).toEqual(['General']);

    // Archiving a members-only channel never moves its posts into General.
    await owner.c.patch(`/api/v1/circles/${circle.id}/channels/${channel.id}`, { archived: true });
    expect(bodies(await regular.c.get(`/api/v1/circles/${circle.id}/feed?channel=general`))).toEqual(['Hello everyone']);
    expect((await founder.c.get(`/api/v1/posts/${secret.id}`)).post.body).toBe('Backstage plans for the trip');

    // A tier still used by an open channel can't be archived; once free, archiving clears assignments.
    const ch2 = (await owner.c.post(`/api/v1/circles/${circle.id}/channels`, { name: 'Founders only', tierId: founderTier.id }, 201)).channel;
    expect((await owner.c.req('PATCH', `/api/v1/circles/${circle.id}/tiers/${founderTier.id}`, { archived: true })).status).toBe(409);
    await owner.c.patch(`/api/v1/circles/${circle.id}/channels/${ch2.id}`, { tierId: null });
    await owner.c.patch(`/api/v1/circles/${circle.id}/tiers/${founderTier.id}`, { archived: true });
    const list = await founder.c.get(`/api/v1/circles/${circle.id}/tiers`);
    expect(list.tiers.map((x: { name: string }) => x.name)).toEqual(['Core crew']);
    expect(list.myTierId).toBeNull();
    expect(list.paidNote).toMatch(/payouts to circle owners aren’t built/);

    // Members list shows the tier badge; leaving drops it.
    await owner.c.put(`/api/v1/circles/${circle.id}/members/${regular.userId}/tier`, { tierId: coreTier.id });
    const detail = await owner.c.get(`/api/v1/circles/${circle.id}`);
    expect(detail.members.find((m: { userId: string }) => m.userId === regular.userId).tier).toMatchObject({ name: 'Core crew' });
    await regular.c.post(`/api/v1/circles/${circle.id}/leave`);
    expect((await owner.c.get(`/api/v1/circles/${circle.id}/tiers`)).tiers[0].members).toBe(0);
  });
});
