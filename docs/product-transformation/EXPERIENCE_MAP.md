# Experience map

## Before (observed 2026-10-25)
1. Landing: six pillars, a decorative 3D scene, no output.
2. Signup: name, email, password, 18+ and terms.
3. Onboarding intro.
4. Birth form.
5. Interests and system choice (required).
6. Cosmic ID: six layers in 3D or 2D.

That is about five steps and an account before any output. Vedic text repeated Western text.

## After (implemented and browser-verified; spec `e2e/j-discover.spec.ts`)
1. **First contact (`/`).** One promise ("Your sky, read as an identity you can keep") and one action ("Discover yours — no account"). The hero is a real Cosmic ID computed by the server for a labelled fictional sample. Below it: the sample's actual Vedic texts, how Bonds work (3 steps), method and privacy.
2. **First value (`/discover`).**
   - The form asks for date, time precision, time, place, and 18+ plus consent.
   - The result arrives in one request, with nothing stored.
   - Unknown time is allowed; the Lagna is then shown as "Needs a birth time", never guessed.
3. **Memorable moment.** About three seconds, skippable:
   1. The sigil draws itself.
   2. "Your Moon rests in {Rashi}", then "in the nakshatra {X}", then "You are {Archetype}".
   3. The result shows: archetype portrait, gifts, growth edge, in bonds; the three Vedic layers; the Western view; how it was derived (element and modality bars, method, disclaimer).
4. **Share.** Story or square card with archetype, essence and three Vedic layer names. No birth date, time, place or positions.
5. **Natural expansion.** "Save my Cosmic ID" or "Save and invite someone" leads to signup, with copy that matches the intent, then onboarding with the details prefilled. Consent is asked again for storage. Interests can be skipped. The saved Cosmic ID matches the preview (asserted in the test).
6. **Return.** The Cosmic ID page opens with the archetype panel, sigil and share cards, then the six detailed layers and the chart explorer.
7. **Payment.** Report pages state what is already free and what the report adds, before checkout.

## Recovery states
| Situation | Behaviour |
|---|---|
| Unknown birth time | Calculated for local noon; uncertain layers badged; Lagna withheld |
| Under 18 | Server refuses, with the reason (same rule for preview and saved profile) |
| Place not found | Manual coordinates option (existing) |
| Calculation or validation error | Field-level message from the server (existing `BirthForm` handling) |
| Share card fails to render | Error toast with the reason; page unaffected |
| Slow connection | Route-level loading skeleton; 3D chunks no longer block or download on public pages |
| Reduced motion | Reveal skipped; static sigil |

## Not yet redesigned
- **Bond invitee flow:** the invitee still needs an account.
- **Daily return experience:** not redesigned.
- **Paid pair report:** not built; it needs content and a live payment provider.
