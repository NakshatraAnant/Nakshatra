# Design direction

## Personality
- Scholarly, warm, precise. Like a beautifully set almanac, not a neon horoscope app.
- Confident enough to show its working.

## Emotional tone
Recognition first ("that is me"), then curiosity ("why?"), then generosity ("send this to her"). Never fear, urgency or fate.

## Visual references, in spirit only
- Jantar Mantar instruments: precision as beauty.
- Pichwai and Mughal manuscript borders: dense ornament reserved for the frame.
- Swiss editorial typography: hierarchy from type, not effects.
- Star-chart engravings: hairlines, rings, numbered divisions.

## Principles
1. **Every mark means something.** The sigil draws only calculated facts:
   - the 27 nakshatras, with the Janma Nakshatra lit
   - the 12 sidereal signs, numbered as in North Indian charts, with the Rashi shaded
   - planets at their real longitudes, with the Lagna on the left
   - a core motif encoding the archetype's element (shape) and modality (structure)
2. **The artefact is the hero.** No decorative planets or particle fields.
3. **Type carries hierarchy.** Cormorant Garamond for display and Figtree for reading (both existing).
4. **Ornament lives at the edge.** Rings and borders frame the content, never sit behind text.
5. **Show the method.** Every identity statement has a "How this was derived" path.

## Colour
- **Base tokens:** unchanged (ink, ivory, gold accent). See DESIGN_SYSTEM.md.
- **Archetype palettes:** each archetype has `ink` (ground), `glow` (light) and `accent` (mark), grouped by element:
  - Fire: saffron and vermilion
  - Earth: ochre, olive and obsidian
  - Air: pale cyan, silver and lilac
  - Water: indigo, crimson and teal
- **Where palettes apply:** only inside the archetype's own artefacts (sigil, share card). The interface chrome stays consistent across users.

## Motion
- Motion explains, and it settles rather than loops.
- **Identity reveal:** about three seconds, always skippable, and skipped entirely under reduced motion.
  1. The sigil's rings draw.
  2. Nakshatra ticks light in sequence.
  3. The core settles.
  4. Three facts appear in order: Rashi → Nakshatra → archetype.
- **Elsewhere:** 140–480 ms transitions with the existing easing tokens.
- **Never:** scroll-jacking, endless loops or forced waits.

## Sound
None. It is not appropriate for a reflective product used in public places.

## Accessibility
- Every sigil has a text alternative listing its facts.
- Information is never carried by colour alone: the lit nakshatra is also thicker, and the Rashi is labelled in text.
- All reveal content is also rendered as plain text below.

## Nakshatra must never look like
- a slot machine (spinning wheels, countdowns)
- a fear poster (red warnings, "dosha alert")
- a generic space wallpaper
- an AI-gradient blob

## Asset production
- **Tooling:** no image-generation tool was available in this environment, so no AI imagery was produced or claimed.
- **What was used instead:** the signature visual is procedural SVG generated from each user's chart. It is original, licence-free, resolution-independent, and meaningful per user.
- **Future option:** if commissioned or generated art is added later (for example archetype editorial illustrations), it must follow the palettes above and never replace the calculated sigil.
