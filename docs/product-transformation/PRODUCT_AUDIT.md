# Product audit

_2026-10-25. The full market and content diagnosis is in `docs/diagnosis/NAKSHATRA_BRUTAL_PRODUCT_DIAGNOSIS.md`. This audit lists what this phase found in the running product, each with its status after this phase._

## Issue register (prioritised)
| # | Issue | Evidence | Severity | Status after this phase |
|---|---|---|---|---|
| 1 | **The web build shipped React's development bundle.** Root `.env` sets `NODE_ENV=development`, and Vite honoured it at build time. Likely since `.env` was overwritten from `.env.example` on 2026-10-24 | Source map of `react-*.js` listed `react.development.js` and `react-dom-client.development.js` | High: about 2× JavaScript and slower rendering | **Fixed:** `envDir: 'src/web'` in `vite.config.ts`; verified production React in the source map |
| 2 | **Every page preloaded three.js and R3F**, about 267 kB gzipped, including the landing page. Vite's preload helper had been placed in the r3f chunk | `dist/web/index.html` modulepreload list; entry imported `_` from `r3f-*.js` | High (performance) | **Fixed:** function `manualChunks` pins the helper to the React chunk. Only `react-*.js` is preloaded now |
| 3 | No value before an account. The landing page showed six product pillars and no output | `landing.tsx` (old) | High | **Fixed:** new landing with a live, labelled sample. Account-free `/discover` |
| 4 | **Vedic layers reused Western text.** Rashi = Moon text + one note, Lagna = Ascendant text, Surya = Sun text | `interpretations.ts` (old) | High (credibility) | **Fixed:** 36 new Vedic texts (`src/content/vedic.ts`), with a test that no Vedic body equals a Western one |
| 5 | No archetype system. The historical archetype names did not exist in the code | grep of `src/` | Medium | **Built:** a deterministic 12-archetype system (`src/astro/archetype.ts`, `src/content/archetypes.ts`) |
| 6 | The decorative 3D hero ("Planets shown above are decorative and not to scale") carried no meaning | `landing.tsx` (old) | Medium | **Replaced** on the landing page with the data-driven sigil. The 3D scenes remain on Cosmic ID, Chart, Bonds and Journey (not re-audited this phase) |
| 7 | Share card was 600×440 and not suited to Stories or Status | `identity.tsx` | Medium | **Added:** 1080×1920 and 1080×1080 cards with no birth data or planetary positions |
| 8 | Navigation exposed about 18 areas, including empty social and dating rooms | `AppShell.tsx` | Medium | **Changed:** identity and Bonds first. Feed, messages, dating, matchmaking, experts and weddings sit in a collapsed "Nakshatra Labs" group. All routes still work |
| 9 | Paid reports did not say which content is already free | `shop.tsx`, `reports.ts` | Medium (trust) | **Fixed:** every report page lists "Already free in the app" and "What this adds" |
| 10 | Content updates could never reach existing installs, because the seed inserted only missing keys | `seed.ts` (old) | Medium | **Fixed:** version-aware seeding that preserves admin edits |
| 11 | Feature flags exist in the database but are not enforced anywhere | `flagEnabled` has no callers | Low (no flag is off) | **Open**; recorded in TECHNICAL_RISKS |
| 12 | Interests step required before the result | `auth.tsx` | Low | **Fixed:** "Skip — choose later in Settings" |
| 13 | Daily content pools repeat within about two weeks | `daily.ts` | Medium | **Open**: needs editorial work (RETENTION_STRATEGY) |
| 14 | No Hindi interpretation bodies | content files | Medium | **Open**: needs a translator, not machine output |
| 15 | Diagnosis overstated two issues: email verification and private-Bond consent | Code review this phase | n/a | **Corrected** in `docs/diagnosis` |

## What was audited and not changed
- **Calculation engine:** reference tests still pass (78 engine tests). The archetype uses existing `elementSummary` weights.
- **Authorisation:** the new routes follow existing patterns.
  - `/cosmic-id/me` and `/cosmic-id/shared` require a session.
  - The `/discover/*` routes are public, rate-limited, store nothing personal, and accept only whitelisted event names.
- **Remaining 3D scenes:** not redesigned this phase (see IMPLEMENTATION_PLAN, next steps).
