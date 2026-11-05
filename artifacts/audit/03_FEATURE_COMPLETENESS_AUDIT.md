# 03 — Feature Completeness Audit

Full per-feature table (100 features, status, files, tables, tests, evidence): `14_COMPLETE_FEATURE_INVENTORY.csv`.

## Status distribution

| Status | Count | Meaning in this audit |
|---|---|---|
| COMPLETE AND VERIFIED | 11 | Traced end-to-end in code **and** exercised (browser, probe, or a test whose assertions actually cover the behaviour) |
| IMPLEMENTED BUT PARTIALLY VERIFIED | 64 | Implemented front-to-back; covered by passing tests or code trace, but not every path observed |
| PARTIALLY IMPLEMENTED | 10 | Works, with a material gap or defect |
| BROKEN | 7 | Core promise of the feature fails (pen names ×3 surfaces, events, three games; all verified except Memory Lane, which shares the verified mechanism) |
| NOT IMPLEMENTED | 6 | Absent (three deliberately: streaks, circle discovery, push/video/voice labelled unavailable) |
| BLOCKED BY EXTERNAL DEPENDENCY | 2 | Paid offers — payments disabled in production config |
| UNABLE TO VERIFY | (production DB state) | Supabase project hibernated |

There are **no UI-only placeholders** in the core product: every screen inspected is backed by a real API and database. Unavailable integrations (video, voice, push) are labelled as unavailable rather than faked. This is notably honest engineering.

## Identity Studio

- **Assessment structure:** 20 statements (`shared/personality.ts:35-56`), 4 per dimension, 2 reverse-keyed per dimension, 5-point Likert. Minimum 15 answers; a dimension needs ≥3 answers, otherwise it is scored 0 and confidence capped at low.
- **Scoring:** `score(d) = Σ key·(answer−3) / (2·answered)` → range −1…+1; rounding to 3 dp. Archetype = nearest of 24 prototypes by Euclidean distance; ties broken by catalogue order; secondary = second nearest; confidence from the distance gap (≥0.25 high, ≥0.10 medium).
- **Determinism:** verified (probe P9: identical input → byte-identical output).
- **Reachability:** all 24 archetypes are reachable (probe P9 over the full 9⁵ score lattice and 200k random answer sheets).

### Scoring defects and bias (VERIFIED by probe P9)

| ID | Issue | Evidence | Why it matters |
|---|---|---|---|
| DEF-04a | Straight-lining produces a confident result. All "Strongly agree", all "Neutral" and all "Strongly disagree" each yield **The Calm in the Chaos** with **high** confidence. Balanced reverse-keying cancels to the zero vector, and Calm in the Chaos has the prototype closest to the origin `(0, −0.2, −0.4, −0.2, −0.4)`. | `audit-probe-output.json` p9_allNeutral/AllAgree5/AllDisagree1 | Low-effort or acquiescent respondents get a "Clear match" — the label is misleading. |
| DEF-04b | Heavy central bias. Under uniformly random answers Calm in the Chaos wins **24.4%**; Soft-Launch Romantic 8.0%; seven archetypes are under 1% (Chaos Diplomat 0.50%, Midnight Philosopher 0.74%, Human Plot Twist 0.80%, Main Character in Training 0.92%). On the evenly weighted score lattice the spread is 1.9%–8.0%. | p9_uniformRandomDistributionPct, p9_latticeSharePct | Real respondents cluster near neutral, so the "calm" archetype will be over-represented in circles and Showdown games, and some showcase archetypes (the landing page features Midnight Philosopher) will be rare. |
| DEF-04c | 44.8% of random sheets get "low" confidence; the UI shows confidence as a badge but does not explain a low result. | p9_confidencePct | Expectation management on the reveal screen. |

Recommendation: detect straight-lining/low variance and say so; recalibrate prototypes against a real response sample (not invented here — needs data); define confidence relative to answer variance as well as prototype gap.

Descriptions avoid diagnoses and state "not a psychological test" in the API and UI — appropriate.

## Thought Drops and social

- Real formats (thought/question/dilemma/confession/prompt/poll), 500-char limit, 15-minute edit window, 3-level threads, reactions, saves, reports, ranked/chronological/following modes with explanations.
- **Broken:** pen-name posting (SEC-01, SEC-02, SEC-06).
- **Visibility gap (PRD-04):** default profile visibility is `private`; a "Public" Thought Drop from such a profile is shown only to followers. The composer copy "Anyone who can see public profiles on Nakshatra" does not tell the author that *their* profile is private. For a new user with no followers, a "public" post is seen by nobody.
- Feed is limited to posts from the last 14 days and the newest 400 candidates; offset pagination stops at 500.
- No outward sharing of a Thought Drop.

