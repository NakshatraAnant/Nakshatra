import { norm360 } from '../constants';
import { placement } from '../chart';
import type { ChartResult } from '../types';
import { houseFrom, ordinal } from './yogas';

/**
 * Dosha analysis with explicit, documented conventions. Results describe the
 * traditional rule that was met; they never assert outcomes.
 */

export const MANGLIK_HOUSES = [1, 2, 4, 7, 8, 12];

export interface ManglikResult {
  convention: string;
  fromLagna: { house: number | null; present: boolean | null };
  fromMoon: { house: number; present: boolean };
  fromVenus: { house: number; present: boolean };
  /** True when Mars meets the rule from the Lagna (or from the Moon when birth time is unknown). */
  present: boolean;
  traditionalExceptions: string[];
  note: string;
}

export function manglik(chart: ChartResult): ManglikResult {
  const mars = placement(chart, 'mars');
  const moon = placement(chart, 'moon');
  const venus = placement(chart, 'venus');
  const hL = chart.ascendant ? houseFrom(chart.ascendant.sign, mars.sign) : null;
  const hM = houseFrom(moon.sign, mars.sign);
  const hV = houseFrom(venus.sign, mars.sign);
  const exceptions: string[] = [];
  if (mars.sign === 0 || mars.sign === 7) exceptions.push('Mars is in its own sign (Aries/Scorpio).');
  if (mars.sign === 9) exceptions.push('Mars is exalted (Capricorn).');
  if (placement(chart, 'jupiter').sign === mars.sign) exceptions.push('Jupiter is conjunct Mars.');
  const present = hL !== null ? MANGLIK_HOUSES.includes(hL) : MANGLIK_HOUSES.includes(hM);
  return {
    convention: 'Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house (whole-sign), checked from Lagna, Moon and Venus.',
    fromLagna: { house: hL, present: hL === null ? null : MANGLIK_HOUSES.includes(hL) },
    fromMoon: { house: hM, present: MANGLIK_HOUSES.includes(hM) },
    fromVenus: { house: hV, present: MANGLIK_HOUSES.includes(hV) },
    present,
    traditionalExceptions: exceptions,
    note: hL === null
      ? 'Birth time unknown: the Lagna reference cannot be evaluated; the Moon reference is used.'
      : 'Many traditions list further cancellations; consult a practitioner before relying on this result.',
  };
}

export interface KaalSarpResult {
  present: boolean;
  type: 'complete' | 'none';
  rule: string;
  factors: string[];
}

export function kaalSarp(chart: ChartResult): KaalSarpResult {
  const rahu = placement(chart, 'rahu').longitude;
  const ids = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'] as const;
  const arcs = ids.map((id) => norm360(placement(chart, id).longitude - rahu));
  const allRahuToKetu = arcs.every((a) => a > 0 && a < 180);
  const allKetuToRahu = arcs.every((a) => a > 180 && a < 360);
  const present = allRahuToKetu || allKetuToRahu;
  return {
    present,
    type: present ? 'complete' : 'none',
    rule: 'All seven classical planets lie within one half of the zodiac bounded by Rahu and Ketu.',
    factors: [present ? `All planets fall on the ${allRahuToKetu ? 'Rahu→Ketu' : 'Ketu→Rahu'} side.` : 'At least one planet lies on each side of the nodal axis.'],
  };
}

export interface SadeSatiResult {
  phase: 'rising' | 'peak' | 'setting' | null;
  dhaiya: 'kantaka' | 'ashtama' | null;
  saturnHouseFromMoon: number;
  rule: string;
  description: string;
}

/** Sade Sati / Dhaiya for a natal Moon sign and Saturn's current sidereal sign. */
export function sadeSati(natalMoonSign: number, transitSaturnSign: number): SadeSatiResult {
  const h = houseFrom(natalMoonSign, transitSaturnSign);
  const phase = h === 12 ? 'rising' : h === 1 ? 'peak' : h === 2 ? 'setting' : null;
  const dhaiya = h === 4 ? 'kantaka' : h === 8 ? 'ashtama' : null;
  return {
    phase,
    dhaiya,
    saturnHouseFromMoon: h,
    rule: 'Sade Sati: transiting Saturn in the 12th, 1st or 2nd sign from the natal Moon. Dhaiya: Saturn in the 4th or 8th.',
    description: phase
      ? `Transiting Saturn is ${ordinal(h)} from the natal Moon (${phase} phase of Sade Sati).`
      : dhaiya
        ? `Transiting Saturn is ${ordinal(h)} from the natal Moon (${dhaiya} dhaiya).`
        : `Transiting Saturn is ${ordinal(h)} from the natal Moon; Sade Sati is not active.`,
  };
}
