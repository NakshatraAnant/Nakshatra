import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { materialiseAllSeries } from '../../src/server/services/circleSpaces';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

async function circleWith(...names: string[]) {
  const owner = await signup(t, `${names[0]} Owner`, { birth: false });
  const { circle } = await owner.c.post('/api/v1/circles', { name: `${names[0]} circle` });
  const others = [];
  for (const n of names.slice(1)) {
    const u = await signup(t, n, { birth: false });
    await t.ctx.db.insert(s.groupMembers).values({ groupId: circle.id, userId: u.userId, role: 'member', status: 'active' });
    others.push(u);
  }
  return { owner, circle, others };
}
const post = (c: Awaited<ReturnType<typeof signup>>['c'], groupId: string, body: string, channelId?: string) => c.req('POST', '/api/v1/posts', { kind: 'thought', body, visibility: 'group', groupId, channelId });

describe('Circle channels', () => {
  it('admins create channels; announcements are admin-only; feed filters by channel; archiving returns posts to General', async () => {
    const { owner, circle, others: [m, outsider] } = await circleWith('Chan', 'Chan Member', 'Chan Outsider');
    await t.ctx.db.delete(s.groupMembers).where(and(eq(s.groupMembers.groupId, circle.id), eq(s.groupMembers.userId, outsider.userId)));
    expect((await m.c.req('POST', `/api/v1/circles/${circle.id}/channels`, { name: 'Books' })).status).toBe(403);
    expect((await owner.c.req('POST', `/api/v1/circles/${circle.id}/channels`, { name: 'General' })).status).toBe(400);
    const books = (await owner.c.post(`/api/v1/circles/${circle.id}/channels`, { name: 'Books', description: 'What we read' }, 201)).channel;
    const news = (await owner.c.post(`/api/v1/circles/${circle.id}/channels`, { name: 'News', kind: 'announcements' }, 201)).channel;
    expect((await owner.c.req('POST', `/api/v1/circles/${circle.id}/channels`, { name: 'books' })).status).toBe(409);

    expect((await post(m.c, circle.id, 'Reading Gitanjali', books.id)).status).toBe(200);
    expect((await post(m.c, circle.id, 'Big news!', news.id)).status).toBe(403);
    expect((await post(owner.c, circle.id, 'Meetup moved to Sunday', news.id)).status).toBe(200);
    expect((await post(m.c, circle.id, 'Hello all')).status).toBe(200);
    const other = (await owner.c.post('/api/v1/circles', { name: 'Other circle' })).circle;
    const otherCh = (await owner.c.post(`/api/v1/circles/${other.id}/channels`, { name: 'Elsewhere' }, 201)).channel;
    expect((await post(owner.c, circle.id, 'Wrong channel', otherCh.id)).status).toBe(400);

    const feed = (q: string) => m.c.get(`/api/v1/circles/${circle.id}/feed${q}`).then((r) => r.posts.map((p: { body: string }) => p.body));
    expect(await feed(`?channel=${books.id}`)).toEqual(['Reading Gitanjali']);
    expect(await feed('?channel=general')).toEqual(['Hello all']);
    expect((await feed('')).length).toBe(3);
    const list = await m.c.get(`/api/v1/circles/${circle.id}/channels`);
    expect(list.channels.map((c: { name: string; canPost: boolean }) => `${c.name}:${c.canPost}`)).toEqual(['General:true', 'Books:true', 'News:false']);
    expect((await outsider.c.req('GET', `/api/v1/circles/${circle.id}/channels`)).status).toBe(404);

    await owner.c.patch(`/api/v1/circles/${circle.id}/channels/${books.id}`, { archived: true });
    expect(await feed('?channel=general')).toContain('Reading Gitanjali');
  });
});

describe('Circle events', () => {
  it('one-off and repeating events; occurrences materialise idempotently; RSVP; cancel one; end the series', async () => {
    const { owner, circle, others: [m] } = await circleWith('Ev', 'Ev Member');
    const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
    expect((await m.c.req('POST', `/api/v1/circles/${circle.id}/events`, { title: 'Nope', startsAt: inDays(2), mode: 'online' })).status).toBe(403);
    expect((await owner.c.req('POST', `/api/v1/circles/${circle.id}/events`, { title: 'Past', startsAt: inDays(-1), mode: 'online' })).status).toBe(400);
    await owner.c.post(`/api/v1/circles/${circle.id}/events`, { title: 'Picnic', startsAt: inDays(3), mode: 'in_person', location: 'Cubbon Park' }, 201);
    const { seriesId } = await owner.c.post(`/api/v1/circles/${circle.id}/events`, { title: 'Book club', startsAt: inDays(1), durationMinutes: 90, mode: 'online', liveUrl: 'https://meet.example.com/club', repeat: 'weekly' }, 201);

    let ev = await m.c.get(`/api/v1/circles/${circle.id}/events`);
    const club = ev.events.filter((e: { seriesId: string | null }) => e.seriesId === seriesId);
    expect(club.length).toBe(6); // six weeks ahead
    expect(club[0]).toMatchObject({ repeats: 'weekly', liveUrl: null });
    expect(JSON.stringify(await m.c.get('/api/v1/notifications'))).toContain(`/circles/${circle.id}?tab=events`);

    expect(await materialiseAllSeries(t.ctx.db)).toBe(0); // nothing new until time passes; never duplicates
    await m.c.post(`/api/v1/events/${club[0].id}/rsvp`, { status: 'going' });
    ev = await m.c.get(`/api/v1/circles/${circle.id}/events`);
    expect(ev.events.find((e: { id: string }) => e.id === club[0].id)).toMatchObject({ myRsvp: 'going', going: 1, liveUrl: 'https://meet.example.com/club' });

    await owner.c.post(`/api/v1/circles/${circle.id}/events/${club[0].id}/cancel`);
    expect(JSON.stringify(await m.c.get('/api/v1/notifications'))).toContain('Cancelled: Book club');
    const ended = await owner.c.post(`/api/v1/circles/${circle.id}/series/${seriesId}/end`);
    expect(ended.cancelled).toBe(5);
    expect(await materialiseAllSeries(t.ctx.db)).toBe(0);
    ev = await m.c.get(`/api/v1/circles/${circle.id}/events`);
    expect(ev.series).toEqual([]);
    expect(ev.events.filter((e: { status: string }) => e.status !== 'cancelled').map((e: { title: string }) => e.title)).toEqual(['Picnic']);
  });
});

