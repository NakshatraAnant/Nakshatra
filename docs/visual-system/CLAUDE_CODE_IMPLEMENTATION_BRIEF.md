# CLAUDE_CODE_IMPLEMENTATION_BRIEF

You are implementing the Nakshatra visual system ("Ink & Ember") in the existing app. This package contains finished SVG/PNG assets, design tokens, and hi-fi reference screens. Read this file fully, then `design-system/*.md`.

## 0. What is in the package
| Path | Contents |
|---|---|
| `design-system/color-tokens.json`, `tokens.css` | Every colour, font, size, radius, shadow, motion and layout token. Import `tokens.css` globally, or map the JSON into Tailwind/theme config. |
| `asset-manifest.json` | 498 entries: id, file, format, type, use, screens, related, size, transparency, decorative, crop, alt, licence. |
| `archetypes/archetypes.json` | 24 provisional identities: hue, accents, treatment, concept, file map. `appArchetypeId` / `appArchetypeName` are **null**. Fill them in. |
| `games/games.json` | 12 games: key, name, accent, concept, files. |
| `brand/`, `environments/`, `archetypes/`, `games/`, `social/`, `circles/`, `rewards/`, `offers/`, `onboarding/`, `empty-states/`, `icons/` | Assets |
| `ui-designs/icons-tinted/` | Pre-tinted icon copies used by the mockups (bone/mute/ink/ember). In product code prefer the `currentColor` masters in `icons/` and `social/`. |
| `_src/lib.js` | Procedural generator used to create every SVG. Regenerate or extend artwork with it rather than hand-editing paths. |
| Project root `*.dc.html` | Hi-fi reference screens (open in a browser): Mobile Identity & Social (01–08), Mobile Play Rewards System (09–19), Desktop (D1–D4), Asset Library. |

## 1. Visual direction (non-negotiables)
1. Dark ink canvas (`--ink-950`), bone text, **one** ember CTA per view. No purple gradients, no glassmorphism except the tab-bar blur, no neon glows on UI.
2. Display type is Instrument Serif (≥24px only). UI type is Hanken Grotesk. Labels are JetBrains Mono uppercase +0.12em.
3. Archetype accents colour only that archetype's own surfaces. Global UI stays bone/mute/ember.
4. Text is never baked into images. All names, numbers, prices, dates and copy are live HTML.
5. Earned rewards use round medallions and polygon badges. Purchases use chamfered squares and foil. Never mix them.
6. Points are fictional and non-redeemable. Never show currency, odds or cash-out language, especially in Prediction Market.
7. Pseudonymous posts must not render any archetype art, accent colour or level. Use the dashed ring + eye-off avatar.

## 2. Naming conventions
- Archetype: `archetypes/archetype-NN/archetype-NN-{sigil|sigil-mono|compact|hero-landscape|hero-portrait|card|treatment-pattern}.svg`
- Game: `games/{key}/game-{key}-{symbol|symbol-mono|card|cover|active|result|celebration}.svg` (manifest ids are `game-{key}-{part}`)
- Environment: `environments/env-{name}-{landscape|portrait}.svg`
- Icons: `icons/icon-{name}.svg` (UI) and `social/icon-post-{type}.svg` (post types). 24px grid, 1.75 stroke, `currentColor`.
- Manifest ids are stable. Reference assets by id in code, e.g. a typed `assets.ts` generated from the manifest.

## 3. Archetype mapping
Create `archetypeVisuals.ts` keyed by **your real archetype id**:
```ts
// fill from archetypes/archetypes.json after deciding the mapping with the product owner
export const archetypeVisual = { [realId]: { slot: 'archetype-14', accent: '#82baff', accentOnLight: '#2e69b2', treatment: 'engraved' } }
```
The provisional names ("The Strategist", etc.) are placeholders. Show the app's real names. Artwork contains no names, so renaming needs no regeneration. Pick slots by meaning using each entry's `concept` and `mood`.

