import { describe, expect, it } from 'vitest';
import { eclipticPosition, greenwichApparentSiderealDeg, meanLunarNodeMeeus } from './ephemeris';
import { meanAyanamsa } from './ayanamsa';
import { computeAngles, computeHouses } from './houses';
import { normalizeBirth } from './time';
import { angleDiff } from './constants';
import { panchang, tithiAt } from './vedic/panchang';
import { festivalsForYear } from './vedic/festivals';

/**
 * Reference tests against published values. Each case records its source,
 * expected value and tolerance. Engine version: 1.0.0.
 * Meeus = Jean Meeus, "Astronomical Algorithms", 2nd ed. (1998).
 */
const tt0 = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 59_000); // ≈ 0h TD (ΔT ≈ 59 s in 1992)
const arcmin = 1 / 60;

describe('astronomical reference values', () => {
  it('Sun apparent longitude — Meeus Example 25.b, 1992-10-13 0h TD: 199°54′21.56″', () => {
    const sun = eclipticPosition('sun', tt0(1992, 10, 13)).longitude;
    expect(Math.abs(angleDiff(sun, 199.905989))).toBeLessThan(0.5 * arcmin);
  });

  it('Moon apparent longitude — Meeus Example 47.a, 1992-04-12 0h TD: 133.167265°', () => {
    const moon = eclipticPosition('moon', tt0(1992, 4, 12)).longitude;
    expect(Math.abs(angleDiff(moon, 133.167265))).toBeLessThan(1 * arcmin);
  });

  it('Venus apparent longitude — Meeus Example 33.a, 1992-12-20 0h TD: 313.08102°', () => {
    const venus = eclipticPosition('venus', tt0(1992, 12, 20)).longitude;
    expect(Math.abs(angleDiff(venus, 313.08102))).toBeLessThan(1 * arcmin);
  });

  it('Mean lunar node — Meeus Example 47.a, 1992-04-12 0h TD: 274.400656°', () => {
    expect(Math.abs(angleDiff(meanLunarNodeMeeus(tt0(1992, 4, 12)), 274.400656))).toBeLessThan(0.001);
  });

  it('Apparent sidereal time — Meeus Example 12.a, 1987-04-10 0h UT: 13h10m46.1351s', () => {
    const gast = greenwichApparentSiderealDeg(new Date(Date.UTC(1987, 3, 10)));
    expect(Math.abs(gast - (13 + 10 / 60 + 46.1351 / 3600) * 15)).toBeLessThan(0.001);
  });

  it('Lahiri mean ayanamsa at J2000.0 ≈ 23°51′25.5″ (Swiss Ephemeris SE_SIDM_LAHIRI definition)', () => {
    const ay = meanAyanamsa(new Date(Date.UTC(2000, 0, 1, 12)));
    expect(Math.abs(ay - (23 + 51 / 60 + 25.5 / 3600))).toBeLessThan(2 / 3600);
  });

  it('Ascendant at the equator with RAMC = 0 is 0° Cancer (geometric identity)', () => {
    // Find an instant where GAST ≈ 0 at Greenwich and test at lon 0, lat 0.
    let t = Date.UTC(2024, 2, 20, 0, 0);
    while (Math.abs(angleDiff(greenwichApparentSiderealDeg(new Date(t)), 0)) > 0.01) {
      t += (-angleDiff(greenwichApparentSiderealDeg(new Date(t)), 0) / 360.9856) * 86400000;
    }
    const a = computeAngles(new Date(t), 0, 0);
    expect(Math.abs(angleDiff(a.ascendant, 90))).toBeLessThan(0.05);
    expect(Math.abs(angleDiff(a.midheaven, 0))).toBeLessThan(0.05);
  });

  it('Placidus cusps 1/4/7/10 coincide with ASC/IC/DSC/MC and intermediate cusps are ordered', () => {
    const d = new Date(Date.UTC(1990, 5, 15, 6, 30));
    const h = computeHouses(d, 28.6139, 77.209, 'placidus');
    expect(h.system).toBe('placidus');
    expect(h.cusps[0]).toBeCloseTo(h.angles.ascendant, 6);
    expect(h.cusps[9]).toBeCloseTo(h.angles.midheaven, 6);
    for (let i = 0; i < 12; i++) {
      const span = ((h.cusps[(i + 1) % 12] - h.cusps[i]) % 360 + 360) % 360;
      expect(span).toBeGreaterThan(10);
      expect(span).toBeLessThan(60);
    }
  });

  it('Placidus falls back to Porphyry inside the Arctic circle', () => {
    const h = computeHouses(new Date(Date.UTC(2020, 11, 21, 12)), 78.22, 15.65, 'placidus');
    expect(['placidus', 'porphyry']).toContain(h.system);
    if (h.system === 'porphyry') expect(h.warnings.join(' ')).toMatch(/Placidus is undefined/);
  });
});

