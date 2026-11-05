# Nakshatra build state (continuation file)

- Branch: product-evolution (local commits only, not pushed)
- Phase: 2 — revenue/COD lifecycle next
- Done this directive: MFA recovery codes (0007); personality-v2 scoring + admin diagnostics; assessment draft resume;
  launch-scope e2e (legacy journeys opt-in via E2E_MODULE_SCOPE=all); funnel events + admin Funnel; nav redesign
  (Home/Discover/Create/Circles/Play/Profile); Create page (text/poll/photo carousel/voice ≤60s, migration 0008);
  opt-in People discovery (0009, /api/v1/people/*); Home "next step"; admin Assessment model + Funnel sections
- Tests: vitest 300/300; typecheck + lint clean. E2E not yet re-run after nav change (mobile.spec needs update: no "More" in bottom nav; menu button in header)
- Migrations: 0007–0009 verified on disposable copy (.data/pglite-disposable via `verify` launch config, port 4520). Local .data/pglite still at 0006 — apply at final hosting after a fresh backup.
- Next exact task: COD physical-merch order lifecycle (schema, state machine, inventory reservation, admin fulfilment, UI, tests)
- Then: Launch Readiness admin centre → e2e update (mobile/nav, new journeys) → full gates → backup + host :4500
- Local app: `verify` server may be running on :4520 (disposable DB); :4500 not running
