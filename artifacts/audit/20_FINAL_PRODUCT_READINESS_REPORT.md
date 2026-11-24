# 20 — Final Product Readiness Report

Audit of commit `f3d993a` on `visual/ink-ember-integration`, 2026-11-05. Evidence: code trace, 180 passing tests, an audit probe that reproduced 7 defects, a production build, `npm audit`, and a browser walk-through of the local development app at 1440/1280/768/390/360 px. Production (Render/Supabase) was not inspected live: the Supabase project was hibernated.

## Overall assessment

Nakshatra is a **well-engineered, over-scoped product with a strong hook and a broken trust promise**.

- Engineering quality at the line level is high (typed, linted, consistent, defensive), and the core features are real — no placeholder screens.
- The core product promise — *pen names hide who you are; circles are invisible; games reveal without names* — is false in four reproduced ways.
- About two-thirds of the shipped surface (dating, matchmaking, experts, LMS, physical commerce, weddings, astrology suite) belongs to an earlier product and is live by default.
- It is **not ready for public launch**. With the P0 list fixed and non-core modules switched off, it is a reasonable candidate for a **closed beta with friend groups**.

No numeric score is given: the evidence supports a readiness *state*, not a precise number.

## Answers to the fifteen questions

**1. What exactly is Nakshatra today?**
A single Fastify + React + PostgreSQL application that contains (a) a personality-led social product — a 20-statement, five-dimension assessment mapping to 24 archetypes, Thought Drops with optional pen names, invite-only private circles, daily/weekly rituals, 12 turn-based social games, XP/levels/achievements, activation-gated referrals and two small paid offers — and (b) a full astrology "super-app": Vedic/Western charts, Cosmic ID, daily sky, calendar, bonds and compatibility, dating, marriage matchmaking with a family bridge, an expert consultation marketplace, an LMS, an e-commerce store with physical goods, and wedding planning with vendors. 392 API endpoints, 136 tables, 91 screens.

**2. What is genuinely working?**
Account-free assessment and reveal (completed in the browser); saving results and onboarding; authentication with sessions, CSRF, throttling, TOTP; Thought Drop creation, editing, comments, reactions, polls, reports; circle creation, hashed expiring invites, roles and ownership transfer; the game engine with row-locked round closing and all 12 rule sets (nine without known leaks); rituals; idempotent XP and achievements; referrals with activation gating; entitlement-checked cosmetics and reports via the dev payment simulator; data export; schema isolation, RLS and production config guards (tested on PGlite); responsive layouts with no horizontal overflow at 360 px on the pages checked.

**3. What is incomplete?**
Sharing (no share before signup, no link or attribution in shares, no tracking); analytics for acquisition, offer views and share; re-engagement (no push, no digest); production email, payments, monitoring, CI and backups; legal pages for the current product; scoring robustness (straight-lining) and calibration; account deletion for files and analytics; Hindi localisation beyond navigation; feature-flag enforcement outside circles/play.

**4. What is broken?**
Pen-name anonymity (mute list and self-replies reveal the author — verified); game secrecy in Who Said It?, Hot Take Arena and Memory Lane (author ids sent to clients — verified for two, same mechanism in the third); private circle events (visible with location to everyone — verified); MFA can be removed without the password (verified); gifted reports (payment webhook fails with 500, or the gift goes to the buyer — verified).

**5. Biggest technical risk?**
Privacy-critical serialization is scattered across dense route handlers with no single place that decides "real identity or pen name", and the tests check for the wrong thing. That combination produced four HIGH leaks with a green suite and will keep producing them as features are added. Close second: a 392-endpoint surface maintained by a small team.

**6. Biggest product risk?**
Identity confusion. A visitor is promised "find your kind of person"; a member receives an astrology super-app with a store and a dating section. Positioning, onboarding, navigation, legal text and analytics all pull in different directions.

**7. Biggest user-experience problem?**
After the excellent archetype reveal, the experience fragments: no way to share the result before signing up, and a signed-in navigation of 20+ destinations where the social core is empty until friends arrive.

