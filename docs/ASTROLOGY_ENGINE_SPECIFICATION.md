# Astrology engine specification

Engine: `src/astro/` (pure TypeScript, no I/O, no network). `ENGINE_VERSION` is stored with every chart so results can be reproduced or recalculated. Astrology is presented as a cultural and interpretive practice, not as scientific prediction; this disclaimer appears on the methodology page, reports and compatibility screens.

## Dependencies and licensing
| Dependency | Use | Licence |
|---|---|---|
| `astronomy-engine` 2.x | Apparent geocentric positions of Sun, Moon, planets on the true ecliptic of date; sidereal time; rise/set; moon phases | MIT |
| `luxon` 3.x | Historical IANA time zones, DST gap/fold detection | MIT |
No proprietary ephemeris or scraped data. Lahiri ayanamsa uses the published Swiss Ephemeris `SE_SIDM_LAHIRI` epoch definition plus IAU 2006 precession (formula, not code).

## Inputs
`BirthInput { date: 'YYYY-MM-DD', time: 'HH:mm' | null, timePrecision: exact | within_15m | within_1h | unknown, latitude, longitude, timezone (IANA) }` plus a `ChartConfig { system: vedic | western, houseSystem, nodeType }`.

## Pipeline
1. **Time normalisation** (`time.ts`): civil time + IANA zone → UTC using the zone's historical rules (e.g. Kolkata +06:30 in 1943). Non-existent local times (spring-forward gap) and ambiguous ones (fall-back) raise `BirthDataError` with the candidate offsets so the user chooses. Unknown time → local noon, `timeAssumed = true`, ±12 h uncertainty window. Invalid dates (29 Feb in non-leap years, future dates) are rejected.
2. **Positions** (`ephemeris.ts`): apparent geocentric ecliptic longitude/latitude and speed for Sun, Moon, Mercury–Pluto at the UTC instant (TT handled by the library). Retrograde = negative daily motion.
3. **Lunar nodes**: mean node and true node per Meeus ch. 47. Ketu = Rahu + 180°.
4. **Ayanamsa** (`ayanamsa.ts`): Lahiri mean = 23.250182778° at JD 2435553.5 advanced by IAU 2006 general precession; true = mean + nutation in longitude. Sidereal longitude = tropical − ayanamsa.
5. **Houses** (`houses.ts`, `chart.ts`): whole-sign houses start at the Ascendant's sign *in the chart's zodiac* (fixed 2026-10-24, engine 1.0.1: earlier sidereal whole-sign cusps were tropical cusps shifted by the ayanamsa, misplacing planets that precede the Lagna degree in the Lagna sign). ASC/MC from local apparent sidereal time and true obliquity. Systems: whole sign (Vedic default), equal, Porphyry, Placidus (semi-arc iteration; above ~66° latitude Placidus is undefined, so Porphyry is used and a warning is attached). Houses and ASC are omitted when the time is unknown.
6. **Placements** (`chart.ts`): sign, degree, nakshatra (27 × 13°20′) and pada (4 × 3°20′), house, dignity (exalted / debilitated / own sign / none), retrograde. Combustion is used in muhurat checks (Jupiter > 11°, Venus > 10° from the Sun) but not shown per placement.
7. **Reliability**: the chart is recomputed at both edges of the time-uncertainty window. Factors that change (ASC sign, Moon sign, nakshatra, houses) are marked `uncertain` and the dependent insights carry a badge.

## Vedic techniques
| Technique | Method | Notes |
|---|---|---|
| Vimshottari dasha | Moon's nakshatra fraction; 120-year cycle; 365.25-day years; mahadasha + antardasha + pratyantar | Active period at a boundary belongs to the new period |
| Vargas | 13 charts shown: D1, D2 (Hora), D3, D4, D7, D9, D10, D12, D16, D20, D24, D30, D60, using classical rules | Trimshamsa odd/even tables |
| Yogas | Rule-based detectors: Gajakesari, Budhaditya, Sunapha, Anapha, Durudhara, Kemadruma, Vesi, Vasi, Ubhayachari, Pancha Mahapurusha (5), Raja yoga (kendra–trikona lords conjoined), Viparita Raja, Yogakaraka planet | Each reports its rule text and caveat |
| Manglik | Mars in 1/2/4/7/8/12 from Lagna, Moon and Venus, with documented cancellations | Shown as a traditional consideration, never a verdict |
| Kaal Sarp | All seven grahas hemmed between Rahu–Ketu axis | |
| Sade Sati / Dhaiya | Transit Saturn relative to natal Moon sign | |
| Ashtakavarga | Bhinnashtakavarga per planet; SAV totals 337 | Needs birth time |
| Guna Milan | Ashtakoota v1 tables: Varna 1, Vashya 2, Tara 3, Yoni 4, Graha Maitri 5, Gana 6, Bhakoot 7, Nadi 8 (=36) | Roles selectable (owner as groom/bride) or shown both ways |
| Gochar | Current transits of nine grahas, houses from Moon | |
| **Not implemented** | Shadbala, Jaimini, KP and Raman ayanamsas | Omitted rather than approximated; the API returns an `unsupported` list |

