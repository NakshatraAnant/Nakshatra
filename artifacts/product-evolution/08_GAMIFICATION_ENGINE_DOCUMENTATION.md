# 08 — Gamification Engine

One progression system on top of the existing `xp_ledger` (no second points currency).

## Pieces
| Component | Where | Notes |
|---|---|---|
| XP ledger | `xp_ledger` (+ `meta`, `reverses_id`), `lib/rewards.ts awardXp` | Unique `(user, rule, source_key)` = idempotency key. New rules: `quest_reward`, `season_reward`, `reversal`. Server-only. |
| Reversals | `services/progression.ts reverseXp`, `POST /api/v1/admin/xp/:id/reverse` (capability `users.manage`) | Negative entry `rev:<id>`, unique `reverses_id`, audited with reason; positive awards only, once. |
| Quests | `shared/progression.ts QUESTS`, `services/progression.ts questStates/claimQuest` | Periods daily / weekly (ISO, member time zone) / once; multi-step; progress computed from real rows; claim PK `(user, quest, period)`; XP via `awardXp(amountOverride)`. 12 quests: vibe, prompt, reply (others only), game night, circle 3 days, say what you think (2 drops + 3 replies), show your card, find archetype, labels, pen name, found a circle (3 steps), bring a friend. |
| Achievements | `shared/gamification.ts ACHIEVEMENTS` (+ `steady_week`, `identity_explorer`, `connector`) | Existing metric evaluator plus direct grants from the engine; all mapped to artwork. |
| Streaks | `computeStreak` (pure) + `activeDays` | Any XP award, vibe or prompt counts; local calendar days; 1 grace day per rolling 7 days (`STREAK_GRACE_PER_WEEK`); today pending never breaks it; best kept. Circle streaks: days any member contributed. No streak notifications. |
| Seasons | `SEASONS` (Season 1 · First Light, 1 Nov 2026 – 31 Jan 2027) | Season points = XP earned in window (IST). Five free milestones → badge collectibles; claim window +14 days after end; archive shows past seasons; **premium track defined but `enabled: false`**. |
| Reward inventory | `GET /api/v1/progress/inventory`; `collectibleStates` | Badges, card styles, themes with source (`earned` / `purchased` / `subscription`). |
| Vibe check-in | `vibe_checkins`, `POST /api/v1/vibe` | 8 words, one per local day (changeable that day); mood never sent to analytics. |

## Anti-abuse
Duplicate XP (unique keys), duplicate claims (PKs; concurrent claims tested), self-reply farming (replies counted per distinct post by someone else), posting volume (daily quests ≤10 XP, per-day XP rules), referral abuse (existing activation + cap), client manipulation (no client-supplied counts anywhere), negative totals (only one reversal per positive award).

## API
`GET /api/v1/progress` · `POST /api/v1/quests/:key/claim` · `POST /api/v1/seasons/:key/milestones/:at/claim` · `POST /api/v1/vibe` · `GET /api/v1/progress/inventory` · `POST /api/v1/admin/xp/:id/reverse`

## Not implemented
Friend (pair) streaks, streak protection items, seasonal leaderboards, tournaments, premium season track (blocked on payments).
