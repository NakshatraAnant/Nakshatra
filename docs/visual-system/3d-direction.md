# 3D direction (design reference only)

**Status: no 3D models, renders or animations were produced in this package.** Everything below is a specification for a developer-built interactive scene (three.js / react-three-fiber). Every geometry described here already exists as 2D SVG in the package, so the scene can be derived from those files.

## 1. Nakshatra emblem (hero, loading, splash)
- Torus ring, major radius 1, tube 0.06, with a 34° gap at −45° (from `nakshatra-symbol.svg`). Material: bone, roughness .45, metalness .1.
- Sparkle: extrude the four-point path from `N.sparkleD` (depth .08, bevel .01). Emissive bone @0.15.
- Ember sphere r 0.065 in the gap. Emissive `#F38C48` intensity 1.2 plus a small point light.
- Idle: the sphere orbits the ring every 9s and the sparkle tilts slowly ±6° with the pointer.

## 2. Archetype reveal
- Each sigil layer becomes a thin tube (0.012) or flat extruded shape on its own z-plane, spaced 0.04 apart. Layers fly in from z = −2, then the camera dollies from z 4→2.6 over 1.4s (matches motion-guidelines).
- Background: `env-identity-reveal` as an equirect-free backdrop plane. Lighting: one key light in the archetype accent, one cool rim light (#3c448d).

## 3. Premium report
- Book or slab with a 1240:1754 ratio. Cover texture is `report-cover.svg` rasterised at 2×. Ember foil edge uses the `gradient.foil` stops as an anisotropic metal.

## 4. Achievement moment
- Medallion as a coin-like cylinder (r 1, h 0.08) with an embossed glyph from the achievement SVG. Spin 1.25 turns, ease-out, then a ring-burst sprite plane behind it.

Fallback: if WebGL is unavailable, use the 2D SVG sequence described in motion-guidelines.md.
