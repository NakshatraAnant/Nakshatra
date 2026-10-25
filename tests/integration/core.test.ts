import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { eq } from 'drizzle-orm';
import { signWebhook } from '../../src/server/lib/payments';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Journey A — new user, Cosmic ID, persistence', () => {
  it('signs up, completes birth data, calculates chart, saves an insight, logs out and back in', async () => {
    const c = new Client(t.app);
    const email = `a${Date.now()}@example.test`;
    const signupRes = await c.post('/api/v1/auth/signup', { email, password: 'correct-horse-battery', displayName: 'Asha', confirmAdult: true, acceptTerms: true }, 201);
    expect(signupRes.user.onboardingComplete).toBe(false);
    const places = await c.get('/api/v1/places?q=Pune');
    expect(places.results[0].timezone).toBe('Asia/Kolkata');
    const saved = await c.put('/api/v1/birth-profile', { date: '1995-08-15', time: '06:45', timePrecision: 'exact', place: { kind: 'geonames', id: places.results[0].id }, consentBirthData: true });
    expect(saved.utcOffsetMinutes).toBe(330);
    const chart = await c.get('/api/v1/charts/me?config=vedic_default');
    expect(chart.chart.placements).toHaveLength(9);
    expect(chart.chart.ascendant).not.toBeNull();
    expect(chart.vedic.dasha.mahadashas.length).toBeGreaterThan(8);
    expect(chart.vedic.interpretations.length).toBeGreaterThan(3);
    const rule = chart.vedic.interpretations[0];
    await c.post('/api/v1/insights', { ruleKey: rule.key, configKey: 'vedic_default', note: 'resonates' });
    const western = await c.get('/api/v1/charts/me?config=western_default');
    expect(western.western.aspects.length).toBeGreaterThan(0);
    const me1 = await c.get('/api/v1/auth/me');
    expect(me1.user.onboardingComplete).toBe(true);
    await c.post('/api/v1/auth/logout');
    expect((await c.get('/api/v1/auth/me')).user).toBeNull();
    await c.post('/api/v1/auth/login', { email, password: 'correct-horse-battery' });
    const insights = await c.get('/api/v1/insights');
    expect(insights.insights[0].note).toBe('resonates');
    const journey = await c.get('/api/v1/journey');
    expect(journey.achievements.find((x: any) => x.key === 'first_light').awardedAt).not.toBeNull();
    expect(journey.xp).toBeGreaterThanOrEqual(110);
  });

  it('rejects wrong passwords with a generic message and rejects under-18 birth dates', async () => {
    const { c, email } = await signup(t, 'Rahul');
    const r = await new Client(t.app).req('POST', '/api/v1/auth/login', { email, password: 'wrong-password-123' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Email or password is incorrect.');
    const young = new Date(Date.now() - 10 * 365 * 86400000).toISOString().slice(0, 10);
    const res = await c.req('PUT', '/api/v1/birth-profile', { date: young, time: null, timePrecision: 'unknown', place: { kind: 'manual', name: 'X', latitude: 10, longitude: 10 }, consentBirthData: true });
    expect(res.status).toBe(400);
  });

  it('handles unknown birth time explicitly', async () => {
    const { c } = await signup(t, 'Noor', { birth: { time: null } });
    const chart = await c.get('/api/v1/charts/me?config=vedic_default');
    expect(chart.chart.ascendant).toBeNull();
    expect(chart.chart.reliability.ascendant).toBe('unknown');
    expect(chart.vedic.ashtakavarga.available).toBe(false);
  });

  it('serves a daily briefing, panchang, festivals and an ICS calendar', async () => {
    const { c } = await signup(t, 'Dev');
    const daily = await c.get('/api/v1/daily');
    expect(daily.briefing.personalised).toBe(true);
    expect(daily.briefing.sections.length).toBeGreaterThan(2);
    expect(daily.panchang.tithi.name).toBeTruthy();
    const fest = await c.get('/api/v1/calendar/festivals?year=2025');
    expect(fest.festivals.find((f: any) => f.key === 'diwali').date).toBe('2025-10-20');
    const ics = await c.req('GET', '/api/v1/calendar/export.ics?year=2025');
    expect(ics.raw).toContain('BEGIN:VCALENDAR');
    const done = await c.post('/api/v1/rituals/complete', { ritualKey: 'gratitude_three' });
    expect(done.xpAwarded).toBe(10);
    const again = await c.post('/api/v1/rituals/complete', { ritualKey: 'gratitude_three' });
    expect(again.alreadyCompleted).toBe(true);
    expect(again.xpAwarded).toBe(0);
  });
});

