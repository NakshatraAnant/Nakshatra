import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import * as s from '../../src/server/db/schema';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Journal and identity calendar', () => {
  it('private, encrypted entries; daily prompt; month calendar; export includes it; no content in analytics', async () => {
    const me = await signup(t, 'Journal Writer', { birth: false });
    const other = await signup(t, 'Journal Other', { birth: false });
    const j = await me.c.get('/api/v1/journal');
    expect(j.prompt.text.length).toBeGreaterThan(10);
    expect(j.privacy).toMatch(/Only you/);

    const secret = 'Felt nervous before the presentation but it went fine.';
    const { entry } = await me.c.post('/api/v1/journal', { body: secret, promptKey: j.prompt.key }, 201);
    expect(entry).toMatchObject({ body: secret, prompt: j.prompt.text, date: j.today });
    expect((await me.c.req('POST', '/api/v1/journal', { body: 'x', promptKey: 'not-a-prompt' })).status).toBe(400);
    expect((await me.c.req('POST', '/api/v1/journal', { body: 'from the future', date: DateTime.fromISO(j.today).plus({ days: 2 }).toISODate() })).status).toBe(400);
    const yesterday = DateTime.fromISO(j.today).minus({ days: 1 }).toISODate()!;
    await me.c.post('/api/v1/journal', { body: 'Catching up on yesterday', date: yesterday }, 201);

    // Encrypted at rest, never in analytics.
    const [row] = await t.ctx.db.select().from(s.journalEntries).where(eq(s.journalEntries.id, entry.id));
    expect(row.bodyEnc).not.toContain('nervous');
    const events = await t.ctx.db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.userId, me.userId));
    expect(JSON.stringify(events)).not.toContain('nervous');

    // Only the author can read, edit or delete.
    expect((await other.c.get('/api/v1/journal')).entries).toEqual([]);
    expect((await other.c.req('PATCH', `/api/v1/journal/${entry.id}`, { body: 'hijack' })).status).toBe(404);
    expect((await other.c.req('DELETE', `/api/v1/journal/${entry.id}`)).status).toBe(404);
    await me.c.patch(`/api/v1/journal/${entry.id}`, { body: `${secret} Proud of myself.` });

    await me.c.post('/api/v1/vibe', { mood: 'calm' });
    await me.c.post('/api/v1/posts', { kind: 'thought', body: 'A thought for the calendar', visibility: 'public' });
    const cal = await me.c.get(`/api/v1/me/calendar?month=${j.today.slice(0, 7)}`);
    const today = cal.days.find((d: { date: string }) => d.date === j.today);
    expect(today).toMatchObject({ journal: 1, posts: 1, mood: 'calm' });
    expect(cal.summary.topMood).toBe('calm');
    if (yesterday.slice(0, 7) === j.today.slice(0, 7)) expect(cal.days.find((d: { date: string }) => d.date === yesterday).journal).toBe(1);
    expect(cal.summary.journalDays).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(cal)).not.toContain('nervous'); // counts only

    const exp = await me.c.post('/api/v1/privacy/export', {});
    expect(exp.data.journal.map((e: { body: string }) => e.body)).toContain(`${secret} Proud of myself.`);
    for (const key of ['quizzesMade', 'tournamentEntries', 'collections', 'marketListings', 'organisations', 'closeFriends', 'vibeCheckins']) expect(exp.data).toHaveProperty(key);

    await me.c.req('DELETE', `/api/v1/journal/${entry.id}`);
    expect((await me.c.get('/api/v1/journal')).entries.map((e: { body: string }) => e.body)).toEqual(['Catching up on yesterday']);
  });
});
