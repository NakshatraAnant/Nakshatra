/**
 * Local API latency benchmark (lab measurement, in-memory PGlite, app.inject — no network).
 * Seeds a small social graph, then times key read endpoints and reports p50/p95/p99 in ms.
 * Usage: npx tsx scripts/bench-api.ts [iterations]
 * Never connects to an external database: PGLITE_DIR is forced to :memory: and DATABASE_URL is cleared.
 */
import { performance } from 'node:perf_hooks';
delete process.env.DATABASE_URL;
const { makeApp, signup } = await import('../tests/integration/harness');
const { QUESTIONS } = await import('../src/shared/personality');

const N = Number(process.argv[2] ?? 150);
const t = await makeApp();
const answers = Object.fromEntries(QUESTIONS.map((q, i) => [q.id, (i % 5) + 1]));
const users = [];
for (let i = 0; i < 12; i++) users.push(await signup(t, `Bench ${i}`, { birth: false }));
for (const u of users) await u.c.post('/api/v1/personality/assessment', { answers });
const [owner, ...rest] = users;
const { circle } = await owner.c.post('/api/v1/circles', { name: 'Bench circle' });
const { token } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
for (const u of rest.slice(0, 8)) await u.c.post(`/api/v1/circle-invites/${token}/accept`);
for (let i = 0; i < 60; i++) {
  const u = users[i % users.length];
  await u.c.post('/api/v1/posts', { kind: 'thought', body: `Bench thought number ${i} about ${['chai', 'trains', 'music'][i % 3]}`, visibility: i % 4 === 0 ? 'group' : 'public', groupId: i % 4 === 0 ? circle.id : undefined }).catch(() => undefined);
}
const { session } = await owner.c.post('/api/v1/play/sessions', { gameKey: 'pick_your_chaos', circleId: circle.id });
await owner.c.post(`/api/v1/play/sessions/${session.id}/start`);

const targets: [string, string][] = [
  ['GET /api/v1/auth/me', '/api/v1/auth/me'],
  ['GET /api/v1/feed', '/api/v1/feed?mode=ranked'],
  ['GET /api/v1/circles', '/api/v1/circles'],
  ['GET /api/v1/circles/:id', `/api/v1/circles/${circle.id}`],
  ['GET /api/v1/play/sessions/:id', `/api/v1/play/sessions/${session.id}`],
  ['GET /api/v1/identity/me', '/api/v1/identity/me'],
  ['GET /api/v1/social-rituals', '/api/v1/social-rituals'],
  ['GET /api/v1/events', '/api/v1/events'],
  ['GET /visual/brand/nakshatra-favicon.svg (static, signed in)', '/visual/brand/nakshatra-favicon.svg'],
];
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
const rows: Record<string, unknown>[] = [];
for (const [name, url] of targets) {
  for (let i = 0; i < 10; i++) await owner.c.req('GET', url);
  const times: number[] = [];
  for (let i = 0; i < N; i++) { const s = performance.now(); await owner.c.req('GET', url); times.push(performance.now() - s); }
  times.sort((a, b) => a - b);
  rows.push({ endpoint: name, n: N, p50: +pct(times, 50).toFixed(2), p95: +pct(times, 95).toFixed(2), p99: +pct(times, 99).toFixed(2) });
}
console.log(JSON.stringify(rows, null, 2));
await t.close();
process.exit(0);
