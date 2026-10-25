# Component specifications

Values reference `color-tokens.json`. The hi-fi screens (`/Nakshatra Mobile - *.dc.html`, `/Nakshatra Desktop.dc.html`) are the visual reference for every component below.

## Surfaces
- **Card**: bg ink-900 · border 1px rgba(242,236,225,.08) · radius 20 (mobile) / 20–24 (desktop) · padding 16–20. No shadow on dark. Elevated overlays use `shadow.overlay`.
- **Raised control / input**: bg ink-800 · radius 12–16 · border 1px rgba(242,236,225,.10) · height 48.
- **Sheet / modal**: bg ink-900 · top radius 28 · drag handle 36×4 bone @20%.

## Buttons (all pill radius 999, min-height 44)
| Variant | Spec | States |
|---|---|---|
| Primary | bg ember · text ink-950 · Hanken 600 16 · h 54 (mobile) / 56 (desktop) · px 24–28 | hover: lighten 6% · active: scale .98 · disabled: bg ink-700, text mute · focus: `shadow.focus` |
| Secondary | transparent · border 1px rgba(242,236,225,.18–.22) · text bone | hover: bg rgba(242,236,225,.06) |
| Inverse | bg bone · text ink-950 · h 38–44 | used on artwork cards ("Begin", "Get started") |
| Price | Primary, Hanken 700, label is the price itself (₹29 / ₹99) | |
| Text | bone or mute 500 15, 44px hit area | |

## Chips & tabs
- Filter chip: h 34–36 · px 14 · radius 999 · 13px. Off: border rgba(242,236,225,.18). On: bg bone, text ink-950, 600.
- Segmented control: track ink-800 r999 p4. Selected segment bone/ink-950.
- Trait chip (reveal): border 1px archetype accent @40%.

## Avatars
- Default: `archetypes/archetype-XX/archetype-XX-compact.svg` (circular, contains its own plate). Sizes 24/26/32/36/40/68/96.
- Stack overlap −7px with a 2px ink-950 ring.
- Pseudonymous: 32px dashed 1px bone@30% ring + `icon-eye-off` in mute. Never an archetype.

## Thought Drop (post)
- Row: padding 16×24 (mobile) / 20×40 (desktop), divider bottom.
- Header: avatar 32/40 · handle Hanken 600 14–15 · mono label "ARCHETYPE · 2H" · type icon 14–16 mute right-aligned.
- Body Hanken 400 17–18 / 1.45. Confessions: Instrument Serif italic 22 in quotes, with a violet 8% top gradient.
- Actions: resonate + reply icons 18 with counts 13 mute. Resonated state uses ember.
- Poll option: h 40 · r 10 · bg ink-800 · fill bar absolutely positioned (leading option uses the game/poll accent @22%, others bone @7%).

## Composer
Type chips (Thought, Question, Dilemma, Poll, Confession) → serif prompt input 26 → type-specific fields → Audience row → **Pseudonymous toggle with explicit consequence copy**.

## Identity card
- Fixed 5:7. Background: `archetype-XX-card.svg` or a `card-style-*-frame.svg`.
- Layout in the 750×1050 artboard: sigil at centre (375,390–400), ~350px. Name: serif, y 620–730. Handle: mono, accent. Traits: y 770–960. All text live. Render to PNG server-side for sharing.

## Game card / tile
3:4 artwork plus a bottom gradient to ink-900 @95% with the title (Hanken 600 15) and meta (11 mute). On desktop the title sits below the image with the 24px game symbol.

## Toggle
44×26 track r13 · on ember with an ink knob · off line-colour with a mute knob · knob 20.

## Progress
Bar h 3–6 r3, track bone@10%, fill accent. Ritual week: 7 circles of 30px, filled = done, outline = today, dashed = future.

## Medallions & badges
- Achievement 128 master, shown at 48–64. Locked: grayscale(1) opacity .35 or `achievement-locked.svg`.
- Level badge 160 master. Sides = level + 2.
- Premium badge: chamfered 64 master, shown at 16–26.

## Tab bar (mobile)
84px including safe area · bg ink-900 @94% + blur 12 · top border. 5 items: Home, Network, Play (centre, diamond icon, ember when active), Circles, You. Icon 24 / label 11. Active = bone 600, inactive = mute. Reference: `MobileTabBar.dc.html`.

## Desktop rail
248px · logo · nav rows h46 r12 (active bg ink-800) · primary "Drop a thought" · profile at the bottom. Right column 380px for ritual, circles, live game and level.
