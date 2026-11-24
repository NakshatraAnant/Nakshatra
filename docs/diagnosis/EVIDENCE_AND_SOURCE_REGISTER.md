# Evidence and source register

_Accessed 2026-10-25 unless noted. "Pub." means the publication date where the source states one. Confidence: H (high), M (medium), L (low)._

## Internal evidence (repository)
| ID | Evidence | Method | Label |
|---|---|---|---|
| I01 | Typecheck, lint, 118/118 tests passed | Ran `npm run typecheck`, `npm run lint` and `npx vitest run` on 2026-10-25 | Verified |
| I02 | 343 routes, 15 modules, 129 tables, 3 migrations | Counted from source and database | Verified |
| I03 | 10 users, all seed or test accounts | Queried the development database | Verified |
| I04 | 276 rules, 264 unique bodies, ~6,545 unique words, 0 Hindi bodies | Script over `src/content/interpretations.ts` | Verified |
| I05 | Western and Vedic layers share body text | Same script | Verified |
| I06 | Daily pool sizes | `src/content/daily.ts` | Verified |
| I07 | Paid reports reuse `interpret()` | `src/server/services/reports.ts` | Observed |
| I08 | Private Bond path stores self-entered third-party data | `src/server/modules/bonds.ts` lines 93–105 | Observed |
| I09 | 18+ is a self-declared checkbox | `src/web/pages/auth.tsx` lines 78–115 | Observed |
| I10 | Placeholder prices and commission | `src/server/db/seed.ts` lines 36–58, 150–152 | Observed |
| I11 | Analytics taxonomy (~30 events) and no funnel view | `src/server/lib/context.ts` | Verified |
| I12 | Archetype names absent | Searched `src/` and `nakshatra_mvp.html` | Verified |
| I13 | 20/20 e2e results | `docs/RELEASE_READINESS_REPORT.md` (2026-10-24); not re-run | Founder (prior session) |
| I14 | Prior strategy report (29 Sep 2026) recommended a narrow wedge | Extracted text of the owner-supplied docx | Founder |

