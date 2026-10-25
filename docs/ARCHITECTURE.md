# Architecture

Nakshatra is a **modular monolith** in one npm package: a React single-page app, a Fastify JSON API, a pure astrology engine shared by both, and PostgreSQL. One process serves the API and the built web app in production.

```
Browser (React 19 SPA, R3F 3D scenes)
   │  same-origin HTTPS, cookie session + CSRF header
   ▼
Fastify 5 API  ── src/server/modules/*  (343 routes, /api/v1/…)
   │   ├─ lib/       auth, CSRF, payments, notifications, storage, rewards, audit/analytics
   │   ├─ services/  identity & charts, ranking, content rules, reports, scheduler
   │   └─ src/astro  deterministic engine (also imported by the web app for display maths)
   ▼
PostgreSQL (server via DATABASE_URL, or embedded PGlite)    Local disk: ./uploads
```

## Source layout
| Path | Responsibility |
|---|---|
| `src/astro/` | Pure functions, no I/O: ephemeris wrapper, ayanamsa, houses, chart builder, Vedic (dasha, vargas, yogas, doshas, ashtakavarga, guna milan, gochar, panchang, festivals, muhurat), Western (aspects, patterns, transits, progressions, returns, synastry, composite), numerology, compatibility. 69 reference tests. |
| `src/content/` | Human-authored text: sign descriptions, daily notes, rituals, lessons, interpretation rules (seeded into the DB, editable by admins with versioning). |
| `src/shared/` | Definitions used by client and server (XP rules, achievements, challenges, collectibles). |
| `src/server/config.ts` | Typed environment config (zod). Refuses unsafe production combinations (no `APP_SECRET`, dev payment simulator in production, Razorpay without keys, SMTP without URL). |
| `src/server/db/` | Drizzle schema (129 tables), DB client (PGlite or node-postgres), seed/migrate/backup/restore CLIs. |
| `src/server/lib/` | Cross-cutting infrastructure: `auth` (sessions, roles, capabilities), `crypto` (scrypt, AES-GCM, HMAC, TOTP), `http` (errors, validation), `context` (audit log, analytics with sanitiser), `payments` (provider boundary + state machine + webhooks), `notify` (in-app + email outbox), `storage` (uploads with magic-byte checks), `rewards` (idempotent XP/achievements), `geo` (place search, coarsening). |
| `src/server/services/` | Domain services shared by modules: chart calculation/caching, ranking functions, interpretation rule cache, report generation, scheduled jobs. |
| `src/server/modules/` | One file per bounded context: auth, profile, astro, bonds, social, messaging, dating, matchmaking, experts, learning, commerce, weddings, journey, account (privacy/support/search/notifications), admin. |
| `src/web/` | SPA: `routes.tsx` (lazy route chunks), `lib/` (API client, i18n, session, formatting), `components/ui` (design system), `three/` (3D scenes), `charts/` (2D SVG charts), `pages/` (one file per area). |
| `tests/integration/` | API tests through `app.inject` with a cookie/CSRF jar; in-memory PGlite or real PostgreSQL via `TEST_DATABASE_URL`. |
| `e2e/` | Playwright browser journeys against a built app and an isolated database (`scripts/e2e-server.ts`). |

## Request lifecycle
1. `@fastify/helmet` (CSP, HSTS header — browsers apply it only over HTTPS), rate limiting (global 600/min; auth endpoints 10/min; per-route limits on uploads, messages, exports).
2. Session resolution: `nk_session` cookie → `sha256` lookup in `sessions` → user, roles, MFA state.
3. CSRF: unsafe methods under `/api/` require header `x-csrf-token` equal to the `nk_csrf` cookie (double submit). Payment webhooks are exempt and verified by HMAC signature.
4. Handler: `parse(zodSchema, input)` → authorisation (`requireAuth`, `requireCapability`, ownership checks in queries) → domain logic, transactions where multiple rows change → `audit()` for sensitive actions → `track()` for analytics (sanitised).
5. Errors: `AppError` → `{ error: { code, message, details } }`; unexpected errors → 500 with a request id, stack only in logs.

## Key design decisions
- **Deterministic everything.** Chart results store engine version and config key; interpretation text is versioned and saved insights keep the version shown. No randomness in user-facing results (daily content selection uses a stable hash of date + user).
- **Payments behind a provider boundary.** `createPayment` → provider checkout → signed webhook → `processWebhook` (idempotent by provider event id) → state machine → purpose handlers (`booking`, `order`, `subscription`, `vendor_milestone`; paid courses are sold as digital products through `order`). The dev simulator signs the same webhook payloads and is refused in production.
- **Server-authoritative rewards and prices.** XP ledger unique on (user, rule, source); prices and stock read from the DB at checkout; client amounts ignored.
- **Privacy by default.** Birth details are private; field-level visibility; Bonds share chart placements, never raw birth data; dating locations coarsened; admin views exclude birth data.
- **3D is progressive enhancement.** Every scene has a 2D equivalent, WebGL detection, an error boundary, reduced-motion support and render-on-demand when hidden.

## Scheduling
`services/scheduler.ts` runs in-process every minute: expire unpaid bookings/orders, send due reminders, renew/expire subscriptions, roll challenge periods. Jobs are idempotent (unique source keys), so running two instances only duplicates work, not effects. For horizontal scaling, run the scheduler in one instance only.

## Integrations
| Integration | Status |
|---|---|
| Payments | Dev simulator (labelled, local only, refused in production). **Razorpay adapter** (`lib/razorpay.ts`): server-side Orders API (10 s timeout), Razorpay Checkout in the browser, checkout-signature check, webhook verification (`X-Razorpay-Signature`, HMAC-SHA256), refunds via the Refunds API; payment state changes only on signed webhooks. Tested against a fake Razorpay API; **not yet verified against a live merchant account**. |
| Email | Dev mailbox (stored in DB, viewable at `/dev/mailbox`, route not registered and refused in production). **SMTP** via nodemailer: mail is queued in `email_outbox`, delivered after the request commits, retried up to 3 times by the scheduler (stale claims recovered after 10 min). Tested against an in-process SMTP server; not yet verified with a real mail provider. |
| Video/voice/push | Not integrated; the UI states they are unavailable. |
| Place search | Bundled offline gazetteer (`lib/geo.ts`) with IANA time zones. |

## Build & runtime
- `npm run build`: Vite → `dist/web` (route-level code splitting; `three` and `r3f` in separate chunks); esbuild → `dist/server/{main,seed-cli,migrate-cli}.js`.
- `npm start`: `node dist/server/main.js` serves `/api/*`, `/uploads/public/*` and the SPA with history fallback.
- Health: `GET /api/health` returns `{ status, database, dbOk, time }` (status `degraded` when the DB ping fails).
