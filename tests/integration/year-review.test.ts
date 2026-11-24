import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import * as s from '../../src/server/db/schema';
import { encryptField } from '../../src/server/lib/crypto';
import { Client, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Year in review', () => {
  it('own-data recap; private facts never shareable; consented snapshot cards that can be switched off', async () => {
    const me = await signup(t, 'Year Sharer', { birth: false });
    const friend = await signup(t, 'Year Friend', { birth: false });
    const year = DateTime.now().year;

    const quiet = await friend.c.get('/api/v1/year-review');
    expect(quiet).toMatchObject({ year, soFar: true, canShare: false });
    expect((await friend.c.req('POST', '/api/v1/year-review/cards', { year, facts: ['activeDays'] })).status).toBe(400);

    const { post: drop } = await me.c.post('/api/v1/posts', { kind: 'thought', body: 'First drop of my year', visibility: 'public' });
    await friend.c.post(`/api/v1/posts/${drop.id}/react`, { kind: 'star' });
    await me.c.post(`/api/v1/posts/${drop.id}/react`, { kind: 'heart' }); // your own reaction doesn't count
    await me.c.post('/api/v1/vibe', { mood: 'calm' });
    await t.ctx.db.insert(s.journalEntries).values([`${year}-01-01`, `${year}-01-02`].map((localDate) => ({ userId: me.userId, localDate, bodyEnc: encryptField(t.ctx.config.appSecret, 'catching up') })));

    const r = await me.c.get('/api/v1/year-review');
    expect(r.facts).toMatchObject({ drops: 1, reactions: 1, checkins: 1, topMood: 'calm', journalDays: 2, games: 0 });
    expect(r.facts.activeDays).toBeGreaterThanOrEqual(3);
    expect(r.canShare).toBe(true);
    expect(r.months.reduce((a: number, b: number) => a + b, 0)).toBe(4);
    expect(r.highlights.join(' ')).not.toMatch(/calm|journal|mood/i);
    expect(r.factList.find((f: { key: string }) => f.key === 'topMood').shareable).toBe(false);

    // Private facts and other people's data are refused.
    for (const facts of [['checkins'], ['topMood'], ['journalDays']]) expect((await me.c.req('POST', '/api/v1/year-review/cards', { year, facts })).status).toBe(400);
    expect((await me.c.req('GET', '/api/v1/year-review?year=2001')).status).toBe(404);

    // Empty facts are dropped; values come from the server, not the client.
    const { card } = await me.c.post('/api/v1/year-review/cards', { year, facts: ['drops', 'activeDays', 'games'], showName: true, values: { drops: 999 } }, 201);
    expect(card.facts.map((f: { key: string }) => f.key)).toEqual(['drops', 'activeDays']);
    expect(card.facts[0].value).toBe('1');
    expect((await me.c.req('POST', '/api/v1/year-review/cards', { year, facts: ['games'] })).status).toBe(400);

    const anon = new Client(t.app);
    const pub = await anon.get(`/api/v1/year-cards/${card.slug}`);
    expect(pub.card).toMatchObject({ year, displayName: 'Year Sharer' });
    expect(JSON.stringify(pub)).not.toMatch(/calm|checkins|journal|userId|Year Friend/);
    const { card: anonCard } = await me.c.post('/api/v1/year-review/cards', { year, facts: ['reactions'] }, 201);
    expect((await anon.get(`/api/v1/year-cards/${anonCard.slug}`)).card.displayName).toBeNull();

    const mine = await me.c.get('/api/v1/year-review/cards');
    expect(mine.cards.find((c: { slug: string }) => c.slug === card.slug).views).toBe(1);
    expect((await friend.c.req('DELETE', `/api/v1/year-review/cards/${card.slug}`)).status).toBe(404);
    await me.c.req('DELETE', `/api/v1/year-review/cards/${card.slug}`);
    expect((await anon.req('GET', `/api/v1/year-cards/${card.slug}`)).status).toBe(404);

    const exp = await me.c.post('/api/v1/privacy/export', {});
    expect(exp.data.yearCards).toHaveLength(2);
    const events = await t.ctx.db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.userId, me.userId));
    expect(events.some((e) => e.name === 'year_card_created')).toBe(true);
    expect(JSON.stringify(events.filter((e) => e.name.startsWith('year_')))).not.toMatch(/"value"|calm/);
  });
});