## External sources
| ID | Claim | Source | Pub. | Conf. |
|---|---|---|---|---|
| X01 | Astrotalk FY25 revenue and profit | [Outlook Business](https://www.outlookbusiness.com/start-up/news/astrotalk-reports-85-revenue-growth-in-fy25-as-tier-i-cities-boost-platform-activity) | 2025 | M |
| X02 | Astrotalk FY25 PAT, business mix | [Inc42](https://inc42.com/features/can-astrotalk-chart-a-future-beyond-astrology/) | 2025 | M |
| X03 | Astrotalk free first chat | [Astrotalk blog](https://astrotalk.com/astrology-blog/astrotalk-coupon-code-complete-guide/) | n/d | M |
| X04 | Astrotalk per-minute range | [TechJockey](https://www.techjockey.com/reviews/astrotalk1) | n/d | L |
| X05 | InstaAstro ₹1 first consult | [InstaAstro](https://instaastro.com/free-talk-chat-with-astrologer/) | n/d | H |
| X06 | InstaAstro revenue, Series A, market size | [Entrepreneur India](https://india.entrepreneur.com/business-news/instaastro-crosses-inr-200-crore-in-annualized-revenue-raises-usd-12-million-series-a) | 2026 | M (market size L) |
| X07 | InstaAstro funding use | [Inc42](https://inc42.com/buzz/instaastro-bags-12-mn-to-build-ai-tools-expand-online-pooja-services/) | 2026 | M |
| X08 | AstroSage features | [App Store](https://apps.apple.com/app/id824705526) | n/d | H |
| X09 | AstroSage downloads, AI | [Stork](https://www.stork.ai/en/astrosage) | n/d | L |
| X10 | Midjourney acquires Co-Star | [Bloomberg Law](https://news.bloomberglaw.com/private-equity/ai-lab-midjourney-buys-astrology-startup-co-star-plans-new-apps) | 24 Jul 2026 | H |
| X11 | Co-Star acquisition, user estimate | [TechCrunch](https://techcrunch.com/?p=3146313) | Jul 2026 | M |
| X12 | Co-Star in-app purchase prices | [App Store](https://apps.apple.com/app/id1264782561) | n/d | H |
| X13 | CHANI pricing | [Adapty](https://adapty.io/paywall-library/chani/), [App Store](https://apps.apple.com/app/id1532791252) | n/d | M |
| X14 | The Pattern pricing | [Adapty](https://adapty.io/paywall-library/the-pattern/) | 2024 data | L |
| X15 | Tinder Astrology Mode | [Mediaweek](https://www.mediaweek.com.au/tinder-unveils-biggest-product-overhaul-in-years-at-sparks-2026-keynote) | Mar 2026 | M |
| X16 | Tinder Astrology Mode | [Trendhunter](https://www.trendhunter.com/trends/tinder-astrology-mode) | 2026 | L |
| X17 | Tinder Mumbai campaign | [Indian Television](https://indiantelevision.com/iworld/tinder-turns-to-astrology-as-mumbai-street-campaign-sparks-dating-debates/) | 2026 | M |
| X18 | US astrology use | [Pew Research](https://www.pewresearch.org/religion/2025/05/21/3-in-10-americans-consult-astrology-tarot-cards-or-fortune-tellers/) | 21 May 2025 | H |
| X19 | Indian user gender and age split | [Storyboard18](https://storyboard18.com/digital/young-indian-women-lead-digital-astrology-platforms-for-guidance-ws-l-91803.htm) | Mar 2026 | L (single company) |
| X20 | DPDP Rules phasing | [EY](https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025) | Nov 2025 | M |
| X21 | DPDP and children's data | [ORF](https://www.orfonline.org/expert-speak/dpdp-rules-and-the-future-of-child-data-safety) | 2025 | M |
| X22 | DPDP notification | [Storyboard18](https://www.storyboard18.com/digital/breaking-govt-notifies-final-dpdp-rules-sets-staggered-rollout-with-key-obligations-for-data-fiduciaries-84201.htm) | Nov 2025 | M |
| X23 | CCPA dark patterns | [JSA](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/) | Dec 2023 | H |
| X24 | CCPA dark patterns | [SCC Online](https://www.scconline.com/blog/post/2023/12/04/ccpa-notifies-guidelines-for-prevention-and-regulation-of-dark-patterns-2023-legal-news/) | 4 Dec 2023 | H |
| X25 | Nebula complaints | [Trustpilot](https://www.trustpilot.com/review/appnebula.co?page=9) | various | L (anecdotal) |
| X26 | Nebula subscription issue | [Apple Discussions](https://discussions.apple.com/thread/256064321) | 2025 | L |
| X27 | 16Personalities paid tier | [16Personalities](https://www.16personalities.com/premium/pro-suite) | n/d | H |
| X28 | Chart art prices | [Natal Echo](https://natalecho.com/shop) | n/d | M |
| X29 | Etsy chart reading listing | [Etsy](https://www.etsy.com/listing/1695936426/birth-chart-custom-astrology-reading) | n/d | M |
| X30 | Razorpay fees | [Razorpay](https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/) | n/d | H |
| X31 | Google Play India fee | [Google India blog](https://blog.google/intl/en-in/products/platforms/sustaining-google-play-as-a-valuable-partner-to-indias-app-ecosystem/) | n/d | H |
| X32 | Google Play service fees | [Play Console Help](https://support.google.com/googleplay/android-developer/answer/112622?hl=en) | n/d | H |
| X33 | Day-30 retention by category | [Braze](https://www.braze.com/resources/articles/mobile-app-retention) | Jul 2026 | M |
| X34 | Cross-category retention roundup | [Quash](https://quashbugs.com/blog/app-retention-rate-statistics) | 2026 | L |
| X35 | Spotify Wrapped 2024 reach | [WDEF](https://www.wdef.com/?p=2271401) | Dec 2024 | L (secondhand) |
| X36 | Spotify Wrapped case study | [The Brand Hopper](https://thebrandhopper.com/2025/06/10/a-case-study-on-spotify-wrapped-the-storytelling-phenomenon/) | 10 Jun 2025 | L |
| X37 | "Nakshatra Jyotish" (~500k downloads) | [AppFollow](https://appfollow.io/android/nakshatra-jyotish/com.naksh.jyots?country=in) | n/d | M |
| X38 | MyNaksh developer | [Google Play](https://play.google.com/store/apps/developer?id=MyNaksh) | n/d | H |
| X39 | Naksh: Vedic Matchmaking | [mwm.ai](https://mwm.ai/apps/naksh-vedic-matchmaking/6766238783) | n/d | M |
| X40 | Nakshatra AI listing | [topai.tools](https://topai.tools/s/nakshatra-ai) | n/d | L |
| X41 | Russian "Накшатра" app | [App Store RU](https://apps.apple.com/ru/app/%D0%BD%D0%B0%D0%BA%D1%88%D0%B0%D1%82%D1%80%D0%B0-%D0%B2%D0%B5%D0%B4%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9-%D0%B3%D0%BE%D1%80%D0%BE%D1%81%D0%BA%D0%BE%D0%BF/id1382250647?l=en-GB) | n/d | H |

## From the prior report (not re-verified)
- Matrimony.com FY26 revenue (about ₹460 cr) and paid subscriptions (about 0.96M).
- Astrotalk's share of marriage-related questions (about 60%).
- A jewellery brand using the name.
- Its other sources were cited inside that report, and I did not reuse its URLs, because the docx extract truncated them.

## Searched but not found
- A nationally representative survey of astrology use in India.
- An astrology-specific retention benchmark.
- 16Personalities Pro Suite pricing.
- Jeevansathi's kundli feature details.
- Indian cost-per-click data for this category.
