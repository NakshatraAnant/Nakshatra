# Nakshatra Visual Universe — package v1.0

Original visual system for Nakshatra: brand, 12 environments, 24 archetype packages, 12 game packages, social, circle, reward, premium, onboarding and empty-state artwork, plus design tokens and hi-fi UI references.

**Start here:** `CLAUDE_CODE_IMPLEMENTATION_BRIEF.md` → `design-system/visual-style-guide.md` → `asset-manifest.json`.

## Counts (visual files)
| Area | Files | Contents |
|---|---|---|
| brand | 29 | Primary, light, dark, mono lockups · wordmarks · symbols · app icon · favicon · loading emblem · pattern · 2 grain textures · 27-mansion motif · hero (2 crops) · celebration · social signature · 8 PNG rasters |
| environments | 24 | 12 concepts × landscape 1920×1080 + portrait 1080×1920 |
| archetypes | 168 | 24 × (sigil, sigil-mono, compact, hero landscape, hero portrait, card 5:7, treatment pattern) |
| games | 84 | 12 × (symbol, symbol-mono, card, cover, active, result, celebration) |
| social | 22 | 10 post-type icons + 12 editorial compositions |
| circles | 47 | 12 covers · 12 symbols · 6 patterns · milestones · challenges · circle levels · 4 rituals · 2 recaps · 2 invites |
| rewards | 46 | 10 level badges · 24 achievements + locked · cosmetic unlock/frame · 3 points milestones + glyph · referral · ritual · weekly · 2 celebration effects |
| offers | 35 | 8 card styles × (frame, preview) · pack cover/comparison/promo · premium badge + foil · report cover, page, 6 editorial elements, 4 section openers, preview, promo |
| onboarding / empty-states | 16 | 10 onboarding + 6 empty-state illustrations |
| icons | 25 | UI icons, 24px, currentColor |

## How the assets were made
There was no AI image generator in this environment, so **no AI raster images are included.** Every asset is original procedural SVG, generated from `_src/lib.js` with seeded randomness so it can be reproduced exactly. The PNGs are rasterised from those SVGs. No third-party imagery or fonts are embedded. The fonts (Instrument Serif, Hanken Grotesk, JetBrains Mono) are OFL and loaded separately.

## Not produced / limitations
- AI-generated painterly or photographic imagery. All art is geometric vector.
- 3D models, renders or animations. Only a written spec exists (`design-system/3d-direction.md`).
- Production raster exports (AVIF/WebP) of environments, heroes and identity cards. Generate them at build time (see brief §10).
- Final archetype names and app IDs. The 24 identities are provisional slots `archetype-01…24`.
- Hi-fi screens are browser files at the project root (`*.dc.html`), not Figma files.
- A ZIP archive could not be created directly. The download is delivered as an exported folder.

## Remaining-work list
1. Map the real archetype catalogue onto the slots in `archetypes/archetypes.json`.
2. Rasterise heavy SVGs for production.
3. Optional: build the 3D emblem/reveal from the spec.
4. Optional: gameplay mockups for the 8 games not shown in hi-fi (their artwork is complete).
