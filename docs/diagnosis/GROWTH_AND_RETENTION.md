# Growth and retention

_2026-10-25. All loops are **[Hypothesis]** unless marked otherwise._

## Loops
1. **Share.** The flow: Cosmic ID → 9:16 story card with one quotable line and a "compare with me" link → a friend opens it → the friend gets their own Cosmic ID → an invitation to make a Bond with the sharer.
   - **Metric:** shares per completer; completions per share.
2. **Pair.** Every Bond requires a second person, who enters their own data.
   - **Metric:** invites per completer × partner completion rate = k.
3. **Gift.** The buyer pays, and both recipients each enter their own data.
   - **Metric:** gift share of paid reports; new users per gift.
4. **Creator.** Affiliate codes for micro-creators: relationship, meme and diaspora pages. The pass bar is in M5 of `MONETIZATION_PLAYBOOK.md`.
5. **Search (supporting only).** Panchang, festival and muhurat pages are already computed [Observed]. Static, indexable versions could bring some search traffic, but AstroSage dominates those queries [Inference].

## Retention without a daily habit
- **[External]** Day-30 lifestyle retention is about 3–4% (Braze, 2026).
- **[Inference]** A daily-habit model starts from a very low base, and Nakshatra's daily content pools repeat within about two weeks [Verified].
- **[Hypothesis]** People return to Nakshatra at life events instead:
  - partner's or friend's birthday ("gift their chart")
  - anniversary of the Bond
  - start of a new dasha period (the date is computed)
  - a friend joining and inviting you
- Each return is opt-in, with a consented notification at a clear frequency.

## Instrumentation to add (before any launch)
- **[Verified]** The event taxonomy already includes:
  - `signup_started`, `cosmic_id_completed`, `profile_shared`
  - `bond_invitation_sent`, `invitation_accepted`, `compatibility_viewed`
  - `checkout_started`, and others
- **Needed:** anonymous-session equivalents of those events, plus a simple funnel view in admin:
  - landing → form started → Cosmic ID → shared → invite sent → partner completed → preview → checkout → paid
- **Privacy:** no third-party ad pixels with birth data; aggregate funnels only.

## Channels not to use yet
- **Paid ads:** break-even is about ₹0.74 per visitor in the base case (see `UNIT_ECONOMICS_MODEL.md`).
- **Influencer flat fees:** use revenue share first.
- **App-store launch:** the web flow comes first, which also avoids the Play billing fee.
