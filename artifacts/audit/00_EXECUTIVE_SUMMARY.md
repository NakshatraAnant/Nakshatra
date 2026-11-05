# Nakshatra — Audit Executive Summary

**Scope:** forensic audit of commit `f3d993a` (branch `visual/ink-ember-integration`), 2026-11-05. No application file, schema, dependency, environment or infrastructure was changed; nothing was deployed. All deliverables are in `artifacts/audit/`.

## The short version

1. **The core is real and well built.** The account-free archetype reveal, Thought Drops, private circles, rituals and a 12-game turn-based engine are implemented end-to-end with server-authoritative rules. 180/180 tests, typecheck, lint and a production build all pass.
2. **The privacy promise is broken.** Four HIGH defects were reproduced on an in-memory copy of the app:
   - muting a pen-name author shows their real name in Settings (SEC-01);
   - a pen-name author replying to their own post is shown under their real name (SEC-02);
   - Who Said It? / Hot Take Arena / Memory Lane send the hidden author's id to every player (SEC-03);
   - events in private circles — including location — are listed to every user, who can RSVP (SEC-04).
   The existing tests passed because they check for the wrong things (QA-01).
3. **The product is two products.** Only 12 of 91 screens and 54 of 136 tables serve the positioned product. Dating, matchmaking, experts, courses, a physical-goods shop and weddings ship alongside it, are enabled by default in production, and their feature flags are not enforced by the API (SEC-08).
4. **Growth and retention loops are under-built and unmeasured.** No share from the preview, shares carry no link or referral code and are not tracked, no acquisition analytics, no push or email re-engagement, and "public" Thought Drops from default-private profiles are only visible to followers.
5. **Operational readiness is incomplete.** No CI (with `autoDeploy: true`), no error monitoring, SMTP unconfigured, no backups on the free database, legal pages describe the old astrology product, and the production Supabase project was hibernated, so live schema isolation could not be verified.

**Verdict:** not ready for public launch. Ready for a closed beta after the six P0 items and the beta prerequisites in `20_FINAL_PRODUCT_READINESS_REPORT.md` §11.

## Key numbers

| Measure | Value |
|---|---|
| Lines of TS/TSX/SQL/CSS | ~33,900 |
| API endpoints / DB tables / screens | 392 / 136 / 91 |
| Features inventoried | 100 — 11 complete & verified, 64 implemented (partially verified), 10 partial, 7 broken, 6 not implemented, 2 blocked by payments |
| Tests | 180 passed / 0 failed (vitest); Playwright e2e not run |
| Security findings | 4 HIGH, 6 MEDIUM, 6 LOW, 3 INFO (19 total) |
| Initial JS (core pages) | ~142 KB gzipped; 3D stack lazy-loaded |
| npm audit (prod deps) | 3 moderate, 0 high, 0 critical |
| Archetype bias (random answers) | "Calm in the Chaos" 24.4%; straight-lined answers → "Calm in the Chaos", high confidence |

## Priorities

| P0 (release blockers) | SEC-01, SEC-02, SEC-03, SEC-04, SEC-08, QA-01 |
|---|---|
| P1 (before public launch) | SEC-05 MFA re-auth · SEC-06 pen-name visibility model · SEC-07 plaintext reset links · SEC-09 compose dev mailbox · PRD-01 narrow navigation · PRD-02 hide unbuyable offers · DEF-01/02/05 payment/gift defects (before enabling payments) · DEF-04 scoring straight-lining · DEP-04 SMTP · DEP-07 CI · DEP-12 legal rewrite |
| P2 | Share loop + attribution, analytics gaps, public-post visibility, re-engagement digest, link previews, retention jobs, object storage, real-Postgres CI |
| P3 | Performance refactors, naming clean-up, i18n decision, minor authz/dependency items |

## Next 30 days (recommended)
Week 1 fix privacy + flags; week 2 narrow the product and stand up SMTP/CI/monitoring; week 3 build and measure the share loop; week 4 closed beta with friend groups and measure activation, sharing, circle activation and return. Details: `13_PRIORITISED_RECOMMENDATIONS.md`.

## Document index

| # | File | Contents |
|---|---|---|
| 00 | `00_EXECUTIVE_SUMMARY.md` | This summary |
| 01 | `01_SYSTEM_ARCHITECTURE_AUDIT.md` | Runtime map, request lifecycles, architecture assessment |
| 02 | `02_SOURCE_CODE_QUALITY_AUDIT.md` | Automated checks, code-quality findings |
| 03 | `03_FEATURE_COMPLETENESS_AUDIT.md` | Feature-by-feature status incl. scoring analysis and all 12 games |
| 04 | `04_DATABASE_AND_BACKEND_AUDIT.md` | Schema, isolation, indexes, data lifecycle, backend defects |
| 05 | `05_UI_UX_AND_VISUAL_AUDIT.md` | Browser findings, responsive checks, assets |
| 06 | `06_SECURITY_AND_PRIVACY_AUDIT.md` | Security/privacy findings with reproduction |
| 07 | `07_PERFORMANCE_AND_SCALABILITY_AUDIT.md` | Measured sizes, request costs, scale estimates |
| 08 | `08_TESTING_AND_QA_AUDIT.md` | Coverage and test-quality findings |
| 09 | `09_PRODUCT_AND_GROWTH_READINESS.md` | Positioning, activation, retention, virality, monetisation, analytics |
| 10 | `10_DEPLOYMENT_READINESS.md` | Render/Supabase readiness and blockers |
| 11 | `11_TECHNICAL_DEBT_REGISTER.md` | Debt register |
| 12 | `12_MISSING_FEATURES_AND_GAPS.md` | Gaps, and what not to build |
| 13 | `13_PRIORITISED_RECOMMENDATIONS.md` | Every finding with impact, severity, priority, complexity, action |
| 14 | `14_COMPLETE_FEATURE_INVENTORY.csv` | 100 features |
| 15 | `15_SCREEN_AND_ROUTE_INVENTORY.csv` | 91 front-end routes |
| 16 | `16_API_ENDPOINT_INVENTORY.csv` | 392 endpoints with auth, rate limit, validation |
| 17 | `17_DATABASE_TABLE_INVENTORY.csv` | 136 tables |
| 18 | `18_SECURITY_FINDINGS_REGISTER.csv` | 19 security findings |
| 19 | `19_TEST_EXECUTION_RESULTS.md` | Commands run and results |
| 20 | `20_FINAL_PRODUCT_READINESS_REPORT.md` | Answers to the 15 questions; coverage statement |
| — | `evidence/` | `audit-probe.ts`, `audit-probe-output.json`, `vitest-test-list.txt` |
