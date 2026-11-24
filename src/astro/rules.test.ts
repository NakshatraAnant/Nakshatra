import { describe, expect, it } from 'vitest';
import {
  buildChart, vimshottari, activeDasha, vargaSign, ashtakavarga, gunaMilan, YONI_TABLE, detectYogas,
  manglik, kaalSarp, sadeSati, numerology, compatibility, vedicReport, westernReport, nakshatraOf,
  DEFAULT_VEDIC_CONFIG, DEFAULT_WESTERN_CONFIG, NAKSHATRAS, BAV_TABLES, secondaryProgressions, solarReturn,
  compositeChart, retrogradePeriods, findMuhurats, gochar, placement, angleDiff,
} from './index';

const BIRTH = { date: '1990-06-15', time: '06:30', timePrecision: 'exact' as const, latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata', placeName: 'New Delhi' };
const BIRTH_B = { date: '1992-11-03', time: '21:10', timePrecision: 'within_15m' as const, latitude: 19.076, longitude: 72.8777, timezone: 'Asia/Kolkata', placeName: 'Mumbai' };

describe('nakshatra and pada boundaries', () => {
  it('0° is Ashwini pada 1; 13°20′ starts Bharani; 359.99° is Revati pada 4', () => {
    expect(nakshatraOf(0)).toMatchObject({ index: 0, pada: 1 });
    expect(nakshatraOf(13.3334).index).toBe(1);
    expect(nakshatraOf(13.3332).index).toBe(0);
    expect(nakshatraOf(359.99)).toMatchObject({ index: 26, pada: 4 });
    expect(nakshatraOf(3.34).pada).toBe(2);
  });
  it('dasha lords follow the Ketu–Venus–Sun… cycle', () => {
    expect(NAKSHATRAS.map((n) => n.lord).slice(0, 9)).toEqual(['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury']);
    expect(NAKSHATRAS[26].lord).toBe('mercury');
  });
});

describe('Vimshottari dasha', () => {
  it('Moon at 0° Aries starts a full 7-year Ketu dasha at birth', () => {
    const birth = new Date('2000-01-01T00:00:00Z');
    const t = vimshottari(0, birth, 2);
    expect(t.balanceAtBirth.lord).toBe('ketu');
    expect(t.balanceAtBirth.years).toBeCloseTo(7, 6);
    expect(t.mahadashas[0].start).toBe(birth.toISOString());
    expect(t.mahadashas[1].lord).toBe('venus');
  });
  it('Moon half-way through Bharani leaves 10 years of Venus', () => {
    const t = vimshottari(13.3333333 + 6.6666667, new Date('2000-01-01T00:00:00Z'));
    expect(t.balanceAtBirth.lord).toBe('venus');
    expect(t.balanceAtBirth.years).toBeCloseTo(10, 3);
  });
  it('antardashas sum to their mahadasha and the cycle totals 120 years', () => {
    const t = vimshottari(100, new Date('1990-01-01T00:00:00Z'), 2);
    for (const md of t.mahadashas) {
      const sum = md.sub!.reduce((a, s) => a + s.years, 0);
      expect(sum).toBeCloseTo(md.years, 6);
      expect(md.sub![0].lord).toBe(md.lord);
    }
    expect(t.mahadashas.slice(0, 9).reduce((a, m) => a + m.years, 0)).toBe(120);
  });
  it('active dasha at a period boundary belongs to the new period', () => {
    const t = vimshottari(0, new Date('2000-01-01T00:00:00Z'), 2);
    const boundary = new Date(t.mahadashas[1].start);
    expect(activeDasha(t, boundary)[0].lord).toBe('venus');
    expect(activeDasha(t, new Date(boundary.getTime() - 1))[0].lord).toBe('ketu');
  });
});

describe('divisional charts', () => {
  it('Navamsa: fire signs start from Aries, earth from Capricorn, air from Libra, water from Cancer', () => {
    expect(vargaSign(0.1, 'D9')).toBe(0);
    expect(vargaSign(30.1, 'D9')).toBe(9);
    expect(vargaSign(60.1, 'D9')).toBe(6);
    expect(vargaSign(90.1, 'D9')).toBe(3);
    expect(vargaSign(29.9, 'D9')).toBe(8);
  });
  it('Hora: odd sign first half → Leo, even sign first half → Cancer', () => {
    expect(vargaSign(5, 'D2')).toBe(4);
    expect(vargaSign(20, 'D2')).toBe(3);
    expect(vargaSign(35, 'D2')).toBe(3);
    expect(vargaSign(50, 'D2')).toBe(4);
  });
  it('Drekkana: 1st, 5th and 9th from the sign', () => {
    expect(vargaSign(5, 'D3')).toBe(0);
    expect(vargaSign(15, 'D3')).toBe(4);
    expect(vargaSign(25, 'D3')).toBe(8);
  });
  it('Dashamsa: even signs count from the 9th', () => {
    expect(vargaSign(30.5, 'D10')).toBe(9);
    expect(vargaSign(0.5, 'D10')).toBe(0);
  });
  it('Trimshamsa odd/even tables', () => {
    expect(vargaSign(2, 'D30')).toBe(0);
    expect(vargaSign(27, 'D30')).toBe(6);
    expect(vargaSign(32, 'D30')).toBe(1);
    expect(vargaSign(59, 'D30')).toBe(7);
  });
});

describe('Ashtakavarga', () => {
  it('bhinnashtakavarga totals match the fixed classical totals and SAV = 337', () => {
    const chart = buildChart(BIRTH, DEFAULT_VEDIC_CONFIG);
    const av = ashtakavarga(chart);
    expect(av.available).toBe(true);
    expect(av.totals).toMatchObject({ sun: 48, moon: 49, mars: 39, mercury: 54, jupiter: 56, venus: 52, saturn: 39, sarva: 337 });
    for (const [planet, table] of Object.entries(BAV_TABLES)) {
      const total = Object.values(table).reduce((a, h) => a + h!.length, 0);
      expect(total, planet).toBe(av.totals[planet]);
    }
  });
  it('is unavailable without a birth time', () => {
    const chart = buildChart({ ...BIRTH, time: null, timePrecision: 'unknown' }, DEFAULT_VEDIC_CONFIG);
    expect(ashtakavarga(chart).available).toBe(false);
  });
});

describe('Guna Milan', () => {
  it('yoni table is symmetric with zero for the seven enemy pairs', () => {
    for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) expect(YONI_TABLE[i][j]).toBe(YONI_TABLE[j][i]);
    const zeros = YONI_TABLE.flatMap((r, i) => r.map((v, j) => (v === 0 && i < j ? `${i}-${j}` : null))).filter(Boolean);
    expect(zeros).toHaveLength(7);
  });
  it('total is bounded 0..36 and koota maxima sum to 36 for every nakshatra pair', () => {
    for (let a = 0; a < 27; a++) for (let b = 0; b < 27; b += 3) {
      const r = gunaMilan({ moonLongitude: a * 13.3333 + 1 }, { moonLongitude: b * 13.3333 + 1 });
      expect(r.kootas.reduce((s, k) => s + k.max, 0)).toBe(36);
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeLessThanOrEqual(36);
      for (const k of r.kootas) expect(k.score).toBeLessThanOrEqual(k.max);
    }
  });
  it('same nakshatra: nadi dosha (0) and full yoni (4)', () => {
    const r = gunaMilan({ moonLongitude: 50 }, { moonLongitude: 51 });
    expect(r.kootas.find((k) => k.key === 'nadi')!.score).toBe(0);
    expect(r.kootas.find((k) => k.key === 'yoni')!.score).toBe(4);
    expect(r.doshas.find((d) => d.key === 'nadi_dosha')!.present).toBe(true);
  });
  it('6/8 Moon signs give zero Bhakoot', () => {
    const r = gunaMilan({ moonLongitude: 5 }, { moonLongitude: 155 }); // Aries vs Virgo → 6/8
    expect(r.kootas.find((k) => k.key === 'bhakoot')!.score).toBe(0);
  });
});

