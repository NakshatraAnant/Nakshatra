# Experience audit

_2026-10-25._
- **What this is based on:** the page source (`src/web/pages/*.tsx`), the e2e specs that drive the real UI (`e2e/a-new-user`, `b-relationship`, `f-commerce`), and the content files.
- **What it is not based on:** I did not run a moderated test with real users, so I have no timing or drop-off data **[Unknown]**.

## 1. First visit: landing (`landing.tsx`, 86 lines)
- **[Observed]** The page has:
  - Headline: "Your cosmic identity, precisely calculated."
  - Subtitle: "…for reflection, for relationships, and for the moments that matter. No AI guesswork…"
  - CTAs: "Create your Cosmic ID" and "How we calculate".
  - Six pillar cards: Cosmic ID, daily ritual, Bonds, Panchang/muhurat, Learn + experts, dating → wedding.
  - A "Private by default" section.
- **[Observed]** The page has no example Cosmic ID, no example compatibility and no screenshot.
- **[Inference]** Six pillars means six promises, so a visitor has to guess which one is for them.
- **Fix:**
  - One promise: compatibility for two people.
  - One live sample, made from a public figure's or a fictional pair's chart and labelled as a sample.
  - One CTA.

## 2. Signup and onboarding (`auth.tsx` and onboarding pages)
- **[Observed]** The steps are: name, email, password, 18+ checkbox and terms → intro → birth form (date, precision, time, place, consent) → interests and system → Cosmic ID.
- **[Inference]** That is about five steps before any output (corrected: email verification is not required before onboarding). Most of them are about the product's needs, not the user's.
- **Fix:**
  - Ask only for birth data, plus an 18+ confirmation.
  - Show the result immediately.
  - Offer an account only for saving the result or creating a Bond.
  - Verify email only before payment or before a Bond.

## 3. Cosmic ID (`identity.tsx`)
- **[Observed]** Six layers, 3D with a 2D fallback, and a PNG share card at 600×440.
- **[Observed]** The words come from the shared interpretation pool. Switching from Western to Vedic often shows the same paragraph again.
- **[Inference]** The visual earns a "wow". The text then deflates it. The landscape share card doesn't fit Instagram Stories or WhatsApp Status (both 9:16).
- **Fix:**
  - Distinct Vedic text for Rashi, Nakshatra and Lagna.
  - A Hinglish option.
  - A 1080×1920 card with one quotable line.

## 4. Today / Journey
- **[Verified]** 14 rituals, 12 lessons, 30 prompts and 9 dasha themes.
- **[Inference]** A daily user sees repeats within about 2 weeks, and the XP reward is for consuming repeats.
- **Fix:** hide it from the MVP. Bring it back only with at least 90 days of distinct content and a retention reason.

## 5. Bonds (`bonds.tsx`, `bonds.ts`)
- **[Observed]** There are two ways to start a Bond:
  - **Invite:** the other person must sign up and accept.
  - **Private Bond:** the user enters someone else's birth data after ticking "They have given me permission to use their birth details here" (self-attested; enforced by the API).
- **[Observed]** Results show dimensions instead of a single score, plus Guna Milan's 36 points with caveats. This is the right design.
- **[Inference]** The consented path has more friction than the non-consented one. Flip that.
- **Fix:**
  - The invitee enters their own data without an account.
  - Both people see a preview.
  - Private Bonds are removed from the MVP, or gated behind a clear notice.

## 6. Paid reports (`shop.tsx`, `reports.ts`)
- **[Observed]** The ₹299 Vedic report reuses the free `interpret()` text and adds tables. Year Ahead (₹399) leans on 9 theme strings.
- **[Inference]** A buyer who has explored the free chart is likely to feel short-changed.
- **Fix:** the paid pair report must be at least 80% new text that the free product never shows.

## 7. Navigation and empty states
- **[Observed]** About 18 areas are reachable, including dating, weddings, the shop and social.
- **[Inference]** With 0 users, the feeds, discover and matchmaking screens are empty. An empty room tells a new visitor the product is dead.
- **Fix:** take everything outside the wedge off the navigation, using feature flags rather than deleting anything.

## 8. What is genuinely good
- **[Founder]** Accessibility is clean (axe, 22 routes), and nothing overflows horizontally on mobile.
- **[Observed]** Disclaimers are honest and appear on every relevant page. Sample data is labelled.
- **[Observed]** The methodology is transparent ("How we calculate"). That supports the "calculated, not generated" position.
- **[Observed]** The privacy settings are strong: export, deletion, and per-field visibility.

## 9. Content quality examples
**[Verified]** House template output, verbatim from `interpretations.ts`:

> "Venus represents love, beauty and values. In the 7th house — partnership, marriage and one-to-one relationships — it traditionally finds pleasure and harmony in this area of life."

**[Inference]** The sentence is accurate, safe and forgettable. That is the bar the product currently sets for itself in 144 places.
