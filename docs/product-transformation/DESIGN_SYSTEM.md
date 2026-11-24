# Design system (changes this phase)

The base system is documented in `docs/DESIGN_SYSTEM.md` and `src/web/styles/app.css`, and is unchanged: tokens, themes, primitives, and the contrast work audited on 2026-10-24. This phase added the following.

## Components
| Component | File | Purpose |
|---|---|---|
| `CosmicSigil` | `src/web/components/CosmicSigil.tsx` | Signature identity artwork from calculated data. Props: `precise` (planet positions and Lagna; false for share cards), `animate` (reveal choreography), accessible `aria-label` listing the facts |
| `IdentityResult` | `src/web/pages/discover.tsx` | Full Cosmic ID layout: archetype, the three Vedic layers, the Western view, how it was derived. Shared by the preview |
| `ShareCardActions` | `src/web/pages/discover.tsx` | Story (1080×1920) and square (1080×1080) cards. Native share on touch devices, download on desktop |
| `ArchetypePanel` | `src/web/pages/identity.tsx` | Compact archetype summary for signed-in members, above the six detailed layers |
| `renderShareCard` | `src/web/lib/cosmic.ts` | Canvas renderer that rasterises a non-precise sigil plus typography |

## Motion tokens (app.css)
| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 140 ms | feedback (existing) |
| `--dur-base` | 240 ms | state changes (existing) |
| `--dur-slow` | 480 ms | entrances (existing) |
| `--dur-reveal` | 1400 ms | identity reveals only (new) |
| `--stagger` | 45 ms | list stagger (new) |
| `--rise-distance` | 8 px | maximum travel (new) |
| `--ease-orbit`, `--ease-settle` | existing | |

## Reduced motion
- **Where the rules live:** sigil animations sit inside `@media (prefers-reduced-motion: no-preference)` and are also disabled by `html[data-motion='reduced']` (the in-app setting).
- **What reduced motion shows:** the finished artwork immediately, with no delayed fills.
- **The reveal component:** skips to the result under reduced motion.

## Navigation information architecture
| Group | Items |
|---|---|
| You | Today, Cosmic ID, Chart, Calendar, Journey |
| Connect | Bonds |
| More | Learn, Shop |
| Nakshatra Labs (collapsed; opens automatically on a Labs route) | Social, Messages, Dating, Matchmaking, Experts, Weddings |
| Account | Rewards, Settings, Admin (staff) |

- **Mobile bottom bar:** Today, Cosmic ID, Bonds, Chart, More.

## Rendering rules for artefacts
- **Literal colours:** artefact SVGs use literal palette colours, not CSS variables, so they rasterise identically.
- **Fonts:** sign and planet labels use numerals and Latin abbreviations. Symbol glyphs rendered as empty boxes on Windows fonts, and this was found during the browser check.
