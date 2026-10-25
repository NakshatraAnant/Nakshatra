# Motion guidelines

| Token | ms | Use |
|---|---|---|
| instant | 120 | Press feedback, toggles |
| fast | 200 | Chips, tabs, hover |
| base | 320 | Sheets, cards entering |
| slow | 600 | Celebration bursts, result reveals |
| reveal | 1400 | Archetype reveal sequence |

Easing: standard `cubic-bezier(.2,.7,.2,1)` · emphasized `cubic-bezier(.16,1,.3,1)` · exit `cubic-bezier(.4,0,1,1)`.

## Principles
1. **Orbit, not bounce.** Things rotate, draw on and settle. No elastic overshoot.
2. **Draw the line.** Sigils and rings reveal through `stroke-dashoffset` (the SVGs are stroke-based, so this works without changes).
3. **One moment per screen.** Only one celebratory animation runs at a time.

## Key sequences
- **Archetype reveal (1400ms)**: env-identity-reveal fades in (0–400) → the sigil strokes draw on, staggered 60ms per layer (200–1000) → the name rises 12px and fades (800–1200) → traits and buttons (1100–1400). Confetti strip plays once.
- **Game result**: result art scales .96→1 + fade (320) → celebration SVG scales .9→1 (600) → numbers count up (600).
- **Achievement unlock**: ring burst rotates 0→12° and scales .6→1 (700, emphasized) behind the medallion, which pops .8→1 (320).
- **Loading**: `nakshatra-loading-emblem.svg` animates itself (SMIL, 1.6s loop).
- **Tab change**: content crossfade with a 8px horizontal translate (200).

## Reduced motion
Under `prefers-reduced-motion: reduce`, remove draw-on, bursts and confetti, show final states directly with a 120ms fade, and swap the loading emblem for the static symbol.
