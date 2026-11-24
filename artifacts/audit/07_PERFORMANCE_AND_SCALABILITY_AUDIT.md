# 07 — Performance and Scalability Audit

**Measured** values come from this audit's build and file inspection. **Estimated** values are architectural reasoning; no load test was run, and no production latency was observed (the production database was hibernated).

## 1. Measured

### Front-end bundle (production `vite build` into a scratch directory)

| Chunk | Raw | Gzip | Loaded |
|---|---|---|---|
| `react` (React, ReactDOM, Router, scheduler) | 291 KB | 94 KB | every page (modulepreload) |
| `index` (app shell, routes, shared UI, Query) | 139 KB | 48 KB | every page |
| CSS | 61 KB | — | every page |
| `three` | 704 KB | 181 KB | lazily, when a 3D component renders (chart explorer, Cosmic ID scene, bonds, journey, shop product fallback) |
| `r3f` (@react-three) | 276 KB | 86 KB | same |
| Largest page chunks | shop 38 KB, admin 38 KB, weddings 37 KB, experts 32 KB, social 30 KB, circles 29 KB | 9–11 KB gz | on demand |

Initial JS for the core product ≈ **142 KB gzipped** plus fonts (four Google font families incl. Devanagari). Reasonable. The 3D stack (≈267 KB gz) is correctly isolated behind `React.lazy` (`identity.tsx:18`, `shop.tsx:15`), so it downloads only when a 3D scene actually renders. In the Shop that happens for products without an image (`ProductViewer3D` fallback) — worth confirming the ₹29/₹99 offers always have images so a cosmetic purchase never pulls in three.js.

### Assets
`public/visual` is 12 MB (498 files). Card SVGs ~600 px wide load lazily. Two OG PNGs are ~1.3 MB each (the site-wide `og:image` is one of them).

### Tests as a rough timing signal
The full integration suite (180 tests, in-memory PGlite, forks pool) took 80.6 s wall-clock. This says nothing about production latency.

## 2. Request-path cost (from code)

| Path | DB round-trips (approx.) | Note |
|---|---|---|
| Any request with a session cookie (incl. static files, images, `/uploads`) | 2 (+1 every 10 min to touch `last_seen_at`) | `app.ts:93` runs `resolveSession` in a global `onRequest` hook |
| `GET /api/v1/feed` | ~16 + in-memory ranking of ≤400 rows | `social.ts:289-331` |
| `GET /api/v1/circles` | 3 + **3 per circle** | `circlePoints` loop |
| `GET /api/v1/play/sessions/:id` (polled every **3 s** by each player) | ~6–8 | `play.ts:323-345` |
| Messages thread (polled every **4 s**) | ~3–4 | `messages.tsx:81` |
| AppShell (every signed-in page) | 2 polls: notifications 60 s, unread messages 30 s | `AppShell.tsx:70-71` |
| `POST /api/v1/play/sessions/:id/submit` closing a round | lock + per-round reads + per-player XP/achievement queries | inside one transaction |
| Boot | all migrations + reference seeding + (if schema) RLS/REVOKE DO-blocks | every cold start |

## 3. What breaks at each scale (estimates)

Assumptions: single Render free instance (shared CPU, 512 MB RAM, sleeps after ~15 min idle), Supabase free tier, `DATABASE_POOL_MAX=5`, in-process scheduler.

| Registered users | Likely behaviour | First bottlenecks |
|---|---|---|
| **100** | Works. Cold starts after idle periods are the most visible problem (migrations + seed run on each wake). Scheduled email retries/reminders pause while asleep. | Render sleep; Supabase free project pausing after inactivity (it was hibernated during this audit). |
| **1,000** | Works if a few dozen are concurrent. A circle game with 8 players polling every 3 s ≈ 2.7 req/s ≈ 20 queries/s for one game. Pool of 5 starts queueing during peaks. | Pool size vs per-request session lookup; free-instance CPU during scrypt hashing on login bursts (scrypt N=16384 ≈ tens of ms each, blocking the libuv threadpool of 4). |
| **10,000** | Feed and search degrade: ILIKE scans, in-memory ranking per request, 400-row candidate fetch. `analytics_events`, `audit_logs`, `notifications`, `email_outbox` grow without retention. Database storage of uploads approaches the 500 MB free quota. | Need a paid instance and DB, indexes listed in `04`, retention jobs, object storage for uploads, caching session lookups. |
| **50,000** | Single process is insufficient; horizontal scaling breaks in-memory rate limits and runs the scheduler on every instance (jobs are idempotent but duplicate work). Polling load from games/messages dominates. | Shared rate-limit store, a separate worker, push/websocket or longer poll intervals, read replicas or caching for feeds. |
| **100,000** | Requires architectural change: feed materialisation (fan-out or precomputed candidates), full-text search, CDN for `public/visual` and uploads, job queue, observability. | Feed design, search, polling, operational tooling. |

Database growth is driven far more by activity tables (analytics, notifications, game state JSON, posts) than by user count.

## 4. Recommendations (ordered by value/effort)
1. Skip `resolveSession` for static assets and `/uploads` (or serve the SPA from a CDN) — removes the majority of per-page queries.
2. Ensure core offers never fall back to the lazy 3D product viewer.
3. Shrink OG PNGs to <300 KB and make `og:image` absolute.
4. Add the indexes listed in `04_DATABASE_AND_BACKEND_AUDIT.md` §3.
5. Retention jobs for sessions, email outbox, notifications, analytics.
6. Move migrations/seeding to a release step, not every boot.
7. Before ~10k users: paid instance + DB, object storage for uploads, error monitoring, request metrics.

## 5. Not measured
No load test, no Lighthouse/Web Vitals run, no production API latency, no memory profiling, no query plans (`EXPLAIN`) against realistic data volumes.
