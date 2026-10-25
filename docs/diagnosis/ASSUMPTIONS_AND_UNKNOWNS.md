# Assumptions and unknowns

_2026-10-25._

## Assumptions in this diagnosis
| ID | Assumption | Why it matters | How to check |
|---|---|---|---|
| A1 | Launch market is India first, plus the diaspora | Drives pricing, language and payment provider | Owner confirms (already listed in `docs/DECISIONS_AND_ASSUMPTIONS.md`) |
| A2 | The owner keeps the no-AI rule | Content must be written by hand, which costs more | Owner confirms |
| A3 | The founder has limited time and budget, with no team | Favours a narrow wedge | Owner confirms |
| A4 | Web checkout comes before app stores | Avoids the Play fee of up to 15% | — |
| A5 | GST applies after registration | Changes net revenue by about 15% | Tax adviser |
| A6 | Conversion and completion rates in `UNIT_ECONOMICS_MODEL.md` | Every revenue estimate depends on them | Experiments E04–E08 |
| A7 | The 18+ audience only | Avoids DPDP children's-data duties | Counsel |
| A8 | Hiding modules is enough. Nothing needs deleting | Protects existing work | — |

## Unknowns
| ID | Unknown | Impact | Owner of answer |
|---|---|---|---|
| U1 | Would anyone pay for a pair report when free Guna Milan exists? | Decides the wedge | E07 |
| U2 | Is J1 (couples/friends) or J2 (families) the stronger job? | Decides the variant | E01, E10 |
| U3 | Can the team write content that wins the blind test? | Decides feasibility | E02 |
| U4 | Can the name be used and protected? | Brand spending | Counsel (E15) |
| U5 | Does the owner have a distribution asset (community, creator, network)? | Could change the channel or wedge | Owner |
| U6 | What did the `yournakshatra.lovable.app` archetype prototype achieve (sign-ups, shares)? | It may hold the only real user evidence | Owner |
| U7 | Is Indian cost per click in this category below the ₹0.74 break-even? | Viability of paid acquisition | Small ad test after Gate 2 |
| U8 | Print-on-demand partner margins in India | M4 viability | Partner quotes |
| U9 | Creator affiliate rates | M5 viability | Outreach |
| U10 | The exact DPDP Rule commencement dates in the Gazette | Compliance timeline | Counsel |
| U11 | Whether Drugs and Magic Remedies Act or consumer-law limits apply to astrology product claims | Shop risk | Counsel |
| U12 | Do 3D visuals raise shares or payment? | Whether to keep investing in 3D | Compare E05 variants |
| U13 | Whether the e2e suite still passes 20/20 | Technical confidence (unit tests re-passed today) | Run `npx playwright test` |
| U14 | Actual funnel drop-off at each onboarding step | Size of the problem described in section 5 of the main report | Funnel view after launch |
