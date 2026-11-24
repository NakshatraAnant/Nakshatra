import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client, makeApp, signup, type TestApp } from './harness';

/**
 * Sends hostile input to every API route found in the source. Nothing here checks features: it checks that bad input is
 * always answered with a 4xx (never a crash), and that visitors and ordinary members cannot use staff routes.
 */
const ROOT = join(process.cwd(), 'src/server');
const files = [join(ROOT, 'app.ts'), ...readdirSync(join(ROOT, 'modules')).filter((f) => f.endsWith('.ts')).map((f) => join(ROOT, 'modules', f))];
const ROUTES = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/app\.(get|post|put|patch|delete)\(\s*['"`](\/api\/[^'"`$]+)['"`]/g)].map((m) => ({ method: m[1].toUpperCase(), path: m[2] })));
// Would end the probing session.
const SKIP = new Set(['POST /api/v1/auth/logout', 'POST /api/v1/privacy/delete-account']);
const PROBES = ROUTES.filter((r) => !SKIP.has(`${r.method} ${r.path}`));

const params = (path: string, value: string) => path.replace(/:[A-Za-z]+/g, () => value);
const BODIES: unknown[] = [
  undefined, null, [], 'text', 7, {},
  { id: 'x', body: 'a\u0000b', name: 'a\u0000b', title: 'a\u0000b', q: '\u0000', email: 'a\u0000@x.test' },
  { body: { nested: true }, name: 1e308, title: ['x'], date: '9999-99-99', startsAt: 'never', amountPaise: 1e20, quantity: -1, ids: ['nope'], payload: [], preferences: 'x', limit: 1e20 },
];
const QUERY = 'q=%25%5F%27&limit=99999999999999999999&offset=99999999999999999&cursor=WyJuZXZlciIsIngiXQ&before=never&date=9999-99-99&month=2026-99&year=99999999999&lat=NaN&lon=1e999&circleId=x&page=-1&status=zzz&tz=Not%2FAZone&mode=zzz';

let t: TestApp;
let member: Client;
beforeAll(async () => { t = await makeApp(); member = (await signup(t, 'Prober')).c; });
afterAll(async () => { await t.close(); });

describe('every API route survives hostile input', () => {
  it('finds the routes', () => { expect(PROBES.length).toBeGreaterThan(300); });

  it('answers bad ids, bodies and queries without a server error', async () => {
    const failures = new Set<string>();
    for (const r of PROBES) {
      const variants: { url: string; body?: unknown }[] = [];
      for (const v of [randomUUID(), 'not-a-uuid', '%00', '9'.repeat(40)]) variants.push({ url: params(r.path, v) });
      if (r.method === 'GET') variants.push({ url: `${params(r.path, randomUUID())}?${QUERY}` }, { url: `${params(r.path, 'x')}?q=%00&circleId=%00&date=%00` });
      else for (const b of BODIES) variants.push({ url: params(r.path, randomUUID()), body: b });
      for (const v of variants) {
        const res = await member.req(r.method, v.url, v.body);
        // 503 is the deliberate "integration not configured" answer.
        if (res.status >= 500 && res.status !== 503) failures.add(`${r.method} ${v.url.slice(0, 120)} ${JSON.stringify(v.body)?.slice(0, 90)} -> ${res.status}`);
      }
    }
    expect([...failures]).toEqual([]);
  }, 600_000);

  it('refuses visitors and ordinary members on staff routes', async () => {
    const anon = new Client(t.app);
    const open: string[] = [];
    for (const r of PROBES.filter((x) => x.path.startsWith('/api/v1/admin'))) {
      const url = params(r.path, randomUUID());
      const a = await anon.req(r.method, url, r.method === 'GET' ? undefined : {});
      const m = await member.req(r.method, url, r.method === 'GET' ? undefined : {});
      if (a.status !== 401) open.push(`anon ${r.method} ${r.path} -> ${a.status}`);
      if (m.status !== 403 && m.status !== 404) open.push(`member ${r.method} ${r.path} -> ${m.status}`);
    }
    expect(open).toEqual([]);
  }, 300_000);

  it('only the intended routes answer visitors', async () => {
    const anon = new Client(t.app);
    const open: string[] = [];
    for (const r of PROBES) {
      const res = await anon.req(r.method, params(r.path, randomUUID()), r.method === 'GET' ? undefined : {});
      if (res.status < 300) open.push(`${r.method} ${r.path}`);
    }
    expect(open.sort()).toMatchInlineSnapshot(`
      [
        "GET /api/health",
        "GET /api/v1/auth/csrf",
        "GET /api/v1/auth/me",
        "GET /api/v1/charts/configs",
        "GET /api/v1/courses",
        "GET /api/v1/dating/safety",
        "GET /api/v1/dev/mailbox",
        "GET /api/v1/discover/sample",
        "GET /api/v1/experts",
        "GET /api/v1/features",
        "GET /api/v1/integrations",
        "GET /api/v1/merch/products",
        "GET /api/v1/moon-phases",
        "GET /api/v1/panchang",
        "GET /api/v1/personality/questions",
        "GET /api/v1/play/games",
        "GET /api/v1/products",
        "GET /api/v1/rituals",
        "GET /api/v1/subscriptions",
        "GET /api/v1/vendors",
      ]
    `);
  }, 300_000);
});
