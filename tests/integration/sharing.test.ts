import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { Client, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { QUESTIONS } from '../../src/shared/personality';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

// A decisive, internally consistent sheet: each answer follows its statement's keying for a clear profile.
const TARGET: Record<string, number> = { energy: 1, compass: -1, voice: 1, tempo: -1, horizon: 1 };
const answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, 3 + q.key * 2 * TARGET[q.dimension]]));

describe('archetype share links', () => {
  it('anonymous preview shares are scored by the server and identify nobody', async () => {
    const anon = new Client(t.app);
    const preview = await anon.post('/api/v1/personality/preview', { answers });
    const created = await anon.post('/api/v1/share/identity', { answers, archetypeKey: 'chaos_diplomat' });
    expect(created.share.archetype).toBe(preview.result.name); // a client cannot pick its archetype
    expect(created.share.url).toMatch(/\/s\/[A-Za-z0-9_-]+$/);
    const page = await new Client(t.app).get(`/api/v1/share/${created.share.slug}`);
    expect(page.share.persona.name).toBe(preview.result.name);
    expect(page.share.displayName).toBeNull();
    expect(JSON.stringify(page)).not.toMatch(/answers|email|handle/);
  });

  it('signed-in shares carry a referral link, include the name only on request, count sign-ups and can be revoked', async () => {
    const u = await signup(t, 'Sharer Sitara', { birth: false });
    await u.c.patch('/api/v1/identity/me', { pseudonym: 'Velvet Moth' });
    await u.c.post('/api/v1/personality/assessment', { answers });
    const unnamed = await u.c.post('/api/v1/share/identity', { showName: false });
    const pub = await new Client(t.app).get(`/api/v1/share/${unnamed.share.slug}`);
    const raw = JSON.stringify(pub);
    expect(raw).not.toContain('Sharer Sitara');
    expect(raw).not.toContain(u.handle);
    expect(raw).not.toContain(u.email);
    expect(raw).not.toContain('Velvet Moth');
    expect(raw).not.toContain(u.userId);
    const named = await u.c.post('/api/v1/share/identity', { showName: true });
    expect((await new Client(t.app).get(`/api/v1/share/${named.share.slug}`)).share.displayName).toBe('Sharer Sitara');
    expect(named.share.url).toContain('?ref=');

    // A visitor signs up from the link: the share counts it and the referral is attributed.
    const code = new URL(named.share.url).searchParams.get('ref');
    const v = new Client(t.app);
    const r = await v.post('/api/v1/auth/signup', { email: `fromshare${Date.now()}@example.test`, password: 'correct-horse-battery', displayName: 'From Share', confirmAdult: true, acceptTerms: true, referralCode: code, shareSlug: named.share.slug }, 201);
    const [row] = await t.ctx.db.select().from(s.identityShares).where(eq(s.identityShares.slug, named.share.slug));
    expect(row.signups).toBe(1);
    expect(row.views).toBe(1);
    const [ref] = await t.ctx.db.select().from(s.referrals).where(eq(s.referrals.referredId, r.user.id));
    expect(ref.referrerId).toBe(u.userId);

    // Revoked links disappear; only the owner can revoke.
    const other = await signup(t, 'Other Ojas', { birth: false });
    expect((await other.c.req('DELETE', `/api/v1/share/${named.share.slug}`)).status).toBe(404);
    await u.c.del(`/api/v1/share/${named.share.slug}`);
    expect((await new Client(t.app).req('GET', `/api/v1/share/${named.share.slug}`)).status).toBe(404);
    expect((await u.c.get('/api/v1/share/mine')).shares.map((x: { slug: string }) => x.slug)).not.toContain(named.share.slug);
  });

  // Needs a built web app (dist/web) because the server renders its index.html.
  it.skipIf(!existsSync('dist/web/index.html'))('share pages carry escaped link-preview metadata in the HTML (no JavaScript needed)', async () => {
    const u = await signup(t, '<img src=x onerror=alert(1)>', { birth: false });
    await u.c.post('/api/v1/personality/assessment', { answers });
    const { share } = await u.c.post('/api/v1/share/identity', { showName: true });
    const res = await t.app.inject({ method: 'GET', url: `/s/${share.slug}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toMatch(/<meta property="og:title" content="&lt;img src=x onerror=alert\(1\)&gt; is The /);
    expect(res.body).not.toContain('<img src=x onerror');
    expect(res.body).toMatch(/<meta property="og:image" content="http:\/\/localhost:5173\/visual\/brand\/png\/[^"]+"/);
    const invite = await t.app.inject({ method: 'GET', url: '/c/join/sometoken1234567890' });
    expect(invite.body).toContain('noindex');
    expect(invite.body).not.toMatch(/circle name/i);
  });

  it('refuses to share an inconclusive (straight-lined) result', async () => {
    const neutral = Object.fromEntries(QUESTIONS.map((q) => [q.id, 3]));
    expect((await new Client(t.app).req('POST', '/api/v1/share/identity', { answers: neutral })).status).toBe(400);
    const u = await signup(t, 'Neutral Nia', { birth: false });
    await u.c.post('/api/v1/personality/assessment', { answers: neutral });
    expect((await u.c.req('POST', '/api/v1/share/identity', {})).status).toBe(400);
  });

  it('cannot share without a result', async () => {
    const u = await signup(t, 'No Result', { birth: false });
    expect((await u.c.req('POST', '/api/v1/share/identity', {})).status).toBe(400);
  });
});
