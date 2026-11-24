import { SIGNS, type Element, type Modality } from './constants';
import type { ChartResult } from './types';
import { elementSummary } from './western/aspects';

/**
 * Cosmic ID archetype: the chart's dominant element crossed with its dominant
 * modality, giving twelve archetypes. Scores use the documented elementSummary
 * weights (Sun, Moon and Ascendant 2; Mercury, Venus, Mars 1.5; Jupiter, Saturn 1;
 * outer planets 0.5) over the chart's own zodiac. Ties are broken by the Moon's
 * sign, then the Ascendant's, then the Sun's, so the result never depends on
 * object ordering. This is a symbolic synthesis, not a psychological measure.
 */
export const ARCHETYPE_VERSION = 'archetype-v1';

export const ARCHETYPE_KEYS = [
  'celestial_rush', 'echo_flame', 'neon_riot',
  'obsidian_mind', 'sol_bloom', 'silver_thread',
  'nova_drift', 'moon_static', 'lucid_haze',
  'crimson_tide', 'velvet_void', 'aether_veil',
] as const;
export type ArchetypeKey = (typeof ARCHETYPE_KEYS)[number];

const ELEMENTS: Element[] = ['fire', 'earth', 'air', 'water'];
const MODALITIES: Modality[] = ['cardinal', 'fixed', 'mutable'];

export function archetypeKeyFor(element: Element, modality: Modality): ArchetypeKey {
  return ARCHETYPE_KEYS[ELEMENTS.indexOf(element) * 3 + MODALITIES.indexOf(modality)];
}

export interface ArchetypeResult {
  version: string;
  key: ArchetypeKey;
  element: Element;
  modality: Modality;
  /** Second-strongest combination when the leading score is within one point. */
  blend: ArchetypeKey | null;
  elements: Record<Element, number>;
  modalities: Record<Modality, number>;
  /** False when the birth time is unknown, so the Ascendant could not be counted. */
  includesAscendant: boolean;
  method: string;
}

function pick<T extends string>(scores: Record<T, number>, order: T[], tiebreak: T[]): { top: T; second: T; margin: number } {
  const rank = (k: T) => {
    const i = tiebreak.indexOf(k);
    return i === -1 ? tiebreak.length : i;
  };
  const sorted = [...order].sort((a, b) => scores[b] - scores[a] || rank(a) - rank(b));
  return { top: sorted[0], second: sorted[1], margin: scores[sorted[0]] - scores[sorted[1]] };
}

export function deriveArchetype(chart: ChartResult): ArchetypeResult {
  const asc = chart.ascendant?.longitude ?? null;
  const summary = elementSummary(chart.placements, asc);
  const signOf = (id: string) => chart.placements.find((p) => p.id === id)?.sign;
  const tieSigns = [signOf('moon'), chart.ascendant?.sign, signOf('sun')].filter((x): x is number => x !== undefined);
  const el = pick(summary.elements, ELEMENTS, tieSigns.map((s) => SIGNS[s].element));
  const mo = pick(summary.modalities, MODALITIES, tieSigns.map((s) => SIGNS[s].modality));
  const key = archetypeKeyFor(el.top, mo.top);
  let blend: ArchetypeKey | null = null;
  if (el.margin < 1 && el.margin <= mo.margin) blend = archetypeKeyFor(el.second, mo.top);
  else if (mo.margin < 1) blend = archetypeKeyFor(el.top, mo.second);
  return {
    version: ARCHETYPE_VERSION,
    key,
    element: el.top,
    modality: mo.top,
    blend,
    elements: summary.elements,
    modalities: summary.modalities,
    includesAscendant: asc !== null,
    method: `${summary.method} Dominant element × dominant modality of the ${chart.system === 'vedic' ? 'sidereal (Lahiri)' : 'tropical'} chart; ties broken by the Moon, then Ascendant, then Sun sign.`,
  };
}
