import { DateTime } from 'luxon';
import {
  KARANA_FIXED_END, KARANA_MOVABLE, LUNAR_MONTH_BY_SUN_SIGN, NAKSHATRAS, NAKSHATRA_SPAN, TITHI_NAMES,
  VARA_LORDS, VARA_NAMES, YOGA_NAMES, norm360, signOf, type PlanetId,
} from '../constants';
import { eclipticPosition, illuminatedFraction, nextMoonPhase, riseSet, searchAngleCrossing } from '../ephemeris';
import { trueAyanamsa } from '../ayanamsa';

/**
 * Panchang for a civil date at a location. Convention: the Vedic day runs from
 * sunrise to the next sunrise; tithi, nakshatra, yoga and karana are reported as
 * the element prevailing at local sunrise (udaya), plus its end time.
 * Lunar months are amanta (new moon to new moon), named by the sidereal sign of
 * the Sun at the opening new moon; the purnimanta name is also given.
 */
export const PANCHANG_VERSION = 'panchang-v1';

export const elongation = (d: Date) => norm360(eclipticPosition('moon', d).longitude - eclipticPosition('sun', d).longitude);
export const moonSidereal = (d: Date) => norm360(eclipticPosition('moon', d).longitude - trueAyanamsa(d));
export const sunSidereal = (d: Date) => norm360(eclipticPosition('sun', d).longitude - trueAyanamsa(d));
const yogaAngle = (d: Date) => norm360(sunSidereal(d) + moonSidereal(d));

export interface TithiInfo { index: number; number: number; name: string; paksha: 'shukla' | 'krishna'; endsAt: string | null }
export interface ElementInfo { index: number; name: string; endsAt: string | null }

export function tithiAt(d: Date): { index: number; name: string; paksha: 'shukla' | 'krishna'; number: number } {
  const index = Math.floor(elongation(d) / 12); // 0..29
  const paksha = index < 15 ? 'shukla' : 'krishna';
  const number = (index % 15) + 1;
  const name = index === 14 ? 'Purnima' : index === 29 ? 'Amavasya' : TITHI_NAMES[index % 15];
  return { index, name, paksha, number };
}

export function karanaName(k: number): string {
  if (k === 0) return 'Kimstughna';
  if (k >= 57) return KARANA_FIXED_END[k - 57];
  return KARANA_MOVABLE[(k - 1) % 7];
}

function endOf(f: (d: Date) => number, span: number, from: Date): string | null {
  const current = Math.floor(f(from) / span);
  const target = norm360((current + 1) * span);
  const r = searchAngleCrossing(f, target, from, 3, 1);
  return r ? r.toISOString() : null;
}

export interface Window { name: string; start: string; end: string; note?: string }

export interface PanchangResult {
  version: string;
  date: string;
  timezone: string;
  latitude: number;
  longitude: number;
  sunrise: string | null;
  sunset: string | null;
  moonrise: string | null;
  moonset: string | null;
  vara: { index: number; name: string; lord: PlanetId };
  tithi: TithiInfo;
  nakshatra: ElementInfo & { pada: number; lord: PlanetId };
  yoga: ElementInfo;
  karana: ElementInfo;
  moonSign: number;
  sunSign: number;
  lunarMonth: { amanta: string; purnimanta: string; adhika: boolean };
  vikramSamvat: number;
  shakaSamvat: number;
  moon: { phaseAngle: number; illumination: number; phaseName: string };
  windows: Window[];
  warnings: string[];
}

