import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { Client, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const birth = { date: '1996-01-14', time: '06:40', timePrecision: 'exact', place: { kind: 'manual', name: 'Jaipur, India', latitude: 26.9124, longitude: 75.7873, timezone: 'Asia/Kolkata' }, consentBirthData: true };

describe('Account-free Cosmic ID', () => {
  it('returns an archetype, distinct Vedic and Western text, and stores nothing about the birth moment', async () => {
    const anon = new Client(t.app);
    const before = await t.ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.birthProfiles);
    const r = await anon.post('/api/v1/discover/cosmic-id', birth);
    expect(r.archetype.name).toBeTruthy();
    expect(r.archetype.disclaimer).toMatch(/not a scientific personality measure/);
    expect(r.layers.rashi.text.body).not.toEqual(r.layers.westernMoon.text.body);
    expect(r.layers.surya.text.body).not.toEqual(r.layers.westernSun.text.body);
    expect(r.layers.lagna.text.body).not.toEqual(r.layers.westernRising.text.body);
    expect(r.timeKnown).toBe(true);
    const after = await t.ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.birthProfiles);
    expect(after[0].n).toBe(before[0].n);
    const events = await t.ctx.db.select().from(s.analyticsEvents).where(eq(s.analyticsEvents.name, 'cosmic_id_previewed'));
    expect(events).toHaveLength(1);
    expect(events[0].userId).toBeNull();
    expect(JSON.stringify(events[0].props)).not.toMatch(/1996|Jaipur|06:40/);
  });

  it('applies the same validation and adult-only rule as saved profiles', async () => {
    const anon = new Client(t.app);
    const young = new Date(Date.now() - 10 * 365 * 86400000).toISOString().slice(0, 10);
    expect((await anon.req('POST', '/api/v1/discover/cosmic-id', { ...birth, date: young })).status).toBe(400);
    expect((await anon.req('POST', '/api/v1/discover/cosmic-id', { ...birth, consentBirthData: false })).status).toBe(400);
    const noTime = await anon.post('/api/v1/discover/cosmic-id', { ...birth, time: null, timePrecision: 'unknown' });
    expect(noTime.timeKnown).toBe(false);
    expect(noTime.layers.lagna).toBeNull();
    expect(noTime.archetype.includesAscendant).toBe(false);
  });

  it('gives a signed-in user the same identity as the preview for the same birth data', async () => {
    const u = await signup(t, 'Mira');
    await u.c.put('/api/v1/birth-profile', birth);
    const mine = await u.c.get('/api/v1/cosmic-id/me');
    const preview = await new Client(t.app).post('/api/v1/discover/cosmic-id', birth);
    expect(mine.archetype.key).toBe(preview.archetype.key);
    expect(mine.layers.nakshatra.value).toBe(preview.layers.nakshatra.value);
    expect((await new Client(t.app).req('GET', '/api/v1/cosmic-id/me')).status).toBe(401);
  });

  it('accepts only whitelisted anonymous page events', async () => {
    const anon = new Client(t.app);
    expect((await anon.post('/api/v1/discover/events', { name: 'landing_viewed' })).ok).toBe(true);
    expect((await anon.req('POST', '/api/v1/discover/events', { name: 'signup_completed' })).status).toBe(400);
  });
});
