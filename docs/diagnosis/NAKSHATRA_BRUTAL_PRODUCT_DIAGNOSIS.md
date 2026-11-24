# Nakshatra: product diagnosis

_Prepared 2026-10-25. Scope: the repository at `C:\Users\anant\Desktop\Nakshatra` (uncommitted working tree on `master`), the running local build at http://localhost:3000, the dossier `Nakshatra_Complete_Product_and_Technical_Dossier.docx`, the earlier strategy report `NAKSHATRA_Master_Strategic_Report` (dated 29 Sep 2026) and public web sources accessed 2026-10-25. Nothing in the product, database or architecture was changed to produce this report._

## Corrections (added later on 2026-10-25)

Two observations in the first version of this report were wrong. Both were found while implementing the follow-up work and checking the code more closely:

1. **Email verification does not block the first result.** After signup the app goes straight to onboarding (`useAuthSuccess` in `src/web/pages/auth.tsx`). Verification is needed only for posting, dating and bookings. The path to first value was about five steps, not "five steps plus an inbox round-trip".
2. **Private Bonds already require the user to attest consent.** Both the form and the API (`consentConfirmed: z.literal(true)` in `src/server/modules/bonds.ts`) require "They have given me permission to use their birth details here." The remaining risk is that this is self-attested, not verified. It is lower than "without their consent" implied.

The sections below keep the original wording where these points appear, so the history is visible. Read them with these corrections.

## Evidence labels

Each finding carries one label:

| Label | Meaning |
|---|---|
| **[Verified]** | Checked directly by running a command or reading the code during this diagnosis |
| **[Observed]** | Seen in the code, the UI, the data or the test specs, but not measured with users |
| **[Founder]** | Claimed in the dossier or the prior report, and not re-checked here |
| **[External]** | Published third-party source, cited in §25 |
| **[Inference]** | My reasoning from the evidence above |
| **[Hypothesis]** | A testable bet, to be confirmed or killed by an experiment in §22 |
| **[Unknown]** | Nobody has this information yet |

---

## 1. Executive verdict

**Nakshatra is an engineering success and a business non-event. It has not been tested once against a real customer.**

- **[Verified]** It is a large, working, well-tested codebase: 15 server modules, 343 API routes, 129 database tables, 3 migrations.
  - Re-run today: typecheck passes, lint passes, and 118/118 unit and integration tests pass.
- **[Verified]** It has no users. The development database holds 10 accounts, all seed or test accounts. No analytics event from a real person exists anywhere.
- **[Inference]** The product does not have one job. Its landing page offers six pillars:
  - Cosmic ID
  - daily ritual
  - Bonds
  - Panchang/muhurat
  - Learn + experts
  - dating → wedding

  Each pillar is a different business, with a different customer, a different competitor and a different trust profile.
- **[Observed]** The thing users would actually come for, the words that interpret their chart, is the thinnest part of the build:
  - About 6,500 unique words of interpretation in total.
  - Most of it comes from templates.
  - The same paragraph is reused across the Western and Vedic systems.
  - There is no Hindi body text.
- **[Observed]** The ₹299 "Complete Vedic Birth Chart Report" mostly re-sells those same free interpretations, plus calculation tables.
- **[Founder] / [Inference]** The prior strategy report (29 Sep 2026) already said the full "Cosmic OS" was **not supported by evidence**. It recommended a narrow identity + compatibility wedge. The full platform was built anyway.

  The most important strategic fact about Nakshatra today is not a market fact. It is that the evidence was available, and the build went the other way.

**Verdict: Continue, but only as a narrowed product, behind a hard validation gate.**

- **Freeze the platform.** Hide dating, matchmaking, weddings, the shop (except the reports Nakshatra itself sells), courses, gamification, social and the expert marketplace from new users. Don't delete them.
- **Ship one thing:** a no-signup Cosmic ID plus a consent-based two-person compatibility ("Bond") report, with a paid full pair report and a gift option.
- **Earn the right to continue within 90 days.** The pass marks are in §23. Interviews come first.
- **Stop if, after two content iterations, fewer than about 1 in 100 people who complete a free compatibility preview will pay ₹149–299 for the full report.** That would mean the wedge does not monetise and the remaining modules will not rescue it.

What would make me wrong:
- **[Unknown]** Nakshatra may have a distribution asset this analysis cannot see: a community, a creator partnership, or a family matchmaking network. That would change the wedge choice.

## 2. The actual product today

**[Verified]** What exists, measured from the repository on 2026-10-25:

| Area | Size |
|---|---|
| Astrology engine `src/astro` (pure TypeScript on astronomy-engine, MIT) | 3,348 lines |
| Interpretation and daily content `src/content` | 619 lines |
| Server modules `src/server/modules` | 5,882 lines, 343 routes |
| Server lib, services, db | 1,080 + 575 + 2,045 lines |
| Web pages, components, 3D, charts | 5,834 + 1,083 + 724 + 259 lines |
| Tests (`tests`, `e2e`) | 983 + 951 lines |

**[Observed]** Stack and how it runs:
- Vite + React 19 SPA, Fastify 5 API, Drizzle ORM.
- Embedded PGlite locally, PostgreSQL in production.
- One local process serves everything at http://localhost:3000 (`npm run local`).
- 3D Cosmic ID uses React Three Fiber, with a full 2D fallback.
- No AI anywhere (an owner rule). Interpretations are deterministic rules in `src/content/interpretations.ts`.

**[Observed]** What a person can do in the current build:
- create an account and verify email
- enter birth data
- receive a six-layer Cosmic ID (3D or 2D) with a downloadable share card
- view Western and Vedic charts (North/South Indian), Panchang, festivals and muhurat
- get a daily briefing with a ritual and a reflection prompt
- create Bonds (invite another user, or a private Bond using birth data the user types in) with compatibility dimensions and Guna Milan
- post socially and message
- use a dating module and a matchmaking module
- book experts (with a dev payment simulator)
- take courses with quizzes and XP
- buy reports and sample products
- run a wedding-planning workspace with vendors, budget and family permissions
- export or delete their data
- use an 18-section admin console

**[Verified]** Commercial status:
- Razorpay is integrated but only tested against a local fake. There is no merchant account.
- SMTP is tested against an in-process server only.
- Prices are seeded placeholders (`src/server/db/seed.ts`):
  - Nakshatra+ ₹199/month or ₹1,999/year
  - Vedic report ₹299, Year Ahead ₹399, Western report ₹249
  - 20% expert commission