const RAHU_PART = [8, 2, 7, 5, 6, 4, 3];
const YAMA_PART = [5, 4, 3, 2, 1, 7, 6];
const GULIKA_PART = [7, 6, 5, 4, 3, 2, 1];
const MONTH_ORDER = ['Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashwin', 'Kartika', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna'];

export function phaseName(angle: number): string {
  if (angle < 6 || angle >= 354) return 'New Moon';
  if (angle < 84) return 'Waxing Crescent';
  if (angle < 96) return 'First Quarter';
  if (angle < 174) return 'Waxing Gibbous';
  if (angle < 186) return 'Full Moon';
  if (angle < 264) return 'Waning Gibbous';
  if (angle < 276) return 'Last Quarter';
  return 'Waning Crescent';
}

/** Amanta lunar month containing instant `d`. */
export function lunarMonthAt(d: Date): { amanta: string; purnimanta: string; adhika: boolean; startsAt: Date } {
  // Previous new moon: search forward from 31 days before.
  let nm = nextMoonPhase(new Date(d.getTime() - 31 * 86400000), 0)!;
  let next = nextMoonPhase(new Date(nm.getTime() + 86400000), 0)!;
  while (next.getTime() <= d.getTime()) {
    nm = next;
    next = nextMoonPhase(new Date(nm.getTime() + 86400000), 0)!;
  }
  const s1 = signOf(sunSidereal(nm));
  const s2 = signOf(sunSidereal(next));
  const adhika = s1 === s2;
  const amanta = LUNAR_MONTH_BY_SUN_SIGN[s1];
  const inKrishna = tithiAt(d).paksha === 'krishna';
  const purnimanta = inKrishna ? MONTH_ORDER[(MONTH_ORDER.indexOf(amanta) + 1) % 12] : amanta;
  return { amanta, purnimanta, adhika, startsAt: nm };
}

export function panchang(date: string, latitude: number, longitude: number, timezone: string): PanchangResult {
  const warnings: string[] = [];
  const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const rs = riseSet(dayStart.toUTC().toJSDate(), latitude, longitude);
  let ref = rs.sunrise;
  if (!ref || DateTime.fromJSDate(ref, { zone: timezone }).toISODate() !== date) {
    warnings.push('No sunrise on this date at this latitude; 06:00 local time used as the reference moment.');
    ref = dayStart.set({ hour: 6 }).toUTC().toJSDate();
  }
  const t = tithiAt(ref);
  const nak = Math.floor(moonSidereal(ref) / NAKSHATRA_SPAN);
  const pada = Math.floor((moonSidereal(ref) - nak * NAKSHATRA_SPAN) / (NAKSHATRA_SPAN / 4)) + 1;
  const yogaIdx = Math.floor(yogaAngle(ref) / (360 / 27));
  const k = Math.floor(elongation(ref) / 6);
  const weekday = DateTime.fromJSDate(ref, { zone: timezone }).weekday % 7; // Luxon: Mon=1..Sun=7 → Sun=0
  const lm = lunarMonthAt(ref);
  const gYear = dayStart.year;
  const gMonth = dayStart.month;
  const mIdx = MONTH_ORDER.indexOf(lm.amanta);
  const vs = gMonth >= 5 || (gMonth >= 3 && mIdx < 9) ? gYear + 57 : gYear + 56;
  const phase = norm360(elongation(ref));

  const windows: Window[] = [];
  if (rs.sunrise && rs.sunset && rs.sunset > rs.sunrise) {
    const sr = rs.sunrise.getTime();
    const ss = rs.sunset.getTime();
    const part = (ss - sr) / 8;
    const seg = (n: number) => [new Date(sr + (n - 1) * part).toISOString(), new Date(sr + n * part).toISOString()] as const;
    const [rk0, rk1] = seg(RAHU_PART[weekday]);
    const [ya0, ya1] = seg(YAMA_PART[weekday]);
    const [gu0, gu1] = seg(GULIKA_PART[weekday]);
    windows.push({ name: 'Rahu Kaal', start: rk0, end: rk1, note: 'Traditionally avoided for new beginnings.' });
    windows.push({ name: 'Yamaganda', start: ya0, end: ya1, note: 'Traditionally avoided for auspicious work.' });
    windows.push({ name: 'Gulika Kaal', start: gu0, end: gu1 });
    const muhurta = (ss - sr) / 15;
    windows.push({
      name: 'Abhijit Muhurta', start: new Date(sr + 7 * muhurta).toISOString(), end: new Date(sr + 8 * muhurta).toISOString(),
      note: weekday === 3 ? 'Traditionally not used on Wednesdays.' : 'Midday muhurta, traditionally auspicious.',
    });
    windows.push({ name: 'Brahma Muhurta', start: new Date(sr - 96 * 60000).toISOString(), end: new Date(sr - 48 * 60000).toISOString(), note: 'Fixed 48-minute muhurtas before sunrise.' });
  }

  return {
    version: PANCHANG_VERSION,
    date,
    timezone,
    latitude,
    longitude,
    sunrise: rs.sunrise?.toISOString() ?? null,
    sunset: rs.sunset?.toISOString() ?? null,
    moonrise: rs.moonrise?.toISOString() ?? null,
    moonset: rs.moonset?.toISOString() ?? null,
    vara: { index: weekday, name: VARA_NAMES[weekday], lord: VARA_LORDS[weekday] },
    tithi: { ...t, endsAt: endOf(elongation, 12, ref) },
    nakshatra: { index: nak, name: NAKSHATRAS[nak].name, pada, lord: NAKSHATRAS[nak].lord, endsAt: endOf(moonSidereal, NAKSHATRA_SPAN, ref) },
    yoga: { index: yogaIdx, name: YOGA_NAMES[yogaIdx], endsAt: endOf(yogaAngle, 360 / 27, ref) },
    karana: { index: k, name: karanaName(k), endsAt: endOf(elongation, 6, ref) },
    moonSign: signOf(moonSidereal(ref)),
    sunSign: signOf(sunSidereal(ref)),
    lunarMonth: { amanta: lm.amanta, purnimanta: lm.purnimanta, adhika: lm.adhika },
    vikramSamvat: vs,
    shakaSamvat: vs - 135,
    moon: { phaseAngle: phase, illumination: illuminatedFraction(ref), phaseName: phaseName(phase) },
    windows,
    warnings,
  };
}
