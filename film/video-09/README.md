# Video 09 — 24 archetypes. Which one are you?

30 seconds, 1080×1920 (9:16), 30 fps. Output: `out/nakshatra-video-09.mp4`.

The film is rendered from code in this folder. It reads the product's own data and artwork, so it cannot
drift from the app:

| In the film | Comes from |
|---|---|
| The 24 archetype names and their order | `src/shared/personality.ts` (`PERSONA_ARCHETYPES`) |
| Each archetype's shell (form, finish, motion, satellites, particles) | `src/web/three/archetypeWorlds.ts` |
| Each archetype's colour and sigil artwork | `src/web/lib/visual.ts`, `public/visual/archetypes/` |
| The five dimensions and their colours | `DIMENSION_INFO`, `IdentityIntro.tsx` |
| Scene 04 app footage | The running app's `/personality` page, photographed frame by frame |
| Wordmark and symbol | `public/visual/brand/` |
| Interface tones and the closing three notes | `src/web/lib/sound.ts` cue notes |

## Timeline

| Time | Scene | On-screen text | Voiceover (not recorded — see below) |
|---|---|---|---|
| 0–4 | The question: one face, half lit; its reflection keeps changing | DO YOU REALLY? | Think you know yourself? |
| 4–11 | 24 identities: the gallery, then a tracking shot past seven of them | 24 ARCHETYPES. + archetype names | Twenty-four archetypes. Twenty-four different ways of seeing the world. |
| 11–18 | Your blend: five dimension rings, two energies, one sculpture | YOUR ARCHETYPE. YOUR BLEND. YOUR STORY. | But your identity isn't just one label. It's your own unique combination. |
| 18–24 | The discovery: the real assessment and reveal | 20 STATEMENTS. ONE PERSONAL DISCOVERY. | Explore your dimensions. Answer twenty statements. Discover what makes you uniquely you. |
| 24–30 | Call to action | NAKSHATRA / WHICH ARCHETYPE ARE YOU? / DISCOVER YOUR IDENTITY | Nakshatra. Which archetype are you? Discover your identity. |

## Left for post-production

- **Voiceover.** No voice is in the mix. Timings for the recording are in `out/nakshatra-video-09-vo.srt`.
- **URL.** The end card keeps 1470–1620 px (from the top) clear under the button for the website or registration URL.
- **Sonic signature.** The closing C–E–G bells are built from the app's `celebrate` cue. If an official sonic logo
  exists as audio, replace the last 2.1 s of the soundtrack with it.

## Things to know before this is published

- **The 24 characters are an interpretation made for this film.** The product has a sigil, a colour and a 3D shell
  for every archetype, but no character art. Each statue here takes its finish and colour from the product data
  and its silhouette (hair, outfit, pose, one object) from that archetype's traits — see `LOOKS` in `src/figure.ts`.
- **Scene 04 shows an example result.** The answers are in `scripts/capture-app.mjs`; the product scored them as
  The Midnight Philosopher. The film labels it "Example result".
- **Scene 03 names no archetype.** The blend is drawn in brand gold and violet and its shell passes through all
  eight product forms, so it is not read as anyone's result.
- Picture is real-time-style 3D rendered offline in a browser, not Unreal Engine.

## Re-rendering

```bash
npm ci && npm run build
E2E_PORT=4410 npx tsx scripts/e2e-server.ts                 # the app, with a throwaway database
node film/video-09/scripts/capture-app.mjs                  # scene 04 footage -> footage/
python3 film/video-09/scripts/audio.py                      # soundtrack -> out/audio.wav
npx vite --config film/video-09/vite.config.ts              # the film page, http://localhost:5190
node film/video-09/scripts/render.mjs                       # frames -> out/nakshatra-video-09.mp4
```

`node film/video-09/scripts/still.mjs <dir> "" 6.5,15.4 0.5` renders single frames for review.
Open `http://localhost:5190/?debug=lineup&page=0` (and `page=1`) for all 24 statues.