describe('security controls', () => {
  it('throttles repeated failed sign-ins per account', async () => {
    const u = await signup(t, 'Throttle');
    const c = new Client(t.app);
    for (let i = 0; i < 8; i++) expect((await c.req('POST', '/api/v1/auth/login', { email: u.email, password: 'wrong-password-' + i })).status).toBe(401);
    const blocked = await c.req('POST', '/api/v1/auth/login', { email: u.email, password: u.password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('too_many_attempts');
  });
  it('rejects state-changing requests without a CSRF token', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'x@example.test', password: 'y' } });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('csrf_failed');
  });

  it('requires authentication and does not leak resources across users (IDOR)', async () => {
    const anon = new Client(t.app);
    expect((await anon.req('GET', '/api/v1/charts/me')).status).toBe(401);
    const a = await signup(t, 'Owner');
    const b = await signup(t, 'Other');
    const entry = await a.c.post('/api/v1/timeline', { kind: 'reflection', title: 'Private thought', body: 'secret', eventDate: '2025-01-01' });
    expect((await b.c.req('PATCH', `/api/v1/timeline/${entry.event.id}`, { title: 'hacked' })).status).toBe(404);
    expect((await b.c.req('DELETE', `/api/v1/timeline/${entry.event.id}`)).status).toBe(404);
    const snap = await a.c.post('/api/v1/charts/snapshots', { configKey: 'vedic_default', label: 'mine' });
    expect((await b.c.req('GET', `/api/v1/charts/snapshots/${snap.snapshot.id}`)).status).toBe(404);
  });

  it('never exposes birth details on public profiles and honours field visibility', async () => {
    const a = await signup(t, 'Visible');
    await a.c.patch('/api/v1/profile', { visibility: 'public', fieldVisibility: { sunSign: 'public', moonSign: 'private', birthTime: 'public' } });
    const anon = new Client(t.app);
    const p = await anon.get(`/api/v1/u/${a.handle}`);
    expect(p.profile.identity.sunSign).not.toBeNull();
    expect(p.profile.identity.moonSign).toBeNull();
    expect(JSON.stringify(p)).not.toMatch(/1992-05-14|06:20|28\.61/);
    await a.c.patch('/api/v1/profile', { visibility: 'private' });
    const p2 = await anon.get(`/api/v1/u/${a.handle}`);
    expect(p2.profile.limited).toBe(true);
    expect(p2.profile.identity).toBeUndefined();
  });

  it('rejects forged payment webhooks and processes signed ones idempotently', async () => {
    const forged = await t.app.inject({ method: 'POST', url: '/api/v1/payments/webhook/dev_simulator', headers: { 'content-type': 'application/json', 'x-nakshatra-signature': 'bad' }, payload: JSON.stringify({ id: 'evt_x', type: 'payment.succeeded', providerRef: 'devpay_x' }) });
    expect(forged.statusCode).toBe(401);
    const body = JSON.stringify({ id: 'evt_unknown_ref', type: 'payment.succeeded', providerRef: 'devpay_none' });
    const sig = signWebhook(t.ctx.config.appSecret, body);
    const ok1 = await t.app.inject({ method: 'POST', url: '/api/v1/payments/webhook/dev_simulator', headers: { 'content-type': 'application/json', 'x-nakshatra-signature': sig }, payload: body });
    const ok2 = await t.app.inject({ method: 'POST', url: '/api/v1/payments/webhook/dev_simulator', headers: { 'content-type': 'application/json', 'x-nakshatra-signature': sig }, payload: body });
    expect(JSON.parse(ok1.body).status).toBe('ignored');
    expect(JSON.parse(ok2.body).status).toBe('duplicate');
  });

  it('suspended users cannot act but can appeal', async () => {
    const u = await signup(t, 'Suspended');
    await t.ctx.db.update(s.users).set({ status: 'suspended' }).where(eq(s.users.id, u.userId));
    expect((await u.c.req('POST', '/api/v1/timeline', { kind: 'reflection', title: 'x', eventDate: '2025-01-01' })).status).toBe(403);
    await u.c.post('/api/v1/appeals', { body: 'I believe this suspension was a mistake, please review.' });
  });

  it('analytics never store birth data or message bodies', async () => {
    const rows = await t.ctx.db.select().from(s.analyticsEvents);
    for (const r of rows) expect(JSON.stringify(r.props)).not.toMatch(/\d{4}-\d{2}-\d{2}|lat|lon|password|message/i);
  });

  it('supports TOTP MFA enrolment and enforcement at login', async () => {
    const { totp } = await import('../../src/server/lib/crypto');
    const u = await signup(t, 'Mfa');
    const setup = await u.c.post('/api/v1/auth/mfa/setup');
    await u.c.post('/api/v1/auth/mfa/enable', { code: totp(setup.secret) });
    const fresh = new Client(t.app);
    const first = await fresh.post('/api/v1/auth/login', { email: u.email, password: u.password });
    expect(first.mfaRequired).toBe(true);
    const second = await fresh.post('/api/v1/auth/login', { email: u.email, password: u.password, totp: totp(setup.secret) });
    expect(second.user.mfaEnabled).toBe(true);
  });
});

describe('configuration', () => {
  it('treats blank values from .env.example as unset and still refuses unsafe production settings', async () => {
    const { loadConfig } = await import('../../src/server/config');
    expect(() => loadConfig({ NODE_ENV: 'development', APP_SECRET: '', SMTP_URL: '', DATABASE_URL: '' })).not.toThrow();
    expect(loadConfig({ NODE_ENV: 'development', APP_SECRET: '' }).appSecret.length).toBeGreaterThanOrEqual(32);
    expect(() => loadConfig({ NODE_ENV: 'production', APP_SECRET: '' })).toThrow(/APP_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', APP_SECRET: 'x'.repeat(40), PAYMENT_PROVIDER: 'none', MAIL_TRANSPORT: 'dev_mailbox' })).toThrow(/dev_mailbox/);
  });
});
