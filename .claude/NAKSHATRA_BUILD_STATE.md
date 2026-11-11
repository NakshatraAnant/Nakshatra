# Nakshatra build state (continuation file)

- Branch: product-evolution (local commits only, not pushed); last commit: see git log
- Phase: hosting done; remaining scope listed below
- Local app: RUNNING at http://localhost:4500 (`app` launch config, local .data/pglite, payments off, dev mailbox)
- Backups: .data/pglite-backup-before-0007-0010, -0011-0012, -0013, -0014, -0015, -0016, -0017, -0018, -0019, -0020, -0021, -0022, -0023, -0024, -0025-0026, -0027, -0028, -local-flags (taken with the app stopped)
- Gates (2026-11-11, final master phase): vitest 401/401; Playwright 44/44 (sequential, after npm run build); typecheck + lint clean; production build OK; secret scan clean (533 files). Do not run vitest and Playwright at the same time (timeouts).
- Note: e2e serves dist/web — run `npm run build` (not build:web:e2e) before Playwright
- Built this directive: MFA recovery codes; personality-v2 (balanced 2.9–5.2%/archetype, blends, versioned, v1 kept);
  assessment resume; funnel events + admin Funnel; nav (Home/Discover/Create/Circles/Play/Profile); voice + photo drops;
  opt-in People discovery; Home next step; reveal first-step card; COD merch lifecycle + admin fulfilment/stock (module off);
  admin Launch readiness + Performance; launch-scope e2e (legacy journeys via E2E_MODULE_SCOPE=all);
  memberships (Duo seats, Student w/ staff review, capped Founding w/ locked price) + plusStatus() engine (0011);
  member quiz builder (trivia + outcome) on shared engine (0012);
  async trivia tournaments (server clock, one run, answers hidden until close, too-fast/over-time held for moderator review,
  competition ranking, match history) + season leaderboards (following/circle scope only, hide-me setting) (0013);
  creator pages (links, featured drops, offering listings with Notify me, tips via payment boundary into a held
  ledger with 10% fee, simulated tips labelled, refunds reverse, daily cap, moderator suspension, no payouts) (0014);
  circle channels (discussion/announcements, feed filter, archive back to General), circle events with weekly/
  fortnightly/monthly repeats (DST-safe, materialised 6 ahead by scheduler, cancel one / stop series), circle
  moderator dashboard (reports in circle w/ reporter hidden, remove/keep, pause posting, ban/unban, audit log) (0015);
  close friends (private list, close_friends post audience enforced in feed/profile/detail/stories, blocks drop it) +
  saved collections (private/public, per-viewer visibility filtering, owner pen-name posts never exposed,
  follows profile privacy, Save to… picker); fixed broken Save toggle (sent {} instead of {saved}) (0016);
  sponsored cards (module ads, default OFF): staff advertisers/campaigns, contextual-only targeting (safe topic list +
  language), sensitive-term policy check, four-eyes approval, edits return to draft, per-viewer daily caps with
  HMAC viewer keys (30-day retention), hide, why-this-ad, server-validated clicks, no ads for Plus, admin stats (0017);
  partner perks (module partners, default OFF): /perks page only with commission disclosure, opaque click refs,
  code reveal, HMAC-signed idempotent postbacks (CSRF-exempt, 30-day attribution), staff approve/reverse commission (0018);
  organisations/B2B (module orgs, default OFF): staff-created workspaces, seat limits, domain-restricted invites,
  org-only circles (circle invite links refuse non-members; leaving/removal drops org circles), 404 for any cross-tenant
  access, aggregate-only opt-in team picture (min 5, averages + spread, never individual results) (0019);
  free circle membership tiers (badges, admin-assigned, ordered) + members-only channels (tier and above; enforced in
  channel list, circle feed, main feed, post page, comments, posting; archived tier channels stay closed) (0020);
  circle market / community commerce (sell, swap, free, wanted inside a circle; prohibited-category check; interest notes
  seen only by seller; seller accepts one -> private listing thread; blocks; circle mods remove; no payments) (0021);
  private journal (encrypted at rest, daily prompt by date, edit/delete, never in analytics) + identity calendar (own month:
  moods, journal days, drops, events, games); data export now covers all features added in this directive (0022);
  year in review (/year, module yearReview on): own-data recap per year since joining, month activity, longest run, busiest
  month, true highlights only (no comparisons); moods/journal private and refused on cards; consented share cards (/y/:slug)
  snapshot only ticked facts computed by the server, optional name, noindex, views, switch off; export + deletion (0023);
  theme studio (/theme, free): mode, 6 accent presets (each WCAG ≥4.5:1 on every surface in both schemes, unit-tested),
  text size 100/112.5/125%, soft/crisp corners, reduce motion; server accepts presets only (no custom CSS/colours);
  applied app-wide via root CSS variables, cached per device for no flash, defaults when signed out; mobile header now
  fits at 125% text (360px no-overflow check) (0024);
  avatar creator (/avatar, free): 9 fixed parts, SVG drawn only from our shapes (no member text), served at
  /api/v1/avatars/:id only while it is the member's picture, versioned URL, remove keeps the build (0025);
  paid circle tiers: owner-only price (₹19–₹1,999), 30-day pass via payment boundary (no auto-renew, extends from
  current end), expiry enforced in every gate, owner 85% held in ledger, refund removes pass + reverses; paid creator
  unlocks: digital offerings with unlock text/https link shown only to creator + buyers, /unlocks page, refund removes
  access; both closed when payments are off; fixed offering PATCH resetting price/description/status (0026);
  revenue registry statuses corrected (duo, student, paid unlocks, circle share, contextual ads, affiliate, partner
  offers, merch -> infrastructure);
  paid circle event tickets (owner-only price ₹19–₹4,999, one-off events only): going only after verified payment,
  capacity counts 30-min unpaid holds, host 85% held; host cancels -> every ticket refunded automatically (user decision
  2026-11-11); payment landing after cancel/start/full -> refund_due -> auto refund; scheduler retries failed refunds;
  members can't self-cancel paid tickets; registry #35 -> infrastructure (0027);
  sponsored quizzes (trivia only; outcome quizzes refused) + sponsored challenges (self-reported) on the ads pipeline
  (module ads, off): same policy check incl. all quiz/step text, four-eyes review, disclosed + hideable, Play->Quizzes
  and Progress placements, server-scored once per member, no XP/rewards, Plus sees none, pseudonymous participation
  (90-day retention), staff see totals only; fixed campaign PATCH resetting text/targeting/cap; registry #37/#38 (0028)
