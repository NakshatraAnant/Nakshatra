# 09 — Product and Growth Readiness

This document separates **implementation evidence** (what the code and the running app show) from **strategic hypotheses** (judgement, marked *Hypothesis*). No user research, market data or analytics from real users exists in this repository, and none is invented here.

## 1. Positioning

**What the public site says (evidence):** "A personality-led social network. Discover your kind of person." Four pillars: Identity (24 archetypes), Expression (Thought Drops, pen names), Belonging (private circles), Play (12 games). Astrology is "optional". No AI, no fake activity, no punishing streaks, private by default.

**What the signed-in product presents (evidence):** the four pillars plus a full astrology suite, Journey/rewards, Learn (courses/certificates), Shop (reports, books, rudraksha, gemstones, ritual supplies, seller studio), and a "Labs" group with community feed, messages, dating, matchmaking, experts and weddings. Global search scope: "people, experts, courses, products". Cart icon in the header.

**Who is it for?** The copy and prompts (chai vs coffee, college gang, Sunday football, group chats, Pune street food) target urban Indian young adults in existing friend groups. *Hypothesis:* 18–28-year-olds who already have WhatsApp groups and want something to *do* together.

**What problem does it solve?** *Hypothesis:* "Give my friend group light, structured reasons to talk and learn about each other." The archetype is the hook; circles + games + daily question are the retention mechanism.

**Differentiation (evidence-based):** transparent rules (documented scoring and ranking), honest labelling, no AI, no streak pressure, pen names, private circles, India-specific content. *Hypothesis:* personality quizzes and friend-group games are a crowded, low-moat space; the differentiation is tone and privacy, which the current privacy defects undermine.

**Is the promise clear?** Signed out — yes. Signed in — no (see `05`).

## 2. Activation

| Step | Evidence | Friction |
|---|---|---|
| Landing → "Find your archetype — no account" | 1 click | none |
| 20 statements in 4 steps | ~20 clicks, ~2 min | none observed |
| Result | Strong reveal (name, signature, traits, dimensions, reasons) | No share before signup; "Clear match" even for straight-lined answers |
| Save → signup | Email, password (≥10 chars), display name, 18+ and terms checkboxes | Standard |
| Email verification | Required before posting a Thought Drop, creating groups/events | Thought Drops blocked until the email arrives (SMTP not yet configured in production) |
| Onboarding | Preview answers carried over; birth details optional | Good |
| First meaningful action | Tracked: first Thought Drop, ritual answer, game round or circle join (`services/activation.ts`) | A ritual answer counts, so activation can be reached alone |

**First meaningful action (as defined in code):** any of thought / ritual / game / circle. **Time to value:** the archetype reveal arrives in ~2 minutes without an account — excellent. **Likely drop-off points** (*Hypothesis*, consistent with the flow): after the reveal (no share, must create an account to keep it), at email verification, and on Home when circles/games are empty.

## 3. Retention

| Loop | Evidence | Assessment |
|---|---|---|
| Daily rituals | 4 personal + 1 circle question per day/week; no streaks; no notifications | Low pull for solo users; a circle question is the strongest loop, but requires a circle |
| Circles | Invite links, circle feed, recap, levels, activation at 3 contributors | Good mechanics; empty for users without friends who join |
| Games | 12 real games; 11 need 2+ players; polling every 3 s; no rematch | Engaging for a group in the same moment; three are currently broken by leaks |
| Feed | Ranked by follows/interests/recency; 14-day window | Effectively empty for new users (default-private profiles hide "public" posts from non-followers) |
| Notifications | In-app only; email only for security/orders/bookings; **no push** | Nothing brings people back unless they remember |
| Gamification | XP, levels, achievements, cosmetic unlocks | Mild; points have no use beyond cosmetics |

**What could prevent return** (*Hypothesis* grounded in the above): no external re-engagement channel, single-player experience is thin, and the social value depends on friends arriving at the same time.

## 4. Virality