## 4. Screen → asset map
| Screen | Assets |
|---|---|
| Landing | brand hero-background (landscape/portrait), logo-primary, 24 × sigil, archetype-07 card, social-confession-header, circle-cover-old-friends, game-archetype-showdown-card, brand motif-27 |
| Assessment | env-sigil-field (portrait/landscape) |
| Reveal | env-identity-reveal, archetype sigil + hero, rewards/celebration-confetti |
| Identity Studio | archetype card, offers/card-styles/*-frame, premium-badge |
| Home | circles/ritual-*, circle-cover-*, game cards, points-glyph, compact avatar |
| Thought Network / Composer | social/icon-post-*, icons, social-* headers (featured/prompt/collections only) |
| Circle / Invite | circle-cover-*, circle-symbol-NN, ritual-check-in, circle-challenge-*, circle-invite-card, circle-invite-og |
| Play hub / games | game card, cover, symbol. Gameplay uses `active`. Results use `result` + `celebration` |
| Rituals | circles/ritual-*, rewards/ritual-complete, rewards/weekly-participation |
| Levels & rewards | rewards/level-NN, achievement-*, achievement-locked, points-milestone-*, celebration-ring-burst |
| Premium | offers/card-pack-*, offers/report/* |
| Profile & privacy | archetype hero-landscape (cropped header), compact |
| Loading | brand/nakshatra-loading-emblem, env-minimal-starfield |
| Empty / onboarding | empty-states/*, onboarding/* |
| Share / OG | brand/png/nakshatra-social-signature-1200x630.png, circle-invite-og, archetype card (rasterise server-side) |

## 5. Rendering text over art
- Use the manifest `crop` and `use` fields for safe zones. Apply `gradient.scrimLeft` / `scrimBottom` whenever text overlaps artwork.
- Identity card: compose in HTML/SVG at 750×1050 (sigil ~350px at centre-top, name y 620–730, traits y 770–960). For sharing, render to PNG server-side (resvg/Satori/Playwright).
- Report: decorative assets only. Real report text is HTML on `report-page-paper.svg`, with the `report-element-*` ornaments as dividers and frames. The trait chart frame takes a live data polygon drawn on top.

## 6. Decorative vs meaningful
- `decorative: true` → `alt=""` + `aria-hidden="true"`. This covers environments, covers, patterns, textures and celebrations.
- `decorative: false` → use the manifest `alt`. This covers logos, symbols, medallions, badges, icons that stand alone, and the premium mark.

## 7. Responsive cropping
Assets with `crop` values need `object-fit: cover` and the given `object-position`. Use `<picture>` to switch landscape/portrait masters at 768px. Tiles (`crop: "tile"`) are seamless `background-repeat` patterns. See responsive-guidelines.md.

## 8. Alternatives & fallbacks
- Brand: logo-light-bg / wordmark-ink / symbol-ink for paper. Mono versions (`currentColor`) for one-colour contexts. PNG app icons 1024/512/192/180 and favicons 32/16 in `brand/png/`.
- Archetypes: `sigil-mono` for print/paper. `compact` for anything under 96px.
- Games: `symbol-mono` for nav and light surfaces.
- Card styles: `*-frame` (production) vs `*-preview` (marketing only, shows sample archetype-14).
- Locked achievements: CSS grayscale + opacity, or `achievement-locked.svg`.
- Reduced motion: static `nakshatra-symbol.svg` in place of the loading emblem.

## 9. Animation & 3D
- Animated: `brand/nakshatra-loading-emblem.svg` (SMIL). Everything else is static and animated with CSS/JS as described in motion-guidelines.md. Sigils are stroke-based, so `stroke-dasharray` draw-on works directly.
- 3D: **none produced.** `design-system/3d-direction.md` is a specification only.

## 10. Performance
- SVGs with grain filters and large blurs (environments, heroes) are heavier to paint. For production, rasterise full-bleed environments and heroes to AVIF/WebP at 1×/2× (e.g. `sharp` or `resvg`) and keep the SVG as the master. Keep icons, symbols, sigils, medallions and badges as inline/sprite SVG.
- Lazy-load everything below the fold. Preload only the landing hero.

## 11. Constraints to preserve
- No fake text inside images. Do not add any.
- Do not invent prices, testimonials or stats. The only prices are ₹29 (Card Style Pack) and ₹99 (Expanded Identity Report).
- Never imply a purchase or unlock just because an asset is displayed. Gate it on real entitlement state.
- Astrology is optional. Never show astrology-only UI by default.
- Keep contrast ≥4.5:1 for body text (bone and mute on ink both pass). Accents are not body-text colours.
