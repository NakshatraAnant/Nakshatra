# Testing strategy

Tests prove behaviour against real code paths: the real engine, the real API through Fastify's injector or HTTP, the real database engine (PostgreSQL via PGlite, or a PostgreSQL server), and the real built UI in a real browser. Nothing is mocked except external providers that are not integrated (payments use the labelled dev simulator, which signs real webhook payloads).

## Layers
| Layer | Tool | Location | Database | Run |
|---|---|---|---|---|
| Engine reference & rules | Vitest | `src/astro/*.test.ts` | none | `npm run test:unit` |
| API integration & security | Vitest + `app.inject` with cookie/CSRF jar | `tests/integration/*.test.ts` | in-memory PGlite per file, or a throwaway PostgreSQL DB per file with `TEST_DATABASE_URL` | `npm test` |
| Browser journeys | Playwright (installed Edge) | `e2e/*.spec.ts` | fresh on-disk PGlite under `.data/e2e`, seeded with labelled sample data | `npm run test:e2e` |
| Static | TypeScript strict, ESLint (typescript-eslint, react-hooks) | — | — | `npm run typecheck`, `npm run lint` |
| Secrets | Pattern scanner | `scripts/secret-scan.ts` | — | `npm run audit:secrets` |
| Dependencies | npm audit | — | — | `npm audit --omit=dev` |

## Coverage map
| Area | Unit/rule | Integration | Browser |
|---|---|---|---|
| Astronomy, time zones, panchang, festivals | 69 tests | daily/panchang/ICS endpoints | Cosmic ID matches API chart (A) |
| Auth, sessions, CSRF, MFA, throttling | — | core.test.ts | signup/sign-in/out (A), mobile signup |
| IDOR / authorisation / admin capabilities | — | core.test.ts | smoke.spec.ts (403 for members), I |
| Bonds consent, share links, revocation | compatibility engine | journeys B | B, I |
| Learning, quizzes, certificates | — | journeys C | C |
| Gamification idempotency | — | journeys H + concurrent XP test | C+H |
| Dating lifecycle | — | journeys D | D |
| Matchmaking & family permissions | — | journeys (matchmaking) | smoke routes |
| Expert booking, payments, refunds, double-booking | — | journeys E + concurrent booking test | E |
| Commerce, inventory, refunds | — | journeys F, webhook idempotency | F |
| Weddings, permissions, quotations, milestones | — | journeys G | G |
| Privacy export & deletion | — | journeys I | I |
| Notifications, search, support, admin | — | journeys/admin tests | smoke routes, F (admin refund), I (admin privacy) |
| Every route renders | — | — | smoke.spec.ts (public, member, all 18 admin sections, 404) |
| Mobile | — | — | mobile.spec.ts (Pixel 7 emulation: touch onboarding, bottom nav, drawer, no horizontal overflow on 14 routes) |
| 3D resilience | — | — | resilience.spec.ts (WebGL off, context loss, reduced motion, repeated navigation, keyboard/dialog focus) |

## Rules
- Tests never touch the developer database (`.data/pglite`) or `.data/dev-credentials.json`; the e2e server deletes and recreates `.data/e2e` each run.
- No assertion is removed or loosened to make a test pass; failures are investigated (see IMPLEMENTATION_STATUS.md for the log of real defects found by tests).
- Timeouts reflect measured behaviour (see DECISIONS_AND_ASSUMPTIONS.md #20).
- Generated test passwords are fixed throwaway values used only in disposable databases.

## Results
The latest executed results, with dates and counts, are recorded in `docs/RELEASE_READINESS_REPORT.md`.