| Mechanic | Evidence | Gap |
|---|---|---|
| Identity card share | Story/square PNG via Web Share on touch devices, download on desktop (`studio.tsx:170-185`, `lib/cosmic.ts:149`) | **Only after signup**; share payload contains **no URL and no referral code**; card prints "Find your kind of person — Nakshatra" with no address; **no analytics event** is emitted for persona card shares |
| Circle invite link | `APP_ORIGIN/c/join/<token>`; public preview shows circle name, size, inviter | Link previews in WhatsApp will show the generic site meta (SPA, relative 1.3 MB `og:image`) |
| Referral | Code + link (`/signup?ref=`), rewarded only after activation; rules shown in plain language | Understandable and abuse-resistant; reward (points) has little value |
| Public identity page `/i/:handle` | Exists | Profiles are private by default → most links 404 for strangers |
| Thought Drop sharing | Not implemented | — |

*Hypothesis:* the natural loop is "take the quiz → share archetype → friend takes quiz → start a circle → play". Today the first share step is the weakest link in that chain.

## 5. Monetisation

| Offer | Evidence | Assessment |
|---|---|---|
| ₹29 Card Style Pack (2 cosmetic styles) | Seeded product; entitlement unlocks card styles server-side | Clear, low price, cosmetic only — appropriate |
| ₹99 Expanded Identity Report | 20 written sections from your answers + nearest archetypes; "already free vs adds" disclosure on the product page | Honest framing; value depends on content quality (not evaluated) |
| Nakshatra+ ₹199/month, ₹1,999/year | Astrology benefits (reports, themes, chart snapshots) | Belongs to the old product; confusing next to identity offers |
| Astrology reports ₹299/₹399, course ₹499, physical goods | Seeded (physical items labelled sample) | Off-positioning |
| Payments in production | `PAYMENT_PROVIDER=none` | Offers visible, checkout fails (DEP-03) |

Monetisation dependencies that could harm UX: gift paths are broken (DEF-01/02); late payment after order expiry is not refunded (DEF-05).

## 6. Analytics coverage

Events are first-party rows in `analytics_events` with a documented taxonomy (`lib/context.ts:31-90`) and an admin view computing Weekly Meaningful Cosmic Users.

| Metric needed | Tracked? | Event / gap |
|---|---|---|
| Acquisition source / campaign | **No** | No UTM, referrer or landing-source capture |
| Landing views | Yes (anonymous) | `landing_viewed` |
| Registration | Yes | `signup_completed` (with `referred` flag) |
| Assessment preview completed | Yes (anonymous) | `personality_preview_completed` |
| Assessment saved / archetype reveal | Yes | `assessment_completed` |
| Preview → signup click | **No** for persona preview | only `cosmic_id_preview_signup_clicked` exists (astrology path) |
| **Archetype card share** | **No** | `PersonaShare` posts no event; `cosmic_id_shared` only covers astrology cards |
| Referral conversion | Partial | `referral_approved`; no event for link visits |
| Activation | Yes | `first_meaningful_action` |
| Circle participation | Yes | `circle_created`, `circle_invite_created/accepted`, `circle_activated` |
| Game participation | Yes | `game_started`, `game_round_played`, `game_completed` |
| Ritual participation | Yes | `ritual_responded` |
| Retention cohorts | Derivable | from events by user and date; no built-in cohort report beyond WMCU |
| Paid offer viewed | **No** | `offer_viewed` defined but never emitted (grep) |
| Checkout / revenue | Yes | `checkout_started`, `product_ordered` |
| Email verification completed | **No** dedicated event | — |
| Funnel drop-off per assessment step | **No** | — |

## 7. Readiness verdict (product)
- The **hook** (account-free archetype reveal) is ready and good.
- The **trust promise** (pen names, private circles) is not ready — it is currently false in four verified ways.
- The **social loop** is mechanically complete but cold-start-hostile, and its key share step is under-built and unmeasured.
- The **product boundary** is unclear: about two-thirds of the shipped surface belongs to a different product.

*Hypothesis:* the fastest path to learning whether this product works is a closed beta with friend groups (circles of 3–8), measuring preview→signup, share rate, invite acceptance, circle activation and week-2 return — after fixing the privacy defects and hiding the legacy modules.