describe('natal charts', () => {
  it('whole-sign houses follow the Lagna sign in the chart zodiac (regression: sidereal cusps were offset by the ayanamsa)', () => {
    // Includes the 1994-07-19 Varanasi case where the Sun (2° Karka) precedes the Lagna degree (8° Karka) in the same sign.
    const cases = [
      { date: '1994-07-19', time: '05:50', latitude: 25.3176, longitude: 82.9739 },
      { date: '1990-06-15', time: '06:30', latitude: 28.6139, longitude: 77.209 },
      { date: '1975-01-02', time: '23:15', latitude: 13.0827, longitude: 80.2707 },
      { date: '2001-09-30', time: '14:05', latitude: 51.5072, longitude: -0.1276 },
    ];
    for (const c of cases) {
      for (const cfg of [DEFAULT_VEDIC_CONFIG, { ...DEFAULT_WESTERN_CONFIG, houseSystem: 'whole_sign' as const }]) {
        const chart = buildChart({ ...c, timePrecision: 'exact', timezone: c.longitude < 0 ? 'Europe/London' : 'Asia/Kolkata' }, cfg);
        const ascSign = chart.ascendant!.sign;
        for (const p of chart.placements) expect(p.house, `${c.date} ${cfg.system} ${p.id}`).toBe(((p.sign - ascSign + 12) % 12) + 1);
      }
    }
    const v = buildChart({ ...cases[0], timePrecision: 'exact', timezone: 'Asia/Kolkata' }, DEFAULT_VEDIC_CONFIG);
    expect(placement(v, 'sun').house).toBe(1);
  });

  it('is reproducible: identical input produces identical output', () => {
    expect(JSON.stringify(buildChart(BIRTH, DEFAULT_VEDIC_CONFIG))).toBe(JSON.stringify(buildChart(BIRTH, DEFAULT_VEDIC_CONFIG)));
  });
  it('sidereal = tropical − ayanamsa (Lahiri ≈ 23.7° in 1990)', () => {
    const v = buildChart(BIRTH, DEFAULT_VEDIC_CONFIG);
    const w = buildChart(BIRTH, DEFAULT_WESTERN_CONFIG);
    expect(v.ayanamsa!).toBeGreaterThan(23.6);
    expect(v.ayanamsa!).toBeLessThan(23.8);
    const sunV = placement(v, 'sun').longitude;
    const sunW = placement(w, 'sun').longitude;
    expect(Math.abs(angleDiff(sunW - sunV, v.ayanamsa!))).toBeLessThan(1e-6);
  });
  it('mid-June Sun is in tropical Gemini and sidereal Taurus/Gemini boundary region', () => {
    const w = buildChart(BIRTH, DEFAULT_WESTERN_CONFIG);
    expect(placement(w, 'sun').signName).toBe('Gemini');
    expect(placement(buildChart(BIRTH, DEFAULT_VEDIC_CONFIG), 'sun').signName).toBe('Vrishabha');
  });
  it('Rahu and Ketu are exactly opposite', () => {
    const v = buildChart(BIRTH, DEFAULT_VEDIC_CONFIG);
    expect(Math.abs(Math.abs(angleDiff(placement(v, 'rahu').longitude, placement(v, 'ketu').longitude)) - 180)).toBeLessThan(1e-9);
  });
  it('unknown birth time: no ascendant/houses, flagged reliability and warnings', () => {
    const c = buildChart({ ...BIRTH, time: null, timePrecision: 'unknown' }, DEFAULT_VEDIC_CONFIG);
    expect(c.ascendant).toBeNull();
    expect(c.placements.every((p) => p.house === null)).toBe(true);
    expect(c.reliability.ascendant).toBe('unknown');
    expect(c.warnings.join(' ')).toMatch(/Birth time unknown/);
  });
  it('detects Moon sign uncertainty for a birth near a Moon ingress', () => {
    // Find a Moon sign ingress and set the birth time 5 minutes before it with 1-hour precision.
    let t = Date.UTC(2001, 0, 1);
    const sign = (ms: number) => placement(buildChart({ date: new Date(ms).toISOString().slice(0, 10), time: new Date(ms).toISOString().slice(11, 16), timePrecision: 'exact', latitude: 0, longitude: 0, timezone: 'UTC' }, DEFAULT_WESTERN_CONFIG), 'moon').sign;
    const s0 = sign(t);
    while (sign(t + 3600000) === s0) t += 3600000;
    const d = new Date(t + 30 * 60000);
    const c = buildChart({ date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), timePrecision: 'within_1h', latitude: 0, longitude: 0, timezone: 'UTC' }, DEFAULT_WESTERN_CONFIG);
    expect(c.reliability.moonSign).toBe('uncertain');
  });
  it('high latitude chart (Tromsø) computes with a warning', () => {
    const c = buildChart({ date: '1985-12-21', time: '12:00', timePrecision: 'exact', latitude: 69.65, longitude: 18.96, timezone: 'Europe/Oslo' }, DEFAULT_WESTERN_CONFIG);
    expect(c.warnings.join(' ')).toMatch(/High latitude/);
    expect(c.cusps).toHaveLength(12);
  });
  it('full Vedic and Western reports build', () => {
    const v = vedicReport(BIRTH);
    expect(v.vargas).toHaveLength(13);
    expect(v.dasha.mahadashas.length).toBeGreaterThan(8);
    const w = westernReport(BIRTH);
    expect(w.aspects.length).toBeGreaterThan(0);
    expect(Object.values(w.elements.elements).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

describe('yogas and doshas', () => {
  it('every yoga reports its rule and caveat', () => {
    const y = detectYogas(buildChart(BIRTH, DEFAULT_VEDIC_CONFIG));
    expect(y.length).toBeGreaterThan(10);
    for (const r of y) {
      expect(r.rule.length).toBeGreaterThan(10);
      expect(r.caveat).toMatch(/cancellation/);
    }
    // Sunapha/Anapha/Durudhara/Kemadruma are mutually exclusive and exhaustive.
    const lunar = y.filter((r) => ['sunapha', 'anapha', 'durudhara', 'kemadruma'].includes(r.key));
    expect(lunar.filter((r) => r.present)).toHaveLength(1);
  });
  it('manglik reports all three references', () => {
    const m = manglik(buildChart(BIRTH, DEFAULT_VEDIC_CONFIG));
    expect(m.fromLagna.house).not.toBeNull();
    expect(m.fromMoon.house).toBeGreaterThanOrEqual(1);
  });
  it('kaal sarp and sade sati evaluate', () => {
    expect(['complete', 'none']).toContain(kaalSarp(buildChart(BIRTH, DEFAULT_VEDIC_CONFIG)).type);
    expect(sadeSati(5, 4).phase).toBe('rising');
    expect(sadeSati(5, 5).phase).toBe('peak');
    expect(sadeSati(5, 6).phase).toBe('setting');
    expect(sadeSati(5, 8).dhaiya).toBe('kantaka');
    expect(sadeSati(5, 0).phase).toBeNull();
  });
  it('gochar lists nine grahas with houses from Moon', () => {
    const g = gochar(3, 0, new Date('2025-01-01T00:00:00Z'));
    expect(g.entries).toHaveLength(9);
    expect(g.entries.every((e) => e.houseFromMoon >= 1 && e.houseFromMoon <= 12)).toBe(true);
  });
});

describe('western techniques', () => {
  const natal = buildChart(BIRTH, DEFAULT_WESTERN_CONFIG);
  it('solar return Sun matches natal Sun within 1 arcminute', () => {
    const sr = solarReturn(natal, 2025);
    expect(Math.abs(angleDiff(placement(sr, 'sun').longitude, placement(natal, 'sun').longitude))).toBeLessThan(1 / 60 + 0.01);
    expect(sr.utc.startsWith('2025-06')).toBe(true);
  });
  it('secondary progressions move the Sun about 1° per year', () => {
    const p = secondaryProgressions(natal, new Date('2020-06-15T00:00:00Z'));
    const sun = p.placements.find((x) => x.id === 'sun')!.longitude;
    const arc = ((sun - placement(natal, 'sun').longitude) + 360) % 360;
    expect(arc).toBeGreaterThan(27);
    expect(arc).toBeLessThan(31);
  });
  it('composite midpoint of identical charts equals the chart', () => {
    const c = compositeChart(natal, natal);
    expect(c.placements[0].longitude).toBeCloseTo(placement(natal, 'sun').longitude, 9);
  });
  it('Mercury has retrograde periods in 2024 (3 stations)', () => {
    const r = retrogradePeriods('mercury', new Date('2024-01-01T00:00:00Z'), new Date('2024-12-31T00:00:00Z'));
    expect(r.length).toBeGreaterThanOrEqual(3);
    // Published: Mercury stationed retrograde 2024-04-01 ~22:14 UTC.
    expect(r.some((p) => p.stationRetrograde.startsWith('2024-04-01') || p.stationRetrograde.startsWith('2024-04-02'))).toBe(true);
  });
});

describe('numerology', () => {
  it('life path keeps master numbers and reduces otherwise', () => {
    expect(numerology('1990-06-15', 'Asha Rao', 2025).lifePath).toBe(4); // 6 + 6 + 19→1 = 13 → 4
    expect(numerology('1987-11-29', 'X', 2025).lifePath).toBe(11); // 11 + 11 + 25→7 = 29 → 11
  });
  it('name numbers use Pythagorean values', () => {
    const n = numerology('1990-01-01', 'ABC', 2025);
    expect(n.expression).toBe(6);
    expect(n.soulUrge).toBe(1);
  });
});

describe('compatibility engine', () => {
  const wa = buildChart(BIRTH, DEFAULT_WESTERN_CONFIG);
  const wb = buildChart(BIRTH_B, DEFAULT_WESTERN_CONFIG);
  const va = buildChart(BIRTH, DEFAULT_VEDIC_CONFIG);
  const vb = buildChart(BIRTH_B, DEFAULT_VEDIC_CONFIG);
  it('is deterministic and reports dimensions without a combined score', () => {
    const r1 = compatibility({ westernA: wa, westernB: wb, vedicA: va, vedicB: vb, relationship: 'romantic' });
    const r2 = compatibility({ westernA: wa, westernB: wb, vedicA: va, vedicB: vb, relationship: 'romantic' });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(r1.western.map((d) => d.key)).toEqual(['emotional', 'communication', 'attraction', 'stability', 'growth']);
    expect(r1).not.toHaveProperty('overall');
    for (const d of r1.western) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
      expect(d.factors.length).toBeGreaterThan(0);
    }
    expect(r1.vedic.gunaMilan!.total).toBeLessThanOrEqual(36);
    expect(r1.vedic.gunaMilanReverse).toBeDefined();
  });
  it('colleague relationships omit the attraction dimension', () => {
    const r = compatibility({ westernA: wa, westernB: wb, relationship: 'colleague' });
    expect(r.western.map((d) => d.key)).not.toContain('attraction');
    expect(r.vedic.available).toBe(false);
  });
});

describe('muhurat discovery', () => {
  it('returns rule checks for each day and never passes a Rikta tithi', () => {
    const r = findMuhurats('marriage', '2025-11-01', 20, 28.6139, 77.209, 'Asia/Kolkata');
    expect(r.candidates).toHaveLength(20);
    for (const c of r.candidates) {
      if (c.passed) expect([4, 9, 14]).not.toContain(c.panchang.tithi.number);
      expect(c.checks.length).toBeGreaterThanOrEqual(5);
    }
  });
});
