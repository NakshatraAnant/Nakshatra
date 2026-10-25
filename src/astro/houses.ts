import { norm360 } from './constants';
import { greenwichApparentSiderealDeg, nutationAndObliquity } from './ephemeris';

export type HouseSystem = 'whole_sign' | 'equal' | 'porphyry' | 'placidus';

export const HOUSE_SYSTEM_LABELS: Record<HouseSystem, string> = {
  whole_sign: 'Whole sign',
  equal: 'Equal (from Ascendant)',
  porphyry: 'Porphyry',
  placidus: 'Placidus',
};

export interface Angles {
  ascendant: number;
  midheaven: number;
  descendant: number;
  imumCoeli: number;
  /** Right ascension of the meridian, degrees. */
  ramc: number;
  obliquity: number;
}

export interface HouseResult {
  system: HouseSystem;
  /** 12 cusp longitudes (tropical), index 0 = house 1. */
  cusps: number[];
  angles: Angles;
  warnings: string[];
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Ascendant, MC and RAMC for an instant and geographic location (east longitude positive). */
export function computeAngles(date: Date, latitude: number, longitude: number): Angles {
  const ramc = norm360(greenwichApparentSiderealDeg(date) + longitude);
  const eps = nutationAndObliquity(date).trueObliquity;
  const r = ramc * D2R;
  const e = eps * D2R;
  const phi = latitude * D2R;
  const mc = norm360(Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(e)) * R2D);
  const asc = norm360(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(e) + Math.tan(phi) * Math.sin(e))) * R2D);
  return { ascendant: asc, midheaven: mc, descendant: norm360(asc + 180), imumCoeli: norm360(mc + 180), ramc, obliquity: eps };
}

/** Ecliptic longitude of the point with a given right ascension (on the ecliptic). */
function longitudeFromRa(ra: number, eps: number): number {
  return norm360(Math.atan2(Math.sin(ra * D2R), Math.cos(ra * D2R) * Math.cos(eps * D2R)) * R2D);
}

function declinationOfLongitude(lon: number, eps: number): number {
  return Math.asin(Math.sin(eps * D2R) * Math.sin(lon * D2R)) * R2D;
}

/**
 * Placidus cusp by semi-arc iteration. `fraction` is the share of the semi-arc
 * travelled from the meridian; `above` selects diurnal (houses 11/12) vs nocturnal (2/3).
 */
function placidusCusp(ramc: number, eps: number, lat: number, fraction: number, above: boolean): number | null {
  let lon = longitudeFromRa(ramc + (above ? 90 * fraction : 180 - 90 * fraction), eps);
  for (let i = 0; i < 60; i++) {
    const dec = declinationOfLongitude(lon, eps);
    const x = Math.tan(lat * D2R) * Math.tan(dec * D2R);
    if (Math.abs(x) >= 1) return null; // circumpolar: Placidus undefined
    const ad = Math.asin(x) * R2D; // ascensional difference
    const ra = above ? ramc + fraction * (90 + ad) : ramc + 180 - fraction * (90 - ad);
    const next = longitudeFromRa(ra, eps);
    if (Math.abs(norm360(next - lon + 180) - 180) < 1e-7) return next;
    lon = next;
  }
  return lon;
}

export function computeHouses(date: Date, latitude: number, longitude: number, system: HouseSystem): HouseResult {
  const angles = computeAngles(date, latitude, longitude);
  const warnings: string[] = [];
  const { ascendant: asc, midheaven: mc } = angles;
  let cusps: number[];

  if (Math.abs(latitude) > 66.0) {
    warnings.push('High latitude: quadrant house systems become distorted or undefined near the polar circles.');
  }

  const porphyry = () => {
    // Trisect each quadrant measured forward in zodiacal order: ASC→IC and IC→DSC.
    const ascToIc = norm360(angles.imumCoeli - asc);
    const icToDsc = norm360(angles.descendant - angles.imumCoeli);
    const c: number[] = new Array(12);
    c[0] = asc;
    c[1] = norm360(asc + ascToIc / 3);
    c[2] = norm360(asc + (2 * ascToIc) / 3);
    c[3] = angles.imumCoeli;
    c[4] = norm360(angles.imumCoeli + icToDsc / 3);
    c[5] = norm360(angles.imumCoeli + (2 * icToDsc) / 3);
    for (let i = 6; i < 12; i++) c[i] = norm360(c[i - 6] + 180);
    return c;
  };

  switch (system) {
    case 'whole_sign': {
      const start = Math.floor(asc / 30) * 30;
      cusps = Array.from({ length: 12 }, (_, i) => norm360(start + 30 * i));
      break;
    }
    case 'equal':
      cusps = Array.from({ length: 12 }, (_, i) => norm360(asc + 30 * i));
      break;
    case 'porphyry':
      cusps = porphyry();
      break;
    case 'placidus': {
      const eps = angles.obliquity;
      const c11 = placidusCusp(angles.ramc, eps, latitude, 1 / 3, true);
      const c12 = placidusCusp(angles.ramc, eps, latitude, 2 / 3, true);
      const c2 = placidusCusp(angles.ramc, eps, latitude, 2 / 3, false);
      const c3 = placidusCusp(angles.ramc, eps, latitude, 1 / 3, false);
      if (c11 === null || c12 === null || c2 === null || c3 === null) {
        warnings.push('Placidus is undefined at this latitude for this moment; Porphyry cusps were used instead.');
        cusps = porphyry();
        return { system: 'porphyry', cusps, angles, warnings };
      }
      cusps = [asc, c2, c3, angles.imumCoeli, norm360(c11 + 180), norm360(c12 + 180), angles.descendant, norm360(c2 + 180), norm360(c3 + 180), mc, c11, c12];
      break;
    }
  }
  return { system, cusps, angles, warnings };
}

/** House number (1–12) of a longitude given cusps (works for unequal houses). */
export function houseOf(longitude: number, cusps: number[]): number {
  const l = norm360(longitude);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    const span = norm360(end - start);
    if (norm360(l - start) < span || span === 0) return i + 1;
  }
  return 1;
}
