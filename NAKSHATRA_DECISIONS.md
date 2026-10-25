# Nakshatra decisions: social network transformation

_2026-10-25. Earlier decisions (1–43) are in `docs/DECISIONS_AND_ASSUMPTIONS.md`._

## Product
| # | Decision | Why | Consequence |
|---|---|---|---|
| S1 | **Identity onboarding no longer requires birth details.** A personality assessment completes onboarding; birth details are an optional second path | Most 18–35 users will not know their birth time or want astrology | Astro pages show a "This part uses your birth details" state instead of an error |
| S2 | **Personality model: 5 dimensions, 20 Likert items, 24 archetypes, nearest prototype** (`personality-v1`) | Small and explainable; every result can say why | Prototype spacing ≥ 0.5 and reachability of every archetype are unit-tested |
| S3 | **Archetype names are behavioural and affectionate, never diagnoses.** "The Midnight Philosopher" and "The Chaos Diplomat" are kept from the brief; "Soft-Launch Romantic", "Delulu Strategist" and others are adapted | Recognisable and shareable without stereotyping | External trademark checks not done (needs counsel) |
| S4 | **Three identity sources are shown separately**: calculated (assessment), self-selected (labels), community-derived (friends' Archetype Showdown guesses), plus optional astrology | Honest about where each claim comes from | Each has its own visibility control |
| S5 | **Pseudonymous, not anonymous.** Pen names hide the author from other members; the account link is kept server-side | Safety and legal obligations | Not serialised in feeds, profiles, search or rankings; author-based ranking signals are disabled for these posts |
| S6 | **Circles reuse `groups` with kind = 'circle'** | Memberships, roles and moderation already existed | Circles are excluded from group listing, search and direct join; non-members get 404 |
| S7 | **Invite links store only a SHA-256 hash.** They expire in 7 days, allow 20 uses (counted atomically) and can be revoked | Links get forwarded | Public preview shows name, theme, size and inviter only |
| S8 | **One turn-based, database-backed game engine with polling** | Correctness first; there is no realtime infrastructure | Round close locks the session row; secrets are stripped before any response |
| S9 | **Prediction Market uses in-game play points only** | No gambling or cash value | Play points live in the game score, never in the points ledger |
| S10 | **Points = the existing idempotent XP ledger.** Ranks renamed New Signal → Orbiting → Inner Circle → Supernova → Constellation Keeper | Reuse proven idempotency | Purchases never add points; paid cosmetics are labelled "Purchased" |
| S11 | **Referral reward only after activation**: verified email + identity discovered + one social action within 30 days. Self-referral detection by canonical email; 10/month cap | Stops click and alias farming | Pending referrals are re-checked on relevant actions |
| S12 | **Rituals: coprime-stride selection.** No repeat until a bank is exhausted; same prompt for everyone in a scope; DST-safe calendar periods | Fresh without randomness or per-day content | Circle rituals use IST for the whole circle; rituals never push-notify |
| S13 | **Initial paid offers: card style pack ₹29, Expanded Identity Report ₹99** (real products, admin-editable) | Smallest honest monetisation; ₹11 was rejected as unprofitable after payment fees | Checkout pre-checks data so reports never fail after payment |
| S14 | **Feature flags `circles` and `play` are enforced on the server** (`requireFeature`) | Navigation-only hiding is not a control | `/api/v1/features` exposes flags to the client |
| S15 | **Search never returns private groups or circles** | Found during the audit: search leaked private group names | Thought Drop search added |
| S16 | **Baseline text screening**: harassment phrases, plus phone and email blocking in pseudonymous, confession and game contexts. Extra terms configurable in `moderation_terms` | Conservative and explainable | Not a guarantee; reporting and human review remain primary |

## Engineering notes
- Migration `0003_social_network` is additive only.
- Circle helpers live in `services/circles.ts` to avoid module cycles.
- Two content bugs found by the new tests and fixed:
  - prompt ids collided across categories, which would have broken repeat avoidance
  - two archetype prototypes were too close to tell apart
