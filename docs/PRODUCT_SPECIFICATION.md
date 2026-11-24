# Product specification

**Nakshatra** is a cosmic identity platform: a precise, private, deterministic astrology core (Vedic and Western) with social, relationship, learning, marketplace and life-event products built around it. No artificial intelligence is used anywhere in the product.

Audience: Indian and diaspora users (18+ for dating, matchmaking and consultations) interested in astrology as culture, self-reflection and relationships; families arranging marriages; independent astrologers, course creators, sellers and wedding vendors.

Positioning rules: astrology is presented as a belief-based, interpretive practice; no medical, financial, legal or guaranteed-prediction claims; no fear-based selling of remedies.

## Modules and core requirements
| # | Module | User value | Key requirements |
|---|---|---|---|
| 1 | Accounts & onboarding | Get to a personal Cosmic ID in minutes | Email/password signup with 18+ and terms confirmation, email verification, password reset, optional TOTP MFA, session management; onboarding: intro → birth data (date, time precision incl. unknown, place search with historical time zones, consent) → interests and preferred system |
| 2 | Cosmic ID & profile | A shareable, private-by-default identity | Six layers (Vedic Rashi, Lagna, Nakshatra; Western Sun, Moon, Rising) with interpretations, reliability badges, method cards; 3D and 2D views; customisation (theme, emblem); share card; public profile with per-field visibility; birth time/place never public |
| 3 | Astrology engine | Trustworthy numbers | See ASTROLOGY_ENGINE_SPECIFICATION.md: charts, houses, nakshatras, dashas, vargas, yogas, doshas, ashtakavarga, transits, progressions, returns, panchang, festivals, muhurat, numerology, compatibility |
| 4 | Today (daily) | A reason to return daily | Personal briefing from Moon transit vs natal chart, tithi, dasha, rule-selected ritual, reflection prompt, daily lesson; check-in streak; private reflections saved to Journey |
| 5 | Chart explorer | Explore the chart deeply | North/South Indian charts, Western wheel, 3D wheel, placements, houses, aspects, dashas, vargas, yogas & doshas, ashtakavarga, transits, progressions, solar return, snapshots, saved insights |
| 6 | Calendar | Plan by Panchang | Month view with tithi/nakshatra/moon phase, day detail (sunrise, Rahu Kaal etc.), festivals by year/location, muhurat finder with rule explanations, ICS export |
| 7 | Journey & gamification | See progress honestly | Timeline of personal entries + calculated landmarks (clearly separated), saved insights, XP ledger, levels, streaks, achievements (3D medallions), challenges incl. festival seasons, collectibles, Wrapped recap; server-authoritative and idempotent |
| 8 | Bonds | Understand relationships with consent | Invite by handle or link, private Bonds with permission confirmation, share scope (chart or Big Three), compatibility dimensions + Guna Milan, notes, milestones, share summary links (revocable), revoke/delete, 3D constellation of Bonds |
| 9 | Community | Learn and share with others | Feed (posts, polls, questions), comments, reactions, saves, follows (with requests for private profiles), groups, events with RSVP, reporting, blocking, muting, transparent feed ranking |
| 10 | Messaging | Talk safely | Direct, group, dating-match, consultation and vendor conversations; message requests; read state; image attachments; report and block; closed conversations after unmatch |
| 11 | Dating | Meet people intentionally | Separate 18+ profile, preferences (age, distance, intent), optional astrology lens, verification selfie (human review), discovery with mutual-preference filtering and explanation, like/pass, matches, chat, chart-contact insights only with mutual opt-in, report, unmatch, pause, incognito |
| 12 | Matchmaking & Family Bridge | Family-assisted marriage search with consent | Separate profile with cultural preferences and Kundli importance, suggestions, shortlist, connection requests with stages, family member invitations with explicit per-capability permissions, family suggestions, family view, revocation |
| 13 | Experts marketplace | Book trustworthy consultations | Expert onboarding, credentials with document upload, human verification, services (chat/report/workshop available; voice/video marked unavailable without a provider), weekly availability and exceptions, timezone-aware slots, booking with payment hold, cancellation policy and refunds, consultation chat, shared chart consent, notes, reviews by verified customers, disputes, payouts |
| 14 | Learning & creators | Learn properly | Course catalogue, chapters, lessons (text/video), quizzes with pass mark, progress, bookmarks, notes, certificates with public verification, reviews; creator studio with editorial review; paid courses via commerce |
| 15 | Commerce & subscriptions | Buy with confidence | Catalogue with categories, search, sort; product detail with variants, stock, disclosures (no outcome claims), saved items; cart, discount codes, gifts; checkout with server prices; orders, shipments, returns, refunds; digital library; generated reports (real calculated documents); seller studio with review; Nakshatra+ subscription with entitlements, cancel at period end |
| 16 | Weddings | Plan together | Projects with muhurat, partner/family/planner members with permissions, tasks and events, budget, guests with RSVP links, vendor discovery (verified only), inquiries, quotations with milestones, acceptance, milestone payments, cancellations, reviews; vendor studio |
| 17 | Notifications | Stay informed, not spammed | In-app notifications, per-category in-app/email preferences, quiet hours, daily cap, unsubscribe-all, templates editable by admins |
| 18 | Search & support | Find things; get help | Global search across people (public only), experts, courses, products, events, vendors, groups; history (can be disabled) and saved searches; support tickets with replies; appeals |
| 19 | Privacy | Control over personal data | Visibility controls, consent records, data export (JSON), immediate account deletion with documented retention |
| 20 | Administration | Operate safely | Overview queues, users (roles, suspension, deletion), moderation queues with priorities, appeals (independent reviewer), verification, refunds & disputes, payouts, products/orders/discounts/subscriptions, courses, vendors, interpretation content versions, calculation configs, notification templates, analytics (WMCU north-star, funnels, cohorts, revenue), audit log, flags & settings, support, privacy requests |
| 21 | Legal & methodology | Trust | Terms, Privacy policy (drafts describing real behaviour, pending legal review), Methodology page listing every calculation convention |

## North-star metric
**Weekly Meaningful Cosmic Users (WMCU):** distinct users with at least one meaningful event in the ISO week (e.g. Cosmic ID completed, insight saved, Bond created, lesson completed, booking completed); app opens and passive views excluded. Shown in Admin → Analytics.

## Non-functional requirements
- Privacy by default; birth data never in URLs, logs, analytics or public responses.
- Responsive from 360 px; touch-friendly; WCAG AA contrast; keyboard accessible; reduced-motion support; 2D equivalents for 3D.
- Deterministic, versioned calculations and content.
- Server-authoritative prices, rewards and permissions; idempotent payments and rewards.
- English and (partial) Hindi.

## Out of scope for this release
Native mobile apps; live audio/video consultations (provider needed); push notifications (provider needed); tax invoicing; AI features of any kind (permanently excluded).
