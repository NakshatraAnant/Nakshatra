# Nakshatra test and blocker report

_2026-10-25. Every result comes from a command run on this date._

## Results
| Check | Result |
|---|---|
| `npm run typecheck` (web + server) | pass |
| `npm run lint` | pass, 0 findings |
| `npx vitest run` | **169/169 pass** (10 files). New: `src/shared/social.test.ts` (29 tests), `tests/integration/social.test.ts` (13 tests) |
| `npm run test:e2e` (full suite, Edge) | **22 passed, 2 failed** first run (19.6 min). The 2 failures were both accessibility scans (light and dark), each with the same finding: one composer link distinguishable only by colour (`/thoughts`) |
| Accessibility fix | All new inline links underlined; `e2e/a11y.spec.ts` re-run: **2/2 pass**. The full suite was not re-run end to end after this one-line CSS fix |
| New browser specs | `e2e/k-social.spec.ts` (2 tests) and the updated `e2e/j-discover.spec.ts`: pass |
| Build and local start | `npm run build` pass; `npm run local` → http://localhost:3000 healthy; migration 0003 applied to the existing dev database after a backup (`backups/pglite-2026-10-25T01-38-36-361Z.tar`) |

### What the tests cover

**Unit tests:**
- archetype scoring: determinism, bounds, unknown dimensions, validation, reachability of all 24 archetypes, prototype spacing
- game engine: all 12 games plan and validate; Who Said It author secrecy and scoring; Honest Vote totals only; Showdown consent; Plot Twist turns; Prediction settlement; Memory Lane eligibility; summaries
- ritual non-repetition, scope consistency and DST periods
- prompt id uniqueness
- ranking: no author signals for pseudonymous posts, needs-answers boost, engagement cap, per-author cap
- moderation screening
- email canonicalisation
- level names

**Integration tests:**
- preview stores nothing; onboarding completes without birth details; assessment points awarded once
- labels, pen names and locked styles validated on the server
- public identity visibility
- Thought Drop types, pseudonymity boundaries (post view, feed, profile, search), edits, reply points once per replier, thread depth, mute author, screening
- circles: privacy (detail, feed, join, listing, search), invite hash, preview contents, accept, roles, revoke 410, expiry 410, removal
- circle activation reward only at three contributors; recap
- a full Who Said It game (hidden authors, withdrawal, scoring, completion points), Honest Vote privacy, Memory Lane consent gate, solo game, turn order, play-point settlement
- rituals: one per period, circle answers unlock only after answering
- referrals: pending until activation; alias self-referral rejected
- identity report gated on assessment; purchased card style unlocks through entitlement; purchases add no points
- feature flag off blocks the API

**Browser tests:**
- archetype preview → signup → onboarding with saved answers → identity
- circle creation → invite link → second user joins → circle Thought Drop → full two-player This or That game → points → offer page
- no horizontal overflow at 360 px on the new pages

## Not verified
- Real phones and low-end GPUs (emulated widths only).
- Realtime multiplayer: there is none by design (3-second polling).
- Screen-reader walkthrough of game rounds.
- Load and concurrency on PostgreSQL. Round closing uses `SELECT … FOR UPDATE`, but PGlite serialises everything, so the race behaviour is not proven on a server.
- Behaviour with real users: every retention, conversion and virality number is unknown.

## External blockers (owner actions)
1. Razorpay live keys. Paid offers currently use the dev payment simulator; nothing claims a live payment works.
2. SMTP provider for real verification and notification emails.
3. WSL 2 or a PostgreSQL server, to run `TEST_DATABASE_URL=… npm test` and Docker.
4. Legal review: privacy notice (pseudonymity, game reuse consent), referral terms, UGC and moderation obligations, grievance officer, DPDP readiness, age handling.
5. Trademark search for archetype names and the brand.
6. Independent penetration test, especially invite tokens, pseudonymity boundaries and game-state endpoints.
7. Push notification provider (in-app notifications only today).
