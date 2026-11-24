# 04 — Performance Before / After

All numbers are **local lab measurements** on one Windows laptop, not field data. API timings use `app.inject` against an in-memory PGlite database (no network, no TLS), so they measure server work only.

## API latency — same-time A/B (`scripts/bench-api.ts`, 300 requests × 2 rounds, interleaved)
Baseline = original commit `f3d993a` run from a scratch git worktree at the same time; New = this branch. Raw files: `evidence/ab-base-*.json`, `evidence/ab-new-*.json`, `evidence/ab-summary.json`.

| Endpoint | Base p50 / p95 / p99 (ms) | New p50 / p95 / p99 (ms) | Note |
|---|---|---|---|
| GET /api/v1/auth/me | 7.21 / 10.46 / 13.13 | 8.32 / 16.00 / 26.09 | +1 ms p50; tail noisier |
| GET /api/v1/feed | 17.80 / 23.84 / 27.61 | 23.90 / 33.72 / 39.92 | **Not like-for-like**: the visibility fix makes many more public posts visible, so more rows are ranked and hydrated |
| GET /api/v1/circles | 8.61 / 16.95 / 21.68 | 8.10 / 11.93 / 15.40 | N+1 removed (bench has one circle; benefit grows with circles) |
| GET /api/v1/circles/:id | 13.16 / 17.79 / 20.66 | 13.39 / 21.81 / 29.63 | within noise |
| GET /api/v1/play/sessions/:id | 8.91 / 12.10 / 16.30 | 9.46 / 13.57 / 17.50 | within noise |
| GET /api/v1/identity/me | 10.48 / 14.75 / 18.39 | 10.66 / 15.81 / 19.83 | + quality computation |
| GET /api/v1/social-rituals | 10.04 / 18.66 / 23.84 | 10.47 / 20.40 / 33.91 | within noise |
| GET /api/v1/events | 3.56 / 5.80 / 12.65 | 4.08 / 5.88 / 12.38 | + visibility subqueries |
| Static file, signed-in | 3.66 / 5.06 / 8.73 | **0.80 / 1.91 / 2.35** | −78% p50: sessions are no longer resolved for non-API requests |

Honest summary: most API endpoints are unchanged within run-to-run noise (the earlier single-run "before" figures in `evidence/bench-before.json` were taken when the machine was ~1.6× faster and are not comparable). The clear win is every static/asset/upload request, which no longer costs two database queries per file — on a real page load that is 10–30 requests and pool capacity (`DATABASE_POOL_MAX=5` in the Render blueprint).

## Front-end bundle (production `vite build`)

| Chunk | Before (audit) raw / gzip | After raw / gzip |
|---|---|---|
| `index` (app shell, initial) | 138.7 KB / 47.5 KB (audit) · 145.0 / 49.4 (after Phase 1–2 additions) | **102.0 KB / 32.8 KB** |
| `react` | 291.2 / 93.8 | 291.2 / 94.0 |
| CSS | 61.1 KB | 61.5 KB / 12.2 KB gz |
| three.js + R3F | lazy | lazy (unchanged) |

Cause: the shell imported `MaskIcon` from the visual module, which transitively pulled in the personality model and the entire game engine + prompt banks (via a `hashSeed` import). `hashSeed` moved to `src/shared/hash.ts` and `MaskIcon` to its own module. Initial JS for core pages ≈ 127 KB gz (was ≈141 KB gz in the audit) despite adding modules, progress, sharing and motion code.

## Other changes
- `/assets/*` (hashed) served `Cache-Control: public, max-age=31536000, immutable`; other static files 1 h.
- Circle points batched (3 grouped queries instead of 3 per circle).
- Feed comment counts now exclude deleted/hidden comments (correctness; same cost).
- Messages unread-count polling stops entirely while the messages module is off (one fewer poll every 30 s per signed-in tab).
- Indexes added (see `03`).

## Not measured / not done
- No Lighthouse/Web Vitals (LCP/INP/CLS) run: the built-in browser offers no performance tracing here. Targets remain targets.
- No load test, no `EXPLAIN` plans on large data.
- OG PNGs (~1.3 MB) not recompressed — no image tool available locally (`sharp` not installed; adding a dependency for one asset was not justified).
- Feed is still an in-memory rank over ≤400 recent posts with offset pagination (acceptable below ~10k active users per the audit).
