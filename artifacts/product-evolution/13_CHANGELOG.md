# 13 — Changelog (branch `product-evolution`, uncommitted)

## Security & privacy
- Pen-name mutes stored separately and listed by pen name with an opaque reference; real/pen-name mutes no longer cross-hide posts.
- Pen-name authors' replies in their own threads stay under the pen name; pen name snapshotted per post.
- Following feed excludes other people's pen-name posts; public posts follow post-level visibility.
- Hidden-author game rounds no longer expose the author id or "waiting" state.
- Private circle/group events gated on list, RSVP and search.
- MFA: setup refused while enabled; disable requires password + code, ends other sessions, audits failures.
- Retention job for delivered email bodies, dev mailbox, auth tokens, old sessions.
- Dev mailbox answers only loopback requests.
- Account deletion removes uploads (DB + disk), nulls analytics user ids, revokes share links, deletes pen mutes.
- Smaller fixes: feed feedback visibility check, moderators can't act on moderators, post images must be your own upload.

## Product
- Central module registry with server-side enforcement; legacy modules off by launch scope; module-aware navigation and page gates; identity-only catalogue; payment-preview mode; `PAYMENTS_ENABLED` gate.
- Gifting rebuilt around verified-email claims (pending/claimed/expired/refunded), lazy report generation, Library "Build report" and Gifts panel, gift claim page.
- Late provider payments on expired orders trigger an automatic refund request.
- Assessment response quality (straight-lined, near-centre, low variance, patterned, inconsistent, incomplete) and "inconclusive" results; inconclusive results can't be shared.
- Archetype share links (anonymous or named), public `/s/:slug` page, referral/share attribution, server-rendered link-preview meta.
- Gamification: quests (daily/weekly/once, multi-step), streaks with grace, circle streaks, Season 1 with badge rewards, inventory, vibe check-in, XP reversal.
- Identity Evolution Timeline, Common Ground cards with conversation starters, game rematch.
- Terms/Privacy rewritten (draft for legal review).
- Referral cap no longer rejects referrals after 30 days.

## Performance
- Sessions resolved only for API requests (static −78% p50 in A/B).
- Initial app chunk 49.4 → 32.8 KB gzip (hash and icon split).
- Immutable caching for hashed assets; batched circle points; new indexes; messages polling off when module off.

## UI / motion
- Progress page, home progress card, celebration toasts, page transitions, progress fills, press feedback (reduced-motion safe); explicit radio labels.

## Data
- Migrations `0005_security_privacy_gifts`, `0006_gamification_engine` (additive).

## Tooling & tests
- +79 tests (259 total); `scripts/bench-api.ts`; `scripts/export-revenue-matrix.ts`; isolated e2e build (`WEB_DIST_DIR`, `npm run build:web:e2e`); harness isolated from local `.env`; `app` launch configuration on port 4500; local `.env` payments off (backup in `.data/`).
