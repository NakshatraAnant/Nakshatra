# Design system

Source of truth: `src/web/styles/app.css` (tokens) and `src/web/components/ui/*` (components). Tailwind v4 utilities map to **semantic tokens**, so every page themes consistently.

## Direction
Deep-space calm, not neon. Ink-blue canvas, ivory text, a single warm gold accent, violet/celestial blue for secondary meaning. Serif display type (Cormorant Garamond) for headings and identity moments; a clean humanist sans (Figtree, with Noto Sans Devanagari for Hindi) for UI. Orbital geometry (thin rings, constellation lines) is the decorative motif and is used sparingly.

## Themes
`data-theme` on `<html>`: **Midnight** (dark, signature) and **Ivory** (light). "Match my device" follows `prefers-color-scheme`. Chosen in Settings → Profile → Appearance and stored on the profile.

## Tokens
| Group | Tokens |
|---|---|
| Semantic colour | `canvas`, `canvas-deep`, `surface`, `surface-2`, `surface-3`, `line`, `line-strong`, `fg`, `fg-2`, `fg-3`, `accent`, `accent-strong`, `accent-ink`, `violet`, `celestial`, `success`, `danger` |
| Palette | ink 950–500, ivory 50–200, mist 300–500, gold 300–700, violet 300–600, celestial 300–400, rose, copper, jade, ember |
| Type | `--font-display`, `--font-sans`, `--font-deva`; display sizes 3xl–6xl for page titles, 15px body, 11px uppercase tracked kickers |
| Radius | xs 6, sm 10, md 14, lg 20, xl 28 px |
| Elevation | `--shadow-soft`, `--shadow-lift` |
| Motion | `--ease-orbit`, `--ease-settle`; `.rise-in` entrance (≈400 ms); all animation disabled under `prefers-reduced-motion` or the in-app "Reduce motion" setting (`data-motion="reduced"`) |
| Layers | `--z-nav` 30, `--z-overlay` 50, toasts above dialogs |
| Breakpoints | Tailwind defaults plus `xs` 380 px; mobile layout below `md` (bottom tab bar + "More" drawer), sidebar from `md` |

## Components (`components/ui`)
| File | Components |
|---|---|
| `primitives.tsx` | `Button` (primary, secondary, ghost, danger; sm/md/lg; loading, icon), `ButtonLink`, `IconButton` (required label), `Spinner`, `Field` (label, hint, error, `aria-describedby` wiring), `Input`, `Textarea`, `Select`, `Checkbox`, `Switch` (role="switch"), `Card`, `Badge` (tones), `Avatar`, `Skeleton`, `SectionTitle`, `PageHeader` (kicker, title, subtitle, actions), `Kv` |
| `overlays.tsx` | `Dialog` (native `<dialog>` with `showModal()`: browser-managed focus containment, Escape to close, focus returned to the opener; labelled by its title), `ConfirmDialog` (optional typed confirmation), `Drawer`, `Tooltip`, `ToastProvider`/`useToast` (polite live region), `Tabs` (roving keyboard), `Segmented` (radiogroup) |
| `feedback.tsx` | `EmptyState`, `ErrorState` (role="alert", retry), `LoadingBlock` (aria-busy skeleton), `QueryState` (loading/error/empty/success wrapper), `Notice` (info/warning/danger/success/dev), `IntegrationNotice` (states when a provider is in development mode or unavailable), `SampleBadge` |
| `data.tsx` | `StatTile`, `Meter`, `ProgressRing`, `DataTable` (horizontal scroll on small screens), `Pagination`, `TimelineItem`, `Constellation` (SVG achievement art), `Money` |
| `icons.tsx` | One stroke-icon set (`Icon name=…`), 1.5 px strokes, `currentColor` |

## Patterns
- Every data view goes through `QueryState`, so loading, error (with retry) and empty states are never missing.
- Destructive actions use `ConfirmDialog`; irreversible ones (account deletion) require typing a word.
- Development-only or sample content is always labelled (`Notice tone="dev"`, `SampleBadge`).
- Validation errors name the field (`describeApiError` in `lib/api.ts`), e.g. "Interested in: choose at least one."
- Focus: `:focus-visible` gold focus ring (`--focus-ring`) on all interactive elements; skip link "Skip to content" as the first tab stop.
- Touch targets ≥ 40 px on mobile navigation and primary actions.

## Accessibility commitments
Semantic landmarks (`header`, `nav` "Primary", `main#main`), labelled form controls, `role="alert"` for errors, polite live regions for toasts and selected-object panels, colour never the only signal (badges carry text), 2D equivalents for all 3D content. Body text on surfaces meets WCAG AA contrast in both themes (ivory `#f3eee2` on ink `#0b0c1f`; ink on ivory).
