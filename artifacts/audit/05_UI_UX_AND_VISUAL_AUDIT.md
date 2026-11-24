# 05 — UI/UX and Visual Audit

## How this was inspected

- Local dev servers started from `.claude/launch.json` (`api` on 4400 against the **local development** PGlite database, `web` on 5173). No production environment was opened.
- Browser: the Claude desktop built-in browser with viewport emulation. Signed out: landing, account-free assessment (all 20 statements answered, result viewed). Signed in as the seeded demo member from `.data/dev-credentials.json`: Home, Thoughts, Play, Identity, Chart, Shop, Circles, Dating.
- Widths: 1440 (landing, assessment, home, thoughts, play), 1280 (dating), 768 (circles), 390 (home), 360 (identity, chart, shop). Horizontal overflow measured with `document.documentElement.scrollWidth` on each.
- Screenshots were viewed during the session but **not saved to disk** (the browser tool returns them inline only). Observations below are first-hand; they are not reconstructed from code.
- Not opened in the browser: circle detail with members, a live multi-player game, thought detail, settings, admin, onboarding after signup, commerce checkout, the 3D explorer. Those are assessed from code only.

## 1. Visual consistency (Ink & Ember)

| Element | Observation |
|---|---|
| Palette | Dark ink background, warm ember/orange primary buttons, muted secondary text — consistent across every screen visited. |
| Typography | Instrument Serif display headings, Hanken Grotesk body, JetBrains Mono eyebrows (`app.css:11-14`, loaded from Google Fonts with `display=swap`). Applied consistently. |
| Cards & radii | Rounded cards with hairline borders on Home rituals, Play library, Thoughts composer, Circles empty state — consistent. |
| Artwork | Landing hero (identity card + astrolabe), 24 archetype sigils, 12 game card SVGs, ritual thumbnails, environment banner on Thoughts all render. Game cards on `/play` appeared blank for ~2 s on first load (lazy SVGs from the dev server) then filled in; no broken images (`naturalWidth > 0` for all 12). |
| Icons | Two systems coexist: Ink & Ember mask icons for the five core nav items (`pkg` in `AppShell.tsx`) and a built-in line-icon set for everything else. Visible as a slight stylistic difference between the top five nav items and the rest. |
| Motion | Loading emblem + skeletons; reduced-motion handled (`RouteLoading`, preference effects). Not stress-tested. |
| Contrast | At 768 px the Circles page heading and subtitle rendered at very low contrast in the screenshot (possibly mid entrance-animation). Not measured with a contrast tool. |

**Assessment:** the visual integration is genuinely good — distinctive, cohesive and polished on the core screens. The inconsistency is not in the styling but in **what is being styled** (see §3).

## 2. Asset integration

| Check | Result |
|---|---|
| Registry vs files | `visual-registry.generated.ts` lists 496 paths; **0 missing** on disk; all 498 files under `public/visual` are listed (VERIFIED by script). |
| Archetype art | 24 directories = 24 archetypes. |
| Game art | 12 directories = 12 games. |
| Other packs | brand, circles, empty-states, environments, icons, offers, onboarding, rewards, social — present. |
| Total size | 12 MB; 488 SVGs (7.1 MB), 8 PNGs. 14 SVGs exceed 60 KB. |
| Oversized | `brand/png/nakshatra-social-signature-1200x630.png` **1.34 MB** and `circle-invite-og-1200x630.png` **1.30 MB** — the first is the site-wide `og:image`. Messaging apps commonly ignore or slowly render previews this heavy. |
| Registry vs usage | Whether every registry entry is rendered somewhere was **not verified** (entries are referenced through keys, not literal paths). |
| Unit test | `src/web/lib/visual.test.ts` passes. |

## 3. User experience

### Could a first-time user understand Nakshatra in 10 seconds?
**Signed out: yes.** The landing hero says "A personality-led social network — Discover your kind of person", one primary CTA ("Find your archetype — no account"), a sample identity card, then the 24 archetypes and four pillars. Clear.

**Signed in: no.** The first screen after sign-in has a sidebar with five sections: *Nakshatra* (Home, Identity, Thoughts, Circles, Play), *Astrology* (Cosmic ID, Daily sky, Chart, Calendar, Bonds), *More* (Journey, Invite friends, Learn, Shop), *Nakshatra Labs* (Community, Messages, Dating, Matchmaking, Experts, Weddings — collapsed), *Account*. The global search placeholder reads "Search people, experts, courses, products…", and a shopping-cart icon sits in the top bar. The Shop lists "Rudraksha", "Gemstones", "Ritual supplies" next to the ₹29/₹99 identity offers. A user who signed up for "find your kind of person" lands in what looks like an astrology super-app with a store. **This is the single biggest UX problem.**

