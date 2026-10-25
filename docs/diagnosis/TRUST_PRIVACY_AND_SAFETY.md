# Trust, privacy and safety

_2026-10-25. This is not legal advice. Every regulatory item needs review by Indian counsel. The DPDP dates come from secondary sources (EY, ORF, Storyboard18); I did not read the Gazette text [Unknown]._

## Regulatory context
- **DPDP Act 2023 and DPDP Rules 2025** (notified November 2025) [External]:
  - The Rules phase in: consent-manager provisions after one year; most obligations after 18 months, around 13 May 2027.
  - The 18-month obligations cover notice, consent, security safeguards, breach notification, retention, rights requests and verifiable parental consent for children.
- **CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023** [External]: 13 named patterns, including subscription trap, false urgency, confirm-shaming, basket sneaking and drip pricing.
- **IT Rules (grievance officer)** [Founder]: already noted as an owner action in `RELEASE_READINESS_REPORT.md`.
- **Drugs and Magic Remedies (Objectionable Advertisements) Act, 1954** [Inference]: may matter if remedies or gemstones are sold with health claims. Counsel to confirm.

## Risk register
| # | Risk | Where | Likelihood | Impact | Label | Mitigation |
|---|---|---|---|---|---|---|
| R1 | A third party's birth data processed on the user's self-attested permission (attestation required by form and API) | Private Bonds (`bonds.ts`) | High once launched | High | [Observed] | Remove from the MVP, or add an explicit notice and keep the data local to the user. Default to the consented invite |
| R2 | Minors' data (birth date reveals age) | Signup uses a self-declared 18+ checkbox (`auth.tsx`) | Medium | High | [Observed] | Refuse and discard if the computed age is under 18. Keep the same gate in the no-signup flow |
| R3 | Marriage harm from Guna or Manglik output | Bonds, matchmaking, reports | Medium | High | [Inference] | Never show match/no-match. Explain the conventions and exceptions. No remedy upsells |
| R4 | Dark-pattern exposure | Subscription, checkout | Low if the MVP is one-time only | Medium | [External] | One-time pricing, full price up front, easy refunds |
| R5 | Remedy and authenticity claims | Physical shop (rudraksha, diyas; samples only) | Medium if enabled | High | [Inference] | Keep the physical shop hidden |
| R6 | Dating and matchmaking safety | dating, matchmaking, messaging | High if enabled | High | [Inference] | Keep these hidden |
| R7 | Expert advice harm or fraud | experts | Medium if enabled | High | [Inference] | Keep this hidden |
| R8 | Breach of birth data and email | Database | Low–medium | High | [Inference] | Sessions are already hashed, with export and delete [Observed]. Add a retention schedule for anonymous charts, a breach runbook and a penetration test |
| R9 | Trademark conflict | Brand | Medium | Medium | [External] | Clearance search; shortlist backup names |
| R10 | Content perceived as fake or generic | Reports | High today | Medium (refunds, reviews) | [Verified] content stats | New content; refund policy |
| R11 | Payment disputes | Razorpay | Low | Medium | [Inference] | Clear descriptor, instant delivery, refunds without argument |

## Existing strengths
All [Observed]:
- private by default
- per-field visibility
- consent records for chart sharing
- revocation
- JSON export
- deletion with de-identified retention
- refusal of the dev simulator and dev mailbox in production
- sample data labelled
- honest disclaimers

These are a real differentiator against the trust failures seen in the category (Nebula complaints [External]).
