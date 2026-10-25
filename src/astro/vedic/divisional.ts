import { SIGNS, degreeInSign, signOf } from '../constants';
import type { ChartResult } from '../types';

/**
 * Divisional (varga) charts per Brihat Parashara Hora Shastra. Each function maps a
 * sidereal longitude to the varga sign index (0 = Aries).
 */
export type Varga = 'D1' | 'D2' | 'D3' | 'D4' | 'D7' | 'D9' | 'D10' | 'D12' | 'D16' | 'D20' | 'D24' | 'D30' | 'D60';

export const VARGA_INFO: Record<Varga, { name: string; theme: string }> = {
  D1: { name: 'Rashi', theme: 'The natal chart as a whole' },
  D2: { name: 'Hora', theme: 'Resources and sustenance' },
  D3: { name: 'Drekkana', theme: 'Siblings, courage and initiative' },
  D4: { name: 'Chaturthamsa', theme: 'Home, property and fixed assets' },
  D7: { name: 'Saptamsa', theme: 'Children and creative continuity' },
  D9: { name: 'Navamsa', theme: 'Partnership, dharma and inner strength of planets' },
  D10: { name: 'Dashamsa', theme: 'Career and public conduct' },
  D12: { name: 'Dwadashamsa', theme: 'Parents and lineage' },
  D16: { name: 'Shodashamsa', theme: 'Vehicles, comforts and happiness' },
  D20: { name: 'Vimshamsa', theme: 'Spiritual practice' },
  D24: { name: 'Chaturvimshamsa', theme: 'Learning and education' },
  D30: { name: 'Trimshamsa', theme: 'Challenges and resilience' },
  D60: { name: 'Shashtiamsa', theme: 'Overall karmic detail (very time-sensitive)' },
};

const isOdd = (sign: number) => sign % 2 === 0; // Aries (0) is an odd sign in 1-based counting
const modality = (sign: number) => SIGNS[sign].modality;

export function vargaSign(longitude: number, varga: Varga): number {
  const s = signOf(longitude);
  const d = degreeInSign(longitude);
  switch (varga) {
    case 'D1':
      return s;
    case 'D2':
      return isOdd(s) ? (d < 15 ? 4 : 3) : d < 15 ? 3 : 4;
    case 'D3':
      return (s + [0, 4, 8][Math.floor(d / 10)]) % 12;
    case 'D4':
      return (s + [0, 3, 6, 9][Math.floor(d / 7.5)]) % 12;
    case 'D7': {
      const part = Math.floor(d / (30 / 7));
      return ((isOdd(s) ? s : s + 6) + part) % 12;
    }
    case 'D9':
      return Math.floor(longitude / (30 / 9)) % 12;
    case 'D10': {
      const part = Math.floor(d / 3);
      return ((isOdd(s) ? s : s + 8) + part) % 12;
    }
    case 'D12':
      return (s + Math.floor(d / 2.5)) % 12;
    case 'D16': {
      const start = { cardinal: 0, fixed: 4, mutable: 8 }[modality(s)];
      return (start + Math.floor(d / 1.875)) % 12;
    }
    case 'D20': {
      const start = { cardinal: 0, fixed: 8, mutable: 4 }[modality(s)];
      return (start + Math.floor(d / 1.5)) % 12;
    }
    case 'D24': {
      const start = isOdd(s) ? 4 : 3;
      return (start + Math.floor(d / 1.25)) % 12;
    }
    case 'D30':
      if (isOdd(s)) return d < 5 ? 0 : d < 10 ? 10 : d < 18 ? 8 : d < 25 ? 2 : 6;
      return d < 5 ? 1 : d < 12 ? 5 : d < 20 ? 11 : d < 25 ? 9 : 7;
    case 'D60':
      return (s + Math.floor(d * 2)) % 12;
  }
}

export interface VargaChart {
  varga: Varga;
  name: string;
  theme: string;
  ascendantSign: number | null;
  placements: { id: string; sign: number }[];
  timeSensitive: boolean;
}

export function divisionalChart(chart: ChartResult, varga: Varga): VargaChart {
  return {
    varga,
    ...VARGA_INFO[varga],
    ascendantSign: chart.ascendant ? vargaSign(chart.ascendant.longitude, varga) : null,
    placements: chart.placements.map((p) => ({ id: p.id, sign: vargaSign(p.longitude, varga) })),
    // Vargas finer than ~D9 shift with a few minutes of birth-time error.
    timeSensitive: ['D10', 'D12', 'D16', 'D20', 'D24', 'D30', 'D60'].includes(varga),
  };
}
