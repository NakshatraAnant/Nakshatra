# 01 — System Architecture Audit

## 1. What the repository actually contains

| Measure | Value | Source |
|---|---|---|
| Tracked files | 788 (497 images/SVGs) | `git ls-files` |
| TypeScript/TSX/SQL/CSS lines | ~33,900 | `wc -l` over tracked sources |
| Server route modules | 21 + payments | `src/server/modules/` |
| HTTP endpoints | **392** | `16_API_ENDPOINT_INVENTORY.csv` |
| Database tables | **136** (5 migrations) | `17_DATABASE_TABLE_INVENTORY.csv` |
| Front-end routes | **91** | `15_SCREEN_AND_ROUTE_INVENTORY.csv` |
| Routes belonging to the identity/social/play core | 12 of 91 | same |
| Tables used by the core product (incl. auth/platform/payments) | 54 of 136 | same |
| Markdown documentation files | 60+ (`docs/`, root `NAKSHATRA_*.md`) | `git ls-files` |

**Headline:** Nakshatra is two products in one codebase. The current positioning ("a personality-led social network": 24 archetypes, Thought Drops, private circles, 12 games) is implemented as a thin, well-built layer (≈ `studio.ts`, `circles.ts`, `play.ts`, `rituals.ts`, `referrals.ts`, part of `social.ts`) on top of an earlier, much larger astrology super-app: Vedic/Western charts, bonds and compatibility, dating, marriage matchmaking with a "Family Bridge", an expert-consultation marketplace with bookings and payouts, an LMS with courses/quizzes/certificates, an e-commerce store with physical shipping (rudraksha, gemstones), and wedding planning with a vendor marketplace. All of it still ships, is reachable from the signed-in navigation, and is enabled by default.

## 2. Runtime architecture

```
Browser (React 19 SPA, React Router 7, TanStack Query 5, Tailwind 4, three.js/R3F lazy chunks)
   │  same-origin fetch, cookie session + x-csrf-token
   ▼
Fastify 5 (single Node 22 process)  ── src/server/main.ts → app.ts
   ├─ plugins: cookie, helmet (CSP), rate-limit (in-memory, 600/min global), multipart, static
   ├─ onRequest: CSRF double-submit + resolveSession() (DB lookup on EVERY request)
   ├─ 21 route modules (registerModules) — handlers contain business logic directly
   ├─ services/ (identity, ranking, circles, referrals, reports, scheduler, moderation…)
   ├─ lib/ (auth, crypto, payments, razorpay, notify, rewards, storage, context)
   ├─ in-process scheduler: setInterval 60 s (email retries, reminders, holds, orders, subscriptions)
   └─ serves dist/web (SPA) + /uploads/public (disk or Postgres bytea)
   ▼
Drizzle ORM 0.45 → node-postgres pool (DATABASE_URL, optional dedicated schema, CA-verified TLS)
              or → PGlite (embedded WASM Postgres) for local/dev/tests
```

- **Boot sequence (`app.ts:30-37`):** open DB → run all migrations → `seedReferenceData` (feature flags, plans, offers, platform settings) → register plugins/routes. This runs on every process start, including every Render cold start.
- **No separate worker:** background work runs in the web process; on Render's free plan it stops when the instance sleeps.
- **No realtime transport:** games, messages and notifications poll (AppShell polls notifications every 60 s and unread messages every 30 s; game pages poll the session).
- **Shared code:** `src/shared/` (personality model, game engine, rituals, gamification) is imported by both server and client — good for consistency (the client never awards points).
- **Astrology engine:** `src/astro/` (~3k lines) built on `astronomy-engine`, with reference tests.

## 3. Front-end architecture

| Aspect | Finding |
|---|---|
| Framework | React 19.2, React Router 7.18 (`createBrowserRouter`), Vite 7 |
| Routing | `src/web/routes.tsx`; every page is a lazy chunk via `page(loader, name)` |
| Data | TanStack Query; thin `api()` wrapper (`lib/api.ts`) adds CSRF, normalises errors |
| State | Server state in Query cache; local `useState`; session via `useMe()` |
| Components | `components/ui/*` (primitives, feedback, overlays, data, icons), `components/visual.tsx`, layout `AppShell` |
| Page size | Page files 150–510 lines each, multiple screens per file (e.g. `shop.tsx` exports 12+ screens) |
| Error handling | Route-level `errorElement`; `reportClientError` posts to `/api/v1/client-errors`; no error tracking service |
| Accessibility | Axe e2e spec exists (`e2e/a11y.spec.ts`, not run in this audit); assessment radios expose names "1".."5" in the accessibility tree (observed) |
| Bundles | Initial: `index` 139 KB (47 KB gz) + `react` 291 KB (94 KB gz) + CSS 61 KB. three.js chunk 704 KB (181 KB gz) + R3F 276 KB (86 KB gz) load only on astrology/3D pages |

## 4. Back-end architecture