describe('Circle moderator dashboard', () => {
  it('reports in the circle (reporter hidden), remove or keep, pause posting, ban blocks rejoining, moderators can’t act on owners', async () => {
    const { owner, circle, others: [mod, troll, reporter] } = await circleWith('Mod', 'Mod Helper', 'Mod Troll', 'Mod Reporter');
    await owner.c.post(`/api/v1/circles/${circle.id}/members/${mod.userId}`, { action: 'make_admin' });
    expect((await troll.c.req('GET', `/api/v1/circles/${circle.id}/moderation`)).status).toBe(403);

    const bad = (await post(troll.c, circle.id, 'You are all idiots')).body.post;
    const fine = (await post(troll.c, circle.id, 'Sorry, bad day')).body.post;
    await reporter.c.post('/api/v1/reports', { targetType: 'post', targetId: bad.id, reason: 'harassment' });
    await reporter.c.post('/api/v1/reports', { targetType: 'post', targetId: fine.id, reason: 'other' });
    let dash = await mod.c.get(`/api/v1/circles/${circle.id}/moderation`);
    expect(dash.stats.openReports).toBe(2);
    expect(JSON.stringify(dash.reports)).not.toContain(reporter.userId);
    expect(JSON.stringify(dash.reports)).not.toContain('Mod Reporter');
    const r1 = dash.reports.find((r: { postId: string }) => r.postId === bad.id);
    const r2 = dash.reports.find((r: { postId: string }) => r.postId === fine.id);
    await mod.c.post(`/api/v1/circles/${circle.id}/moderation/reports/${r1.id}`, { decision: 'remove' });
    await mod.c.post(`/api/v1/circles/${circle.id}/moderation/reports/${r2.id}`, { decision: 'keep' });
    expect((await reporter.c.req('GET', `/api/v1/posts/${bad.id}`)).status).toBe(404);
    const [platform] = await t.ctx.db.select().from(s.reports).where(eq(s.reports.id, r1.id));
    expect(platform.status).toBe('open'); // Nakshatra's own review still happens

    expect((await mod.c.req('POST', `/api/v1/circles/${circle.id}/timeouts`, { userId: owner.userId, hours: 1, reason: 'test' })).status).toBe(403);
    await mod.c.post(`/api/v1/circles/${circle.id}/timeouts`, { userId: troll.userId, hours: 24, reason: 'Cool off' });
    expect((await post(troll.c, circle.id, 'Still here')).status).toBe(403);
    expect((await troll.c.req('POST', `/api/v1/posts/${fine.id}/comments`, { body: 'me again' })).status).toBe(403);
    expect((await troll.c.req('POST', '/api/v1/posts', { kind: 'thought', body: 'Elsewhere is fine', visibility: 'public' })).status).toBe(200);
    dash = await mod.c.get(`/api/v1/circles/${circle.id}/moderation`);
    expect(dash.timeouts.map((x: { name: string }) => x.name)).toEqual(['Mod Troll']);
    expect(dash.log.map((l: { action: string }) => l.action)).toEqual(expect.arrayContaining(['post removed', 'member paused', 'report kept']));

    await mod.c.post(`/api/v1/circles/${circle.id}/bans`, { userId: troll.userId, ban: true });
    expect((await troll.c.req('GET', `/api/v1/circles/${circle.id}`)).status).toBe(404);
    const { token } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`, {});
    expect((await troll.c.req('POST', `/api/v1/circle-invites/${token}/accept`)).status).toBe(403);
    expect((await mod.c.get(`/api/v1/circles/${circle.id}/moderation`)).banned.map((b: { name: string }) => b.name)).toEqual(['Mod Troll']);
    await owner.c.post(`/api/v1/circles/${circle.id}/bans`, { userId: troll.userId, ban: false });
    expect((await troll.c.req('POST', `/api/v1/circle-invites/${token}/accept`)).status).toBe(200);
  });
});
