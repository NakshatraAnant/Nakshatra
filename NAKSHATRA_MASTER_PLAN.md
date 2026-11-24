# Nakshatra master plan: personality-led social network

_Started 2026-10-25. Status lives in `NAKSHATRA_IMPLEMENTATION_STATUS.md`. Decisions are in `NAKSHATRA_DECISIONS.md`._

**Promise:** "Discover your kind of person. Say what you really think. Find your people."

**Pillars:** Identity · Expression · Belonging · Play. Astrology is an optional differentiator.

## Phase 0 audit: what already exists and is reused
| Target capability | Existing code to reuse | Gap |
|---|---|---|
| Identity Studio | Cosmic ID + astro archetypes (`src/astro/archetype.ts`), profiles with field visibility, share cards (`src/web/lib/cosmic.ts`) | No non-astrology assessment. Onboarding forces a birth profile |
| Thought Network | `posts` (text/poll/…), poll options/votes, reactions, threaded `comments.parentId`, `saved_posts`, `feed_feedback`, ranking service (`src/server/services/ranking.ts`), reports, blocks, mutes | Thought types, pseudonymous posting, duplicate/spam and text filter, circle visibility |
| Private Circles | `groups` + `group_members` (roles owner/moderator/member, statuses) | Circle kind, invite tokens, circle feed, rituals, circle progress |
| Play | none | Whole game engine and 12 games |
| Rituals | astro daily briefing/rituals (`ritual_completions`) | Social ritual engine with non-repeating selection |
| Points and levels | `xp_ledger` (idempotent by user/rule/sourceKey), achievements, collectibles, `levelForXp` | New rules, level taxonomy, cosmetic unlocks |
| Referrals | `users.referralCode`, `referredBy`, `referrals` table written at signup | Status, activation rule, abuse checks, reward, history screen |
| Offers and entitlements | commerce products/variants/orders/payments/entitlements, dev payment simulator, Razorpay adapter | Cosmetic offers, entitlement-gated card styles, identity report |
| Analytics | `analytics_events` + typed taxonomy + sanitiser, admin funnel | New social events, WMSP north star |
| Notifications | in-app notifications + preferences | New categories (circles, games) |
| Moderation | reports, moderation actions, appeals, admin queue | Text filter, duplicate-post guard |

## Architecture decisions (summary; details in DECISIONS)
- **Circles:** a `groups` row with `kind = 'circle'` (always private). This reuses memberships, roles and moderation.
- **Points:** the existing XP ledger, presented as "points". Levels are renamed.
- **Games:** one database-backed, turn-based engine (`src/shared/play/*` definitions plus a server engine) with polling. No realtime transport.
- **Pseudonymity:** an optional `profiles.pseudonym`. Pseudonymous posts are serialised without the author id for everyone except the author and staff.
- **Assessment:** a 5-dimension, 20-question deterministic model (`src/shared/personality.ts`). Nearest-prototype archetype with confidence, versioned.
- **Migrations:** a single additive migration, `0003_social_network`.

## Phases
| Phase | Work |
|---|---|
| 0 | Audit and checkpoint docs |
| 1 | Schema migration, shared definitions (personality, games, rituals, levels) |
| 2 | Identity Studio: assessment API, archetype result, labels, privacy, cards; onboarding without birth data |
| 3 | Thought Network: types, pseudonymity, filters, circle visibility |
| 4 | Circles: CRUD, invites, roles, circle feed |
| 5 | Game engine and 12 games |
| 6 | Rituals, points rules, levels, cosmetic unlocks |
| 7 | Referrals (activation rule) and offers/entitlements |
| 8 | UI: Home, Identity, Thoughts, Circles, Play, Rewards, navigation, assets |
| 9 | Tests (unit, integration, browser), docs, local run |
