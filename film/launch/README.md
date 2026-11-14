# Nakshatra — “The Universe Is Open” (launch film)

30 seconds · 9:16 · 1080×1920 · 30 fps · H.264 + AAC.

| File | What it is |
|---|---|
| `out/nakshatra-launch-30s.mp4` | The master: picture and score. |
| `out/nakshatra-launch-score.wav` | The score on its own (48 kHz, 24-bit), for a remix with voice-over. |
| `out/nakshatra-launch-30s.vo.srt` | The voice-over script, timed to picture. Also usable as captions. |
| `launch.config.json` | The end frame's website address and call to action. **Nothing is shown until these are confirmed.** |

## What is real in it

- **Scenes 3 and 4 are the product.** Every product pixel is a recording of the running application: its own 3D
  scenes (reveal theatre, avatar figure, tournament arena, people constellation, season path), its seven screens
  (Home, Identity Studio, archetype result, Discover, Circles, Thought Drops, Play), a Thought Drop card and the
  avatars it draws. Nothing was mocked up or redrawn. The film only places, lights and cuts that footage.
- **The people are sample content.** The eight members, their posts, circles and trivia runs were created for the
  shoot through the product's own API on a throwaway local database (`scripts/fixtures.mjs`). They are not real
  members, and nothing was sent anywhere but the local app. Archetypes, scores, reactions, levels and standings are
  whatever the product computed for them.
- **The logo, wordmark and symbol** are the official files in `public/visual/brand`, loaded unchanged. Type is the
  brand's three families (Instrument Serif, Hanken Grotesk, JetBrains Mono; SIL OFL, in `assets/fonts`).
- **The portal, the universe and the launch constellation are original to the film**, drawn in real time with
  three.js from the product's own visual language: the single light, particle ring and gateway of the in-app
  introduction, and the 27-mansion ring of the brand motif. Colours are the design tokens.

## What it is not

- **Not an offline CGI render.** It is real-time stylised 3D with bloom and grading, not Unreal-quality path-traced
  imagery, and the characters are the product's own procedural avatar figure — the only character asset there is.
- **No recorded voice-over.** The lines are on screen as captions for scene 3 and timed in the `.srt`; the mix
  leaves room for a voice. Set `"captions": false` once a voice-over is laid in, if you want the frame cleaner.
- **The score is synthesised** (`scripts/score.mjs`), not an orchestral recording. There was no existing sonic
  signature file; the closing figure is built from the app's own “celebrate” cue (C–E–G, `src/web/lib/sound.ts`).

## Before it is published

`launch.config.json` decides the last three seconds:

```json
{ "url": "your-domain.example", "registration": "open", "captions": true }
```

`registration` is `"open"` (shows **JOIN NOW**) or `"waitlist"` (shows **JOIN THE WAITLIST**). While either value
is `null`, that line is left off rather than guessed. The line “NAKSHATRA IS LIVE.” should only ship once the site
is publicly reachable.

## Rebuilding it

Everything is reproducible from the repository; nothing needs a GPU.

```bash
npm ci && npm run build
film/launch/scripts/local-app.sh --fresh        # a throwaway local app on :4500 (leave running)
node film/launch/scripts/fixtures.mjs           # sample cast and content, through the real API
node film/launch/scripts/capture.mjs            # the shoot: plates, screens, stills → film/launch/.shoot
node film/launch/scripts/score.mjs              # the score
node film/launch/scripts/render.mjs frames      # 900 frames (about 40 minutes on 4 cores)
node film/launch/scripts/render.mjs encode      # → out/nakshatra-launch-30s.mp4
```

To change only the end frame after editing `launch.config.json`:

```bash
node film/launch/scripts/render.mjs frames 26.6 30
node film/launch/scripts/render.mjs encode
```

`render.mjs stills 4.4 12 25.6` writes half-size preview stills at those seconds. The scripts refuse to run against
anything but `localhost`.

## Timeline

| Time | Scene | On screen |
|---|---|---|
| 0–4 s | The gate, closed; particles in orbit; a heartbeat | IT’S TIME. |
| 4–9 s | It opens; the flight through; the universe | THE WAIT IS OVER. |
| 9–17 s | Identity · expression · belonging · play · connection · evolution (product footage) | the six lines |
| 17–23 s | Seven product screens | screen names |
| 23–27 s | The 27-star constellation lights; particles converge; the wordmark | NAKSHATRA IS LIVE. |
| 27–30 s | End frame | DISCOVER YOUR KIND OF PERSON. · ENTER YOUR UNIVERSE. · call to action · address |

Cuts from 9 s on sit on a 120 bpm grid, so picture and score stay locked.