- Every expert, vendor and product in the database is labelled sample data.

**[Unknown]** The dossier mentions an earlier archetype prototype at `yournakshatra.lovable.app` (archetypes such as "Velvet Void" and "Moon Static"). None of those archetype names exist anywhere in `src/` or in `nakshatra_mvp.html` **[Verified]**. If that prototype was the original identity hook, it was lost in the rebuild. I did not audit that site.

## 3. Technical status versus business status

| Dimension | Status | Label |
|---|---|---|
| Builds, typechecks, lints | Pass (re-run 2026-10-25) | [Verified] |
| Unit and integration tests | 118/118 pass (re-run 2026-10-25) | [Verified] |
| Browser e2e | 20/20 reported on 2026-10-24; **not re-run today** | [Founder] (prior session's report) |
| Calculation correctness | Reference-tested. Two festival rules and one house bug were found and fixed on 24 Oct, which shows the engine *had* errors that tests missed until a visual check | [Observed] |
| Production deployment | None. Docker and PostgreSQL server unverified (WSL 2 missing) | [Verified] |
| Live payments / email | None (no merchant account, no SMTP provider) | [Verified] |
| Legal (terms, privacy, grievance officer) | Drafts only | [Observed] |
| Real users | 0 | [Verified] |
| Customer interviews | 0 known | [Unknown]: none in the dossier |
| Revenue | ₹0 | [Verified] |
| Retention, activation, conversion data | None. A 30-event analytics taxonomy exists (`src/server/lib/context.ts`) but has only recorded test traffic | [Verified] |
| Brand/trademark clearance | Not done. Several "Nakshatra"-named apps exist | [External] |

**[Inference]** The technical side is roughly at 'closed beta'. The business side is at 'idea': nobody has yet asked a customer whether they want this. Spending more engineering time before that question is answered will widen the gap, not close it.

## 4. Complete feature inventory

The full per-feature decision list is in `FEATURE_DECISION_REGISTER.csv`. The table below has one row per module.

| Module (server lines / routes; page lines) | What it does | Readiness | Value to a first-time user | Label |
|---|---|---|---|---|
| auth (290 / 17; 263) | Signup, email verification, sessions, throttling, password reset | Solid | Barrier, not value | [Observed] |
| profile + account (268 / 14, 287 / 20; settings 342) | Birth profile, visibility, export, delete | Solid; privacy controls are a genuine strength | Trust signal | [Observed] |
| astro (493 / 33; chart 373, calendar 176) | Western/Vedic charts, dasha, yogas, divisional charts, Panchang, festivals, muhurat | Engine is the best asset in the repo | High for enthusiasts, opaque for casual users | [Observed] |
| identity (identity 365) | Six-layer Cosmic ID, 3D/2D, PNG share card | Works; its text comes from the thin content packs | **Core** | [Observed] |
| today/journey (124 / 3; today 248, journey 275) | Daily briefing, ritual, reflection, saved insights, XP | Works; content pools repeat within weeks (§6) | Retention attempt, weak | [Observed] |
| bonds (415 / 18; 392) | Invite or private Bond, compatibility dimensions, Guna Milan, share links, revocation | Works; best consent design in the app | **Core** | [Observed] |
| social (597 / 37; 414) | Feed, posts, comments, follows | Works; empty with 0 users | Negative while empty | [Inference] |
| messaging (194 / 9; 139) | Polling chat | Works | Only matters once dating, matchmaking or experts are live | [Observed] |
| dating (276 / 12; 201) | Profiles, discover, likes, matches, report/unmatch | Works | Needs liquidity; Tinder ships astrology natively | [External] |
| matchmaking (328 / 19; 324) | Family-style matchmaking | Works | Matrimony incumbents; high safety burden | [Inference] |
| weddings (538 / 34; 426) | Projects, family permissions, vendors, quotes, budget | Works | A separate business (wedding SaaS) | [Inference] |
| experts (462 / 25; 380) | Expert listings, availability, booking, payouts, refunds | Works with sample experts | Astrotalk/InstaAstro dominate; supply acquisition needed | [External] |
| commerce (487 / 27; shop 471) | Cart, checkout, stock, refunds, reports, sample physical goods | Works; physical goods are samples | Reports: yes. Goods: no | [Observed] |
| learning (379 / 21; 298) | Courses, lessons, quizzes, XP, achievements | Works with one sample course | Low; content does not exist | [Observed] |
| admin (657 / 54; 376) | 18 sections: moderation, verification, refunds, content, ops | Works | Internal | [Observed] |

**[Inference]** About 60% of server routes serve modules that only make sense once the core has many users: social, dating, matchmaking, weddings, experts, learning and admin moderation. Those modules come to about 260 of the 343 routes.

## 5. End-to-end user journey analysis

**[Observed]** The path from the landing page to first value, taken from `src/web/pages/landing.tsx`, `auth.tsx` and the onboarding pages, and confirmed by e2e spec `a-new-user`:

1. **Landing.** The headline reads "Your cosmic identity, precisely calculated". It offers six pillars and two CTAs ("Create your Cosmic ID", "How we calculate"). **No example output is shown anywhere.**
2. **Signup.** Name, email, password, an 18+ checkbox and terms.
3. **Email verification.** The person leaves the app for their inbox (the dev mailbox locally).
4. **Onboarding intro.**
5. **Birth form.** Date, time precision, time, place, consent.
6. **Interests and preferred system.**
7. **Cosmic ID.** First value.

**[Inference]** That is about six steps and an inbox round-trip before any output. Competitors with an identity hook show something much sooner: 16Personalities gives the full result with no account, and Co-Star asks for birth details first, then the account. Every one of those steps leaks users. I have no funnel data of my own **[Unknown]**, so I can't say how much each step costs. The direction is not in doubt.

**[Observed]** The relationship journey (spec `b-relationship`):
- An invite link goes out, and the other person must **create a full account and accept** before anyone sees compatibility.
- The alternative is a "private Bond", where the user types in someone else's birth details. That is easy, but it means processing a third party's personal data without that person knowing (§20).
- The *consented* path is the slow one, and the *non-consented* path is the fast one. For a product whose pitch is "Private by default", that is backwards.

**[Observed]** The paid journey: Shop → report → checkout → dev payment → report document. The report is generated from the same `interpret()` rules shown free in Chart and Cosmic ID (`src/server/services/reports.ts`).

**[Inference]** Someone who has already explored their chart will find little new text in the ₹299 report. The added value is the tables (divisional charts, ashtakavarga, dasha dates) and the packaging. That is a refund and review risk.

## 6. The brutal UX and content audit

### Content quantity and quality

**[Verified]** Measured from `src/content/*.ts`:

- **276 interpretation rules, 264 unique bodies, about 6,545 unique words.** For comparison, a single long-form app horoscope reading is often 300–600 words **[Inference]**.
- **0 Hindi interpretation bodies.** Hindi covers only navigation and UI strings, for a product whose launch market is India **[Founder]**.
- **Cross-system duplication.** The Western "Sun in Taurus" body is identical to the Vedic "Surya in Vrishabha" body. Moon/Rashi and Ascendant/Lagna also reuse their text. Someone who toggles systems, which is the "bilingual Vedic/Western" selling point, reads the same paragraph twice.
- **144 house interpretations are one template.** Example: "Venus represents love, beauty and values. In the 7th house — partnership, marriage and one-to-one relationships — it traditionally finds pleasure and harmony in this area of life."

  That sentence is accurate and generic. It is also the kind of text a reader screenshots *to mock*, not to share.
- **Daily content pools:**

  | Pool | Entries |
  |---|---|
  | Moon-transit notes | 12 |
  | Tithi notes | 16 |
  | Moon-phase notes | 8 |
  | Dasha themes | 9 |
  | Reflection prompts | 30 |
  | Rituals | 14 |
  | Lessons | 12 |
  | Daily colours (one per weekday) | 7 |

  **[Inference]** A daily user will see a repeated ritual within about two weeks and a repeated lesson within two. The daily habit loop runs on a supply of content that is gone in a fortnight.

### Interface

- **[Observed]** The visual polish is real:
  - axe WCAG A/AA finds 0 serious issues on 22 routes **[Founder]** (prior session)
  - 0 px horizontal overflow on mobile
  - working 3D with fallbacks
- **[Observed]** Navigation exposes about 18 page areas. A first-time user sees dating, weddings and shop next to their own chart. **[Inference]** This says "super-app" before the product has earned one use.
- **[Observed]** The landing page tells, it doesn't show: no sample Cosmic ID, no sample compatibility, no testimonial (correctly, since none exist).
- **[Observed]** Disclaimers are good, honest and everywhere. This is a trust asset, and Nebula's complaint history is the counter-example **[External]**.
- **[Inference]** The 3D Cosmic ID is visually impressive. But the share card is a static PNG of a 600×440 render. It isn't designed for Instagram Stories (9:16) or WhatsApp status, which are the two places Indian 18–30-year-olds would actually post it.

### Brand

- **[External]** "Nakshatra" is also used by:
  - "Nakshatra Jyotish" on Google Play (about 500k downloads, last updated 2021, per AppFollow)
  - "MyNaksh: AI Astrology & Kundli" (Play developer page)
  - "Naksh: Vedic Matchmaking" (iOS, listed on mwm.ai)
  - a "Nakshatra AI" directory entry
  - a Russian iOS app, "Накшатра"

  The prior report also noted a jewellery brand **[Founder]**.
- **[Inference]** The name is a common Sanskrit astrological term. That makes it hard to protect in the astrology class, and hard to find in app-store search. Trademark counsel is needed before any spending on brand.

## 7. Twenty-two hard truths

1. **[Verified]** Nobody has used Nakshatra. 10 accounts, all seed or test.
2. **[Founder]/[Inference]** The prior strategy report said not to build the full platform, and the full platform was built. Unless the decision process changes, more research will not change the outcome.
3. **[Verified]** The interpretation content, about 6.5k words, is smaller than the admin module's code.
4. **[Verified]** The Western and Vedic layers share body text, so the "two systems" differentiator is partly cosmetic today.
5. **[Verified]** No Hindi body content exists, in an India-first product.
6. **[Observed]** The ₹299 Vedic report re-packages interpretations the user already saw free.
7. **[Observed]** Time-to-first-value is about six steps plus an email round-trip. Comparable identity products show value before or at signup.
8. **[Observed]** The landing page shows no output, so it asks for trust before earning it.
9. **[Observed]** The fast way to get compatibility (a private Bond) skips the other person's consent. The consented way requires them to sign up.
10. **[Inference]** Social, dating and matchmaking are empty rooms until thousands of local users exist. A new user who lands in an empty feed is told the product is dead.
11. **[External]** Tinder launched an Astrology Mode in 2026, with a Mumbai campaign. Astrology-flavoured dating is now a feature of incumbents, not a startup opportunity.
12. **[External]** The Indian astrology money is in live consultations. Astrotalk reported about ₹1,176 cr operating revenue in FY25, mostly consultations. That market is won by supply scale and performance marketing, and Nakshatra has neither.
13. **[External]** Astrotalk offers a free first chat and InstaAstro a ₹1 first consultation. Competing on expert price is a subsidy war.
14. **[External]** AstroSage gives free Kundli, matching and Panchang. Calculation accuracy alone is a commodity in India.
15. **[External]** Midjourney bought Co-Star (announced July 2026). Well-funded players are moving on AI-personalised astrology. The no-AI rule makes Nakshatra's text more costly to produce per user, which the content gap already shows. It is also a defensible position ("calculated, not generated") only if the hand-written content is better.
16. **[Inference]** The wedding-planning module is a separate SaaS business with a different buyer (families and planners) and its own competitors. It is scope creep, not an extension.
17. **[Observed]** The daily ritual runs out of fresh content in about two weeks.
18. **[External]** Category Day-30 retention for lifestyle-type apps is in the low single digits (Braze lists about 3–4% for Health & Fitness). A daily-habit astrology subscription starts from that base.
19. **[External]** Trial-to-subscription complaints are the main reputational risk in the category (Nebula), and India's CCPA lists "subscription trap" as a banned dark pattern.
20. **[Inference]** "Nakshatra" is generic and contested. Brand spending before clearance is money at risk.
21. **[Inference]** The 3D work is the most expensive part of the UI per unit of user value. It impresses in a demo. Whether it drives shares or payment is untested **[Unknown]**.
22. **[Verified]** The analytics taxonomy is ready (30 events), but no dashboard, cohort view or funnel exists to read it. Nakshatra could get users tomorrow and still not know what they did.

## 8. Industry and consumer research

Full sources with dates are in §25 and `EVIDENCE_AND_SOURCE_REGISTER.md`. All were accessed 2026-10-25.

### India

- **[External]** Astrotalk FY25:
  - total income about ₹1,214 cr, operating revenue about ₹1,176 cr (FY24 about ₹651–656 cr)
  - reported profit figures differ by source: Outlook Business cites adjusted PBT of about ₹285 cr, while Inc42 reports PAT of about ₹33 cr
  - expects about ₹1,850 cr in FY26 (company claim)
- **[External]** InstaAstro:
  - FY26 revenue ₹111.26 cr (FY25 ₹52 cr), annualised run-rate above ₹200 cr
  - about 25% international
  - $12M Series A
- **[External]** Market size (MarkNtel, via Entrepreneur India): India's astrology app market is put at $163M in 2024, rising to $1.8B by 2030. This is a market-research-firm projection: **low confidence**, and not used for planning here.
- **[External]** User demographics (iMeUsWe data via Storyboard18, March 2026): about 60% of digital astrology users are women and 63% are aged 18–30. This is one company's user base, not a national sample.
- **[Founder]** The prior report estimated that about 60% of Astrotalk questions relate to marriage or relationships (low confidence).
- **[External]** Matrimony.com:
  - FY26 revenue about ₹460 cr
  - about 0.96M paid subscriptions (via the prior report)
  - a stagnant incumbent, yet kundli matching remains a ritual in arranged marriage **[Inference]**
- **[External]** Distribution costs:
  - Razorpay: 2% + 18% GST per transaction, including UPI
  - Google Play India: a service fee of 15% or less for most developers, minus 4 percentage points with alternative billing

### Global

- **[External]** Pew (May 2025): 28% of US adults consult astrology, tarot or fortune tellers at least yearly, and 43% of women aged 18–49 believe in astrology. Most say they use it for fun.
- **[External]** Co-Star:
  - 4.3M users (a Sensor Tower estimate)
  - acquired by Midjourney (announced 24 Jul 2026)
  - pricing: Pro-Star $8.99/month, Year Ahead $11.99, packs $2.99–6.99
- **[External]** CHANI: $11.99/month or $107.99/year, with free horoscopes.
- **[External]** The Pattern: $20.99 per quarter or $83.99 per year (2024 data).
- **[External]** Etsy birth-chart art: digital posters $4–7, engraved wood about $27, personalised books about $87.

  **[Inference]** People pay for a *physical or gifted artefact* of their chart, separately from readings.
- **[External]** Spotify Wrapped 2024 is the reference for shareable identity artefacts. Secondhand figures: about 250M users in 65 hours and 575M shares.

  **[Inference]** The mechanic that matters is a free, personal, pre-formatted, platform-native card.

### What this means for Nakshatra

1. **[Inference]** Indian astrology demand concentrates on two things: **relationships/marriage** and **live human guidance**. The second is owned by funded marketplaces.
2. **[Inference]** Identity astrology (Co-Star, The Pattern) works when the *text* feels personal and the *artefact* is shareable. Nakshatra has the artefact machinery but not yet the text.
3. **[Inference]** Compatibility is the one job that is relationship-focused, naturally viral (it needs a second person), and not dominated by a marketplace.

## 9. Competitor analysis

| Competitor | Job they win | Model | Threat to Nakshatra's wedge | Where Nakshatra can differ | Label |
|---|---|---|---|---|---|
| Astrotalk | "Talk to an astrologer now" | Per-minute consults, free first chat | High for experts; low for self-serve compatibility | Don't compete on consults | [External] |
| InstaAstro | Same, plus poojas | ₹1 first consult, poojas | Same | Same | [External] |
| AstroSage | Free Kundli/matching for Vedic users | Free tools, paid consults, AI | **High**: free Guna Milan exists | Design, explanation, two-person consent, shareability | [External] |
| Co-Star | Daily identity texts, friend comparison | Freemium, IAP | Medium (global, AI-led, now Midjourney-funded) | Vedic + Indian context; no-AI "calculated" stance | [External] |
| CHANI | Thoughtful astrology and wellness | Subscription | Low in India | — | [External] |
| The Pattern | Deep psychological identity and bonds | Subscription | Medium: closest to the Bond idea | Vedic, India pricing, consent | [External] |
| Nebula | Readings, psychics | Trial → subscription | Low; **cautionary** on trust | Honest billing as a differentiator | [External] |
| Tinder Astrology Mode | Signs in dating | Free feature in an incumbent | **Kills** the dating module | Not a dating app | [External] |
| Matrimony.com / Shaadi / Jeevansathi | Arranged-marriage matching | Paid subscriptions | High for matchmaking module | Explainer for families, not matching | [External]/[Inference] |
| 16Personalities | Free identity result, paid depth | Free test → paid suite | Analog, not a competitor | Copy the funnel: value before account | [External] |
| Etsy chart art | Gift artefact | One-off | Low; validates WTP for artefacts | Auto-generated from real calculation | [External] |

**[Inference]** No incumbent clearly owns *"a beautiful, explainable compatibility report for two people, where both consent, in Vedic and Western, priced for India"*. AstroSage owns the free version and The Pattern owns the global version. That gap is narrow, and it can be copied in a quarter. Nakshatra's only durable advantages would be **content quality, trust, and the share loop**. None of those exists yet.

## 10. Customer problems and Jobs to Be Done

All JTBDs below are **[Hypothesis]**. No customer has been interviewed **[Unknown]**. The interview plan is in `CUSTOMER_JTBD_AND_RESEARCH_PLAN.md`.

| # | Job: "When…, I want to…, so I can…" | Who | Current alternative | Evidence for it |
|---|---|---|---|---|
| J1 | When I start liking someone, I want to see how our charts fit, so I can talk about us playfully and feel reassured | 18–30, urban, English-first, often women | Co-Star friends, AstroSage matching, Instagram reels, asking a friend | Tinder's 2026 launch; 63% of users aged 18–30 (single source) [External] |
| J2 | When my family raises a match, I want to understand what the Guna score really means, so I'm not cornered by a number | 22–32 facing arranged-marriage conversations | Family astrologer, AstroSage printout | Prior report: about 60% of consult topics are marriage-related (low confidence) [Founder] |
| J3 | When I discover my sign or nakshatra, I want something that captures "me" to share, so friends see who I am | 18–25 | Co-Star, Instagram filters, 16Personalities | Spotify Wrapped and 16Personalities share behaviour [External] |
| J4 | When a friend or partner's birthday comes, I want a personal gift that isn't generic | 20–35 gift buyers | Etsy chart posters, flowers | Etsy listings at $4–87 [External] |
| J5 | When I feel anxious about a decision, I want guidance from a person | Broad | Astrotalk, InstaAstro | Market size [External]; not Nakshatra's job |
| J6 | Each morning, I want a short ritual, so I can feel grounded | Wellness-minded | CHANI, Co-Star, Calm | Low D30 retention benchmarks [External] |

**[Inference]** J1, J3 and J4 together form one loop: discover → share → compare → gift. J2 is a high-intent but sensitive adjacent segment. J5 and J6 are real, but they are other companies' jobs.

## 11. Product-market-fit hypotheses

| ID | Hypothesis | Pass signal | Kill signal |
|---|---|---|---|
| H1 | People will give birth data without an account if they see a sample result first | ≥40% of landing visitors who start the form finish it | <15% |
| H2 | A good Cosmic ID gets shared | ≥8% of completers share or download the card | <2% |
| H3 | Compatibility pulls a second person in | ≥25% of compatibility initiators get a partner to enter their own data | <8% |
| H4 | The pair report sells | ≥1.5% of free-preview viewers pay ₹149–299 | <0.5% after two content iterations |
| H5 | Gifting adds revenue on top | ≥15% of paid reports are gifts | <3% |
| H6 | Users trust the method more than "AI astrology" | In interviews, ≥50% say "calculated, explained" matters | Indifference |
| H7 | Families want a Guna explainer | ≥5 of 10 J2 interviewees would pay ₹299+ | <2 of 10 |

All rows are **[Hypothesis]**, and the thresholds are my judgement **[Inference]**, set from the cost of acquisition in §18 rather than from benchmarks. No astrology-specific conversion benchmark was found **[Unknown]**.

## 12. Strategic options

| Option | Description | For | Against | Verdict |
|---|---|---|---|---|
| A. Full Cosmic OS (current build) | Keep all modules, launch broadly | Already built | Many cold-start marketplaces at once; no focus; trust surface huge | **Reject** |
| B. Expert marketplace | Compete with Astrotalk | Biggest revenue pool | Subsidy war, supply ops, trust/regulatory risk | **Reject** |
| C. Dating / matchmaking | Astro-dating app | Real interest | Tinder has it; liquidity; safety | **Reject** |
| D. Identity + compatibility (Bond) | No-signup Cosmic ID → consented pair report → paid report/gift | Viral by nature; uses the best assets (engine, consent design, 3D); low ops | Easy to copy; content must get much better; WTP unproven | **Recommend** |
| E. Family Guna explainer (B2C) | Kundli-match explainer for arranged-marriage families | High intent, India-specific | Sensitive; competing with free AstroSage; family dynamics | **Test as a variant of D** |
| F. B2B API / white-label engine | License the MIT-based engine to apps or matrimony sites | Engine is good; low trust risk | Commodity calculations; long sales | **Defer**; revisit if D fails but the engine draws interest |
| G. Daily wellness subscription | CHANI-style daily ritual | Recurring revenue | Content cost; low retention base | **Defer** until D shows retention |
| H. Stop | Archive, keep code | Saves time | Discards a strong engine before one test | **Only after the §23 gates fail** |

## 13. Recommended positioning and strategic wedge

**Wedge [Hypothesis]: "See how you two fit — calculated, explained, and only with both of you."**

- **For:** Indian and Indian-diaspora people aged 18–30, English-first and Hinglish-comfortable, who use astrology for fun and conversation, especially about relationships.
- **The product:** a two-person compatibility report that both people opt into. It shows Vedic Guna Milan *explained* and Western synastry side by side, with an honest note on what the numbers do and don't mean.
- **The hook:** a free personal Cosmic ID that needs no account.
- **The payment:** a full pair report, or a gift report.

Why this one:
1. **[Observed]** It uses Nakshatra's three real assets:
   - the calculation engine
   - the consent model in `bonds.ts` (share scopes, revocation, the `/shared-report/link/:token` public route)
   - the Cosmic ID visuals
2. **[Inference]** It is the only option where each new user can bring in the next one by design.
3. **[Inference]** It avoids every marketplace cold start.
4. **[Inference]** "Calculated and consented" is a credible stance against both AI-generated astrology and opaque Guna printouts. It holds only if the content gets better, which is the main investment.

**Positioning statement [Hypothesis]:** "Nakshatra calculates what your charts actually say about the two of you, shows its working, and never reads anyone without their yes."

**What this is not:** a dating app, a matrimony service, an astrologer marketplace, a wedding planner, or a daily horoscope app.

## 14. The three-feature MVP

1. **Instant Cosmic ID: no account, under 60 seconds.**
   - Birth date, time (or "unknown") and place → three layers (Sun/Rashi, Moon/Nakshatra, Rising/Lagna) with a 9:16 story card and a WhatsApp-ready image.
   - The account becomes optional: offered only for saving.
   - **Reuses:** engine, identity page, share card.
   - **Must improve:**
     - New Vedic and Western texts, so the two systems don't duplicate each other.
     - Hindi/Hinglish versions of the three hero layers.
     - A visible sample on the landing page.
2. **Consented Bond preview.**
   - "Invite them to add their birth details" link. The partner enters their own details with no account, sees their own free Cosmic ID, and both get a free preview: three compatibility dimensions plus the Guna total with a one-line explanation.
   - **Reuses:** `bonds.ts` invite and scope model, Guna Milan, dimensions.
   - **Must change:**
     - The invitee does not need an account.
     - The private-Bond path goes behind a clear notice, or is removed for the MVP (§20).
3. **Paid full pair report, with gifting.**
   - All 8 kootas explained, the Manglik convention explained with its exceptions, Western synastry highlights, "conversation starters" (the reflection prompts already in `bonds.ts`), and a PDF/print-ready design.
   - A gift option: "Buy for a friend's pair", where the recipient enters their own data.
   - **Reuses:** commerce, entitlements, `reportDocuments`, the Razorpay adapter.
   - **Must add:** a `pair_report` template whose text is mostly new. It must not reuse the free text.

**Explicitly not in the MVP:** daily briefing, social, dating, matchmaking, weddings, experts, courses, gamification, physical shop, subscriptions.

## 15. Features to improve, remove, or defer

The full list is in `FEATURE_DECISION_REGISTER.csv`. "Hide" means behind a feature flag or off the navigation. **Nothing is deleted.**

- **Improve:**
  - landing (show output)
  - onboarding (no signup)
  - interpretation content (new Vedic text, Hindi)
  - share card (9:16)
  - Bond invite (no account for the invitee)
  - paid report (new content)
  - analytics (a simple funnel view)
- **Keep as is:** auth, privacy, export/delete, admin (internal), engine, chart page (as "depth" for enthusiasts), calendar/Panchang (SEO candidate).
- **Hide/defer:** daily briefing, journey/XP, social feed, messaging, dating, matchmaking, weddings, experts, courses, physical goods, Nakshatra+ subscription.
- **Remove from the MVP surface:** private Bonds with third-party data, unless a clear notice is added; Year Ahead (₹399) until its text goes beyond the 9 dasha themes.

## 16. Twenty-two monetization models

Scores and criteria are in `MONETIZATION_SCORECARD.csv`. Each model is scored 1–5 on user value, willingness-to-pay evidence, wedge fit, effort (inverted), trust safety, regulatory safety, margin and time-to-revenue, for a maximum of 40.

| # | Model | Score /40 | Note |
|---|---|---|---|
| 1 | One-time full pair compatibility report | 33 | Core of the wedge |
| 2 | Gift pair report | 32 | Etsy WTP analog; viral |
| 3 | Personal full Cosmic ID report (one-time) | 29 | Current ₹299 report, rebuilt with new content |
| 4 | Printed/framed Cosmic ID or pair art (print-on-demand) | 28 | Etsy evidence; partner ops |
| 5 | Family Guna explainer report (bilingual) | 28 | J2; sensitive |
| 6 | Creator/affiliate referral codes | 27 | Distribution more than revenue |
| 7 | Group/friends compatibility pack | 26 | Extension of 1 |
| 8 | Wedding-invite astrology artwork | 22 | Niche, seasonal |
| 9 | Annual "Year of Us" pair report | 22 | Needs new content |
| 10 | Nakshatra+ subscription (₹199/month) | 21 | Retention unproven; dark-pattern risk |
| 11 | B2B calculation API | 21 | Commodity |
| 12 | White-label for matrimony sites | 20 | Long sales |
| 13 | Muhurat / Panchang premium | 19 | AstroSage gives it free |
| 14 | Premium Cosmic ID themes/frames (IAP) | 19 | Small tickets |
| 15 | Year Ahead report | 18 | Content thin today |
| 16 | Courses | 15 | No content exists |
| 17 | Expert consult marketplace (commission) | 14 | Subsidy war, trust risk |
| 18 | Dating premium | 12 | Tinder |
| 19 | Matchmaking premium | 12 | Safety; incumbents |
| 20 | Wedding vendor commissions | 12 | Separate business |
| 21 | Ritual products / gemstones / rudraksha | 9 | Remedy-claim and authenticity risk |
| 22 | Advertising | 8 | Low eCPM at small scale; trust cost |
| — | **Selling or sharing identifiable birth data** | **Excluded** | Never: violates the consent model, and DPDP's purpose limitation [Inference] |
| — | **Fear-based remedies, auto-renew traps** | **Excluded** | CCPA dark-pattern guidelines [External] |

**[Inference]** All scores are judgement calls. A 3/5 for "WTP evidence" means analogous public prices exist; 5/5 would need Nakshatra's own sales, and no model has that.

## 17. Ranked top five monetization opportunities

1. **Full pair report.** Price test: ₹149 / ₹199 / ₹299.
   - Fits J1 directly, needs no new infrastructure, and pays once with no renewal.
   - **[Hypothesis]** It converts ≥1.5% of free previews.
2. **Gift pair report.** Same price plus a gift message.
   - Every gift brings in two new people.
   - **[Hypothesis]** ≥15% of paid reports are gifts.
3. **Family Guna explainer** (English + Hindi). ₹299–499.
   - **[Hypothesis]** Higher intent, and it pays more. Must be careful never to *recommend for or against* a marriage.
4. **Printed pair or Cosmic ID artwork** via a print-on-demand partner. ₹799–1,999.
   - **[External]** Etsy prices show demand for chart artefacts.
   - **[Unknown]** Indian print-on-demand partner margins.
5. **Creator affiliate codes** (10–20% revenue share on reports).
   - **[Hypothesis]** This is the cheapest way to acquire customers in the category.
   - **[Unknown]** Creator rates.

The subscription is **not** in the top five. It can return only once at least 20% of paying users come back unprompted within 30 days.

## 18. Unit economics and financial assumptions

Full model: `UNIT_ECONOMICS_MODEL.md`. Everything below is **[Hypothesis]** unless marked otherwise. The fee rates are **[External]**.

**Per paid pair report (web checkout, Razorpay):**

| | Low | Base | High |
|---|---|---|---|
| Price (incl. 18% GST) | ₹149 | ₹199 | ₹299 |
| Net of GST | ₹126.27 | ₹168.64 | ₹253.39 |
| Razorpay 2% + 18% GST on fee (2.36%) | ₹3.52 | ₹4.70 | ₹7.06 |
| **Contribution per sale** (marginal compute ~₹0) | **₹122.75** | **₹163.94** | **₹246.33** |
| Free-preview → paid conversion | 0.5% | 1.5% | 3% |
| Visitor → preview completion | 20% | 30% | 40% |
| **Revenue per 1,000 landing visitors** | ₹123 | ₹738 | ₹2,956 |
| **Break-even cost per visitor** | ₹0.12 | ₹0.74 | ₹2.96 |

Notes on the table:
- Revenue per visitor = completion × conversion × contribution.
- **[Inference]** GST applies only once the business is registered or above the threshold. Confirm with a tax adviser. Before registration, net revenue is higher.
- **[Inference]** The break-even cost per visitor is very low. Paid acquisition almost certainly won't work in the low and base cases. Growth must come from the share loop and creators. The real economic question is the **viral coefficient** (k): each paying user's invites must bring in about 0.3–0.5 new completers for organic growth to compound.
- **[Inference]** On Android in-app billing, Google's ≤15% fee would cut contribution by about ₹19–38. Stay on web checkout first.
- **Fixed costs [Inference]:**
  - hosting a single-process app is small
  - real costs are content writing (the main one), legal review, trademark search and filing, a Razorpay account (setup terms not verified here [Unknown]), and founder time
  - **[Unknown]** a content writer's rate

## 19. Acquisition and retention strategy

Full plan: `GROWTH_AND_RETENTION.md`.

- **Loop 1, share [Hypothesis]:** free Cosmic ID → 9:16 card → Instagram/WhatsApp → friend lands on a *pre-filled comparison invite* → their Cosmic ID → Bond preview.
- **Loop 2, pair [Hypothesis]:** compatibility needs a second person, so every Bond is a new user. Measure invites sent per completer, and partner completion.
- **Loop 3, gift [Hypothesis]:** gift recipients must enter their own data, so each gift is a new user who consented.
- **Seeding [Hypothesis]:** 10–20 micro-creators (astrology meme pages, relationship creators, Indian diaspora) on affiliate codes, rather than paid ads.
- **SEO [Inference]:** Panchang and festival pages are already computed. Static, indexable festival and muhurat pages could bring steady search traffic. AstroSage dominates those search terms, so treat this as a supporting channel only.
- **Retention:** there is no daily loop in the MVP. Retention comes back through *events*: partner's birthday, anniversary, the start of a new dasha, a friend joining. Each is a reason to return without daily content.
- **[External]** Low D30 benchmarks mean Nakshatra should not depend on daily habit.

## 20. Privacy, trust, safety, and regulatory risks

Full register: `TRUST_PRIVACY_AND_SAFETY.md`.

| Risk | Severity | Label | Mitigation |
|---|---|---|---|
| Private Bonds process a third party's birth data without their consent | High | [Observed]/[Inference] | Remove from the MVP, or require an explicit notice; default to the consented invite |
| DPDP Rules obligations (notice, consent, security, breach, children) start about 13 May 2027 | High | [External] (secondary sources; Gazette not checked) | Plan for compliance now; consent records already exist |
| Children: birth date reveals age; the 18+ gate is a self-declared checkbox (`auth.tsx`) | Medium | [Observed] | Drop data if the computed age is under 18; no-signup flow must keep the same gate |
| Subscription dark patterns (CCPA 2023 guidelines) | Medium | [External] | No subscription in the MVP; one-time pricing; one-click refunds |
| Marriage decisions made on Guna or Manglik output | High (harm) | [Inference] | Never "match/no-match"; explain the conventions, the exceptions and the limits; never fear-based upsells |
| Remedy and gemstone claims (Drugs and Magic Remedies Act, consumer law) | High if the shop is used | [Inference]; needs counsel | Hide the physical shop |
| Dating and matchmaking safety (harassment, fake profiles, IT Rules grievance duties) | High | [Inference] | Hide the modules |
| Name/trademark conflict | Medium | [External] | Clearance search before brand spending |
| Data breach of birth data + email | High | [Inference] | The app already hashes sessions, exports and deletes; add a retention schedule and a breach runbook |
| Expert advice harm | High | [Inference] | Hide the marketplace |

## 21. Product roadmap

Full roadmap with gates: `ROADMAP_AND_DECISION_GATES.md`.

**Days 1–2: decide and freeze.**
- Owner accepts or rejects the wedge.
- Flag off non-wedge navigation (reversible).
- Start the trademark search.
- Book interviews.

**Days 3–30: learn.**
- 15–25 interviews (J1/J2/J3).
- Rewrite the three hero layers and the pair-report outline.
- Build the no-signup Cosmic ID and a landing page that shows a sample.
- Set up a funnel dashboard.
- Live Razorpay account.
- **Gate 1 (day 30):** a pass needs all three:
  - interviews confirm J1 or J2 as a top-three need for at least 8 of 15
  - at least 5 people say they would pay at the test price, unprompted by the interviewer's number
  - content quality rated "better than what I use" by at least 60% of reviewers

**Days 31–60: first money.**
- Consented Bond preview without an account.
- Paid pair report with the ₹149/199/299 test.
- Gift option.
- Creator seeding.
- **Gate 2 (day 60):** a pass needs both:
  - at least 300 preview completers
  - at least 1% paid conversion, or 0.5% with a clear rising trend after a content iteration

**Days 61–90: loop.**
- Share-loop improvements, family explainer test, print partner pilot.
- **Gate 3 (day 90):** a pass needs at least one of:
  - viral coefficient k ≥ 0.3
  - revenue that covers content cost
  - at least 15% of paid reports are gifts

  Otherwise apply §23.

## 22. Validation experiments

Seventeen experiments are in `EXPERIMENT_BACKLOG.csv`. The first five:

1. **E01:** 15–25 problem interviews (no product shown).
2. **E02:** a content blind test: current text versus rewritten text, read by 20 people.
3. **E03:** a landing page showing a sample, compared with the current landing page.
4. **E04:** no-signup Cosmic ID completion rate.
5. **E05:** paid pair report price test.

No experiment uses fake functionality. Every paid test delivers a real report, and every price test shows the price the person actually pays. That follows the owner's rule against fake features.

## 23. Explicit continue/pivot/stop criteria

**Continue, investing in growth and content, if by day 90 all three hold:**
- at least 1% of preview completers pay
- k ≥ 0.3, or the gift share is at least 15%
- refund requests are at most 3%, and there are no unresolved trust complaints

**Pivot if:**
- Interviews or tests show J2 (families) pays and J1 does not → narrow to the family Guna explainer.
- Nobody pays, but developers or matrimony platforms ask for the engine → test option F (engine API).

**Stop or pause if any of these happen:**
- fewer than 0.5% pay after two content iterations and at least 500 preview completers
- k < 0.1 and there is no affordable acquisition channel
- trademark counsel advises the name cannot be used and the owner is unwilling to rebrand

Unfreezing any hidden module needs its own evidence. It never happens because the code exists.

## 24. What to do in the next seven days

1. **Day 1.**
   - Read this report.
   - Accept or reject the wedge in writing, and record it in `docs/DECISIONS_AND_ASSUMPTIONS.md`.
   - Do not write code yet.
2. **Day 1–2.**
   - List 30 people aged 18–32 for J1 and J2, from personal networks and two communities.
   - Book 15 interviews using the script in `CUSTOMER_JTBD_AND_RESEARCH_PLAN.md`.
3. **Day 2.**
   - Commission a trademark search for "Nakshatra" in the relevant classes (counsel decides which), and list backup names.
4. **Day 2–3.**
   - Rewrite the three hero Cosmic ID layers for 5 signs and 5 nakshatras as a sample: Vedic text distinct from Western, plus Hinglish.
   - Run E02 with 10 people.
5. **Day 3–4.**
   - Apply for a Razorpay merchant account (owner action; KYC needed).
6. **Day 4–7.**
   - Run the interviews.
   - Write each interview up the same day, as the person's own words, not a summary.
7. **Day 7.**
   - Review against Gate 1's interview criteria, and decide whether engineering starts on the no-signup Cosmic ID.

## 25. Sources, assumptions, and limitations

All accessed 2026-10-25. Publication dates are given where the source states them. The complete register is in `EVIDENCE_AND_SOURCE_REGISTER.md`.

- Astrotalk FY25:
  - [Outlook Business, "Astrotalk reports 85% revenue growth in FY25"](https://www.outlookbusiness.com/start-up/news/astrotalk-reports-85-revenue-growth-in-fy25-as-tier-i-cities-boost-platform-activity) (2025)
  - [Inc42, "Can Astrotalk chart a future beyond astrology?"](https://inc42.com/features/can-astrotalk-chart-a-future-beyond-astrology/) (2025)
- Astrotalk free first chat: [Astrotalk blog](https://astrotalk.com/astrology-blog/astrotalk-coupon-code-complete-guide/); per-minute pricing: [TechJockey](https://www.techjockey.com/reviews/astrotalk1)
- InstaAstro:
  - ₹1 first consult: [InstaAstro](https://instaastro.com/free-talk-chat-with-astrologer/)
  - revenue and Series A: [Entrepreneur India](https://india.entrepreneur.com/business-news/instaastro-crosses-inr-200-crore-in-annualized-revenue-raises-usd-12-million-series-a) (2026); [Inc42](https://inc42.com/buzz/instaastro-bags-12-mn-to-build-ai-tools-expand-online-pooja-services/) (2026)
- AstroSage: [App Store](https://apps.apple.com/app/id824705526); [Stork](https://www.stork.ai/en/astrosage)
- Co-Star:
  - acquisition: [Bloomberg Law](https://news.bloomberglaw.com/private-equity/ai-lab-midjourney-buys-astrology-startup-co-star-plans-new-apps) (24 Jul 2026); [TechCrunch](https://techcrunch.com/?p=3146313) (Jul 2026)
  - pricing: [App Store](https://apps.apple.com/app/id1264782561)
- CHANI pricing: [Adapty paywall library](https://adapty.io/paywall-library/chani/); [App Store](https://apps.apple.com/app/id1532791252)
- The Pattern pricing: [Adapty](https://adapty.io/paywall-library/the-pattern/) (2024 data)
- Tinder Astrology Mode: [Mediaweek](https://www.mediaweek.com.au/tinder-unveils-biggest-product-overhaul-in-years-at-sparks-2026-keynote) (Mar 2026); [Trendhunter](https://www.trendhunter.com/trends/tinder-astrology-mode); [Indian Television](https://indiantelevision.com/iworld/tinder-turns-to-astrology-as-mumbai-street-campaign-sparks-dating-debates/)
- Pew: ["3 in 10 Americans consult astrology, tarot cards or fortune tellers"](https://www.pewresearch.org/religion/2025/05/21/3-in-10-americans-consult-astrology-tarot-cards-or-fortune-tellers/) (21 May 2025)
- Indian user demographics: [Storyboard18](https://storyboard18.com/digital/young-indian-women-lead-digital-astrology-platforms-for-guidance-ws-l-91803.htm) (Mar 2026)
- DPDP Rules 2025: [EY](https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025); [ORF](https://www.orfonline.org/expert-speak/dpdp-rules-and-the-future-of-child-data-safety); [Storyboard18](https://www.storyboard18.com/digital/breaking-govt-notifies-final-dpdp-rules-sets-staggered-rollout-with-key-obligations-for-data-fiduciaries-84201.htm) (Nov 2025)
- CCPA Dark Patterns Guidelines 2023: [JSA](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/); [SCC Online](https://www.scconline.com/blog/post/2023/12/04/ccpa-notifies-guidelines-for-prevention-and-regulation-of-dark-patterns-2023-legal-news/) (Dec 2023)
- Nebula complaints: [Trustpilot](https://www.trustpilot.com/review/appnebula.co?page=9); [Apple Discussions](https://discussions.apple.com/thread/256064321)
- 16Personalities: [Pro Suite](https://www.16personalities.com/premium/pro-suite)
- Etsy and chart art: [Natal Echo](https://natalecho.com/shop); [Etsy listing](https://www.etsy.com/listing/1695936426/birth-chart-custom-astrology-reading)
- Payment fees: [Razorpay pricing explained](https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/); [Google Play India](https://blog.google/intl/en-in/products/platforms/sustaining-google-play-as-a-valuable-partner-to-indias-app-ecosystem/); [Play Console service fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)
- Retention benchmarks: [Braze](https://www.braze.com/resources/articles/mobile-app-retention) (Jul 2026); [Quash roundup](https://quashbugs.com/blog/app-retention-rate-statistics) (2026)
- Spotify Wrapped (secondhand): [WDEF](https://www.wdef.com/?p=2271401); [The Brand Hopper](https://thebrandhopper.com/2025/06/10/a-case-study-on-spotify-wrapped-the-storytelling-phenomenon/) (Jun 2025)
- Name collisions:
  - [AppFollow: Nakshatra Jyotish](https://appfollow.io/android/nakshatra-jyotish/com.naksh.jyots?country=in)
  - [MyNaksh on Play](https://play.google.com/store/apps/developer?id=MyNaksh)
  - [Naksh: Vedic Matchmaking](https://mwm.ai/apps/naksh-vedic-matchmaking/6766238783)
  - [Nakshatra AI listing](https://topai.tools/s/nakshatra-ai)
  - [Накшатра (App Store RU)](https://apps.apple.com/ru/app/%D0%BD%D0%B0%D0%BA%D1%88%D0%B0%D1%82%D1%80%D0%B0-%D0%B2%D0%B5%D0%B4%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9-%D0%B3%D0%BE%D1%80%D0%BE%D1%81%D0%BA%D0%BE%D0%BF/id1382250647?l=en-GB)
- Matrimony.com figures, Astrotalk's share of marriage-related questions, and the jewellery brand come from the prior report (29 Sep 2026). I did not re-check them.

**Limitations:**
- There is no user data, so every behavioural number is a hypothesis.
- Revenue figures for private Indian companies come from press coverage of regulatory filings; I have not seen the filings.
- The DPDP dates come from secondary sources; I did not read the Gazette.
- I did not audit `yournakshatra.lovable.app`.
- The e2e suite was not re-run today.
- Market-size projections are vendor estimates, and I did not use them in planning.
- I am not a lawyer or a licensed financial adviser. The legal and tax items need professional review.

Assumptions and unknowns: `ASSUMPTIONS_AND_UNKNOWNS.md`.
