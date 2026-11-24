# 09 — UI/UX and Animation Changes

Ink & Ember identity unchanged (tokens, typography, artwork). Changes are about what is shown and how it responds.

## Product scope in the UI
- Navigation is driven by the server's module state: Labs/legacy entries disappear when off; "Astrology" became "Optional · astrology"; "Quests & streaks" added; Learn moved under Labs.
- Header search: "Search people, Thought Drops, circles…"; cart only when payments are enabled; mobile messages icon only when that module is on.
- Disabled-module pages render a clear "switched off" page (also for public routes).
- Shop with marketplace off → "Identity extras" with only the two identity offers; preview notice and disabled buy buttons while payments are off.

## New screens / components
| Screen | What |
|---|---|
| `/progress` | Level card, streak card, vibe picker, quests (Today / This week / Explore) with per-step progress bars and Claim, circle streaks, season track with milestone claims, collection + achievements |
| Home | "How's today?" vibe picker + streak + next quest + rewards-ready link |
| Identity Studio | "Your timeline" (results with per-dimension ▲▼ deltas, recent vibes, milestones); share-link panel with "Show my name" |
| Assessment result | Inconclusive badge + guidance; "Share a link" on the account-free preview |
| `/s/:slug` | Public archetype page with CTA (no sign-in) |
| `/gifts/claim/:token` | Gift claim page; Library shows "Build report" for pending reports and a Gifts panel |
| Circle members | "Common ground" dialog with conversation starters |
| Finished game | "Rematch" |
| Settings → Privacy | Pen-name mutes listed by pen name |
| Settings → Security | MFA disable needs password + code |
| Thought composer | Accurate "Public" visibility copy |
| Terms / Privacy | Rewritten for the current product (draft for legal review) |

## Motion (`app.css` motion-v2, `components/motion.tsx`)
Page-in (220 ms), celebration card with burst ring and floating "+XP" chip (non-blocking, `aria-live="polite"`, auto-dismiss 3.2 s), progress-bar fill, press feedback. All run only under `prefers-reduced-motion: no-preference` and without the in-app reduced-motion setting; otherwise elements appear statically. No new animation dependency; no continuous 3D added.

## Accessibility
Explicit `aria-label`s on assessment radios (now announced "Strongly disagree" … in the accessibility tree); progress bars expose `role=progressbar` with values; vibe buttons use `aria-pressed`.

## Responsive verification (local build)
No horizontal overflow measured at 360, 390, 430, 768, 1024 on landing, assessment, share page, home and progress; 1280/1440 checked visually. Observation: at 360 px the public header's "Sign in" wraps to two lines (cosmetic, not fixed).
