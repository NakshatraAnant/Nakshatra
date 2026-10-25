# Typography

All three families are free on Google Fonts under the SIL Open Font License. Self-host the files in production.

| Role | Family | Weights |
|---|---|---|
| Display: headlines, archetype names, prompts, quotes | Instrument Serif | 400, 400 italic |
| UI: body, buttons, inputs, nav | Hanken Grotesk | 400, 500, 600, 700 |
| Labels: metadata, eyebrows, counters | JetBrains Mono | 500 |

```
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
```

## Scale (px · line-height · tracking)
| Token | Desktop | Mobile | Use |
|---|---|---|---|
| display-xl | 112–120 / .92 / -0.025em | 58 / 1 | Reveal name, landing closer |
| display-l | 88–92 / .96 / -0.02em | 48 / 1 | Landing hero |
| display-m | 64 / 1 / -0.015em | 40 / 1 | Section titles, screen titles (Play, Rituals) |
| display-s | 44 / 1 | 32 / 1.05 | Screen headers, circle names |
| prompt | 28–34 / 1.1 | 24–34 / 1.08 | Questions, ritual prompts, game quotes |
| title | 17–20 / 1.3 / 600 | 15–17 / 600 | Card titles, list rows |
| body-l | 18–19 / 1.5 | 16–17 / 1.45 | Posts, descriptions |
| body | 15 / 1.5 | 15 / 1.5 | Default |
| small | 13 / 1.45 / 500 | 12–13 | Meta, helper text |
| label | 11 / 1.2 / 500 / +0.12em / UPPERCASE mono | same | Eyebrows, counters, archetype tags |

## Rules
- Use Instrument Serif at 24px or larger only. Below that, use Hanken Grotesk.
- Italic serif marks the voice of the product: taglines, moods, "or" in This or That, confessions.
- Put mono labels above serif headlines as eyebrows, max 40 characters.
- `text-wrap: pretty` on all multi-line copy. Minimum body size is 15px on mobile.
- Numbers in stats use Hanken 600 with tabular-nums.
