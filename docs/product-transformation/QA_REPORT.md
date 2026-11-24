# QA report

_2026-10-25. Every result below comes from a command run on this date after the final code changes._

## Automated
| Check | Result |
|---|---|
| `npm run typecheck` (web + server) | pass |
| `npm run lint` (src, tests, e2e, scripts) | pass, 0 findings |
| `npx vitest run` | **127/127 passed**, 8 files (was 118 in 6 files). New tests: `src/astro/archetype.test.ts` (5), `tests/integration/discover.test.ts` (4) |
| `npm run test:e2e` (build + Playwright, Edge) | **22/22 passed, 0 flaky, 6.9 min** (was 20). New spec: `e2e/j-discover.spec.ts` (2 tests). Log: `.data/transform-e2e.log` |
| `npm run build` | pass |

## What the new tests assert
- **Archetypes:**
  - all 12 element × modality combinations are covered, with unique names
  - derivation is deterministic
  - weighted dominance decides the archetype
  - ties are broken by the Moon sign, not by list order
  - the Ascendant is excluded when the birth time is unknown
- **Content:** none of the 36 Vedic Rashi/Lagna/Surya bodies equals a Western body, and all are unique and version 2.
- **Account-free preview:**
  - returns distinct Vedic and Western text
  - stores no birth profile
  - writes one anonymous event, with no birth data in its properties
  - refuses under-18 dates and missing consent
  - handles unknown birth time (Lagna null)
- **Consistency:** the signed-in `/cosmic-id/me` returns the same archetype as the preview for the same data. Anonymous access is refused (401).
- **Event whitelist:** a non-whitelisted event name is rejected (400).
- **Browser journey:**
  1. The landing page shows the labelled sample and its sigil.
  2. The `/discover` form returns a result with the reduced-motion reveal skipped.
  3. The story card renders at 1080×1920. The download is intercepted, so nothing is written to disk.
  4. Save → signup page with the matching title → onboarding prefilled with the same date and time → consent asked again → interests skipped → Cosmic ID shows the same archetype as the preview.
- **Phone width:** `/` and `/discover` have no horizontal overflow at 360 px.
- **Regression:** all earlier journeys (A–I, smoke, accessibility in light and dark, resilience, mobile) still pass with the new navigation and landing.

## Manual verification (in-app browser, http://localhost:3000)
- Cosmic ID page shows the archetype panel and sigil for an existing test account (Crimson Tide).
- Landing renders the sample sigil and text.
- Discover → reveal (Rashi → Nakshatra → archetype lines) → result (Moon Static for the test data).
- **Story card checked visually:** shows the sigil without planet labels (asserted: no Su/Mo/Ma labels in the exported SVG), plus the name and essence.
- **Defects found by this check and fixed:**
  - zodiac and planet symbol glyphs rendered as empty boxes on Windows fonts → numerals and abbreviations
  - overlapping planet labels on conjunctions → lane layout
  - square corners on the reveal → rounded mask
  - native share sheet on desktop never resolved in headless Edge → native share on touch devices only

## Performance (measured)
| | Before | After |
|---|---|---|
| React build | development (`react.development.js`) | production |
| JS preloaded on every page | react + three + r3f (≈152 + 182 + 120 kB gzip) | react only (≈94 kB gzip) + entry 26.6 kB |
| 3D on landing | WebGL scene | none (SVG sigil) |
| `/discover` route chunks | — | about 1 s after HTML in the in-app browser, including the API call |

## Not verified
- Real phones and low-end devices (only emulated widths and the Pixel 7 profile).
- Screen-reader walkthrough of the new reveal. It uses `aria-live`, and all facts are also present as text.
- The `cosmic_id_shared` event from the signed-in share button was not asserted by a test.
- Hindi rendering of the new content (none exists yet).