**8. What could prevent users from returning?**
Nothing reaches them outside the app (no push, no email digest); solo users have one daily choice and private journal prompts; the public feed is effectively empty because "public" posts from default-private profiles are only visible to followers; 11 of 12 games need a group.

**9. What could prevent organic growth?**
The share artefact carries no link, no referral code and no measurement; invite and profile links get generic, heavy link previews; public identity pages 404 for strangers by default; referral rewards are points with little value.

**10. What is preventing public launch?**
The P0 list: SEC-01, SEC-02, SEC-03, SEC-04 (privacy), SEC-08 (unmoderated dating/matchmaking live by default), QA-01 (tests that would catch these). Then operational prerequisites: SMTP, CI, error monitoring, backups, updated Terms/Privacy, and a production database that is awake.

**11. What must be fixed before beta?**
All P0 items; MFA re-auth (SEC-05); outbox token retention (SEC-07); hide non-core modules and paid offers (PRD-01, PRD-02); production SMTP; CI; error monitoring; a read-only verification that the live `nakshatra` schema is isolated and the 22 legacy tables are untouched.

**12. What must be fixed before public launch?**
Everything for beta plus: pen-name visibility model (SEC-06); legal rewrite and DPDP review (DEP-12); scoring straight-lining guard (DEF-04); share loop with attribution and analytics (PRD-03, PRD-05); public-post visibility rule (PRD-04); backups and retention jobs; a paid or always-on hosting decision. Before enabling payments: DEF-01, DEF-02, DEF-05.

**13. What can wait until after launch?**
Feed materialisation and search indexing, realtime games, horizontal scaling (shared rate limits, separate worker), JSONB validation, CHECK constraints, i18n decision, renaming overloaded concepts, N+1 clean-ups, dependency minor updates.

**14. What should we avoid building?**
More games, more modules, realtime infrastructure, a points marketplace, streaks, public circle discovery, AI features, and any further work on dating, matchmaking, weddings, experts, LMS or physical commerce until the core has demonstrated retention. Avoid adding premium tiers before the free loop is measured.

**15. What should the next 30 days focus on?**
Week 1: fix and regression-test the four privacy leaks, MFA and flag enforcement. Week 2: narrow the signed-in product to Home/Identity/Thoughts/Circles/Play, hide paid offers, ship SMTP + CI + monitoring, start the legal rewrite. Week 3: build and instrument the share loop from the preview, fix public-post visibility, guard against straight-lined answers. Week 4: closed beta with real friend groups and measure preview→signup, share rate, invite acceptance, circle activation and week-1/2 return. (Detail in `13_PRIORITISED_RECOMMENDATIONS.md`.)

## Audit coverage

| Area | Status |
|---|---|
| Architecture, config, server bootstrap, auth, social, circles, play, studio, rituals, referrals, payments, storage, scheduler, deletion | **Fully audited** (code traced; key paths exercised) |
| Database schema, migrations, schema isolation code, indexes, lifecycle | **Fully audited** in code; production state **not audited** |
| Security of core product | **Fully audited** (manual review + probe); no dynamic scanning |
| Test suites (vitest), typecheck, lint, build, dependency audit | **Executed** |
| UI/UX and visual | **Partially audited** — 11 screens in browser at 5 widths; screenshots not persisted; many screens code-only |
| Asset integration | **Fully audited** for presence/registry/size; usage per asset not verified |
| Performance | **Partially audited** — bundle/asset sizes measured; latency and load not measured |
| Admin module | **Partially audited** — capability map and route inventory; handlers not traced individually |
| Astrology engine, dating, matchmaking, experts, LMS, commerce, weddings | **Partially audited** — inventoried, sampled, covered by passing journey tests; not deeply reviewed |
| Playwright e2e | **Not run** (would overwrite `dist/web`; long-running) |
| Production Render service, Supabase schema/RLS/legacy tables, DNS/HTTPS, SMTP provider | **Not audited** (hibernated/unavailable or out of scope) |
| Product strategy | **Audited from evidence**; strategic statements marked as hypotheses; no user research available |
