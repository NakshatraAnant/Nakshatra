# Nakshatra transformation: implementation tracker

Tracks the "Master Product Transformation" directive section by section against the real codebase. Update this file whenever something moves; resume from it rather than from memory.

Status words: **Verified** (completed and covered by a passing test or measured), **Unverified** (implemented, not fully tested), **Partial**, **Blocked**, **Not started**.

Last updated: 2026-11-13. Branch `product-evolution`.

## Baseline (what the audit found)

- **Stack:** Fastify 5 API, Drizzle ORM on PostgreSQL (PGlite locally), React 19 + React Router 7 + TanStack Query, Tailwind 4, Vite 7, three.js 0.180 with React Three Fiber 9. Vitest and Playwright (Edge).
- **Auth:** one session-cookie system with CSRF, email verification and optional MFA. No second auth system added.
- **Data:** 28 migrations. No new tables or migrations were needed for this directive; everything below reads existing data.
- **Already in place before this directive:** six-destination navigation, 20-statement assessment with saved progress, archetype scoring and blends, Thought Drops (text, poll, photo, voice), Circles with tiers/events/market, twelve games, tournaments, quests, seasons, achievements, Year in Review, journal, discovery (opt-in), profiles, follows, reactions, comments, messaging, notifications, moderation and reporting, analytics funnel, privacy controls, data export and deletion.
- **Recovery point:** every batch is its own commit; the branch is on GitHub.

## Section status

