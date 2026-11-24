import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client, makeAdmin, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { MODULES, moduleForApiPath, moduleForPage } from '../../src/shared/modules';

/** Launch scope: legacy modules are off by default and their APIs are unreachable, not just hidden. */
let t: TestApp;
beforeAll(async () => { t = await makeApp({ MODULE_SCOPE: 'launch' }); });
afterAll(async () => { await t.close(); });

describe('module registry', () => {
  it('maps paths to the most specific module', () => {
    expect(moduleForApiPath('/api/v1/experts/abc')?.key).toBe('experts');
    expect(moduleForApiPath('/api/v1/expert/dashboard')?.key).toBe('experts');
    expect(moduleForApiPath('/api/v1/social-rituals')?.key).toBe('rituals');
    expect(moduleForApiPath('/api/v1/rituals')?.key).toBe('astrology');
    expect(moduleForApiPath('/api/v1/reports')).toBeNull(); // moderation reports are never switchable
    expect(moduleForPage('/vendors/123')?.key).toBe('weddings');
    expect(moduleForPage('/home')).toBeNull();
  });
});

describe('launch scope enforcement', () => {
  it('reports legacy modules off and core modules on', async () => {
    const u = await signup(t, 'Scope Sana', { birth: false });
    const f = await u.c.get('/api/v1/features');
    for (const k of ['dating', 'matchmaking', 'experts', 'learning', 'weddings', 'marketplace', 'community', 'messages']) expect(f.modules[k]).toBe(false);
    for (const k of ['identity', 'thoughts', 'circles', 'play', 'rituals', 'gamification', 'referrals', 'premium', 'astrology']) expect(f.modules[k]).toBe(true);
  });

  it('every API prefix of a disabled module answers 404 module_disabled, for GET and POST', async () => {
    const u = await signup(t, 'Direct Dev', { birth: false });
    for (const m of MODULES.filter((x) => !x.defaultEnabled)) {
      for (const p of m.api) {
        const get = await u.c.req('GET', `${p.replace(/\/$/, '')}/x`);
        expect(get.status, `${m.key} GET ${p}`).toBe(404);
        expect(get.body.error.code).toBe('module_disabled');
        const postRes = await u.c.req('POST', p, {});
        expect(postRes.status, `${m.key} POST ${p}`).toBe(404);
      }
    }
    // Signed-out callers are refused the same way.
    expect((await new Client(t.app).req('GET', '/api/v1/dating/profile')).status).toBe(404);
  });

  it('the shop shows only the identity catalogue; legacy products cannot be opened or bought', async () => {
    const u = await signup(t, 'Shopper Shy', { birth: false });
    const list = await u.c.get('/api/v1/products');
    expect(list.products.map((p: { slug: string }) => p.slug).sort()).toEqual(['cosmetic-card-styles', 'report-identity-expanded']);
    expect((await u.c.req('GET', '/api/v1/products/report-complete-vedic')).status).toBe(404);
    const search = await u.c.get('/api/v1/search?q=a&scope=all');
    expect(search.results.experts).toBeUndefined();
    expect(search.results.courses).toBeUndefined();
    expect(search.results.vendors).toBeUndefined();
  });

  it('an admin can switch a module back on (reversible, no data lost)', async () => {
    const admin = await signup(t, 'Admin Aru', { birth: false });
    await makeAdmin(t, admin.userId);
    expect((await admin.c.req('GET', '/api/v1/experts')).status).toBe(404);
    await admin.c.put('/api/v1/admin/flags/experts', { enabled: true, rolloutPercent: 100 });
    expect((await admin.c.req('GET', '/api/v1/experts')).status).toBe(200);
    await admin.c.put('/api/v1/admin/flags/experts', { enabled: false, rolloutPercent: 100 });
    expect((await admin.c.req('GET', '/api/v1/experts')).status).toBe(404);
    const [marker] = await t.ctx.db.select().from(s.platformSettings).where(eq(s.platformSettings.key, 'module_launch_scope_v1'));
    expect(marker).toBeTruthy();
  });
});