## Panchang and calendar
| Element | Method |
|---|---|
| Tithi | floor((Moon − Sun) mod 360 / 12) at local sunrise (udaya convention) |
| Nakshatra | Sidereal Moon at sunrise |
| Yoga | floor((sidereal Sun + sidereal Moon) mod 360 / 13°20′) |
| Karana | Half-tithis, fixed karanas at the cycle ends |
| Vara | Weekday from local sunrise |
| Lunar month | Amanta; named by the Sun's sidereal sign at the preceding new moon; Adhika when no sankranti occurs between new moons |
| Day periods | Rahu Kaal, Yamaganda, Gulika (eighths of daytime by weekday), Abhijit (8th of 15 daytime muhurtas), Brahma muhurta (96–48 min before sunrise) |
| Festivals | `festivalsForYear`: each festival defined by (month, paksha, tithi) or solar ingress plus an observance-time rule (sunrise, pradosh, nishita, madhyahna, aparahna). Vijayadashami uses aparahna (Dashami in the afternoon). Holika Dahan/Holi apply the Bhadra rule: the Vishti half of Purnima must end by local midnight of the pradosh evening, otherwise the observance moves to the next evening |
| Muhurat | Rule set v1: excludes Rikta tithis (4, 9, 14), Amavasya, inauspicious nakshatras for the event type, Rahu Kaal; returns each rule check so the result is explainable |

## Western techniques
Aspects (conjunction, sextile, square, trine, opposition; minor optional) with orbs (+2° when a luminary is involved); patterns (grand trine, T-square, yod, stellium); element/modality balance; transits to natal; secondary progressions (day-for-a-year, solar-arc MC); solar return (Sun within 1′); synastry; composite (midpoints); retrograde stations by root-finding on longitude speed.

## Compatibility
`compatibility.ts` reports **dimensions** (emotional, communication, attraction, stability, growth; colleagues omit attraction), each with its contributing factors and weights, plus Guna Milan when both Moon nakshatras are known. There is deliberately no single "compatibility %". Copy never predicts relationship success.

## Interpretations
Rules in `src/content/interpretations.ts` are seeded into `interpretation_content` with `rule_key`, `version`, conditions (e.g. Moon in sign X, yoga present, current dasha lord), precedence group and importance. `interpret(ctx, locale, rules)` evaluates conditions deterministically and returns title/body/caveat/source/factor/version. Admins edit by publishing a new version; saved insights keep the version the user saw.

## Precision and ranges
- Planet longitudes: within ~1″–10″ of Meeus worked examples (tested to < 0.01°; Moon < 0.003°).
- Supported range: astronomy-engine is valid for years −2000…+6000; time zones before 1970 depend on the IANA database's historical coverage (best for India and Europe since ~1900).
- Sunrise: astronomy-engine `SearchRiseSet` (upper limb, standard atmospheric refraction); tested at about 06:33 IST for Delhi on 2024-11-01, matching published tables.

## Reference validation (all automated, `npm run test:unit`)
- Meeus Ex. 25.b Sun 199°54′21.56″; Ex. 47.a Moon 133.167265° and mean node 274.400656°; Ex. 33.a Venus 313.08102°; Ex. 12.a apparent sidereal time 13h10m46.1351s.
- Lahiri ayanamsa at J2000 ≈ 23°51′25.5″.
- Geometric identities for ASC; Placidus cusp ordering; polar fallback.
- Time zones: Kolkata 1943 +06:30, modern IST, New York 2021 DST gap and fold, leap day validation, unknown-time handling.
- Panchang: Amavasya at sunrise 2024-11-01 New Delhi; Purnima 2025-03-14; sunrise ≈ 06:33 IST.
- Festivals vs published Indian calendars (2026 dates checked against the CAG 2026 holiday list, Drik Panchang and hindu-blog.com on 2026-10-24): 2026 — Maha Shivaratri 02-15, Holika Dahan 03-03, Holi 03-04, Raksha Bandhan 08-28, Ganesh Chaturthi 09-14, Navratri 10-11, Dussehra 10-20, Diwali 11-08. Earlier: Diwali 2024-10-31 and 2025-10-20; Holi 2025-03-14; Ram Navami 2025-04-06; Ganesh Chaturthi 2025-08-27; Navratri start 2025-09-22; Dussehra 2025-10-02; Makar Sankranti 2025-01-14; Vaisakhi 2025-04-14; Maha Shivaratri 2025-02-26; Raksha Bandhan 2025-08-09.
- Whole-sign regression: every planet's house equals its sign's distance from the Lagna sign (4 births, Vedic and Western whole-sign).
- Rule tests: nakshatra/pada boundaries, dasha arithmetic (120-year total), varga tables, SAV = 337, Guna Milan bounds and symmetry, reproducibility, Rahu/Ketu opposition, Moon-ingress uncertainty, Tromsø high latitude, solar return accuracy, progression rate, Mercury 2024 retrograde stations, Pythagorean numerology.

## Known limitations
- Regional festival traditions can differ by a day; the rule used is shown with each festival.
- Placidus is undefined at polar latitudes (Porphyry fallback, flagged).
- Only Lahiri ayanamsa is offered.
- Shadbala and several advanced systems are not implemented.

## Performance (measured 2026-10-24, `npx tsx scripts/bench-chart.ts`)
Warm: buildChart 4–5 ms, Vedic extras ~3 ms, Western extras ~4 ms; first call ~40 ms (module warm-up). `GET /api/v1/charts/me` 10–30 ms over HTTP because charts are cached per (birth profile, config, engine version).
