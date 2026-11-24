# 10 — Test Execution Results

All runs on the local machine, 2026-11-05/06, branch `product-evolution`, uncommitted working tree. Raw logs in `evidence/`.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| Unit + integration (final) | `npx vitest run --reporter=verbose` | **21 files, 259 tests, 259 passed**, 132.6 s | `evidence/vitest-final.txt` |
| Typecheck (web) | `tsc -p tsconfig.web.json --noEmit` | exit 0 | `evidence/typecheck.txt` |
| Typecheck (server) | `tsc -p tsconfig.server.json --noEmit` | exit 0 | `evidence/typecheck.txt` |
| Lint | `eslint src tests e2e scripts` | exit 0, no findings | `evidence/lint.txt` |
| Production build | `npm run build` | exit 0 | `evidence/prod-build-final.log` |
| Migrations | Every integration test file migrates a fresh in-memory DB 0000→0006; local dev DB migrated on app start | Pass | test run; server start log |
| Browser E2E (isolated build) | `npm run build:web:e2e` then `WEB_DIST_DIR=.data/e2e-web npx playwright test` | **23 passed, 1 failed** (21.3 min) | `evidence/e2e-run.log` |
| E2E failure re-run | `playwright test e2e/e-expert-booking.spec.ts --retries=0` | **1 passed** (16 s) | `evidence/e2e-rerun-E.log` |
| API health (local launch) | `GET http://127.0.0.1:4500/api/health` | 200, `{"status":"ok","database":"pglite"}` | manual |
| Module enforcement (local) | `GET /api/v1/dating/profile` | 404 `module_disabled` | manual |
| Responsive (local) | `scrollWidth` vs viewport at 360, 390, 430, 768, 1024 (+1280/1440 earlier) | No horizontal overflow on landing, assessment, share page, home, progress | manual browser |
| API benchmark | `npm run bench:api` A/B vs `f3d993a` | See `04` | `evidence/ab-*.json` |

## Test growth
Audit baseline: 13 files / 180 tests. Now: 21 files / 259 tests (+79).

| New file | Tests | Covers |
|---|---|---|
| `tests/integration/security-regressions.test.ts` | 15 | SEC-01/02/03/04/05/06, feed policy, gifts (DEF-01/02 incl. unregistered, wrong person, repeat claim, expiry, failed payment, refund, self-gift), DEF-05, retention |
| `tests/integration/modules.test.ts` | 5 | Registry mapping; every disabled prefix GET+POST → 404; catalogue filter; search scopes; admin re-enable |
| `tests/integration/sharing.test.ts` | 6 (1 skips without a web build) | Anonymous/named shares, no identifiers, attribution, revocation, inconclusive refusal, escaped meta |
| `tests/integration/progression.test.ts` | 7 | Quests, concurrent claims, self-reply farming, multi-step quest, achievements, seasons, inventory, reversals, streak |
| `tests/integration/features.test.ts` | 3 | Timeline, common ground (privacy), rematch |
| `src/shared/personality.test.ts` | 32 | Straight-lining (1/3/5), alternating, reversed, missing, determinism, all 24 archetypes reachable, random-sheet confidence |
| `src/shared/progression.test.ts` | 8 | Streak grace, reset, year boundary, ISO weeks, quest/season definitions |
| `src/shared/monetisation.test.ts` | 4 | 50 models, commission, revenue share, sponsorship disclosure |

## Changes to existing tests (and why)
- `tests/integration/harness.ts`: pins `PAYMENT_PROVIDER=dev_simulator` and `MAIL_TRANSPORT=dev_mailbox` so tests no longer depend on the developer's `.env`. Needed after setting the local `.env` to `PAYMENT_PROVIDER=none`; before this, 14 tests failed with 503 "Payments are not configured" — an environment leak, not a product regression.
- `tests/integration/razorpay.test.ts`: sets `PAYMENTS_ENABLED=true` for its stubbed-provider fixture, as the new safety gate requires.
No assertion was weakened.

## Known failures / flakiness
- **E2E Journey E (expert booking)** failed in the full run (and its retry) waiting for a second bookable slot in the booking dialog; it passed when run alone. Expert booking is a legacy module (off in launch scope; on in e2e). Likely order/time-dependent slot availability in the shared e2e database. Not fixed; recorded in `12`.

## Not run
- Real-PostgreSQL integration run (`TEST_DATABASE_URL`) — no local PostgreSQL server.
- Lighthouse/Web Vitals, load tests.