## Private circles

Solid: hashed invite tokens, expiry, max uses with an atomic counter, roles, ownership transfer, 404 to outsiders, circle feed, rituals, recap, activation reward. **Broken edge:** events attached to a circle are visible to everyone (SEC-04).

## Games (individually)

All 12 are genuinely playable rule sets, not visual shells: each has `plan`, `validate`, `reveal`, `score`, and most a `summary` (`shared/play/engine.ts`). Rounds close inside a row lock; state persists in `game_sessions.state`; clients poll every 3 s, so "reconnection" is simply reloading. Idle games are abandoned after 7 days.

| Game | Players | Status | Notes |
|---|---|---|---|
| Who Said It? | 3–12 | **BROKEN** | Author leaked (SEC-03, verified) |
| Pick Your Chaos | 1–20 | Partially verified | Only game that is fun solo |
| The Honest Vote | 3–12 | Partially verified | Individual votes never returned (test) |
| One-Line Confessions | 2–12 | Partially verified | Shuffled, no names |
| Archetype Showdown | 3–10 | Partially verified | Needs ≥1 opted-in player with an assessment |
| Friend Decoder | 2–8 | Partially verified | — |
| This or That | 2–20 | Partially verified | Twins + wildcard summary |
| Plot Twist | 2–8 | Partially verified | Turn stalls until host advances if a player is away |
| Hot Take Arena | 3–12 | **BROKEN** | "Anonymous verdicts" not anonymous (verified) |
| Prediction Market | 2–12 | Partially verified | Play points isolated from the XP ledger (test) |
| Memory Lane | 3–12 | **BROKEN** | Same `excludeId` mechanism as Who Said It? |
| Compatibility Lab | 2–8 | Partially verified | Counts identical answers; honest disclaimer |

Abuse prevention: text screening with contact-detail blocking in all game text, report on any submission (`game_submission` target), withdraw before close, consent flags for reuse/identity. No replay/rematch.

## Retention and gamification

XP ledger is idempotent and server-only (concurrency test passes). Levels, ranks, achievements, circle levels, rituals (no streaks by design). Manipulation surface: XP is per-day or per-source capped; game completion XP requires acting in ≥50% of open rounds; circle activation requires 3 contributing members; referral XP requires an activated, verified, non-alias referee and is capped monthly. A determined user can still farm referral XP with real secondary inboxes (≤10/month) — low value because points have no cash value. **DEF-03:** capped referrals are told "reviewed next month" but are rejected once 30 days pass (`services/referrals.ts:60-77` checks the 30-day window before the cap).

## Premium

- ₹29 Card Style Pack and ₹99 Expanded Identity Report exist as products seeded in every environment (`db/seed.ts:59-60`); entitlements are checked server-side; no client bypass found.
- Production uses `PAYMENT_PROVIDER=none`: offers remain visible and checkout fails with 503 "Payments are not configured" (`lib/payments.ts:createPayment`). The order transaction rolls back, so no orphan order, but the user hits a dead end.
- **DEF-01 (VERIFIED):** gifting the Expanded Identity Report to a member who has not taken the assessment makes the payment webhook throw inside its transaction (`commerce.ts:74-79` → `services/reports.ts:40`) → HTTP 500, payment stays `created`, order stays `pending_payment`. With Razorpay the provider would retry and the customer's money would be captured with nothing delivered until the scheduler cancels the order after 1 hour.
- **DEF-02 (VERIFIED):** gifting to an email with no account delivers the report to the **buyer's** library (`commerce.ts:72`), while the recipient is emailed "create an account with this email to access it".
- **DEF-05 (CODE):** if a Razorpay payment succeeds after the scheduler cancelled the order (1 h), the `cancelled → succeeded` transition is rejected and ignored (`payments.ts:canTransition`) — captured money, no fulfilment, no automatic refund.

## Legacy modules (inventoried, sampled)

Astrology (charts, Cosmic ID, daily sky, calendar, bonds), learning/LMS, commerce with physical goods, dating, matchmaking + Family Bridge, expert consultations, weddings + vendors, community groups, stories, DMs. Integration journeys B–J pass for these. They are **implemented**, but they are not the product now being positioned, they are enabled by default, and their feature flags (except circles/play) are not enforced server-side (SEC-08).
