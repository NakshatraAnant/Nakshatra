# Responsive guidelines

## Breakpoints
| Name | Min width | Layout |
|---|---|---|
| sm | 0 (designed at 390) | Single column, bottom tab bar, gutters 16–24 |
| md | 768 | Single column max 640 centred, tab bar becomes a top bar |
| lg | 1024 | Rail (248) + content. Right column hidden |
| xl | 1440 | Rail 248 + content (fluid, max 720 for feeds) + right column 380 |

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96, 128. Section rhythm on the landing page is 120px desktop and 72px mobile.

## Artwork cropping
- Every full-bleed asset uses `object-fit: cover` plus the `crop` value from the manifest. Landscape and portrait masters exist for all 12 environments, archetype heroes and the brand hero.
- Use landscape masters at ≥768px and portrait masters below (`<picture>` with `media`).
- Text safe zones: landscape heroes have the left 50% clear, game covers the left 50%, circle covers the left 50%, offers the left 55%. Portrait heroes are clear below 66% height.
- Circle covers (3:1) crop to 2:1 on mobile with object-position 72–75% 50%.
- Fixed-ratio assets are never cropped: identity cards (5:7), card styles, medallions, symbols, report pages.

## Minimums
- Hit targets 44×44. Primary buttons 54 tall on mobile.
- Archetype compact symbol min 24px. Sigil min 96px (below that use compact). Game symbol min 20px.
- Mobile body text ≥15px, labels ≥10px mono.

## Density
Feeds stay text-first at every size. Imagery scales up on desktop only for heroes, featured covers and game grids (2 columns on mobile → 4–6 on desktop).