- NOT built (honest gaps): creator payouts + real settlement (forbidden by directive: needs KYC/payout provider);
  market payments/escrow (needs a licensed escrow provider); ad billing/self-serve; creator memberships/sessions/workshops/newsletters (recurring billing /
  scheduling); content-heavy models (programmes, workbooks, audio, packs); sponsored seasons/games, promoted
  discovery, rewarded ads; further 3D (achievement unlock, level-up and game scenes; reveal aura is built)
- Next exact task if continuing: push to GitHub once the repository URL and authentication are provided; wake the Supabase project and run the read-only audit; then the remaining gaps (each needs a provider, content or a product decision)
- Final master phase (2026-11-11): archetype reveal 3D aura (ArchetypeAura3D: rings from the member's own five dimension
  scores, lazy, pauses off-screen, static under reduced motion, 2D art fallback); assessment re-validated (scripts/
  assessment-distribution.ts: random sheets 91% low confidence, every archetype 2.9–5.2% on held-out populations, 13%
  blends, straight-lining inconclusive, v1 kept); backup restore verified (copy of before-0028 opened, migrated forward,
  counts intact); .gitignore tightened (.env.*, dumps, keys, scratch scripts) and .env.example completed (payments off by
  default); local .env PORT moved 4000 -> 4500 (4000 is ATLAS); registry #49 campus -> infrastructure (orgs module)
- Local review flags: ads, partners, orgs, merch switched ON in the local database only (audit_logs:
  flags.local_review_enabled; backup .data/pglite-backup-before-local-flags). Payments stay off (PAYMENT_PROVIDER=none,
  PAYMENTS_ENABLED=false), so paid tiers/unlocks/tickets show "opens when payments are on".
- GitHub: BLOCKED — no git remote is configured, gh CLI is not installed and no git credentials are stored, so the
  repository could not be identified or verified; nothing was pushed. Needs the repository URL and a way to authenticate.
- Supabase: project "Nakshatra" (ref xxppudtbhkxornjthbrw, ap-southeast-1) identified; per docs/DEPLOY_RENDER_SUPABASE.md
  it is the intended PRODUCTION database (app schema "nakshatra", 22 legacy prototype tables in public). It is
  hibernated: every SQL/list/advisor call timed out, so schema, migration history, RLS and storage could NOT be audited.
  Nothing was changed. "project-atlas" belongs to ATLAS and was not touched.
- 3D identity universe, batch 1 (2026-11-11, Fable 5.2): graphics quality profiles (auto/eco/balanced/high/ultra, per
  device, src/web/three/quality.ts) honoured by the shared Scene3D host; 24 data-driven archetype worlds
  (archetypeWorlds.ts: unique form+build per archetype, unit-tested); one identity scene engine (identity.tsx: five
  dimension rings from real scores, archetype shell around the sigil art, satellites/particles, blend companion sized
  by stored blend weight, deterministic reveal timeline); Reveal Theatre with Skip/Replay (plays once per result),
  Dimension explorer on /identity, Home identity world, SVG Quest constellation on /progress, CSS motion presets
  (m-enter/reveal/float/pulse/glow/success/error/hover). Scene stages are always dark-ink. No-WebGL e2e passes.
  Gates: vitest 405/405; Playwright full run 44/46, the 2 failures (Theme studio overflow at 360px from the new
  graphics control) fixed and those specs + widths re-run green; full suite not re-run after that one-component fix.
  Measured: identity scene chunk 7.3 kB (3.2 kB gz), page wrapper 23 kB, three.js stays in its own lazy 704 kB chunk.
