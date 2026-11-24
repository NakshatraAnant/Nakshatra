# Unit economics model

_2026-10-25. Every rate and conversion below is a **[Hypothesis]** unless marked otherwise. Fee rates are **[External]** (Razorpay: 2% plus 18% GST on the fee; Google Play India: at most 15%). Nakshatra has no sales data **[Verified]**._

## Formulae
- Net of GST = price ÷ 1.18 (applies once the business is GST-registered; check with a tax adviser [Inference])
- Payment fee = price × 2% × 1.18 = price × 2.36%
- Contribution = net of GST − payment fee − marginal compute (about ₹0; one chart takes 3–5 ms [Founder])
- Revenue per visitor = completion rate × paid conversion × contribution

## One-time pair report (web checkout)
| | Low | Base | High |
|---|---|---|---|
| Price (incl. GST) | ₹149 | ₹199 | ₹299 |
| Net of GST | ₹126.27 | ₹168.64 | ₹253.39 |
| Razorpay fee | ₹3.52 | ₹4.70 | ₹7.06 |
| **Contribution per sale** | **₹122.75** | **₹163.94** | **₹246.33** |
| Landing visitor → preview completed | 20% | 30% | 40% |
| Preview → paid | 0.5% | 1.5% | 3% |
| Paid buyers per 1,000 visitors | 1 | 4.5 | 12 |
| **Revenue per 1,000 visitors** | **₹123** | **₹738** | **₹2,956** |
| **Break-even acquisition cost per visitor** | ₹0.12 | ₹0.74 | ₹2.96 |

How to read this table [Inference]:
- **Paid acquisition will not pay for itself in the low or base case.** Any realistic paid click price will be above ₹0.74 per visitor, though I have no Indian cost-per-click data [Unknown]. Growth must therefore come from shares, Bonds, gifts and creators.
- **Through Android in-app billing,** a fee of up to 15% would cut contribution by about ₹19–38 per sale. Stay on web checkout first.

## Viral coefficient
- k = invites sent per completer × partner completion rate.
- Example: 1.0 invites × 30% completion = k of 0.3.
- At k = 0.3, every 100 seeded users become about 143 users in total: 100 ÷ (1 − 0.3).
- Gate 3 requires k ≥ 0.3.

## Subscription (deferred, shown for comparison)
| | Low | Base | High |
|---|---|---|---|
| Monthly price | ₹199 | ₹199 | ₹199 |
| Contribution per month | ₹163.94 | ₹163.94 | ₹163.94 |
| Monthly churn | 20% | 12% | 8% |
| Lifetime value (contribution ÷ churn) | ₹820 | ₹1,366 | ₹2,049 |

Day-30 retention for lifestyle apps is in the low single digits [External: Braze, 2026]. Any of these lifetime values needs a paying base that keeps coming back. Nakshatra has no evidence of that yet.

## Fixed costs
[Inference] Exact amounts are unknown:
- **Content writing** is the main cost: about 230 new texts for the MVP (3 layers in 2 systems, a Hinglish version, and pair-report sections) [Unknown: rate].
- **Legal:** review of the terms and privacy policy, plus a trademark search and filing [Unknown: counsel fees].
- **Hosting:** a single Node process plus PostgreSQL; small at MVP scale [Unknown: provider].
- **Razorpay:** the setup terms were not checked [Unknown].
- **Founder time:** the real constraint.

## Break-even example (base case)
If content and legal costs come to ₹X:
- Base-case sales needed = X ÷ ₹163.94
- Visitors needed = X ÷ ₹0.738

For example, recovering ₹1,00,000 would take about 610 sales, or about 135,500 visitors at base rates. At the high-case rates it would take about 34,000 visitors. That is why content quality and the share loop (which pushes conversion and k) matter more than the price.
