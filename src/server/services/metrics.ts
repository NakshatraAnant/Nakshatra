/**
 * In-process request timing (no external service). Keeps the most recent samples per route pattern in a
 * fixed-size ring, so memory is bounded. Records route patterns only — never URLs with ids, query strings or users.
 */
const MAX_ROUTES = 300;
const SAMPLES = 1000;
interface Ring { durations: Float64Array; statuses: Uint16Array; n: number; total: number; errors: number }
const routes = new Map<string, Ring>();
export const startedAt = new Date();

export function recordRequest(route: string, ms: number, status: number) {
  let r = routes.get(route);
  if (!r) {
    if (routes.size >= MAX_ROUTES) return;
    r = { durations: new Float64Array(SAMPLES), statuses: new Uint16Array(SAMPLES), n: 0, total: 0, errors: 0 };
    routes.set(route, r);
  }
  r.durations[r.n % SAMPLES] = ms;
  r.statuses[r.n % SAMPLES] = status;
  r.n++; r.total++;
  if (status >= 500) r.errors++;
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function snapshot() {
  const rows = [...routes.entries()].map(([route, r]) => {
    const k = Math.min(r.n, SAMPLES);
    const d = Array.from(r.durations.subarray(0, k)).sort((a, b) => a - b);
    const round = (x: number) => Math.round(x * 10) / 10;
    return { route, requests: r.total, sampled: k, p50: round(pct(d, 50)), p95: round(pct(d, 95)), p99: round(pct(d, 99)), max: round(d[d.length - 1] ?? 0), serverErrors: r.errors };
  });
  const api = rows.filter((r) => r.route.startsWith('/api/'));
  const all = [...routes.entries()].filter(([k]) => k.startsWith('/api/')).flatMap(([, r]) => Array.from(r.durations.subarray(0, Math.min(r.n, SAMPLES)))).sort((a, b) => a - b);
  return {
    since: startedAt.toISOString(),
    overallApi: { sampled: all.length, p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99) },
    routes: api.sort((a, b) => b.p95 - a.p95),
    memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

export function resetMetrics() { routes.clear(); }
