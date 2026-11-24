# Product as built

_Inspected 2026-10-25 from the working tree, which is uncommitted on `master`. No files outside `docs/diagnosis/` were changed._

## Verification run today
| Check | Result | Label |
|---|---|---|
| `npm run typecheck` | pass | [Verified] |
| `npm run lint` | pass | [Verified] |
| `npx vitest run` | 6 files, 118/118 passed | [Verified] |
| Playwright e2e | 20/20 recorded on 2026-10-24 in `docs/RELEASE_READINESS_REPORT.md`; **not re-run in this phase** | [Founder] (prior session) |
| Local app | Healthy at http://localhost:3000 (`npm run local`) | [Verified] |
| Database | Embedded PGlite: 3 migrations, 129 tables, 10 users (all seed or test) | [Verified] |

## Size by area (lines)
| Area | Lines |
|---|---|
| `src/astro` | 3,348 |
| `src/content` | 619 |
| `src/server/modules` | 5,882 |
| `src/server/lib` | 1,080 |
| `src/server/services` | 575 |
| `src/server/db` | 2,045 |
| `src/web/pages` | 5,834 |
| `src/web/components` | 1,083 |
| `src/web/three` | 724 |
| `src/web/charts` | 259 |
| `tests` | 983 |
| `e2e` | 951 |

## Server modules
| Module | Lines | Routes |
|---|---|---|
| account | 287 | 20 |
| admin | 657 | 54 |
| astro | 493 | 33 |
| auth | 290 | 17 |
| bonds | 415 | 18 |
| commerce | 487 | 27 |
| dating | 276 | 12 |
| experts | 462 | 25 |
| journey | 124 | 3 |
| learning | 379 | 21 |
| matchmaking | 328 | 19 |
| messaging | 194 | 9 |
| profile | 268 | 14 |
| social | 597 | 37 |
| weddings | 538 | 34 |
| **Total** | | **343** |

## Pages (lines)
| Page | Lines |
|---|---|
| admin | 376 |
| auth | 263 |
| bonds | 392 |
| calendar | 176 |
| chart | 373 |
| dating | 201 |
| experts | 380 |
| identity | 365 |
| journey | 275 |
| landing | 86 |
| learn | 298 |
| matchmaking | 324 |
| messages | 139 |
| misc | 285 |
| settings | 342 |
| shop | 471 |
| social | 414 |
| today | 248 |
| weddings | 426 |

## Content inventory
Counts measured from `src/content/*.ts` **[Verified]**:
- **Interpretation rules:**
  - 276 rules, 264 unique bodies, about 6,545 unique words
  - 0 Hindi bodies
  - 144 house rules come from one template
  - Sun/Vedic Sun, Moon/Rashi and Ascendant/Lagna share body text
- **Rules by group:**

  | Group | Rules |
  |---|---|
  | sun_sign | 12 |
  | moon_sign | 12 |
  | ascendant | 12 |
  | rashi | 12 |
  | lagna | 12 |
  | vedic_sun | 12 |
  | janma_nakshatra | 27 |
  | house_* | 144 |
  | retro_* | 5 |
  | yoga_* | 18 |
  | manglik | 1 |
  | current_dasha | 9 |

- **Daily content pools:**

  | Pool | Entries |
  |---|---|
  | Moon-transit notes | 12 |
  | Tithi notes | 16 |
  | Moon-phase notes | 8 |
  | Dasha themes | 9 |
  | Reflection prompts | 30 |
  | Rituals | 14 |
  | Lessons | 12 |
  | Weekday colours | 7 |

- **Archetypes:** the dossier names an archetype hook ("Velvet Void", "Moon Static" and others). None of these names exist in `src/` or in `nakshatra_mvp.html`.

## Commercial wiring
Prices are placeholders seeded in `src/server/db/seed.ts` **[Observed]**:

| Product | Price |
|---|---|
| Nakshatra+ | ₹199/month, ₹1,999/year |
| Vedic report | ₹299 |
| Year Ahead | ₹399 |
| Western report | ₹249 |
| Expert commission | 20% |

- **[Observed]** Reports are generated in `src/server/services/reports.ts`. The Vedic report calls the same `interpret()` used by the free pages, then adds yoga, Manglik, D9/D10, ashtakavarga and dasha tables. Year Ahead uses the 9 `DASHA_THEMES` strings and one repeated retrograde sentence.
- **[Verified]** Razorpay and SMTP are tested against local fakes only. No merchant account exists, and no email provider is configured.
- **[Observed]** The analytics taxonomy has about 30 events in `src/server/lib/context.ts`, emitted from 36 call sites. There is no funnel or cohort view.

## Strengths worth keeping
- An MIT-licensed astronomy-engine base. This removes the AGPL ephemeris concern.
- A well-tested calculation engine with reference tests.
- A consent model in `bonds.ts`: share scopes, revocation, and the public `/shared-report/link/:token` route.
- Privacy controls: private by default, export, deletion, de-identified retention.
- Accessibility and mobile work: axe-clean, no mobile overflow (both [Founder]).
- Honest labelling: sample data is badged, the dev payment simulator is refused in production, and there is no AI.

## Not production-ready
These need the owner:
- live Razorpay
- an SMTP provider
- a PostgreSQL server or Docker (WSL 2 missing)
- legal review and a grievance officer
- a penetration test
- trademark clearance
