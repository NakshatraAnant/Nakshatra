import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { composeCollab, COLLAB_RULES } from '../../src/shared/collab';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Collaborative Drops', () => {
  it('composes within a Thought Drop and credits only people who wrote', () => {
    expect(composeCollab('Opening', [{ name: 'Asha', text: 'One' }, { name: 'Rohan', text: '  ' }, { name: 'Meera', text: 'Two' }])).toBe('Opening\nOne\nTwo\n— with Asha and Meera');
    const worst = composeCollab('x'.repeat(COLLAB_RULES.openingMax), Array.from({ length: COLLAB_RULES.maxCollaborators }, () => ({ name: 'n'.repeat(60), text: 'y'.repeat(COLLAB_RULES.lineMax) })));
    expect(worst.length).toBeLessThanOrEqual(500);
  });

  it('invite → accept/decline → lines → remove → publish once through the normal post path; outsiders see nothing', async () => {
    const owner = await signup(t, 'Collab Owner', { birth: false });
    const friend = await signup(t, 'Collab Friend', { birth: false });
    const second = await signup(t, 'Collab Second', { birth: false });
    const stranger = await signup(t, 'Collab Stranger', { birth: false });
    // A follow only counts once it is accepted: public profiles accept at once, private ones are a request.
    await owner.c.post(`/api/v1/follows/${stranger.userId}`, {});
    for (const u of [friend, second]) { await u.c.patch('/api/v1/profile', { visibility: 'public' }); await owner.c.post(`/api/v1/follows/${u.userId}`, {}); }

    const { collab } = await owner.c.post('/api/v1/collabs', { opening: 'Best small joy this week?' }, 201);
    const base = `/api/v1/collabs/${collab.id}`;
    expect(collab).toMatchObject({ status: 'draft', isOwner: true, members: [] });

    // Only connected people can be invited, only by the owner; nobody else can even see the draft.
    expect((await owner.c.req('POST', `${base}/invite`, { userId: stranger.userId })).status).toBe(403);
    expect((await stranger.c.req('GET', base)).status).toBe(404);
    expect((await friend.c.req('GET', base)).status).toBe(404);
    await owner.c.post(`${base}/invite`, { userId: friend.userId });
    await owner.c.post(`${base}/invite`, { userId: second.userId });
    expect((await owner.c.req('POST', `${base}/invite`, { userId: friend.userId })).status).toBe(409);
    expect((await friend.c.req('POST', `${base}/invite`, { userId: stranger.userId })).status).toBe(403);
    expect((await owner.c.get('/api/v1/collabs/invitable')).people.map((p: { userId: string }) => p.userId).sort()).toEqual([friend.userId, second.userId].sort());

    // An invited person sees the draft but cannot write until they accept; publishing needs a real line.
    expect((await friend.c.get(base)).collab.myStatus).toBe('invited');
    expect((await friend.c.req('PUT', `${base}/line`, { line: 'too early' })).status).toBe(403);
    expect((await owner.c.req('POST', `${base}/publish`, {})).status).toBe(400);
    await friend.c.post(`${base}/respond`, { accept: true });
    await second.c.post(`${base}/respond`, { accept: true });
    expect((await friend.c.req('POST', `${base}/respond`, { accept: true })).status).toBe(409);
    await friend.c.req('PUT', `${base}/line`, { line: 'Chai on the terrace.' });
    await second.c.req('PUT', `${base}/line`, { line: 'This line will be removed.' });
    expect((await friend.c.req('PUT', `${base}/line`, { line: 'x'.repeat(COLLAB_RULES.lineMax + 1) })).status).toBe(400);
    // Only the owner edits the opening, cancels or publishes.
    expect((await friend.c.req('PATCH', base, { opening: 'hijack' })).status).toBe(403);
    expect((await friend.c.req('POST', `${base}/publish`, {})).status).toBe(403);
    expect((await friend.c.req('POST', `${base}/cancel`, {})).status).toBe(403);
    expect((await friend.c.req('DELETE', `${base}/members/${second.userId}`)).status).toBe(403);

    // A removed collaborator loses access and their line is not published.
    await owner.c.req('DELETE', `${base}/members/${second.userId}`);
    expect((await second.c.req('GET', base)).status).toBe(404);
    expect((await second.c.req('PUT', `${base}/line`, { line: 'sneak back in' })).status).toBe(404);

    const posts0 = (await t.ctx.db.select().from(s.posts).where(eq(s.posts.authorId, owner.userId))).length;
    const pub = await owner.c.post(`${base}/publish`, {});
    expect(pub.collab).toMatchObject({ status: 'published', postId: pub.postId });
    const [post] = await t.ctx.db.select().from(s.posts).where(eq(s.posts.id, pub.postId));
    expect(post).toMatchObject({ authorId: owner.userId, kind: 'thought', visibility: 'public', body: 'Best small joy this week?\nChai on the terrace.\n— with Collab Friend' });
    expect(post.body).not.toContain('removed');
    // Published once; nothing can change afterwards.
    expect((await owner.c.req('POST', `${base}/publish`, {})).status).toBe(409);
    expect((await friend.c.req('PUT', `${base}/line`, { line: 'late edit' })).status).toBe(409);
    expect((await owner.c.req('POST', `${base}/cancel`, {})).status).toBe(409);
    expect((await t.ctx.db.select().from(s.posts).where(eq(s.posts.authorId, owner.userId))).length).toBe(posts0 + 1);
  });

  it('declining, leaving and cancelling close things off cleanly', async () => {
    const owner = await signup(t, 'Collab Host', { birth: false });
    const guest = await signup(t, 'Collab Guest', { birth: false });
    await owner.c.patch('/api/v1/profile', { visibility: 'public' });
    await guest.c.post(`/api/v1/follows/${owner.userId}`, {});
    const { collab } = await owner.c.post('/api/v1/collabs', { opening: 'A line each?', visibility: 'followers' }, 201);
    const base = `/api/v1/collabs/${collab.id}`;
    await owner.c.post(`${base}/invite`, { userId: guest.userId });
    await guest.c.post(`${base}/respond`, { accept: false });
    expect((await guest.c.req('GET', base)).status).toBe(404);
    expect((await guest.c.get('/api/v1/collabs')).collabs).toEqual([]);
    // Invited again, accepts, then leaves: the line goes with them.
    await owner.c.post(`${base}/invite`, { userId: guest.userId });
    await guest.c.post(`${base}/respond`, { accept: true });
    await guest.c.req('PUT', `${base}/line`, { line: 'I was here.' });
    await guest.c.req('DELETE', `${base}/members/${guest.userId}`);
    expect((await owner.c.get(base)).collab.preview).toBe('A line each?');
    await owner.c.post(`${base}/cancel`, {});
    expect((await owner.c.req('POST', `${base}/invite`, { userId: guest.userId })).status).toBe(409);
    expect((await owner.c.req('POST', `${base}/publish`, {})).status).toBe(409);
  });
});
