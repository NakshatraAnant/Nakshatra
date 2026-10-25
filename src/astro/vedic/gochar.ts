import { PLANETS, SIGNS, type PlanetId } from '../constants';
import { positionsAt } from '../chart';
import { DEFAULT_VEDIC_CONFIG, type ChartConfig } from '../types';
import { houseFrom } from './yogas';
import { sadeSati, type SadeSatiResult } from './doshas';

/**
 * Gochar (transits) counted from the natal Moon sign. Favourable-house lists are the
 * commonly cited Gochara Phala table; vedha (obstruction) is NOT evaluated.
 */
export const GOCHAR_FAVOURABLE: Record<string, number[]> = {
  sun: [3, 6, 10, 11],
  moon: [1, 3, 6, 7, 10, 11],
  mars: [3, 6, 11],
  mercury: [2, 4, 6, 8, 10, 11],
  jupiter: [2, 5, 7, 9, 11],
  venus: [1, 2, 3, 4, 5, 8, 9, 11, 12],
  saturn: [3, 6, 11],
  rahu: [3, 6, 11],
  ketu: [3, 6, 11],
};

export interface GocharEntry {
  id: PlanetId;
  name: string;
  sign: number;
  signName: string;
  houseFromMoon: number;
  houseFromLagna: number | null;
  retrograde: boolean;
  traditionallyFavourable: boolean;
}

export interface GocharResult {
  at: string;
  natalMoonSign: number;
  entries: GocharEntry[];
  sadeSati: SadeSatiResult;
  note: string;
}

export function gochar(natalMoonSign: number, natalLagnaSign: number | null, at: Date, config: ChartConfig = DEFAULT_VEDIC_CONFIG): GocharResult {
  const pos = positionsAt(at, config);
  const entries = pos.map((p) => {
    const h = houseFrom(natalMoonSign, p.sign);
    return {
      id: p.id,
      name: PLANETS[p.id].vedic,
      sign: p.sign,
      signName: SIGNS[p.sign].vedic,
      houseFromMoon: h,
      houseFromLagna: natalLagnaSign === null ? null : houseFrom(natalLagnaSign, p.sign),
      retrograde: p.id === 'rahu' || p.id === 'ketu' ? false : p.retrograde,
      traditionallyFavourable: GOCHAR_FAVOURABLE[p.id]?.includes(h) ?? false,
    };
  });
  const saturn = pos.find((p) => p.id === 'saturn')!;
  return {
    at: at.toISOString(),
    natalMoonSign,
    entries,
    sadeSati: sadeSati(natalMoonSign, saturn.sign),
    note: 'Counted from the natal Moon sign (Chandra lagna). Vedha and ashtakavarga refinements are not applied.',
  };
}
