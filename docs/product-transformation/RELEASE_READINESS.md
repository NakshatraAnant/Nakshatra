# Release readiness

**Status: an improved release candidate for local exploration and closed testing. Not production-launched.**

| Area | State | Evidence |
|---|---|---|
| New public journey (landing → preview → share → save) | Implemented and verified | `e2e/j-discover.spec.ts`, `tests/integration/discover.test.ts` |
| Archetypes and Vedic content v2 | Implemented and verified | `src/astro/archetype.test.ts` |
| Existing journeys | Verified (no regressions) | 22/22 e2e |
| Build integrity (production React, chunking) | Implemented and verified | Source map and modulepreload inspection |
| Content upgrade on the existing dev database | Verified | Server restart applied v2; sample shows the new Rashi text; backup taken first |
| Analytics funnel | Implemented, partially verified (API typechecked; dashboard not opened in the browser) | `admin.ts` |
| Payments (Razorpay live) | Blocked: merchant account and keys | unchanged |
| Email (SMTP provider) | Blocked: credentials | unchanged |
| PostgreSQL server / Docker | Blocked: WSL 2 | unchanged |
| Legal review, grievance officer, trademark clearance | Blocked: counsel | unchanged |
| Penetration test | Blocked: external | unchanged |
| Real-user validation | Not started | No users exist; every product metric is a hypothesis |

## Configuration and migrations
- **Migrations:** none added. No schema change.
- **`vite.config.ts`:** `envDir: 'src/web'` and function `manualChunks`.
- **Content seeding:** on first start, rows for v1 Rashi, Lagna and Vedic Sun are marked `retired`, and v2 rows are inserted.

## Run
```
npm run local        # build if needed, start on http://localhost:3000
npm run local:stop
```
After changing web code, rebuild (`npm run build`) **and restart**: the server registers asset files at startup.
