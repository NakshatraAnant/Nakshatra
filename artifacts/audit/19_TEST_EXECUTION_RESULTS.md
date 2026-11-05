# 19 — Test Execution Results

All commands were run on 2026-11-05 on the auditor's Windows machine from `C:\Users\anant\Desktop\Nakshatra` at commit `f3d993a` (clean working tree). No test, source or config file was modified.

## Commands and results

| # | Command | Result | Duration |
|---|---|---|---|
| 1 | `npx vitest run --reporter=verbose` | **13 files, 180 tests, 180 passed, 0 failed, 0 skipped** | 80.6 s (89 s wall) |
| 2 | `npx tsc -p tsconfig.web.json --noEmit` | exit 0 | — |
| 3 | `npx tsc -p tsconfig.server.json --noEmit` | exit 0 | — |
| 4 | `npx eslint src tests e2e scripts` | exit 0 | — |
| 5 | `npx vite build --outDir <scratchpad>/webbuild --emptyOutDir` | exit 0 (repo `dist/` not touched) | — |
| 6 | `npm audit --omit=dev --json` | 3 moderate, 0 high, 0 critical | — |
| 7 | `npm audit --json` | 13 moderate, 0 high, 0 critical | — |
| 8 | `npx tsx evidence/audit-probe.ts` (audit probe, in-memory DB) | exit 0; 7 defects reproduced (see below) | not timed |
| 9 | Playwright e2e (`npm run test:e2e`) | **NOT RUN** | — |

Per-test list: `evidence/vitest-test-list.txt` (180 lines, all ✓).

### Why e2e was not run
`npm run test:e2e` first runs `vite build` into the repository's `dist/web` (overwriting build output) and launches Microsoft Edge with software WebGL for ~15+ minutes per the config comments. The audit rule was not to modify the application; the existing `playwright-report/index.html` dated 2026-10-25 was **not** used as evidence because it predates the last three commits (deployment config, Postgres uploads, schema isolation).

### Side effects of running tests
- `.data/test-errors.log` (gitignored) is appended by the server when a 500 occurs under `NODE_ENV=test`. The audit probe's DEF-01 reproduction (gift report → 500) wrote a stack trace there. No other files outside the scratch directory and `artifacts/audit/` were written by the audit.
- The browser session used the local development database (`.data/pglite`) via `npm run dev:api`; migrations/seeding are idempotent; a sign-in created one session row for the seeded demo member.

## Suite composition

| File | Tests (`it`) | Kind | What it really exercises |
|---|---|---|---|
| `src/astro/reference.test.ts` | 22 | unit | Ephemeris/chart values against reference data |
| `src/astro/rules.test.ts` | 39 | unit | Vedic/Western rule engines |
| `src/astro/archetype.test.ts` | 5 | unit | Cosmic (astrology) archetype derivation |
| `src/shared/social.test.ts` | 29 | unit | Personality scoring, game engine pure functions, ranking |
| `src/web/lib/visual.test.ts` | 3 | unit | Visual registry mapping |
| `tests/integration/core.test.ts` | 13 | API + real Postgres (PGlite) | Auth, CSRF, IDOR, MFA, webhooks, analytics sanitisation |
| `tests/integration/journeys.test.ts` | 22 | API + PGlite | Journeys A–J: astrology, bonds, learning, dating, experts, commerce, weddings, gamification, privacy/deletion, concurrency |
| `tests/integration/social.test.ts` | 13 | API + PGlite | Identity Studio, Thought Drops, circles, games, rituals, referrals, offers, flags |
| `tests/integration/schema-isolation.test.ts` | 2 | API + PGlite | Dedicated schema next to clashing public tables |
| `tests/integration/deploy-config.test.ts` | 6 | config + PGlite | TLS options, origin, prod guards, RLS, DB uploads |
| `tests/integration/discover.test.ts` | 4 | API | Account-free Cosmic ID |
| `tests/integration/razorpay.test.ts` | 3 | API with **stubbed** Razorpay HTTP | Signature checks, order→capture→refund flow against a fixture |
| `tests/integration/smtp.test.ts` | 2 | API with a local TCP SMTP stub | SMTP delivery path |
| `e2e/*.spec.ts` (14 files) | 24 | browser | not run |

## Audit probe results (`evidence/audit-probe.ts` → `evidence/audit-probe-output.json`)

| Probe | Expectation from product promise | Observed | Finding |
|---|---|---|---|
| P1 | Muting a pen-name author keeps them anonymous | Muted list returns real `displayName`, `handle`, `userId` | SEC-01 |
| P2 | Pen-name author's replies keep pen name | Reply shows real identity | SEC-02 |
| P3 | Hidden author in Who Said It? / Hot Take Arena | `round.excludeId` = author; author only player not "waiting" | SEC-03 |
| P4 | Circle events invisible outside circle | Outsider sees title + location; RSVP 200 | SEC-04 |
| P5 | Disabling MFA requires password | `/mfa/setup` flips `mfaEnabled` to false | SEC-05 |
| P6 | — | Duplicate signup → 409 with "already exists" | SEC-11 |
| P7a | Paid gift to member without assessment fulfils or fails cleanly | Webhook 500; payment `created`; order `pending_payment` | DEF-01 |
| P7b | Gift to non-member reaches recipient | Report lands in buyer's library | DEF-02 |
| P9 | Scoring is deterministic, unbiased, robust | Deterministic ✓; all 24 reachable ✓; straight-lining → Calm in the Chaos "high"; 24.4% Calm in the Chaos under random answers | DEF-04 |

## Quality of the existing tests

**Strong points**
- Tests hit real routes through `app.inject` with a real Postgres engine (PGlite), real CSRF and cookies — very little mocking.
- Concurrency tests (double booking, double XP) and idempotent webhook tests exist.
- Privacy intent is tested in several places (Honest Vote, public profile field visibility, circle 404s, analytics sanitisation).

**Weak assertions / gaps that let real defects through**

| Test | Weakness | Defect it missed |
|---|---|---|
| `social.test.ts:185` Who Said It? | Asserts `JSON.stringify(view.round)` does not contain the string `'secret'` — checks the key name, not the author id | SEC-03 |
| `social.test.ts:80-118` pen names | Checks post author, feed, profile list and search, then mutes — but never reads `/api/v1/blocks` or a self-reply | SEC-01, SEC-02 |
| none | No test for events attached to private groups/circles | SEC-04 |
| `core.test.ts:142` MFA | Enrolment and login only; no test that setup cannot reset an enabled factor | SEC-05 |
| `social.test.ts:338` identity report | Self-purchase only; no gift paths | DEF-01, DEF-02 |
| `social.test.ts:26` scoring | One fixed answer pattern; no straight-lining or distribution test | DEF-04 |
| `social.test.ts:367` flags | Covers circles/play only; no test that dating/matchmaking flags block their APIs | SEC-08 |
| Razorpay | Provider HTTP stubbed (honestly documented: "Live verification needs a merchant account and is NOT covered here") | Live integration unverified |
| Schema isolation | PGlite only (unless `TEST_DATABASE_URL`/`TEST_DATABASE_SCHEMA` set, which they were not in this run); Supabase pooler/TLS/grants not exercised | Production isolation unverified |

**Missing categories:** load/performance tests, dependency/licence checks in CI, accessibility unit checks outside the e2e axe spec, any CI configuration in the repository (no `.github/workflows` or equivalent found in `git ls-files`).

## Flakiness
The vitest run was executed once and passed. `playwright.config.ts` documents an intermittent stall in the four-user wedding journey after long software-WebGL runs (isolated into its own project) and uses `retries: 1` — a known flakiness source in e2e.
