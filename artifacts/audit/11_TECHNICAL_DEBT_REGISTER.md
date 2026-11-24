# 11 — Technical Debt Register

Complexity: XS (<½ day) · S (½–2 days) · M (3–5 days) · L (1–3 weeks) · XL (>3 weeks). Estimates are relative, for planning.

| ID | Debt | Evidence | Actual impact today | Severity | Priority | Complexity | Recommended action |
|---|---|---|---|---|---|---|---|
| TD-01 | **Product scope sprawl**: dating, matchmaking, Family Bridge, expert marketplace, LMS, physical commerce, weddings + vendors, community groups, stories, DMs ship alongside the identity/social core | 392 endpoints, 136 tables, 91 routes; 12 routes / 54 tables are core | Confuses users (05), multiplies security and moderation surface (SEC-08), slows every cross-cutting change (deletion touches 30+ tables) | High | P1 | M (hide/flag) → L (extract/remove) | Turn off and hide now; decide per module to remove or park on a branch |
| TD-02 | Session resolved with 2 DB queries on every request incl. static files | `app.ts:93` | Wasted pool capacity (max 5 in prod) | Medium | P2 | XS | Only resolve for `/api/*` (and SSR routes if added) |
| TD-03 | Migrations + reference seeding on every boot | `app.ts:35-37` | Slower cold starts on a sleeping free instance; seed resets flags only via `onConflictDoNothing` (OK) | Medium | P2 | S | Release-phase migration command |
| TD-04 | In-process scheduler, in-memory rate limits, `setTimeout` email kick | `scheduler.ts`, `app.ts:66`, `notify.ts:84` | Single-instance assumption; jobs pause while asleep | Medium | P2 | M | Separate worker/cron + shared store when scaling |
| TD-05 | Business logic inside route handlers; cross-module imports of internals | `circles.ts → social.ts hydratePosts`, `commerce.ts → learning.ts` | Hard to test rules without DB; privacy logic duplicated across serializers | Medium | P2 | L | Extract serializers for user-facing identities (one place decides real vs pen name) |
| TD-06 | N+1 query loops | `circles.ts:39-41`, `social.ts:346,457`, `play.ts:155-158`, `studio.ts communityGuesses`, `GET /referrals` re-evaluation | Latency grows with activity | Low now | P3 | S each | Batch queries |
| TD-07 | In-memory feed ranking over ≤400 rows, 14-day window, offset pagination | `social.ts:289-331` | Fine < ~10k users; caps discovery | Low now | P3 | L | Candidate pre-filtering/materialisation when needed |
| TD-08 | Untyped JSONB reads (`as unknown as`, 30 casts) | game state, chart results, payloads | Runtime errors on shape drift | Low | P3 | M | Zod-parse on read for game state |
| TD-09 | No CHECK constraints/enums for status columns | schema files | Invalid states possible via bugs/admin SQL | Low | P3 | S | Add CHECKs for core status columns |
| TD-10 | No data retention jobs | sessions, email_outbox, notifications, analytics_events, audit_logs, search_history, stored_files | Unbounded growth on a 500 MB DB; plaintext links retained (SEC-07) | Medium | P1 (outbox) / P2 (rest) | S | Nightly purge job |
| TD-11 | Uploads as Postgres `bytea` in production | `STORAGE_DRIVER=database` | Consumes free DB quota; DB backups bloat | Medium | P2 | M | Object storage |
| TD-12 | Overloaded naming: `groups` = groups/channels/circles; circle admin stored as `moderator`; two "archetype" systems; `reports` = moderation reports and paid reports | schema, routes | Reasoning errors (cf. SEC-04 events tied to `groups`) | Low | P3 | M | Rename at the API/serializer layer first |
| TD-13 | Documentation sprawl: 60+ docs incl. earlier readiness/QA reports that are now inaccurate | `docs/`, root `NAKSHATRA_*.md` | Misleads future work | Low | P2 | S | Archive superseded reports; keep one living status doc |
| TD-14 | No CI | no workflow files in git | Unverified merges auto-deploy | High | P1 | XS–S | Add CI |
| TD-15 | No error tracking or metrics | — | Production failures invisible | Medium | P1 | S | Add error tracker + uptime check |
| TD-16 | Heavy, flaky e2e suite with software WebGL | `playwright.config.ts` comments | Likely not run routinely | Low | P2 | M | Slim core-journey e2e without 3D |
| TD-17 | Dead-import shims (`void lt;`) and 23 swallowed `catch {}` blocks | grep | Noise; some failures hidden | Low | P3 | XS | Clean up |
| TD-18 | i18n partially implemented (≈60 keys; page copy hard-coded) | `lib/i18n.tsx` | Hindi users see mixed language | Low | P3 | L | Decide: commit to i18n or remove Hindi toggle |
| TD-19 | Oversized brand PNGs (1.3 MB OG images); 7.1 MB of SVG | `public/visual/brand/png` | Slow/absent link previews | Low | P2 | XS | Optimise images |
| TD-20 | Policy constants in code (feed window, invite TTL, edit window, circle timezone) | various | Product tuning needs deploys | Low | P3 | S | Move to `platform_settings` where tuning is expected |
