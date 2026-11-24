# Nakshatra — Visual Style Guide ("Ink & Ember")

## Signature
Nakshatra looks like a night observatory run by editors. Deep ink surfaces, bone-coloured type, one warm ember accent, and fine engraved geometry drawn like astronomical instruments. Personality shows up through each archetype's own sigil and accent hue. Purple gradients, glassmorphism and neon are avoided.

The brand motif is **the 27 mansions**: a ring of 27 ticks (the traditional count of nakshatras) with a {27/10} star polygon and one ember point in the ring. It appears on the hero, reveal, report and share images. Astrology is suggested, never required.

## Palette
| Token | Hex | Role |
|---|---|---|
| ink-950 | #0A0C12 | App canvas |
| ink-900 | #0F121A | Cards, sheets |
| ink-800 | #161A25 | Raised controls, inputs |
| ink-700 | #212635 | Hover, overlays |
| line | #2F3546 | Hard dividers; default borders use rgba(242,236,225,.08) |
| bone | #F2ECE1 | Primary text and line art |
| mute | #9A958B | Secondary text (6.9:1 on ink-950) |
| paper | #F6F1E8 | Light theme / report pages |
| ink-text | #14161D | Text on paper |
| ember | #F38C48 | The one accent: primary CTA, focus, live states, points |
| ember-deep | #B95115 | Ember on paper |

Archetype and game accents all share the same lightness and chroma, `oklch(0.78 0.12 h)` on dark and `oklch(0.52 0.13 h)` on light, with 24 hues spaced 15° apart. Exact hex values are in `color-tokens.json` and `tokens.css`.

**Rules**
- Ember is reserved for primary actions and live or earned moments. Use one ember CTA per view.
- An archetype accent colours only that archetype's own surfaces: its sigil, card, profile header and the trait chips on its reveal. It never colours global UI.
- Body text is always bone or mute on ink, or ink-text on paper. Accents are never used for paragraphs.

## Geometry & illustration
- Construction uses circles, regular polygons, star polygons, rays, arcs and a four-point concave "sparkle". Shapes are built mathematically. Nothing is hand-drawn.
- Strokes are mostly 1–2.4px at display size. Filled shapes are used sparingly, as one solid element per composition.
- Each composition has one focal structure and plenty of negative space. Text zones are documented per asset in the manifest (`use`, `crop`).
- Each archetype gets one of six **treatments**: halo, engraved, duotone, filled, dotted, eclipse. The treatment changes the hero/card background and how the sigil is rendered, so the 24 archetypes are not just tint swaps of each other.
- Games have their own symbols plus a "field" composition that acts out the game's mechanic (split reveal, scattered shards, balance, timeline…).

## Texture & light
- Fine grain (feTurbulence, 7–12% alpha) on full-bleed artwork. UI surfaces stay flat.
- Light comes from soft radial glows in indigo, ember or the archetype accent. Never more than two glows per image.
- Metallic and foil surfaces are limited to premium card styles.

## Artwork × interface
- Text is never baked into artwork. Names, numbers, prices and dates are always live HTML.
- Over artwork, place text on a scrim (`gradient.scrimLeft` / `scrimBottom`) or inside the documented negative space.
- Ordinary Thought Drops get no imagery. Only type icons (16px) and avatars. Editorial banners are reserved for featured, prompt and collection headers.
- Pseudonymous posts show a dashed ring with the eye-off icon. They never show a sigil, accent colour or anything else that could identify the author.

## Earned vs purchased
- **Earned** (achievements, levels, milestones): round medallions or regular polygons with a 27-tick rim.
- **Purchased / premium**: chamfered-corner squares and the foil gradient (`offers/premium-badge.svg`, `rewards/cosmetic-*`).
- Points use the sparkle glyph and never a coin or currency symbol. Points are fictional and non-redeemable.
