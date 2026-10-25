import { NAKSHATRA_SPAN, NAKSHATRAS, VIMSHOTTARI_ORDER, VIMSHOTTARI_YEARS, nakshatraOf, type PlanetId } from '../constants';

/**
 * Vimshottari dasha. Convention: a dasha year is a Julian year of 365.25 days
 * (some traditions use a 360-day savana year; the convention is exposed in output).
 */
export const DASHA_YEAR_DAYS = 365.25;
const MS_PER_YEAR = DASHA_YEAR_DAYS * 86400000;

export interface DashaPeriod {
  lord: PlanetId;
  start: string;
  end: string;
  years: number;
  sub?: DashaPeriod[];
}

export interface DashaTimeline {
  system: 'vimshottari';
  yearDays: number;
  moonNakshatra: string;
  balanceAtBirth: { lord: PlanetId; years: number };
  mahadashas: DashaPeriod[];
}

function rotateFrom(lord: PlanetId): PlanetId[] {
  const i = VIMSHOTTARI_ORDER.indexOf(lord);
  return [...VIMSHOTTARI_ORDER.slice(i), ...VIMSHOTTARI_ORDER.slice(0, i)];
}

function subPeriods(parent: PlanetId, startMs: number, parentYears: number, depth: number): DashaPeriod[] {
  let t = startMs;
  return rotateFrom(parent).map((lord) => {
    const years = (parentYears * VIMSHOTTARI_YEARS[lord]) / 120;
    const start = t;
    t += years * MS_PER_YEAR;
    const p: DashaPeriod = { lord, start: new Date(start).toISOString(), end: new Date(t).toISOString(), years };
    if (depth > 1) p.sub = subPeriods(lord, start, years, depth - 1);
    return p;
  });
}

/**
 * @param moonSiderealLongitude natal Moon longitude (sidereal)
 * @param birthUtc birth instant
 * @param depth 1 = mahadasha only, 2 = + antardasha, 3 = + pratyantardasha
 */
export function vimshottari(moonSiderealLongitude: number, birthUtc: Date, depth = 2): DashaTimeline {
  const nak = nakshatraOf(moonSiderealLongitude);
  const lord = NAKSHATRAS[nak.index].lord;
  const total = VIMSHOTTARI_YEARS[lord];
  const elapsedFraction = nak.fraction;
  const cycleStart = birthUtc.getTime() - elapsedFraction * total * MS_PER_YEAR;
  let t = cycleStart;
  const mahadashas: DashaPeriod[] = [];
  // Two full cycles (240 years) are more than any lifetime; trim to 120 years after birth.
  const order = [...rotateFrom(lord), ...rotateFrom(lord)];
  for (const l of order) {
    const years = VIMSHOTTARI_YEARS[l];
    const start = t;
    t += years * MS_PER_YEAR;
    const p: DashaPeriod = { lord: l, start: new Date(start).toISOString(), end: new Date(t).toISOString(), years };
    if (depth > 1) p.sub = subPeriods(l, start, years, depth - 1);
    mahadashas.push(p);
    if (t > birthUtc.getTime() + 120 * MS_PER_YEAR) break;
  }
  return {
    system: 'vimshottari',
    yearDays: DASHA_YEAR_DAYS,
    moonNakshatra: NAKSHATRAS[nak.index].name,
    balanceAtBirth: { lord, years: (1 - elapsedFraction) * total },
    mahadashas,
  };
}

/** The active chain of periods (maha → antar → …) at an instant. */
export function activeDasha(timeline: DashaTimeline, at: Date): DashaPeriod[] {
  const chain: DashaPeriod[] = [];
  let level: DashaPeriod[] | undefined = timeline.mahadashas;
  const ms = at.getTime();
  while (level) {
    const found: DashaPeriod | undefined = level.find((p) => Date.parse(p.start) <= ms && ms < Date.parse(p.end));
    if (!found) break;
    chain.push(found);
    level = found.sub;
  }
  return chain;
}

export { NAKSHATRA_SPAN };
