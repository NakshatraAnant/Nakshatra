# 08 — Testing and QA Audit

Execution details and raw results: `19_TEST_EXECUTION_RESULTS.md`.

## Summary

| Area | Coverage | Confidence |
|---|---|---|
| Authentication, sessions, CSRF, MFA happy path | Integration tests with real cookies and CSRF | High |
| Astrology calculations | 66 unit tests incl. reference values | High (not re-derived by this audit) |
| Personality scoring | Unit + integration, one fixed answer pattern | Medium — misses straight-lining and distribution bias |
| Thought Drops / feed | Integration | Medium — pen-name leaks untested |
| Circles | Integration (privacy 404s, invites, roles, activation) | Medium — events untested |
| Games | 6 of 12 games appear in tests (who_said_it, honest_vote, memory_lane, pick_your_chaos, plot_twist, prediction_market) | Low-Medium — secrecy assertion is ineffective |
| Rituals / referrals / offers | Integration | Medium — gift and cap paths untested |
| Payments | Dev simulator end-to-end; Razorpay with stubbed HTTP | Medium for logic, none for live provider |
| Schema isolation / RLS | PGlite integration | Medium — not run against Postgres/Supabase in this audit |
| Browser journeys | 14 Playwright specs (24 tests) incl. axe and 360 px overflow | Unknown — not run |
| Load / performance | none | none |
| Security scanning | none in repo (manual secret-scan script exists: `scripts/secret-scan.ts`) | low |
| CI | no CI configuration tracked in git | none |

## Findings

| ID | Finding | Impact | Priority |
|---|---|---|---|
| QA-01 | **Privacy assertions test the wrong thing.** Who Said It? test checks the literal key `secret` is absent instead of checking the author id is absent; pen-name test never inspects the mute list or self-replies. | Four HIGH privacy defects shipped with a green suite (SEC-01..04). | P0 |
| QA-02 | **No CI.** Tests, typecheck, lint and build are run by hand. `render.yaml` has `autoDeploy: true` on `main`. | A push to `main` deploys without any automated gate. | P1 |
| QA-03 | **Half the games have no test**: One-Line Confessions, Archetype Showdown, Friend Decoder, This or That, Hot Take Arena, Compatibility Lab. | Rule/secrecy regressions undetected. | P1 |
| QA-04 | **Tests run on PGlite by default**; the production path (node-postgres pool, Supabase session pooler, TLS with CA, dedicated schema, revoked roles) is only exercised when `TEST_DATABASE_URL`/`TEST_DATABASE_SCHEMA` are set. | Pooler/TLS/grant issues will appear first in production. | P1 |
| QA-05 | **Payment provider only tested with a fixture.** Documented honestly in the test file. | Live Razorpay behaviour (event shapes, retries, refunds) unknown. | P2 (payments disabled) |
| QA-06 | **e2e suite is heavy** (software WebGL, 240 s timeouts, `retries: 1`, a documented intermittent stall) and was last reported on 2026-10-25. | Low signal-to-cost; likely skipped in practice. | P2 |
| QA-07 | **No property/distribution tests** for scoring and ranking. | Bias defects (DEF-04) invisible. | P2 |
| QA-08 | **No tests for retention/deletion of files**, analytics ids after deletion. | SEC-13 undetected. | P3 |
| QA-09 | **No performance or load tests.** | Scale behaviour in `07` is estimate-only. | P3 |

## Tests that pass despite broken behaviour
- `social.test.ts › runs a full Who Said It? game with hidden authors…` — passes while authors are exposed (SEC-03).
- `social.test.ts › supports Thought Drop types, pseudonymity boundaries…` — passes while pen names can be unmasked (SEC-01/02).
- `social.test.ts › keeps circles private…` — passes while circle events are public (SEC-04).

## Recommended QA additions (in order)
1. Privacy regression tests that assert **absence of the real user id/handle/name** in every response a non-author can fetch for pen-name content and game rounds (feed, post detail, comments, blocks/mutes, search, notifications, game session).
2. Event visibility tests for private groups/circles.
3. MFA setup-while-enabled test; gift purchase tests (member without prerequisite, non-member).
4. Scoring distribution test (straight-lining, per-archetype share bounds).
5. A minimal CI workflow: typecheck, lint, vitest, build — and run the integration suite once against real Postgres with `TEST_DATABASE_SCHEMA=nakshatra`.
