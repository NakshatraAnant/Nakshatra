import { DateTime } from 'luxon';
import { PLANETS, SIGNS, norm360, signOf, angleDiff, degreeInSign, formatDms, type PlanetId } from '../constants';
import { buildChart, positionsAt, placement } from '../chart';
import { computeAngles } from '../houses';
import { nextSunLongitude, searchAngleCrossing, eclipticPosition } from '../ephemeris';
import { DEFAULT_WESTERN_CONFIG, type ChartResult } from '../types';
import type { BirthInput } from '../time';
import { bodiesFromPlacements, crossAspects, midpoint, type Aspect } from './aspects';

/** Transit-to-natal aspects at an instant (tropical). */
export function transitsToNatal(natal: ChartResult, at: Date): { positions: ReturnType<typeof positionsAt>; aspects: Aspect[] } {
  const positions = positionsAt(at, DEFAULT_WESTERN_CONFIG);
  const transitBodies = positions.filter((p) => p.id !== 'ketu').map((p) => ({ id: p.id, longitude: p.longitude, speed: p.speed }));
  const natalBodies = bodiesFromPlacements(natal.placements, { asc: natal.ascendant?.longitude, mc: natal.midheaven?.longitude });
  return { positions, aspects: crossAspects(transitBodies, natalBodies, false, 0.25) };
}

export interface ProgressedChart {
  method: string;
  progressedDate: string;
  ageYears: number;
  placements: { id: PlanetId; longitude: number; signName: string; dms: string }[];
  midheaven: number | null;
  ascendant: number | null;
}

/**
 * Secondary progressions ("a day for a year"): positions for birth + age days.
 * Progressed MC uses the solar-arc method; the progressed ASC is derived from it.
 */
export function secondaryProgressions(natal: ChartResult, at: Date): ProgressedChart {
  const birth = new Date(natal.utc);
  const ageYears = (at.getTime() - birth.getTime()) / (365.2422 * 86400000);
  const progDate = new Date(birth.getTime() + ageYears * 86400000);
  const pos = positionsAt(progDate, DEFAULT_WESTERN_CONFIG);
  const natalSun = placement(natal, 'sun').longitude;
  const progSun = pos.find((p) => p.id === 'sun')!.longitude;
  const arc = norm360(progSun - natalSun);
  let mc: number | null = null;
  let asc: number | null = null;
  if (natal.midheaven) {
    mc = norm360(natal.midheaven.longitude + arc);
    // Derive ASC from progressed MC at the birth latitude via the RAMC of that MC.
    const eps = computeAngles(birth, natal.input.latitude, natal.input.longitude).obliquity * (Math.PI / 180);
    const ramc = Math.atan2(Math.sin(mc * Math.PI / 180) * Math.cos(eps), Math.cos(mc * Math.PI / 180));
    const phi = natal.input.latitude * Math.PI / 180;
    asc = norm360(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * 180 / Math.PI);
  }
  return {
    method: 'Secondary progressions (day-for-a-year, tropical year 365.2422 days); MC by solar arc, ASC derived at birth latitude.',
    progressedDate: progDate.toISOString(),
    ageYears,
    placements: pos.filter((p) => p.id !== 'ketu').map((p) => ({ id: p.id, longitude: p.longitude, signName: SIGNS[signOf(p.longitude)].name, dms: formatDms(degreeInSign(p.longitude)) })),
    midheaven: mc,
    ascendant: asc,
  };
}

