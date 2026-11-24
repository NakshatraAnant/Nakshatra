# 06 — Remaining 50-Feature Roadmap

Status per feature is in `05_FEATURE_IMPLEMENTATION_MATRIX.csv`. Summary of the 50 candidates: **11 newly implemented or fixed & tested** (1, 4, 14, 15, 33, 35, 41, 42, 43 partial, 44, 47) + 50 (implemented, browser-verified only), **16 already existed** and were kept, **2 deliberately not built** (mutual circle discovery, circle discovery — contradict the private-circle promise), **the rest deferred**.

## Recommended next sequence (value ÷ cost, privacy-safe first)
| Order | Feature | Why now | Dependencies | Size |
|---|---|---|---|---|
| 1 | Re-engagement digest (opt-in weekly circle email) | No external return loop exists today | SMTP provider | S |
| 2 | Friend (pair) streaks | Social retention without public pressure | Progression engine (done) | S |
| 3 | Personal Year/Season recap (identity-based) | Shareable moment; data already exists | Timeline, seasons | M |
| 4 | Archetype blending view | Explains secondary archetype honestly | Personality model | S |
| 5 | Mini assessment engine | Repeatable identity content | Content + psychometric review | M |
| 6 | Circle channels | Bigger circles need structure | Circle data model | M |
| 7 | Recurring circle events | Habit around real-world meetups | Events (privacy fixed) | S |
| 8 | Photo carousels | Expression | Uploads → object storage first | M |
| 9 | People discovery (opt-in only) | Growth beyond existing friends | Consent model, safety review, moderation staffing | L |
| 10 | Avatar creator / theme studio | Cosmetics and monetisation | Art | L |

Deferred with reasons: voice & video (moderation cost), user quiz builder (UGC moderation), tournaments & seasonal leaderboards (competitive pressure; revisit with data), creator profiles (creator programme, payouts, KYC).
