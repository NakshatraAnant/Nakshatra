# Implementation plan

## Done this phase (vertical slices with UI, API, data handling, errors and tests)
1. Build integrity: production React and no global three.js preload.
2. Archetype engine, content and tests.
3. Vedic content pack v2, version-aware seeding and tests.
4. Account-free Cosmic ID: API, page, reveal, result, share cards. Integration and browser tests.
5. Landing redesign with a live labelled sample.
6. Onboarding continuity: prefilled from the preview, consent asked again, interests skippable.
7. Cosmic ID page: archetype panel and share cards.
8. Navigation: core first, Labs group.
9. Report transparency: what is free versus what is paid.
10. Discovery funnel analytics.

## Next, in order (each needs the evidence or input noted)
1. **Bond invitee without an account.** The invitee enters their own data on the invite page; a consent record is kept; revocable. Server changes in `bonds.ts`, plus a new public invite page. Highest-leverage next slice.
2. **Explained Guna Milan.** Per-koota explanations that avoid any match or no-match verdict. Needs editorial content (about 8 × 3 states).
3. **Hindi/Hinglish for the three hero layers and the archetypes.** Needs a human translator.
4. **Paid pair report and gifting.** Needs the content from step 2, a live Razorpay account (owner) and price tests (docs/diagnosis).
5. **3D audit of the remaining scenes** (Cosmic ID, Chart, Bonds, Journey). Keep scenes that show calculated geometry (chart wheel). Replace the Cosmic ID 3D ring with the sigil as the default view if user testing prefers it.
6. **Daily content depth** to ≥ 90 distinct days before promoting a daily habit.
7. **Server-side flag enforcement** (TECHNICAL_RISKS T4).

## Not planned without evidence
- Promoting social, dating, matchmaking, experts, weddings or the physical shop out of Labs.
- Subscriptions.
- Any user-facing AI.