- 3D NOT built yet: 3D avatar/rig system, profile worlds, constellation discovery, compatibility visualiser, circle
  worlds/tier visuals, game hub/tournament arena, achievement gallery upgrades, seasonal universe, thought-drop/reaction
  effects, cinematic year-in-review, journal atmosphere, creator stage, product viewer changes, sound, WebGPU path,
  GLB/KTX2 pipeline (no model assets exist), FPS/Core Web Vitals measurements on real devices.
- Next exact task if continuing 3D: profile world + achievement gallery on the identity engine, then circle worlds.

## 3D batch 2 (profile world + achievement gallery)
- src/web/three/gallery.tsx: AchievementGallery3D (28 medallions on one carousel, shared geometry/materials, selection turns it to the front).
- src/web/components/Worlds.tsx: ProfileWorld (on /u/:handle, data only from identity/u/:handle so visibility, blocks and the persona field setting apply) and AchievementGallery (on /progress, replaces the earned-only list; list drives the scene, works without WebGL).
- e2e/z6-identity-universe.spec.ts: third test covers both plus the privacy case (world disappears for a visitor when persona is set to private).
- Gates: vitest 405/405, Playwright 47/47 (full run), typecheck/lint/build clean. Gallery camera framing was adjusted after that run (constants only).
- Next exact task if continuing 3D: circle worlds (portal + tier visuals), then constellation discovery and compatibility visualiser.

## 3D batch 3 (circle world + discovery constellation)
- src/web/lib/starmap.ts (+test): deterministic layout shared by 3D and 2D. src/web/three/starmap.tsx: StarMap3D.
- src/web/components/StarWorlds.tsx: CircleWorld (circle Members tab; role = ring, joined-in = bright, tier = band, activation arc) and PeopleConstellation (/explore; distance only from shared intents and shared labels, never inferred traits; archetype colour only when public). 2D SVG fallback of the same map.
- e2e/z7-star-worlds.spec.ts covers both, opt-in, and that a blocked person disappears.
- Gates: vitest 408/408, Playwright 48/48 (full run), typecheck/lint/build clean.
- Next exact task if continuing 3D: compatibility visualiser on bonds, then game hub / tournament arena, then cinematic Year in Review.

## 3D batch 4 (compatibility visualiser + game hub)
- src/web/lib/bridges.ts (+test), src/web/three/bridges.tsx, components/Bridges.tsx CompatibilityBridges: on a bond's Compatibility tab; one bridge per dimension, thickness/brightness from that dimension's own 0–100 score, never combined; list + status give the same info; 2D SVG fallback.
- src/web/lib/hub.ts, src/web/three/hub.tsx, components/Bridges.tsx GameHub: on /play above the library; games as planets grouped by category, moons = your active/lobby sessions; prev/next + "Rules & play" opens the same dialog as the cards.
- Fix in three/core.tsx: R3F force-loses the context on teardown; that was being reported as webgl_context_lost on every scene unmount. Now ignored when the canvas is no longer in the page.
- Tests: b-relationship extended (bridges), e2e/z8-game-hub.spec.ts. Gates: vitest 412/412, Playwright 49/49, typecheck/lint/build clean.
- Next exact task if continuing 3D: tournament arena + seasonal universe, then cinematic Year in Review, then Thought Drop reactions.

## 3D batch 5 (tournament arena + season path)
- src/web/lib/arena.ts (+test): arenaLayout (podium 2-1-3, shared places side by side, cap 24), seasonProgress/seasonPoint/seasonLayout.
- src/web/three/arena.tsx: TournamentArena3D (pillars rise once; yours bright) and SeasonPath3D (milestone worlds, comet at your points, ring = reward waiting).
- src/web/components/Arena.tsx: TournamentArena (region "Tournament arena", above Standings; draws only the standings already returned, so held runs never appear) and SeasonPath (region "Season path", in SeasonTrack on /progress; colour from season key). 2D SVG fallbacks.
- Found: three.js cannot parse space-separated hsl(); season colours use commas.
- Tests: p-tournament and z6 extended. Gates: vitest 417/417, Playwright 49/49, typecheck/lint/build clean. Season camera moved closer after the full run (constant only).
- Next exact task if continuing 3D: cinematic Year in Review, Thought Drop reaction effects, then 3D avatar preview.
