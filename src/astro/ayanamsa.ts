import { centuriesSinceJ2000 } from './time';
import { nutationAndObliquity } from './ephemeris';

/**
 * Ayanamsa models. A model is defined by a reference epoch, the ayanamsa value
 * at that epoch, and accumulation via IAU 2006 general precession in longitude
 * (Capitaine et al. 2003). This mirrors how Swiss Ephemeris defines its standard
 * ayanamsas (epoch + offset), which lets values be cross-checked.
 *
 * Only Lahiri is offered in engine v1. Other ayanamsas (Raman, KP, …) are not
 * exposed until their epoch definitions are verified against a reference.
 */
export type AyanamsaId = 'lahiri';

interface AyanamsaDef {
  label: string;
  epochJd: number;
  valueAtEpoch: number;
  description: string;
}

export const AYANAMSAS: Record<AyanamsaId, AyanamsaDef> = {
  lahiri: {
    label: 'Lahiri (Chitrapaksha)',
    // Indian Calendar Reform Committee definition, as encoded by Swiss Ephemeris SE_SIDM_LAHIRI.
    epochJd: 2435553.5,
    valueAtEpoch: 23.250182778 - 0.004658035,
    description: 'Official ayanamsa of the Indian national calendar; most widely used in Jyotish.',
  },
};

/** IAU 2006 general precession in longitude, arcseconds, for T Julian centuries from J2000. */
function generalPrecessionArcsec(T: number): number {
  return 5028.796195 * T + 1.1054348 * T ** 2 + 0.00007964 * T ** 3 - 0.000023857 * T ** 4 - 0.0000000383 * T ** 5;
}

/** Mean ayanamsa (no nutation), degrees. */
export function meanAyanamsa(date: Date, id: AyanamsaId = 'lahiri'): number {
  const def = AYANAMSAS[id];
  const T = centuriesSinceJ2000(date);
  const T0 = (def.epochJd - 2451545.0) / 36525;
  return def.valueAtEpoch + (generalPrecessionArcsec(T) - generalPrecessionArcsec(T0)) / 3600;
}

/**
 * True ayanamsa = mean ayanamsa + nutation in longitude. Subtracting this from an
 * apparent tropical longitude yields a sidereal longitude free of nutation,
 * matching the Swiss Ephemeris SEFLG_SIDEREAL convention.
 */
export function trueAyanamsa(date: Date, id: AyanamsaId = 'lahiri'): number {
  return meanAyanamsa(date, id) + nutationAndObliquity(date).dpsi;
}
