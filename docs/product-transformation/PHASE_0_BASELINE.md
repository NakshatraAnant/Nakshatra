# Phase 0: baseline

_Recorded 2026-10-25, before any transformation change._

## Repository
| Item | State |
|---|---|
| Root | `C:\Users\anant\Desktop\Nakshatra` |
| Branch | `master` (default branch named `main` in the remote config); no commits yet |
| Git status | Every project file untracked (25 top-level entries). Nothing is committed, and this work commits nothing. |
| Instructions | No CLAUDE.md or CONTRIBUTING file. Working conventions come from `docs/LOCAL_SETUP.md`, `docs/DECISIONS_AND_ASSUMPTIONS.md` and `docs/TESTING_STRATEGY.md`. |
| Stack (verified) | Vite 7 + React 19 SPA, Fastify 5 API, Drizzle ORM, PGlite locally (PostgreSQL via `DATABASE_URL`), React Three Fiber for 3D, astronomy-engine (MIT) for the ephemeris |
| Size (verified) | 15 server modules, 343 routes, 129 tables, 3 migrations |
| Data | Development database: 10 seed or test accounts, no real users |

## Test baseline (run 2026-10-25, before changes)
| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npx vitest run` | 118/118 pass (6 files) |
| Playwright e2e | Last full run 20/20 on 2026-10-24 (`docs/RELEASE_READINESS_REPORT.md`); not re-run before changes |

## Safety measures
- **Database backup** taken before the first server restart: `backups/pglite-2026-10-24T22-10-59-785Z.tar`.
  - Restore steps: stop the app, move `.data/pglite` aside, then run `npm run db:restore -- <file>`.
- **No destructive migrations.** This phase added no migration and no new table.
- **Content versioning is additive.** Code rules with a newer version are inserted. Older rows are marked `retired`, never deleted. Admin edits (higher versions) are never overwritten.
- **Secrets:** none printed or committed. `.data/dev-credentials.json` was not read.

## External boundaries (unchanged)
- **Razorpay:** tested against a fake only. No merchant account.
- **SMTP:** tested against an in-process server only.
- **PostgreSQL server or Docker:** not verified. WSL 2 is missing.
- **Image generation:** no tool is available in this environment. All new visuals are procedural (SVG) and generated from calculated data. No AI images were produced.

## Prior strategy documents
`docs/diagnosis/*` (2026-10-25) was read and kept. Two corrections were added to it after this phase found errors (see its "Corrections" section).