/** Solar return: instant the transiting Sun returns to its natal tropical longitude in `year`. */
export function solarReturn(natal: ChartResult, year: number, location?: { latitude: number; longitude: number; timezone: string; placeName?: string }): ChartResult {
  const natalSun = placement(natal, 'sun').longitude;
  const birth = DateTime.fromISO(natal.utc, { zone: 'utc' });
  const approx = DateTime.fromObject({ year, month: birth.month, day: birth.day }, { zone: 'utc' }).minus({ days: 5 });
  const when = nextSunLongitude(approx.toJSDate(), natalSun, 15);
  if (!when) throw new Error('Solar return search failed');
  const loc = location ?? { latitude: natal.input.latitude, longitude: natal.input.longitude, timezone: natal.input.timezone, placeName: natal.input.placeName };
  const local = DateTime.fromJSDate(when, { zone: loc.timezone });
  const input: BirthInput & { placeName?: string } = {
    date: local.toISODate()!, time: local.toFormat('HH:mm'), timePrecision: 'exact',
    latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone, placeName: loc.placeName,
  };
  const chart = buildChart(input, DEFAULT_WESTERN_CONFIG);
  chart.methodology.push(`Solar return moment ${when.toISOString()} (Sun at natal longitude ${formatDms(natalSun % 30)} ${SIGNS[signOf(natalSun)].name}); minute-rounded for the chart.`);
  return chart;
}

export function synastry(a: ChartResult, b: ChartResult): Aspect[] {
  const ab = bodiesFromPlacements(a.placements, { asc: a.ascendant?.longitude });
  const bb = bodiesFromPlacements(b.placements, { asc: b.ascendant?.longitude });
  return crossAspects(ab, bb, false, 0.75);
}

export interface CompositeChart {
  method: string;
  placements: { id: PlanetId; name: string; longitude: number; signName: string; dms: string }[];
  ascendant: number | null;
  midheaven: number | null;
}

export function compositeChart(a: ChartResult, b: ChartResult): CompositeChart {
  const placements = a.placements.filter((p) => p.id !== 'ketu').map((pa) => {
    const pb = placement(b, pa.id);
    const lon = midpoint(pa.longitude, pb.longitude);
    return { id: pa.id, name: PLANETS[pa.id].name, longitude: lon, signName: SIGNS[signOf(lon)].name, dms: formatDms(degreeInSign(lon)) };
  });
  return {
    method: 'Midpoint composite (nearer midpoint of each pair of placements).',
    placements,
    ascendant: a.ascendant && b.ascendant ? midpoint(a.ascendant.longitude, b.ascendant.longitude) : null,
    midheaven: a.midheaven && b.midheaven ? midpoint(a.midheaven.longitude, b.midheaven.longitude) : null,
  };
}

export interface RetrogradePeriod { id: PlanetId; stationRetrograde: string; stationDirect: string | null }

/** Retrograde stations for a planet within a date range (search of speed sign changes). */
export function retrogradePeriods(id: PlanetId, from: Date, to: Date): RetrogradePeriod[] {
  if (id === 'sun' || id === 'moon' || id === 'rahu' || id === 'ketu') return [];
  const speed = (d: Date) => {
    const h = 0.25 * 86400000;
    const a = eclipticPosition(id, new Date(d.getTime() - h)).longitude;
    const b = eclipticPosition(id, new Date(d.getTime() + h)).longitude;
    return angleDiff(b, a);
  };
  const out: RetrogradePeriod[] = [];
  const step = 86400000;
  let t = from.getTime();
  let prev = speed(new Date(t));
  let open: string | null = null;
  const refine = (lo: number, hi: number, wantNegative: boolean) => {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const s = speed(new Date(mid));
      if ((s < 0) === wantNegative) hi = mid;
      else lo = mid;
    }
    return new Date(hi).toISOString();
  };
  if (prev < 0) open = from.toISOString();
  while (t < to.getTime()) {
    const t1 = t + step;
    const s = speed(new Date(t1));
    if (prev >= 0 && s < 0) open = refine(t, t1, true);
    if (prev < 0 && s >= 0 && open) {
      out.push({ id, stationRetrograde: open, stationDirect: refine(t, t1, false) });
      open = null;
    }
    prev = s;
    t = t1;
  }
  if (open) out.push({ id, stationRetrograde: open, stationDirect: null });
  return out;
}

export { searchAngleCrossing };