### Could they complete the assessment without confusion?
Yes. Four steps of five statements, a progress bar (0/20), Back/Next, a clear "See my archetype" final button, and a non-diagnostic disclaimer. Completed end-to-end in ~20 clicks. Issues:
- Radio inputs are exposed to assistive technology as "1"…"5" (accessibility tree), not "Strongly disagree"…"Strongly agree" — the visual labels are not programmatically associated (DEF-10).
- No warning when all answers are identical; the result still says "Clear match" (DEF-04).

### Would they understand what to do after the archetype?
Partly. The result shows name, signature, traits, "In circles", growth edge, secondary archetype, a five-bar dimension chart and two plain-language reasons — strong. The only actions are **Save my archetype** and **Start again**. There is **no share option before signup** (the share card exists only inside Identity Studio after saving), so the most viral moment has no share affordance.

After saving, Home shows a level badge, four rituals ("Today"), "Your circles" (empty → "Start a circle"), "Your games", and three cards (Say something / Play something / Invite a friend). The next step is reasonably clear, but every social action needs other people: circles and most games need 2–3 friends, and the public feed is effectively empty for new users (PRD-04).

### Would they have a reason to return?
Rituals (daily choice, daily thought, micro-challenge, weekly reflection, circle question) are the designed return loop. They are private by default, carry no streak pressure, and send **no push or email nudges** ("Rituals never send push or email nudges"). Without friends in a circle, a solo user's return reason is one daily would-you-rather and a private journal prompt.

### Other UX observations
| Area | Observation | Evidence |
|---|---|---|
| Thought visibility | Composer default "Public" with copy "Anyone who can see public profiles on Nakshatra", but the author's own profile is private by default, so the post reaches only followers | `thoughts.tsx:61`, `schema/auth.ts:74` |
| Pen names | UI says "pseudonymous, not anonymous" — honest — but "Mute author" and self-replies unmask (SEC-01/02) | `thoughts.tsx:95,183` |
| Paid offers in production | Visible, then fail at checkout with "Payments are not configured" (503) | `render.yaml PAYMENT_PROVIDER=none`, `payments.ts` |
| Empty states | Circles: illustrated, actionable ("Start one for your college gang…"). Home games: "No games yet. Pick one above." | browser |
| Loading states | Skeleton lines + emblem per route chunk; Home showed ~2 s of skeletons on the dev server | browser |
| Error states | Route-level error page with Reload/Go home; API errors normalised to sentences with field names (`humanizeDetail`) | `routes.tsx`, `api.ts` |
| Mobile nav | Bottom bar: Home, Thoughts, Play, Circles, More; top bar: search, messages, notifications, cart | 390 px |
| i18n | Hindi exists for ~60 navigation/action keys; all page copy is hard-coded English | `lib/i18n.tsx` |
| Link previews | Single static `index.html` with relative `og:image` and no `og:title`/`og:url`/Twitter tags; invite links (`/c/join/:token`) and public identity pages (`/i/:handle`) cannot have their own previews in a client-rendered SPA | `index.html` |

## 4. Responsive behaviour

| Width | Pages | Horizontal overflow | Notes |
|---|---|---|---|
| 1440 | landing, personality, home, thoughts, play | none observed | Content max-width keeps lines readable |
| 1280 | dating | none (`scrollWidth == 1280`) | — |
| 768 | circles | none | Full sidebar (~200 px) retained at tablet width; content column narrow |
| 390 | home | none (`scrollWidth == 390`) | Bottom tab bar; cards stack well |
| 360 | identity (assessment), chart, shop | none | Five Likert options fit at 360 with two-line labels; Shop filter chips wrap to 5 rows before any product is visible |

The existing e2e suite also includes a 360 px overflow check for social pages (`e2e/k-social.spec.ts:114`, not run in this audit).

## 5. Accessibility (sampled, not a full audit)
- Skip link and landmark structure not inspected.
- Assessment radios lack accessible names matching their visible labels (DEF-10).
- Icon-only header buttons (search, messages, notifications, cart) — accessible names not checked.
- `e2e/a11y.spec.ts` runs axe on key pages; it was not executed here.

## 6. Verdict
The **craft** is high (visual system, empty states, honest copy, mobile layout). The **experience** is diluted: a clear public promise is followed by a signed-in product that presents astrology, commerce and six "Labs" modules alongside the core, the viral share moment is missing before signup, and the social surfaces are empty for anyone who arrives without friends.
