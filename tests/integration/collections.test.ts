import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type U = Awaited<ReturnType<typeof signup>>;
const bodies = (r: { posts: { body: string }[] }) => r.posts.map((p) => p.body);

describe('Close friends', () => {
  it('only listed people see close-friends posts — in feeds, on the profile and by direct link; nobody is told; blocks drop the link', async () => {
    const author = await signup(t, 'Cf Author', { birth: false });
    const friend = await signup(t, 'Cf Friend', { birth: false });
    const follower = await signup(t, 'Cf Follower', { birth: false });
    const stranger = await signup(t, 'Cf Stranger', { birth: false });
    await author.c.patch('/api/v1/profile', { visibility: 'public' });
    for (const u of [friend, follower]) await u.c.post(`/api/v1/follows/${author.userId}`);

    expect((await author.c.req('PUT', `/api/v1/close-friends/${stranger.userId}`, { on: true })).status).toBe(400); // not connected
    await author.c.put(`/api/v1/close-friends/${friend.userId}`, { on: true });
    const list = await author.c.get('/api/v1/close-friends');
    expect(list.people.find((p: { userId: string }) => p.userId === friend.userId).onList).toBe(true);
    expect(list.count).toBe(1);
    expect(JSON.stringify(await friend.c.get('/api/v1/notifications'))).not.toMatch(/close friend/i);

    expect((await author.c.req('POST', '/api/v1/posts', { kind: 'thought', body: 'x', visibility: 'close_friends', pseudonymous: true })).status).toBe(400);
    const { post } = await author.c.post('/api/v1/posts', { kind: 'thought', body: 'Only for my people', visibility: 'close_friends' });
    await author.c.post('/api/v1/posts', { kind: 'thought', body: 'For all followers', visibility: 'followers' });

    for (const mode of ['ranked', 'following', 'chronological']) {
      expect(bodies(await friend.c.get(`/api/v1/feed?mode=${mode}`))).toContain('Only for my people');
      const f = bodies(await follower.c.get(`/api/v1/feed?mode=${mode}`));
      expect(f).toContain('For all followers');
      expect(f).not.toContain('Only for my people');
    }
    expect((await follower.c.req('GET', `/api/v1/posts/${post.id}`)).status).toBe(404);
    expect((await stranger.c.req('GET', `/api/v1/posts/${post.id}`)).status).toBe(404);
    expect(bodies(await follower.c.get(`/api/v1/users/${author.userId}/posts`))).not.toContain('Only for my people');
    expect(bodies(await friend.c.get(`/api/v1/users/${author.userId}/posts`))).toContain('Only for my people');
    expect((await friend.c.get(`/api/v1/posts/${post.id}`)).post.visibility).toBe('close_friends');

    await author.c.put(`/api/v1/close-friends/${friend.userId}`, { on: false });
    expect((await friend.c.req('GET', `/api/v1/posts/${post.id}`)).status).toBe(404);
    await author.c.put(`/api/v1/close-friends/${friend.userId}`, { on: true });
    await friend.c.post(`/api/v1/blocks/${author.userId}`);
    expect((await author.c.get('/api/v1/close-friends')).count).toBe(0);
  });
});