| Aspect | Finding |
|---|---|
| Layering | Route handlers hold most business logic (validation → authorisation → queries → side effects). `services/` exists for cross-cutting pieces. No controller/service/repository split. Acceptable at this size but makes handlers 20–60 lines and hard to unit test without the DB. |
| Validation | Zod on almost every body/param/query (`parse()` in `lib/http.ts`); 4 handlers have no parsed input (GET lists) |
| Errors | `AppError` + central `setErrorHandler`; 404 used for "not yours" to avoid probing |
| AuthZ | `requireAuth`, `requireRole`, `requireCapability` (staff capability map), `requireSeller`, `requireCreator`; ownership in WHERE clauses |
| Transactions | Used for multi-write operations (signup, posts, game round close with `SELECT … FOR UPDATE`, payments). Several side effects run *after* commit (notifications, referral evaluation) — fine. |
| Idempotency | XP ledger unique `(user, rule, source)`, payment events unique, checkout idempotency keys, invite use counter atomic |
| Logging | pino with redaction of cookies/auth/passwords/tokens; request ids |
| Versioning | All APIs under `/api/v1`; no v2 strategy needed yet |

## 5. Lifecycle of key requests (traced)

**Personality assessment save** — `POST /api/v1/personality/assessment` → CSRF + session hook → `requireAuth` → Zod answers → `scorePersonality()` (shared, pure, deterministic) → transaction: insert `assessment_results`, set `profiles.onboarding_completed_at`, `awardXp('assessment_completed', once)`, `evaluateAchievements`, `track` → after commit `evaluateReferral` → `personaView()` response.

**Thought Drop** — `POST /api/v1/posts` (20/min) → email verified required → Zod → pen-name requires `profiles.pseudonym` → `screenText` (phrase list + contact details when pseudonymous/confession) → group membership check → 24-h duplicate/spam check → transaction: insert post (+poll options), XP per day, achievements, analytics, first-action → referral + circle activation after commit.

**Feed** — `GET /api/v1/feed` → loads following ids, group ids, blocks, mutes → selects up to **400** posts from the last **14 days** → counts reactions/comments/open reports → `rankFeed()` (documented weights, per-author cap) → slices by `offset` (max 500) → `hydratePosts()` (≈9 queries). ~15 queries per request; whole candidate set ranked in memory.

**Game round** — `POST /play/sessions/:id/submit` → load + validate against current round → transaction with `FOR UPDATE` on the session → upsert submission → if nobody pending, `closeRound()` computes reveal/scores/extension/summary inside the lock → after commit circle activation + referral evaluation for all players.

**Purchase (dev simulator path)** — `POST /checkout` → cart lines → prerequisite checks → transaction: stock decrement, order + items, `createPayment` → simulator posts a signed event through `processWebhook()` → state machine → `onSucceeded` handler grants entitlements and **generates the report inside the webhook transaction** (see DEF-01 in `03_FEATURE_COMPLETENESS_AUDIT.md`).

## 6. Architecture assessment

**Strengths**
- Coherent, boring, appropriate stack (Fastify + Drizzle + Postgres + React SPA); one deployable.
- Server-authoritative rules everywhere (scores, XP, entitlements, game secrets kept in `round.secret` — mostly).
- Good defensive primitives (idempotency, row locks, state machines, schema isolation, RLS defence-in-depth).
- Embedded PGlite makes local dev and tests zero-dependency.

**Weaknesses**
1. **Scope:** 392 endpoints and 136 tables for a product whose positioning needs perhaps 60–80 endpoints and ~50 tables. Every legacy module carries security, moderation, privacy-deletion and maintenance cost (`11_TECHNICAL_DEBT_REGISTER.md` TD-01).
2. **Per-request session lookup** for every HTTP request including static assets (`app.ts:93`), 2 queries each, against a pool of 5 connections in production.
3. **Work on boot:** migrations + reference seeding on every start lengthen cold starts on a sleeping free instance.
4. **Single-process assumptions:** in-memory rate limits, in-process scheduler, `setTimeout` email kick. Fine for one instance; must change before horizontal scaling.
5. **In-memory feed ranking with offset pagination** caps the feed at 400 recent posts and is O(N) per request.
6. **Two archetype systems** (24 personality personas in `shared/personality.ts` and astrology "Cosmic archetypes" in `content/archetypes.ts`) share the word "archetype".

## 7. Configuration map

`src/server/config.ts` (Zod-validated env). Key variables: `NODE_ENV`, `DATABASE_URL`, `DATABASE_SCHEMA`, `DATABASE_CA_CERT`, `DATABASE_POOL_MAX`, `APP_SECRET`, `APP_ORIGIN`/`RENDER_EXTERNAL_URL`, `PAYMENT_PROVIDER` (dev_simulator|razorpay|none), `MAIL_TRANSPORT` (dev_mailbox|smtp) + `SMTP_URL`, `STORAGE_DRIVER` (local|database), `TRUST_PROXY`, `SEED_DEMO_DATA`. Production guards refuse the simulator, the dev mailbox and a missing secret.

## 8. Not audited in depth

Astrology calculation correctness (`src/astro/`, covered by its own reference tests which pass), admin handlers individually, LMS/experts/weddings business rules.
