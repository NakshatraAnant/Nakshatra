import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client, makeAdmin, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 1)]);

async function uploadFile(c: Client, url: string, buf: Buffer, filename: string, mime: string) {
  await c.get('/api/v1/auth/me');
  const boundary = '----nk' + Math.random().toString(16).slice(2);
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    buf, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({ method: 'POST', url, payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie: c.cookieHeader(), 'x-csrf-token': c.cookies.get('nk_csrf') ?? '' } });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

describe('Thought Drops — photos and voice notes', () => {
  it('posts a voice note (own upload, ≤ 60 s) and a 2–4 photo carousel; foreign or wrong-kind files are refused', async () => {
    const u = await signup(t, 'Voice Vani', { birth: false });
    const other = await signup(t, 'Other Omar', { birth: false });
    const audio = await uploadFile(u.c, '/api/v1/posts/audio', WEBM, 'voice.webm', 'audio/webm');
    expect(audio.status).toBe(200);
    expect(audio.body.mime).toBe('audio/webm');
    // An image is not accepted as a voice note, and a voice note can't be smuggled in as a photo.
    expect((await uploadFile(u.c, '/api/v1/posts/audio', PNG, 'x.png', 'image/png')).status).toBe(400);
    const { post } = await u.c.post('/api/v1/posts', { kind: 'voice', body: '', visibility: 'public', audioUrl: audio.body.url, audioSeconds: 12 });
    expect(post.audioUrl).toBe(audio.body.url);
    expect((await u.c.req('POST', '/api/v1/posts', { kind: 'voice', body: '', visibility: 'public', audioUrl: audio.body.url, audioSeconds: 75 })).status).toBe(400);
    expect((await other.c.req('POST', '/api/v1/posts', { kind: 'voice', body: '', visibility: 'public', audioUrl: audio.body.url, audioSeconds: 5 })).status).toBe(400);
    expect((await u.c.req('POST', '/api/v1/posts', { kind: 'image', body: '', visibility: 'public', imageUrl: audio.body.url })).status).toBe(400);

    const p1 = await uploadFile(u.c, '/api/v1/posts/image', PNG, 'a.png', 'image/png');
    const p2 = await uploadFile(u.c, '/api/v1/posts/image', PNG, 'b.png', 'image/png');
    const car = await u.c.post('/api/v1/posts', { kind: 'image', body: 'Weekend', visibility: 'public', imageUrls: [p1.body.url, p2.body.url] });
    expect(car.post.imageUrls).toEqual([p1.body.url, p2.body.url]);
    expect(car.post.imageUrl).toBe(p1.body.url);
    const feed = await other.c.get('/api/v1/feed?mode=chronological');
    const seen = feed.posts.find((x: { id: string }) => x.id === car.post.id);
    expect(seen.imageUrls).toHaveLength(2);
    expect(feed.posts.find((x: { id: string }) => x.id === post.id).audioSeconds).toBe(12);
  });
});