| § | Area | Status | Evidence / notes |
| --- | --- | --- | --- |
| 5 | First-time cinematic experience | Verified | `components/CinematicIntro.tsx`, `three/intro.tsx`, `lib/intro.ts`. Seven scenes, 15 s, Skip, Sign in, "Enter Your Universe". Once per device for signed-out visitors; replay from the landing page and Theme studio. No sound. Reduced motion: never auto-plays. No WebGL: still frame. Tests: `z12-cinematic-intro`, `lib/intro.test.ts`. |
| 6 | Account creation, progressive onboarding | Verified (pre-existing) | Existing signup: display name, email, password, age and terms confirmation. Handle is generated and editable later. No location, ID or contacts required. Tests: `a-new-user`, `mobile`. |
| 7 | Identity introduction | Verified | `components/IdentityIntro.tsx` on `/personality`: the product's own five dimensions (from `shared/personality.ts`), each explained, CTA "Discover My Identity". Test: `z12`. |
| 8 | 20-statement assessment | Verified (pre-existing) | 20 statements in four steps of five, five choices, progress bar, Back, saved draft with "Picked up where you left off". Scoring untouched. Background does not yet evolve with answers (Not started; low value against the "avoid excessive animation" rule). |
| 9 | Grand identity reveal | Verified | Seven chapters (`REVEAL_STAGES`): one light, five dimensions, connection, archetype, blend, awakening, arrival. Full length first time, double speed on replay, Skip always. Chapter five states the truth for the result (stored blend, nearby second archetype, or neither). Result screen has archetype, blend, dimensions, strengths, growth edge, identity card, share, and links to avatar and Home. Tests: `z6`, `archetypeWorlds.test.ts`. |
| 10A | Avatar Studio | Partial | Drawn 2D avatar from fixed parts, optional 3D stage with blink. **Blocked** for rigged 3D characters, clothing, poses: needs licensed or commissioned models. |
| 10B | Universe Studio | Partial | Theme studio: mode, accent, text size, corners, 3D quality, sounds, reduced motion. Per-user environment, particles and decorations: Not started. |
| 10C | Identity Studio | Verified | `/identity`: reveal, dimension explorer, why-this-result, evolution timeline, labels, sharing. |
| 10D | Profile Studio | Verified (pre-existing) | Settings → Profile & display and Privacy; all persisted through the API. |
| 10 | One studio, four rooms | Verified | `StudioNav` links Identity, Avatar, Universe, Profile at the top of each. Test: `z12`. |
| 11 | Cosmic Home | Verified | Identity world, daily vibe, single next step from real state, feed, circles, quests. Tests: `z6`, `l-create-discover`, `k-social`. |
| 12 | Discover: two modes | Verified | Constellation and list, with a Both / Constellation / List switch that is remembered per device. Tests: `z7`, `l-create-discover`. On selection the map turns to the chosen star; there is no camera zoom. |
| 13 | Expression | Verified (mostly pre-existing) | Text, poll, photo carousel, voice, pen name, audience choice, moderation. Reaction burst, real voice waveform, photo reveal added. Collaborative Drop: Not started. Separate preview step before publish: Not started (composer is single-step). |
| 14 | Circles | Partial | Circle world, tiers, events with tickets, market, moderation; permissions server-side (tests `m`, `n`, `i-privacy`). Named environment themes (Observatory, Garden…): six colour themes exist, not distinct 3D environments. |
| 15 | Play | Verified | Game hub, tournament arena, quest constellation, achievement gallery, season path. Scores, XP and claims are server-side with duplicate-claim protection (tests `h-progress`, `p-tournament`, `z8`). Arena countdown and victory animation: Not started. |
| 16 | Evolution | Verified | Identity timeline, achievements, Year in Review with film, journal sky. Private facts never on share cards (test `z-year-review`). |
| 17 | Navigation | Verified (pre-existing) | Home, Discover, Create, Circles, Play, Profile on mobile and desktop. Tests: `mobile`, `widths`. |
| 18 | Social | Verified (pre-existing) | Profiles, follows, drops, reactions, comments, sharing, notifications, search, messaging. |
| 19 | Animation and 3D engineering | Verified | One scene host, shared layouts in `lib/`, lazy three.js chunk, pause off-screen, disposal, WebGL fallbacks, false context-loss reports fixed. Instancing: single-draw-call point clouds; medallions share geometry. |
| 20 | Design system | Verified (pre-existing) | Tokens in `styles/app.css`, primitives in `components/ui`. Motion presets added. No full component-state audit was done in this pass. |
| 21 | Mobile and desktop | Verified | 360–1440 px overflow tests; quality levels Eco to Ultra with Automatic default; reduced motion; keyboard and screen-reader paths. |
| 22 | Data and privacy | Verified (pre-existing) | No schema changes in this pass. Privacy boundaries tested (`i-privacy`, `z6`, `z7`). |
| 23 | Performance | Verified (desktop), Partial (phones) | Measured: ~120 fps on integrated GPU; 38–52 fps under 4× CPU phone-class emulation with one ~2 s first-load frame. Real phones not measured. See `docs/3d-report/`. |
| 24 | Analytics | Verified | Existing funnel plus `intro_viewed`, `intro_skipped`, `intro_completed`, `reveal_completed`, `identity_studio_opened` (aggregate, no properties). `avatar_customised`, `profile_viewed`: Not started. |
| 25 | QA | Verified | Journeys 1–8 covered by existing specs plus `z6`–`z12`; diagnostic sweep of 59 pages found nothing. Slow-network test: Not started. |

## Blocked or needing the owner

- **Rigged 3D avatars, clothing, poses:** needs licensed or commissioned character models.
- **Supabase audit:** the production project's database does not answer after a resume request; needs a Supabase support ticket from the account owner. On hold at the owner's request.
- **Pull request into `main`:** to be opened by the owner on GitHub.
- **Real-phone measurements:** need physical devices.

## Next, in order

1. Universe Studio: a per-user backdrop choice for the identity world (needs one profile field and a migration).
2. Circle environment themes as distinct scenes on the existing star map.
3. Tournament countdown and finish animation.
4. Preview step in the composer; Collaborative Drops (needs product decisions on ownership and moderation).
5. Split or preload the three.js chunk to remove the first-scene pause on slow phones.

## Last full run

2026-11-13: 432 of 432 unit tests (66 files), 54 of 54 browser tests, typecheck, lint, build and secret scan clean.

Found during this pass: the Playwright config's top-level `reducedMotion` option is not applied, so the suite has always run with full motion. Documented in the config; tests that need reduced motion set it on their own context.
