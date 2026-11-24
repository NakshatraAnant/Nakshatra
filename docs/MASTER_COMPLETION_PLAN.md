# Master completion plan

The plan the work follows; live progress is in `IMPLEMENTATION_STATUS.md`, feature-level evidence in `FEATURE_TRACEABILITY_MATRIX.md`, and the final assessment in `RELEASE_READINESS_REPORT.md`.

## Resume procedure (every session)
1. Read `IMPLEMENTATION_STATUS.md` → "Exact next action".
2. `git status`; re-run `npm run typecheck && npm run lint && npm test` to confirm the recorded baseline still holds.
3. Continue from the earliest incomplete phase below; update the status file before stopping.

## Phases
| Phase | Scope | Status |
|---|---|---|
| 1. Audit & baseline | Repository inventory, feature map, baseline checks | Done (2026-10-24: typecheck/lint pass, 99/99 tests at start of session) |
| 2. Foundations | Config guards, auth/authorisation, migrations, concurrency safety, throttling | Done — advisory-lock booking guard, per-account login throttle, production mail guard added 2026-10-24 |
| 3. Product functionality | All modules in PRODUCT_SPECIFICATION.md | Done except documented omissions (Shadbala; push/video/voice need providers; tax invoicing out of scope) |
| 4. UI/UX & 3D | Design system, responsive layouts, 3D scenes with fallbacks, accessibility | Implemented; context-loss fallback added; visual inspection + axe scan in progress |
| 5. Integrations | Payments, email | Razorpay adapter + SMTP transport implemented and tested against local fakes; live credentials pending (owner) |
| 6. Testing | 9 journeys + smoke, mobile, resilience | Specs written for all; A, B, C+H passed previously; full run in progress |
| 7. Deployment | Fresh install, production build, production-mode smoke, Docker, PostgreSQL | Fresh install + build + production smoke done; Docker/PostgreSQL blocked (no WSL 2 / no PostgreSQL on this machine) |
| 8. Commercial review | Acceptance criteria, legal pages, launch dependencies | In progress (RELEASE_READINESS_REPORT.md) |
| 9. Docs & handover | All docs + report | Docs written; report pending final run |

## Dependency order for remaining work
1. Green e2e run (or classified failures).
2. Accessibility scan + fixes.
3. Visual pass (desktop + mobile) + fixes.
4. Migration upgrade check on an existing database.
5. Release readiness report with exact commands and results.
6. Owner actions: install WSL 2 (or provide PostgreSQL) for Docker/PostgreSQL verification; Razorpay and SMTP credentials; legal review.