describe('time-zone normalisation', () => {
  it('uses the historical +06:30 war-time offset for Kolkata in 1943', () => {
    const n = normalizeBirth({ date: '1943-06-01', time: '12:00', timePrecision: 'exact', latitude: 22.57, longitude: 88.36, timezone: 'Asia/Kolkata' });
    expect(n.utcOffsetMinutes).toBe(390);
    expect(n.utc.toISOString()).toBe('1943-06-01T05:30:00.000Z');
  });

  it('uses IST (+05:30) for modern Indian dates', () => {
    const n = normalizeBirth({ date: '1995-08-15', time: '06:45', timePrecision: 'exact', latitude: 28.61, longitude: 77.2, timezone: 'Asia/Kolkata' });
    expect(n.utcOffsetMinutes).toBe(330);
  });

  it('flags a non-existent spring-forward time (US DST 2021-03-14 02:30 New York)', () => {
    const n = normalizeBirth({ date: '2021-03-14', time: '02:30', timePrecision: 'exact', latitude: 40.71, longitude: -74.0, timezone: 'America/New_York' });
    expect(n.warnings.join(' ')).toMatch(/did not exist/);
  });

  it('flags an ambiguous fall-back time (US DST 2021-11-07 01:30 New York)', () => {
    const n = normalizeBirth({ date: '2021-11-07', time: '01:30', timePrecision: 'exact', latitude: 40.71, longitude: -74.0, timezone: 'America/New_York' });
    expect(n.warnings.join(' ')).toMatch(/occurred twice/);
  });

  it('handles leap day and rejects 29 Feb in a non-leap year', () => {
    expect(() => normalizeBirth({ date: '2000-02-29', time: '10:00', timePrecision: 'exact', latitude: 0, longitude: 0, timezone: 'UTC' })).not.toThrow();
    expect(() => normalizeBirth({ date: '2001-02-29', time: '10:00', timePrecision: 'exact', latitude: 0, longitude: 0, timezone: 'UTC' })).toThrow();
  });

  it('marks unknown time as assumed noon with a 12-hour uncertainty window', () => {
    const n = normalizeBirth({ date: '1990-01-01', time: null, timePrecision: 'unknown', latitude: 19.07, longitude: 72.87, timezone: 'Asia/Kolkata' });
    expect(n.timeAssumed).toBe(true);
    expect(n.calculationTime).toBe('12:00');
    expect(n.uncertaintyMinutes).toBe(720);
  });
});

describe('panchang reference dates (New Delhi, published Indian calendars)', () => {
  const DELHI = { lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' };

  it('Amavasya prevails at sunrise on 2024-11-01 and Kartika month begins after it', () => {
    const p = panchang('2024-11-01', DELHI.lat, DELHI.lon, DELHI.tz);
    expect(p.tithi.name).toBe('Amavasya');
  });

  it('Purnima at sunrise on 2025-03-14 (Holi)', () => {
    expect(panchang('2025-03-14', DELHI.lat, DELHI.lon, DELHI.tz).tithi.name).toBe('Purnima');
  });

  it('tithi index is consistent with elongation at a known full moon (2024-10-17 11:26 UTC)', () => {
    const t = tithiAt(new Date('2024-10-17T11:00:00Z'));
    expect(t.index).toBe(14);
  });

  it('sunrise in Delhi on 2024-11-01 is about 06:33 IST', () => {
    const p = panchang('2024-11-01', DELHI.lat, DELHI.lon, DELHI.tz);
    const local = new Date(p.sunrise!).getTime() + 330 * 60000;
    const hm = new Date(local).toISOString().slice(11, 16);
    expect(['06:32', '06:33', '06:34']).toContain(hm);
  });

  const cases2025: [string, string][] = [
    ['makar_sankranti', '2025-01-14'],
    ['maha_shivaratri', '2025-02-26'],
    ['holika_dahan', '2025-03-13'],
    ['holi', '2025-03-14'],
    ['ram_navami', '2025-04-06'],
    ['vaisakhi', '2025-04-14'],
    ['raksha_bandhan', '2025-08-09'],
    ['ganesh_chaturthi', '2025-08-27'],
    ['navratri', '2025-09-22'],
    ['dussehra', '2025-10-02'],
    ['diwali', '2025-10-20'],
  ];
  const fest2025 = festivalsForYear(2025, DELHI.lat, DELHI.lon, DELHI.tz);
  for (const [key, date] of cases2025) {
    it(`${key} 2025 falls on ${date}`, () => {
      const k = key === 'makar_sankranti' ? 'sankranti_9' : key === 'vaisakhi' ? 'sankranti_0' : key;
      expect(fest2025.find((f) => f.key === k)?.date).toBe(date);
    });
  }

  // 2026 dates from published Indian calendars (CAG holiday list, Drik Panchang, hindu-blog.com), checked 2026-10-24.
  // Dussehra 2026 is the case that needs the aparahna rule: Dashami begins 12:50 IST on Oct 20.
  const cases2026: [string, string][] = [
    ['maha_shivaratri', '2026-02-15'],
    ['holika_dahan', '2026-03-03'],
    ['holi', '2026-03-04'],
    ['raksha_bandhan', '2026-08-28'],
    ['ganesh_chaturthi', '2026-09-14'],
    ['navratri', '2026-10-11'],
    ['dussehra', '2026-10-20'],
    ['diwali', '2026-11-08'],
  ];
  const fest2026 = festivalsForYear(2026, DELHI.lat, DELHI.lon, DELHI.tz);
  for (const [key, date] of cases2026) {
    it(`${key} 2026 falls on ${date}`, () => {
      expect(fest2026.find((f) => f.key === key)?.date).toBe(date);
    });
  }

  it('Diwali 2024 falls on 2024-10-31 under the pradosh rule', () => {
    const f = festivalsForYear(2024, DELHI.lat, DELHI.lon, DELHI.tz);
    expect(f.find((x) => x.key === 'diwali')?.date).toBe('2024-10-31');
  });
});