describe('Collections', () => {
  async function pair(): Promise<[U, U, U]> {
    const owner = await signup(t, 'Col Owner', { birth: false });
    const writer = await signup(t, 'Col Writer', { birth: false });
    const visitor = await signup(t, 'Col Visitor', { birth: false });
    await writer.c.patch('/api/v1/profile', { visibility: 'public' });
    await owner.c.patch('/api/v1/profile', { visibility: 'public' });
    await owner.c.post(`/api/v1/follows/${writer.userId}`);
    return [owner, writer, visitor];
  }

  it('private and public collections; each viewer sees only posts they could open; pen-name posts never tie back to the owner', async () => {
    const [owner, writer, visitor] = await pair();
    const pub = (await writer.c.post('/api/v1/posts', { kind: 'thought', body: 'Public gem', visibility: 'public' })).post;
    const fol = (await writer.c.post('/api/v1/posts', { kind: 'thought', body: 'Followers-only gem', visibility: 'followers' })).post;
    await owner.c.patch('/api/v1/identity/me', { pseudonym: `Quiet Owl ${Date.now() % 10000}` });
    const pen = (await owner.c.post('/api/v1/posts', { kind: 'thought', body: 'My pen-name musing', visibility: 'public', pseudonymous: true })).post;

    const { collection } = await owner.c.post('/api/v1/collections', { name: 'Keepers', visibility: 'public' }, 201);
    const priv = (await owner.c.post('/api/v1/collections', { name: 'Just mine' }, 201)).collection;
    for (const p of [pub, fol, pen]) await owner.c.post(`/api/v1/collections/${collection.id}/items`, { postId: p.id, note: 'good' });
    const stranger = (await visitor.c.post('/api/v1/posts', { kind: 'thought', body: 'Visitor private', visibility: 'followers' })).post;
    expect((await owner.c.req('POST', `/api/v1/collections/${collection.id}/items`, { postId: stranger.id })).status).toBe(404); // can't add what you can't see
    expect((await visitor.c.req('POST', `/api/v1/collections/${collection.id}/items`, { postId: pub.id })).status).toBe(404);

    const mine = await owner.c.get(`/api/v1/collections/${collection.id}`);
    expect(bodies(mine).sort()).toEqual(['Followers-only gem', 'My pen-name musing', 'Public gem']);
    expect(mine.posts[0].note).toBe('good');
    const theirs = await visitor.c.get(`/api/v1/collections/${collection.id}`);
    expect(bodies(theirs)).toEqual(['Public gem']);
    expect(theirs.hidden).toBe(2);
    expect((await visitor.c.req('GET', `/api/v1/collections/${priv.id}`)).status).toBe(404);
    expect((await visitor.c.get(`/api/v1/users/${owner.userId}/collections`)).collections.map((c: { name: string }) => c.name)).toEqual(['Keepers']);

    // A private profile keeps its collections to approved followers.
    await owner.c.patch('/api/v1/profile', { visibility: 'private' });
    expect((await visitor.c.get(`/api/v1/users/${owner.userId}/collections`)).collections).toEqual([]);
    expect((await visitor.c.req('GET', `/api/v1/collections/${collection.id}`)).status).toBe(404);
    await owner.c.patch('/api/v1/profile', { visibility: 'public' });

    expect((await owner.c.get(`/api/v1/posts/${pub.id}/collections`)).collections).toEqual(expect.arrayContaining([{ id: collection.id, name: 'Keepers', contains: true }, { id: priv.id, name: 'Just mine', contains: false }]));
    expect((await owner.c.get('/api/v1/collections')).saved).toBe(3); // adding also saves

    await owner.c.req('DELETE', `/api/v1/collections/${collection.id}/items/${pub.id}`);
    expect(bodies(await visitor.c.get(`/api/v1/collections/${collection.id}`))).toEqual([]);
    await owner.c.patch(`/api/v1/collections/${collection.id}`, { visibility: 'private' });
    expect((await visitor.c.req('GET', `/api/v1/collections/${collection.id}`)).status).toBe(404);
    await owner.c.req('DELETE', `/api/v1/collections/${collection.id}`);
    expect((await owner.c.req('GET', `/api/v1/collections/${collection.id}`)).status).toBe(404);
  });

  it('saving a post from the feed works (toggle on and off)', async () => {
    const [owner, writer] = await pair();
    const p = (await writer.c.post('/api/v1/posts', { kind: 'thought', body: 'Save me', visibility: 'public' })).post;
    await owner.c.post(`/api/v1/posts/${p.id}/save`, { saved: true });
    expect(bodies(await owner.c.get('/api/v1/saved-posts'))).toEqual(['Save me']);
    await owner.c.post(`/api/v1/posts/${p.id}/save`, { saved: false });
    expect(bodies(await owner.c.get('/api/v1/saved-posts'))).toEqual([]);
  });
});
