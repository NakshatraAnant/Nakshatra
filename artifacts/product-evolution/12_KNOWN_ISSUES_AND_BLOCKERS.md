# 12 — Known Issues and Blockers

## Blocked by external configuration
| Item | Needed |
|---|---|
| Real email (verification, reset, gift links) | SMTP provider + verified sending domain (`MAIL_TRANSPORT=smtp`, `SMTP_URL`, `MAIL_FROM`) |
| Any purchase | Payment provider, published refund policy, `PAYMENTS_ENABLED=true` (deliberately not done) |
| Push notifications | Push provider |
| Production DB verification (schema isolation, 22 legacy tables) | Read-only access to the (hibernated) Supabase project — not attempted per instructions |
| Legal sign-off | Lawyer review of the rewritten Terms/Privacy; contact/grievance address |

## Known issues
| Issue | Impact | Notes |
|---|---|---|
| E2E Journey E (expert booking) flaky in full suite | Legacy module only | Passed alone (16 s); failed twice in the full run waiting for a second slot. |
| Archetype distribution still centre-heavy | Calm in the Chaos wins ~25% of random sheets | Now only 1.2% *confidently* (91% of random sheets are labelled "low"). Prototype recalibration needs real response data. |
| Some analytics still missing | Funnel blind spots | UTM/acquisition source, assessment step drop-off; `preview_signup_clicked` and `offer_viewed` are defined but not emitted by the UI. |
| OG images ~1.3 MB | Slow previews in some apps | No local image tool. |
| No CI pipeline | Manual gates | Workflow file not added. |
| Late-payment auto-refund covers orders only | When payments go live | Bookings/subscriptions are legacy and off. |
| Blocking hides a person's pen-name posts too | Weak inference | Safety choice; documented. |
| MFA lost-device recovery | Lock-out risk | Needs recovery codes or support flow. |
| 3 moderate npm advisories | Low | Dependencies not upgraded. |
| Public header "Sign in" wraps at 360 px | Cosmetic | |
| Uploads stored as Postgres bytea in the Render blueprint | Quota | Object storage not added. |
| Scheduler runs in-process | Pauses when a free host sleeps | Fine locally. |

## Continuation checklist
1. Configure SMTP and run the signup → verify → gift-claim flow with real email.
2. Add a CI workflow (typecheck, lint, vitest, build, isolated e2e).
3. Emit `preview_signup_clicked`, `offer_viewed`; add UTM capture.
4. Investigate Journey E slot availability in the shared e2e DB.
5. Recalibrate archetype prototypes once ≥1–2k real responses exist.
6. Decide MFA recovery codes.
7. Compress OG images; move uploads to object storage before any hosted deployment.
