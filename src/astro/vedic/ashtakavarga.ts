import type { PlanetId } from '../constants';
import { placement } from '../chart';
import type { ChartResult } from '../types';

/**
 * Ashtakavarga (Parashara). For each of the seven planets, bindus are contributed
 * by eight reference points (seven planets + Lagna) to the houses listed below,
 * counted from each reference point's sign. Totals per planet are fixed by the
 * tables (Sun 48, Moon 49, Mars 39, Mercury 54, Jupiter 56, Venus 52, Saturn 39;
 * Sarvashtakavarga 337), which the tests assert.
 */
type Contributor = PlanetId | 'lagna';

export const BAV_TABLES: Record<string, Partial<Record<Contributor, number[]>>> = {
  sun: {
    sun: [1, 2, 4, 7, 8, 9, 10, 11], moon: [3, 6, 10, 11], mars: [1, 2, 4, 7, 8, 9, 10, 11], mercury: [3, 5, 6, 9, 10, 11, 12],
    jupiter: [5, 6, 9, 11], venus: [6, 7, 12], saturn: [1, 2, 4, 7, 8, 9, 10, 11], lagna: [3, 4, 6, 10, 11, 12],
  },
  moon: {
    sun: [3, 6, 7, 8, 10, 11], moon: [1, 3, 6, 7, 10, 11], mars: [2, 3, 5, 6, 9, 10, 11], mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    jupiter: [1, 4, 7, 8, 10, 11, 12], venus: [3, 4, 5, 7, 9, 10, 11], saturn: [3, 5, 6, 11], lagna: [3, 6, 10, 11],
  },
  mars: {
    sun: [3, 5, 6, 10, 11], moon: [3, 6, 11], mars: [1, 2, 4, 7, 8, 10, 11], mercury: [3, 5, 6, 11],
    jupiter: [6, 10, 11, 12], venus: [6, 8, 11, 12], saturn: [1, 4, 7, 8, 9, 10, 11], lagna: [1, 3, 6, 10, 11],
  },
  mercury: {
    sun: [5, 6, 9, 11, 12], moon: [2, 4, 6, 8, 10, 11], mars: [1, 2, 4, 7, 8, 9, 10, 11], mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    jupiter: [6, 8, 11, 12], venus: [1, 2, 3, 4, 5, 8, 9, 11], saturn: [1, 2, 4, 7, 8, 9, 10, 11], lagna: [1, 2, 4, 6, 8, 10, 11],
  },
  jupiter: {
    sun: [1, 2, 3, 4, 7, 8, 9, 10, 11], moon: [2, 5, 7, 9, 11], mars: [1, 2, 4, 7, 8, 10, 11], mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    jupiter: [1, 2, 3, 4, 7, 8, 10, 11], venus: [2, 5, 6, 9, 10, 11], saturn: [3, 5, 6, 12], lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  venus: {
    sun: [8, 11, 12], moon: [1, 2, 3, 4, 5, 8, 9, 11, 12], mars: [3, 5, 6, 9, 11, 12], mercury: [3, 5, 6, 9, 11],
    jupiter: [5, 8, 9, 10, 11], venus: [1, 2, 3, 4, 5, 8, 9, 10, 11], saturn: [3, 4, 5, 8, 9, 10, 11], lagna: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  saturn: {
    sun: [1, 2, 4, 7, 8, 10, 11], moon: [3, 6, 11], mars: [3, 5, 6, 10, 11, 12], mercury: [6, 8, 9, 10, 11, 12],
    jupiter: [5, 6, 11, 12], venus: [6, 11, 12], saturn: [3, 5, 6, 11], lagna: [1, 3, 4, 6, 10, 11],
  },
};

export const AV_PLANETS: PlanetId[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

export interface AshtakavargaResult {
  available: boolean;
  reason?: string;
  /** bhinna[planet][signIndex] = bindus */
  bhinna: Record<string, number[]>;
  /** sarva[signIndex] */
  sarva: number[];
  totals: Record<string, number>;
}

export function ashtakavarga(chart: ChartResult): AshtakavargaResult {
  if (!chart.ascendant) {
    return { available: false, reason: 'Ashtakavarga needs the Lagna, which requires a known birth time.', bhinna: {}, sarva: [], totals: {} };
  }
  const refSign: Record<string, number> = { lagna: chart.ascendant.sign };
  for (const id of AV_PLANETS) refSign[id] = placement(chart, id).sign;
  const bhinna: Record<string, number[]> = {};
  const totals: Record<string, number> = {};
  const sarva = new Array(12).fill(0);
  for (const planet of AV_PLANETS) {
    const row = new Array(12).fill(0);
    for (const [contrib, houses] of Object.entries(BAV_TABLES[planet])) {
      for (const h of houses!) row[(refSign[contrib] + h - 1) % 12] += 1;
    }
    bhinna[planet] = row;
    totals[planet] = row.reduce((a, b) => a + b, 0);
    row.forEach((v, i) => (sarva[i] += v));
  }
  totals.sarva = sarva.reduce((a, b) => a + b, 0);
  return { available: true, bhinna, sarva, totals };
}
