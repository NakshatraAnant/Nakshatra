# Nakshatra build state (continuation file)

- Branch: product-evolution (local commits only, not pushed); last commit 628a59b
- Phase: hosting done; remaining scope listed below
- Local app: RUNNING at http://localhost:4500 (`app` launch config, local .data/pglite, payments off, dev mailbox)
- Backups: .data/pglite-backup-before-0007-0010 (taken before migrations 0007–0010 were applied to local data)
- Gates (2026-11-06): vitest 310/310; typecheck + lint clean; production build OK; Playwright full suite 26/26 (run 3, no retries;
  run 1 had 1 failure and run 2 had 2, both fixed: 404 display + ambiguous selector)
- Built this directive: MFA recovery codes; personality-v2 (balanced 2.9–5.2%/archetype, blends, versioned, v1 kept);
  assessment resume; funnel events + admin Funnel; nav (Home/Discover/Create/Circles/Play/Profile); voice + photo drops;
  opt-in People discovery; Home next step; reveal first-step card; COD merch lifecycle + admin fulfilment/stock (module off);
  admin Launch readiness + Performance; launch-scope e2e (legacy journeys via E2E_MODULE_SCOPE=all)
- NOT built (honest gaps): subscriptions (duo/student/founding), creator economy, community commerce, ad campaigns,
  partners/affiliate, B2B orgs, user quiz builder, tournaments/seasonal leaderboards, journal/calendar/theme studio/avatar,
  year-in-review, close friends, collections, circle channels/tiers/mod dashboard, 3D additions; most of the 50+50 lists
- Next exact task if continuing: subscriptions + entitlement engine (preview-only while payments are off), then quiz builder
