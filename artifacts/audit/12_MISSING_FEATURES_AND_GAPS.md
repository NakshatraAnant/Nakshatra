# 12 — Missing Features and Gaps

Only gaps that matter for the **positioned** product (identity → expression → circles → play) are listed as launch-relevant. The repository already has far more features than it needs; most gaps below are about finishing and measuring the core, not adding scope.

## A. Gaps that block a trustworthy beta
| Gap | Why it matters | Evidence |
|---|---|---|
| Correct pen-name isolation across every serializer (mutes, comments, following feed, notifications, search) | The product promise | SEC-01/02/06 |
| Secret game state never sent to clients | Three games depend on it | SEC-03 |
| Private-group/circle event visibility | "Circles are invisible" promise | SEC-04 |
| Production email (SMTP) working end-to-end | Posting requires a verified email | DEP-04 |
| Feature flags enforced for non-core modules, defaults off | Avoid launching unmoderated dating/matchmaking | SEC-08 |
| Updated Terms/Privacy for the current product | Legal coverage of pen names, circles, games | DEP-12 |

## B. Gaps that limit activation and growth
| Gap | Evidence |
|---|---|
| Share from the account-free result | Only "Save" / "Start again" on preview (`studio.tsx:335-361`) |
| Share payload with a link and referral attribution | `shareOrDownload` sends image + text only |
| Per-link previews for invites and public identity pages | Static SPA `index.html`; relative, 1.3 MB `og:image` |
| Analytics: persona card share, offer viewed, preview→signup click, acquisition source, assessment step drop-off, email-verified | `09` §6 |
| Re-engagement channel (push or opt-in email digest for circle activity) | Push not implemented; rituals send no nudges |
| Cold-start content for solo users (e.g. seeded public prompts, solo-playable games beyond Pick Your Chaos) | Feed empty for new users; 11/12 games need a group |
| Clear explanation that "Public" posts need a public profile (or change the rule) | PRD-04 |

## C. Gaps in quality and operations
| Gap | Evidence |
|---|---|
| CI pipeline | none in git |
| Error monitoring, uptime alerting, request metrics | none |
| Backups for Supabase free | repo docs say none downloadable |
| Data retention jobs | `04` §4 |
| Straight-lining detection and calibrated archetype distribution | DEF-04 |
| Accessible names on assessment radios | DEF-10 |
| Real-Postgres test run in CI | QA-04 |

## D. Explicitly NOT gaps (do not build now)
- Realtime/websocket games (polling at 3 s is adequate for a beta).
- Circle discovery / public circles (contradicts the privacy model).
- Streaks (deliberately excluded).
- Cash-value points, redemption marketplace.
- More games — fix and measure the twelve first.
- AI features (positioning says "no AI in the product").

## E. Implemented but unfinished outside the core (for the keep/remove decision)
Video/voice consultations (no provider), push (no provider), recurring subscription billing (manual renewal), Hindi localisation (navigation only), Razorpay live verification.
