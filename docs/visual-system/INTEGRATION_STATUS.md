# Ink & Ember: integration status

This records how the Nakshatra visual package (`Nakshatra visual package.zip`) was wired into the app, what was left out, and why. The package's own docs are in this folder. Its brief is `CLAUDE_CODE_IMPLEMENTATION_BRIEF.md`.

## Where things live

| What | Path |
|---|---|
| Runtime assets (served as static files, copied into `dist/web/visual` at build) | `public/visual/**` (496 SVG/PNG, about 12 MB) |
| Package docs, tokens, manifest, `archetypes.json`, `games.json` | `docs/visual-system/` |
| Procedural generator sources from the package (not used at runtime) | `design/visual-src/` |
| Mapping from real product keys to package assets | `src/web/lib/visual.ts` |
| Rendering components (`Art`, `ResponsiveArt`, `ArchetypeArt`, `MaskIcon`, `PseudonymAvatar`, `LevelBadge`, `PointsGlyph`) | `src/web/components/visual.tsx` |
| Typed registry generated from the manifest; it checks that every file exists. Used only in tests, so it adds nothing to the bundle | `src/web/lib/visual-registry.generated.ts` (regenerate with `npx tsx scripts/gen-visual-registry.ts`) |
| Tests for the mappings | `src/web/lib/visual.test.ts` |

Assets are referenced by root-relative `/visual/...` paths, so they resolve the same way in `vite dev`, the Fastify static server and the e2e server. No external URLs and no runtime generation.

## Assets by category (files on disk)

archetypes 169 · games 85 · circles 47 · rewards 46 · offers 35 · brand 29 · icons 25 · environments 24 · social 22 · onboarding 10 · empty-states 6.

The manifest has 498 entries. Two of them (`design-system/tokens.css` and `color-tokens.json`) are docs; they live in this folder, not in `public/`. Every image entry exists on disk, and the registry generator fails if one goes missing.

## Archetype mapping

The package ships 24 provisional slots (archetype-01 … 24) with placeholder names such as "The Oracle". The product keeps its own 24 archetypes, names and keys. Each archetype is mapped to the slot whose concept is closest in meaning. The package's alt text (which uses the placeholder names) is **not** used. Alt text is built from the real name instead, e.g. "The Midnight Philosopher sigil".

| Real archetype | Slot | Package concept |
|---|---|---|
| Midnight Philosopher | 07 | Oracle |
| Chaos Diplomat | 18 | Jester |
| Unbothered Overthinker | 24 | Cipher |
| Lore Keeper | 05 | Keeper |
| Soft Launch Romantic | 23 | Ember |
| Human Plot Twist | 04 | Spark |
| Professional Disappearing Act | 15 | Dreamer |
| Emotional Archivist | 17 | Sage |
| Delulu Strategist | 14 | Strategist |
| Accidental Therapist | 13 | Hearth |
| Quiet Instigator | 12 | Alchemist |
| Social Battery Economist | 08 | Architect |
| Group Chat Mayor | 20 | Weaver |
| Spreadsheet Optimist | 02 | Cartographer |
| Main Character Trainee | 01 | Lantern |
| Calm in the Chaos | 21 | Pioneer |
| Side Quest Collector | 06 | Wanderer |
| Kind Truth Teller | 22 | Mirror |
| Cosy Contrarian | 10 | Rebel |
| Loyal Night Owl | 03 | Tidecaller |
| Hype Engineer | 16 | Catalyst |
| Gentle Detective | 19 | Sentinel |
| Plan B Poet | 09 | Muse |
| Steady Signal | 11 | Anchor |

The 12 games map one to one by name. The engine key `who_said_it` becomes the package folder `who-said-it`, and so on.

## Screens using the package

- **Brand:** favicon, apple-touch icon, theme colour, Open Graph image, logo in the nav. Fonts are Instrument Serif, Hanken Grotesk and JetBrains Mono.
- **Landing:** responsive hero environment (landscape at 768px and up, portrait below) behind scrims, a sample identity card, all 24 sigils, pillar cards, a game card grid, and a closing motif.
- **Identity Studio:** assessment over the sigil field; reveal sequence (environment → sigil → name → details, 1400 ms; reduced motion shows the final state); a 5:7 identity card with live text; share images (card / story / square) rendered on canvas with the package art plus live text; card-style frames; and the public identity page.
- **Home:** archetype compact sigil, level badge and points glyph, ritual illustrations.
- **Thought Network:** header art; post-type icons; pseudonymous posts show the dashed ring with the eye-off icon, and never archetype art, accent or level.
- **Circles:** covers chosen by theme, symbols hashed from the circle id, a weekly recap cover, join-page cover, empty state.
- **Play:** card art for all 12 games in the library, cover in the dialog and lobby, active-round backdrop, result and celebration art.
- **Rewards / Journey:** level badges 1–10, medallions for every achievement key (locked ones use `grayscale(1)` and opacity .35), ring burst for achievements earned in the last minute, frame thumbnails in the collection.
- **Offers:** the Card Style Pack (₹29) shows its cover and style previews; the Expanded Identity Report (₹99) shows its cover and section art. Prices, titles and contents stay live text from the server. Ownership is shown only when the server returns `owned`.
- **Onboarding and invites:** illustrations on the two onboarding choice cards and the invite page; referral art appears only after a referral has been approved.
- **Empty states:** package illustrations for circles, feed, no results, notifications and unavailable.
- **Loading:** the route fallback shows the brand loading emblem, which rotates only when motion is allowed.

## Not used, missing or deferred

- The hi-fi reference screens (`*.dc.html`) that the brief mentions are **not in the zip**. Layouts follow the written component specs and the brief.
- **No 3D assets** were produced by the package, so nothing 3D was added.
- **No WebP/AVIF.** Rasterising would need a native dependency (sharp or resvg), and that needs permission to install. The SVG masters are served as they are and lazy-loaded below the fold.
- Every SVG embeds **C2PA provenance metadata**. It is left intact.
- Some package assets have no product surface yet: circle challenge/level/milestone art, several social headers (poll, dilemma, weekly best and others), report element ornaments, and mono/ink logo variants. They are in `public/visual` for later use.
- On the Expanded Identity Report, the product category badge still says "Astrology reports". That comes from existing catalogue data, not from this integration.