describe('Discover → People (opt-in, reciprocal)', () => {
  it('lists only opted-in, unblocked, active members to members who opted in themselves; shows only public fields', async () => {
    const a = await signup(t, 'Disc Asha', { birth: false });
    const b = await signup(t, 'Disc Bo', { birth: false });
    const c = await signup(t, 'Disc Cy', { birth: false });
    const quiet = await signup(t, 'Disc Quiet', { birth: false });
    const unverified = await signup(t, 'Disc Unver', { birth: false, verify: false });

    // Browsing needs your own opt-in.
    expect((await a.c.get('/api/v1/people/discover')).optedIn).toBe(false);
    expect((await unverified.c.req('PUT', '/api/v1/people/settings', { discoverable: true, intents: [] })).status).toBe(403);
    await a.c.put('/api/v1/people/settings', { discoverable: true, intents: ['friends', 'game_partners'] });
    await b.c.put('/api/v1/people/settings', { discoverable: true, intents: ['game_partners'] });
    await c.c.put('/api/v1/people/settings', { discoverable: true, intents: ['deep_talks'] });
    expect((await a.c.req('PUT', '/api/v1/people/settings', { discoverable: true, intents: ['friends', 'game_partners', 'deep_talks', 'creative'] })).status).toBe(400);
    await b.c.patch('/api/v1/identity/me', { labels: ['Night owl', 'Gamer'], visibility: { labels: 'private' } });

    const list = await a.c.get('/api/v1/people/discover');
    const ids = list.people.map((p: { userId: string }) => p.userId);
    expect(ids).toEqual(expect.arrayContaining([b.userId, c.userId]));
    expect(ids).not.toContain(a.userId);
    expect(ids).not.toContain(quiet.userId);
    // Shared intents rank first; private labels are not exposed.
    expect(ids.indexOf(b.userId)).toBeLessThan(ids.indexOf(c.userId));
    const bo = list.people.find((p: { userId: string }) => p.userId === b.userId);
    expect(bo.labels).toEqual([]);
    expect(bo.sharedIntents).toEqual(['game_partners']);
    expect(JSON.stringify(list)).not.toContain(b.email);

    // Intent filter.
    const deep = await a.c.get('/api/v1/people/discover?intent=deep_talks');
    expect(deep.people.map((p: { userId: string }) => p.userId)).toEqual([c.userId]);

    // Blocking hides in both directions; opting out removes you.
    await c.c.post(`/api/v1/blocks/${a.userId}`);
    expect((await a.c.get('/api/v1/people/discover')).people.map((p: { userId: string }) => p.userId)).not.toContain(c.userId);
    expect((await c.c.get('/api/v1/people/discover')).people.map((p: { userId: string }) => p.userId)).not.toContain(a.userId);
    await b.c.put('/api/v1/people/settings', { discoverable: false, intents: [] });
    expect((await a.c.get('/api/v1/people/discover')).people.map((p: { userId: string }) => p.userId)).not.toContain(b.userId);
    // Suspended members disappear.
    await t.ctx.db.update(s.users).set({ status: 'suspended' }).where(eq(s.users.id, c.userId));
    await b.c.put('/api/v1/people/settings', { discoverable: true, intents: [] });
    expect((await b.c.get('/api/v1/people/discover')).people.map((p: { userId: string }) => p.userId)).not.toContain(c.userId);
  });

  it('can be switched off by an admin like any module', async () => {
    const admin = await signup(t, 'Disc Admin', { birth: false });
    await makeAdmin(t, admin.userId);
    await admin.c.put('/api/v1/admin/flags/people', { enabled: false, rolloutPercent: 100 });
    expect((await admin.c.req('GET', '/api/v1/people/discover')).status).toBe(404);
    await admin.c.put('/api/v1/admin/flags/people', { enabled: true, rolloutPercent: 100 });
    expect((await admin.c.req('GET', '/api/v1/people/discover')).status).toBe(200);
  });
});

describe('Funnel', () => {
  it('records client funnel events (anonymous for visitors, attributed for members) and reports the cohort funnel', async () => {
    const visitor = new Client(t.app);
    await visitor.post('/api/v1/discover/events', { name: 'landing_viewed' });
    await visitor.post('/api/v1/discover/events', { name: 'assessment_started' });
    expect((await visitor.req('POST', '/api/v1/discover/events', { name: 'post_created' })).status).toBe(400);
    const m = await signup(t, 'Funnel Fay', { birth: false });
    await m.c.post('/api/v1/discover/events', { name: 'result_viewed' });
    await m.c.post('/api/v1/posts', { kind: 'thought', body: 'My first Thought Drop here', visibility: 'public' });
    const rows = await t.ctx.db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.name, 'result_viewed'));
    expect(rows.some((r) => r.userId === m.userId)).toBe(true);
    const anon = await t.ctx.db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.name, 'assessment_started'));
    expect(anon.every((r) => r.userId === null)).toBe(true);

    const admin = await signup(t, 'Funnel Admin', { birth: false });
    await makeAdmin(t, admin.userId);
    const f = await admin.c.get('/api/v1/admin/funnel?days=7');
    expect(f.visitor.find((x: { key: string }) => x.key === 'landing').value).toBeGreaterThanOrEqual(1);
    const signupStep = f.member.find((x: { key: string }) => x.key === 'signup');
    const drop = f.member.find((x: { key: string }) => x.key === 'first_drop');
    expect(signupStep.value).toBeGreaterThanOrEqual(drop.value);
    expect(drop.value).toBeGreaterThanOrEqual(1);
    expect((await m.c.req('GET', '/api/v1/admin/funnel')).status).toBe(403);
  });
});
