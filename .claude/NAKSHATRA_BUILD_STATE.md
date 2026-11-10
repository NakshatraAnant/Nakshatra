# Nakshatra build state (continuation file)

- Branch: product-evolution (local commits only, not pushed); last commit: see git log
- Phase: hosting done; remaining scope listed below
- Local app: RUNNING at http://localhost:4500 (`app` launch config, local .data/pglite, payments off, dev mailbox)
- Backups: .data/pglite-backup-before-0007-0010, -0011-0012, -0013, -0014, -0015, -0016, -0017, -0018, -0019, -0020, -0021, -0022, -0023, -0024, -0025-0026, -0027 (taken with the app stopped)
- Gates (2026-11-07, latest): vitest 363/363; typecheck + lint clean; production build OK; Playwright 38/38 (Journey B timed out once under heavy load, passed on re-run). Do not run vitest and Playwright at the same time (timeouts).
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
  members can't self-cancel paid tickets; registry #35 -> infrastructure (0027)
- NOT built (honest gaps): creator payouts + real settlement (forbidden by directive: needs KYC/payout provider);
  market payments/escrow (needs a licensed escrow provider); ad billing/self-serve; creator memberships/sessions/workshops/newsletters (recurring billing /
  scheduling); content-heavy models (programmes, workbooks, audio, packs); sponsored quizzes/quests/seasons/games,
  promoted discovery, rewarded ads; 3D additions
- Next exact task if continuing: sponsored quizzes/quests on the ads review pipeline (contextual, disclosed), or stop
