# 02 — Source Code Quality Audit

## Automated checks (run during this audit)

| Check | Command | Result |
|---|---|---|
| Type check (web) | `tsc -p tsconfig.web.json --noEmit` | **Pass** (exit 0) |
| Type check (server) | `tsc -p tsconfig.server.json --noEmit` | **Pass** (exit 0) |
| Lint | `eslint src tests e2e scripts` | **Pass** (exit 0, no warnings printed) |
| Unit + integration tests | `vitest run` | **180/180 pass**, 13 files, 80.6 s |
| Production web build | `vite build --outDir <scratchpad>` | **Pass** (built outside the repo; `dist/` untouched) |

## Quantitative indicators

| Indicator | Count | Comment |
|---|---|---|
| `: any` | 0 | Strict typing is respected |
| `as unknown as` casts | 30 | Mostly around JSONB columns (`state`, `result`, `payload`) and Drizzle executor typing; each one is an untyped boundary |
| `eslint-disable` | 7 | Low |
| `TODO/FIXME/XXX` | 0 | No tracked debt markers — debt is undocumented rather than absent |
| `catch {` (swallowed) | 23 | Mostly storage/parsing fallbacks in the web app; acceptable but a few hide failures (see below) |
| `void lt;` dead-import shims | 4 | `social.ts:672`, `play.ts:355`, `circles.ts`… — imports kept alive only to satisfy lint |
| Largest server modules | `social.ts` 673, `admin.ts` 670 (51 routes), `weddings.ts` 538, `commerce.ts` 500, `astro.ts` 493 lines | Large but readable; very long single-line handlers |
| Largest web pages | `shop.tsx` 512, `weddings.tsx` 426, `social.tsx` 414, `studio.tsx`/`bonds.tsx`/`identity.tsx` ~392 | Each file holds many screens |

## Qualitative assessment

### What is good
- **Consistent conventions:** every handler follows `requireAuth → parse(Zod) → load → authorise → transaction → side effects → response`. Easy to review.
- **Explanatory comments where it matters** (why a rule exists, not what a line does): ranking weights, referral rules, payment boundary, schema isolation.
- **Pure, shared domain logic** in `src/shared/` (personality scoring, game engine, rituals, gamification) — deterministic and testable.
- **Server-authoritative design:** the client never computes points, scores or entitlements.
- **Defensive data handling:** idempotency keys, unique indexes as concurrency guards, `FOR UPDATE` locks.

### Problems and their real impact

| ID | Problem | Evidence | Impact |
|---|---|---|---|
| CQ-01 | **Scope, not code, is the dominant quality problem.** 21 modules / 392 endpoints for a product whose current promise uses ~6 modules. | Inventories | Every change to shared concepts (users, groups, posts, deletion, moderation) must consider dating, matchmaking, weddings, experts, LMS and commerce. Deletion logic (`account.ts:267-308`) already has to touch 30+ tables. |
| CQ-02 | **Business logic lives in route handlers.** | e.g. `social.ts:210-259` (post create), `commerce.ts:59-91` (order fulfilment) | Hard to unit-test without a database; reuse happens by importing other modules' internals (`circles.ts` imports `hydratePosts` from `social.ts`; `commerce.ts` imports `grantCourseEnrollment` from `learning.ts`). |
| CQ-03 | **Very long lines / dense handlers.** Many statements exceed 200 characters with nested ternaries. | `social.ts:80,301,659`, `play.ts:197`, `circles.ts:71-75` | Review fatigue; the privacy bugs SEC-01..04 sit in exactly this kind of dense code. |
| CQ-04 | **Overloaded concepts.** `groups` stores community groups, creator channels and circles (`kind`); circle "admin" is stored as role `moderator`; "archetype" means two different things; `reports` is both the moderation-report table and the paid-report product (`/api/v1/reports` vs `/api/v1/reports/:id`). | `services/circles.ts:12-17`, routes | Confusing reasoning about permissions; route collisions avoided only by Fastify's static-before-param ordering. |
| CQ-05 | **Repeated N+1 loops.** | `circles.ts:39-41` (`circlePoints` per circle, 3 queries each), `social.ts:346,457` (`canViewPost` per row, up to 4 queries each), `play.ts:155-158` (per-round submission reads), `referrals.ts` module re-evaluates every pending referral on GET | Fine at demo scale; quadratic-ish growth with activity. |
| CQ-06 | **Untyped JSONB boundaries.** Game `state`, chart `result`, payment `payload`, `fieldVisibility` are cast with `as` instead of validated on read. | 30 casts | A schema change in stored JSON fails at runtime, not compile time. |
| CQ-07 | **Side effects inside critical transactions.** Report generation runs inside the payment webhook transaction. | `commerce.ts:74-80` | A content error aborts the payment state change (proven: DEF-01). |
| CQ-08 | **Hard-coded policy values in code** (feed window 14 days / 400 rows, ritual circle timezone `Asia/Kolkata`, invite TTL 7 days / 20 uses, edit window 15 min). | `social.ts:292,309`, `rituals.ts:23` | Reasonable defaults; product changes require deploys. |
| CQ-09 | **Documentation drift risk.** 60+ markdown files including several "status", "readiness" and "QA" reports from previous phases. | `docs/`, root `NAKSHATRA_*.md` | Previous reports assert readiness that this audit contradicts (privacy). Treat them as history, not truth. |
| CQ-10 | **Dead/legacy UI and copy.** Header search placeholder "Search people, experts, courses, products…", cart icon in the global header, Shop categories for rudraksha and gemstones. | Browser observation | Product incoherence leaks into every screen. |

### Circular dependencies
No tooling-based cycle analysis was run. Manual reading found module-to-module imports (`circles.ts → social.ts`, `commerce.ts → learning.ts`, `auth.ts → services/referrals`) but no cycle that broke the build or type check.

### Testability
Integration tests exercise real routes against a real (embedded) Postgres via `app.inject` — this is the right level for this architecture and gives high confidence in what is covered. The cost is that pure business rules inside handlers have no fast unit tests.

## Verdict

Code quality at the line level is **good**: typed, linted, consistent, defensively written. The quality risk is **structural** — an over-wide surface area with dense handlers, where privacy-critical details (who sees an author id) are easy to get wrong and were got wrong in four places.
