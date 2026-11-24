# Nakshatra implementation status (social network transformation)

_Checkpoint: 2026-10-25. Source of truth for resuming work. Verify against the working tree before trusting it._

## Current phase
Phases 0–9 are complete for this environment. The remaining items are external blockers and post-launch measurement.

## Completed (verified by tests)
- **Migration `drizzle/0003_social_network.sql`** (additive). It adds:
  - tables: `assessment_results`, `circle_invites`, `game_sessions`, `game_participants`, `game_submissions`, `ritual_responses`
  - columns: `profiles.pseudonym/identity_labels/card_style`, `groups.theme/invite_policy`, `posts.pseudonymous/edited_at`, `referrals.status/decided_at/decision_reason/reward_points`
- **Personality engine** `src/shared/personality.ts`: 5 dimensions, 20 questions, 24 archetypes, deterministic nearest-prototype scoring, confidence.
- **Game engine** `src/shared/play/engine.ts`, 12 games, plus content banks in `src/shared/play/content.ts`.
- **Ritual engine** `src/shared/rituals.ts`: non-repeating coprime-stride selection, DST-safe periods.
- **Server modules:**

  | Module | Covers |
  |---|---|
  | `studio.ts` | assessment, identity, labels, pen name, card style, public identity |
  | `circles.ts` | CRUD, invites, roles, feed, recap, `/features` |
  | `play.ts` | sessions, join, start, submit, withdraw, advance, view |
  | `rituals.ts` | social rituals |
  | `referrals.ts` | referral history |

- **Services:** `moderation`, `progress`, `referrals`, `activation`, `circles`; `settings.requireFeature`.
- **Changes to existing code:**
  - `social.ts`: Thought Drop kinds, pseudonymity, screening, edit window, mute-author, reply points, reply depth limit, circles hidden from groups.
  - `account.ts`: search no longer leaks private groups or circles; Thought Drop search; export and deletion cover the new data.
  - `ranking.ts`: no author signals on pseudonymous posts; needs-answers boost.
  - `auth.ts`: `hasAssessment`; referral check after email verification.
  - `journey.ts`: purchase-aware collectibles, ranks, earn list.
  - `commerce.ts`: report data pre-checks.
  - `reports.ts`: identity report.
  - `seed.ts`: flags `circles`/`play`, offers `cosmetic-card-styles` ₹29 and `report-identity-expanded` ₹99.
  - `gamification.ts`: new points rules, level names, achievements, card styles.
- **Tests:**
  - `src/shared/social.test.ts`: 29 unit tests
  - `tests/integration/social.test.ts`: 13 integration tests
  - Full vitest: **169/169 pass**

## UI completed (browser-verified)
- **Pages:**

  | Page | Path |
  |---|---|
  | Home | `/home` |
  | Identity Studio | `/identity` |
  | Archetype preview | `/personality` |
  | Public identity | `/i/:handle` |
  | Thoughts | `/thoughts`, `/thoughts/:id` |
  | Circles | `/circles`, `/circles/:id` |
  | Invite landing | `/c/join/:token` |
  | Play | `/play`, `/play/:id` |
  | Invite friends | `/invite` |

- **Components:** `PersonaSigil` (procedural archetype sigil), `GameMark`, `CircleEmblem`, persona share cards (`src/web/lib/persona.ts`).
- **Onboarding:** two paths — archetype (no birth data) or birth details. Deep links such as circle invites survive signup.
- **Navigation:** Nakshatra (Home, Identity, Thoughts, Circles, Play) / Astrology / More / Labs. Mobile bar: Home, Thoughts, Circles, Play, More.
- **Landing:** new social promise; astrology shown as an optional differentiator.
- **Astro pages without birth details:** a "This part uses your birth details" state instead of an error.

## Remaining (priority order)
1. Owner blockers (see NAKSHATRA_TEST_AND_BLOCKER_REPORT.md).
2. Run the full e2e suite once more end to end. The accessibility link fix was verified with a targeted re-run only.
3. Post-launch: measure the activation, circle activation and game completion funnels in Admin → Analytics.
4. Possible next features (deliberately not built without evidence): realtime transport, push notifications, creator and sponsored offers, Memory Lane sources beyond two games.

## Exact next action
Owner actions: Razorpay test keys, SMTP, legal review. Engineering: `npm run test:e2e` for one fully green run.

## Known regressions
None known. Full suite: 22/24 on the first run; the 2 accessibility failures were fixed and re-verified separately.

## External blockers (unchanged)
- Razorpay live keys
- SMTP provider
- WSL 2 for Docker/PostgreSQL verification
- Legal review (privacy, referrals, UGC, age)
- Penetration test
- Trademark check of archetype names (not possible locally)

## Local run
```
npm run db:backup     # with the server stopped
npm run build
npm run local         # http://localhost:3000
npm run local:stop
```
