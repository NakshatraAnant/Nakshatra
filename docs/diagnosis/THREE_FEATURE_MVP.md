# Three-feature MVP

_2026-10-25. This is a **recommendation only**. Nothing has been implemented, and building waits until Gate 1 passes._

## 1. Instant Cosmic ID (no account)
- **User outcome:** a personal result in under 60 seconds, ready to share.
- **Flow:**
  1. The person enters date, time (or "unknown") and place, and confirms they are 18+.
  2. They see three hero layers: Sun/Rashi, Moon/Nakshatra, Rising/Lagna.
  3. They get a 1080×1920 card and a WhatsApp image.
  4. "Save" is optional and creates an account.
- **Reuses:** the engine, `identity.tsx`, the share-card code, and the consent record.
- **New work:**
  - Distinct Vedic and Western text for the three layers (12 + 12 + 27 + 12 entries per system).
  - Hinglish versions.
  - A landing page that shows a labelled sample.
  - Anonymous chart sessions with a short retention period.
- **Measure:** start → complete rate (H1), share or download rate (H2).

## 2. Consented Bond preview
- **User outcome:** two people see how they fit, and both have agreed.
- **Flow:**
  1. "Compare with someone" creates an invite link.
  2. The partner opens it and enters their own data, with no account and their own consent.
  3. The partner gets their own free Cosmic ID.
  4. Both see a preview: 3 dimensions, the Guna total, and one honest explanation line.
- **Reuses:** the scopes and revocation in `bonds.ts`, `/shared-report/link/:token`, Guna Milan, and the dimensions.
- **Changes:**
  - The invitee no longer needs an account.
  - The private-Bond path (third-party data) is removed from the MVP surface, or gated behind a clear notice.
- **Measure:** invites per completer, and partner completion (H3).

## 3. Paid full pair report, with gifting
- **User outcome:** a report worth keeping, sending or printing.
- **Contents:**
  - All 8 kootas, each explained.
  - The Manglik convention and its exceptions, never framed as fear.
  - Western synastry highlights.
  - Conversation starters.
  - A "what this does not mean" section.
  - A print-ready PDF.
- **Gift:** the buyer pays and sends a link. Recipients enter their own data.
- **Price test:** ₹149 / ₹199 / ₹299, paid once and never auto-renewed.
- **Reuses:** commerce, entitlements, `reportDocuments`, and the Razorpay adapter (needs a live account).
- **Rule:** at least 80% of the report text must be new, text the free product never shows.
- **Measure:** preview → paid (H4), gift share (H5), refunds.

## Out of the MVP (hidden, not deleted)
Daily briefing, XP/achievements, social, messaging, dating, matchmaking, weddings, experts, courses, the physical shop, Nakshatra+ and Year Ahead.
