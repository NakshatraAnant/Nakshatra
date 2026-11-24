# Retention strategy

Nothing here has been measured yet. Every mechanism is a hypothesis until real users exist.

## Principles
- People return for real recurring value, not streak anxiety.
- Never recycle the same text as "new".
- Every notification is opt-in, configurable, and never fear-based.

## Architecture
| Rhythm | Mechanism | Status |
|---|---|---|
| Daily | Briefing: Moon transit through your chart, tithi, reflection, ritual (existing) | Live. Pools repeat in about 2 weeks (14 rituals, 12 lessons), so it should not be promoted as the main reason to return until there are ≥ 90 days of distinct content |
| Periodic | Dasha and sub-period changes (dates already calculated), festivals for your city (existing calendar), monthly recap (existing `/recap`) | Live in parts; no promotion yet |
| Social | Share cards (new), consented Bonds, shared report links (existing) | Live |
| Long-term | Saved insights, journal and timeline, reports library (existing) | Live |
| Event-based (proposed) | Opt-in reminders for a Bond partner's birthday, Bond anniversary and dasha transitions | Not built. Needs notification preferences per event (categories exist) |

## Personalisation boundaries
- **Used:** verified chart facts, derived attributes (archetype), explicit preferences (interests, leading system).
- **Not used:** inferred sensitive attributes, or relationship activity exposed to others.
- **Analytics:** separated from content. Event payloads never contain birth data (server-side sanitiser, plus tests for the new events).

## Metrics (definitions)
| Metric | Definition | Source |
|---|---|---|
| Activation | Account-free preview completed, or Cosmic ID saved | `cosmic_id_previewed`, `cosmic_id_completed` |
| Time to first value | Landing view → preview result (needs client timing; not yet instrumented) | Open |
| Share rate | Card downloads or shares ÷ completers | `cosmic_id_card_downloaded`, `cosmic_id_shared` |
| Invitation acceptance | Accepted ÷ sent | `bond_invitation_sent`, `invitation_accepted` |
| D1, D7, D30 | Members with a meaningful event on day N after signup | Existing cohort query (weekly) |
| Paid conversion | `product_ordered` ÷ preview completers | Existing |
| Guardrails | Refund rate, notification opt-outs, account deletions | Existing events |

The admin dashboard shows the discovery funnel and the weekly cohorts. All numbers today come from test traffic.
