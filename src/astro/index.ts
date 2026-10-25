export * from './constants';
export * from './time';
export * from './types';
export * from './houses';
export { trueAyanamsa, meanAyanamsa, AYANAMSAS, type AyanamsaId } from './ayanamsa';
export { bodyPosition, lunarNode, moonPhaseAngle, illuminatedFraction, nextMoonPhase, riseSet, type NodeType } from './ephemeris';
export { buildChart, placement, positionsAt, dignityOf } from './chart';
export { vimshottari, activeDasha, type DashaTimeline, type DashaPeriod } from './vedic/dasha';
export { divisionalChart, vargaSign, VARGA_INFO, type Varga, type VargaChart } from './vedic/divisional';
export { detectYogas, houseFrom, ordinal, type YogaResult } from './vedic/yogas';
export { manglik, kaalSarp, sadeSati, type ManglikResult } from './vedic/doshas';
export { ashtakavarga, BAV_TABLES } from './vedic/ashtakavarga';
export { gunaMilan, GUNA_MILAN_VERSION, YONI_TABLE, YONI_ORDER, type GunaMilanResult } from './vedic/gunaMilan';
export { gochar, GOCHAR_FAVOURABLE } from './vedic/gochar';
export { panchang, tithiAt, lunarMonthAt, phaseName, PANCHANG_VERSION, type PanchangResult } from './vedic/panchang';
export { festivalsForYear, FESTIVAL_RULES_VERSION, type FestivalDate } from './vedic/festivals';
export { findMuhurats, MUHURAT_RULES_VERSION, type MuhuratPurpose } from './vedic/muhurat';
export * from './western/aspects';
export { transitsToNatal, secondaryProgressions, solarReturn, synastry, compositeChart, retrogradePeriods } from './western/techniques';
export { numerology, NUMEROLOGY_VERSION } from './numerology';
export { compatibility, COMPATIBILITY_VERSION, type RelationshipKind, type CompatibilityResult } from './compatibility';
export { deriveArchetype, archetypeKeyFor, ARCHETYPE_KEYS, ARCHETYPE_VERSION, type ArchetypeKey, type ArchetypeResult } from './archetype';

import { buildChart } from './chart';
import type { BirthInput } from './time';
import { DEFAULT_VEDIC_CONFIG, DEFAULT_WESTERN_CONFIG, type ChartConfig, type ChartResult } from './types';
import { vimshottari } from './vedic/dasha';
import { divisionalChart, type Varga } from './vedic/divisional';
import { detectYogas } from './vedic/yogas';
import { manglik, kaalSarp } from './vedic/doshas';
import { ashtakavarga } from './vedic/ashtakavarga';
import { placement } from './chart';
import { natalAspects, bodiesFromPlacements, elementSummary, chartPatterns } from './western/aspects';

export interface VedicReport {
  chart: ChartResult;
  dasha: ReturnType<typeof vimshottari>;
  vargas: ReturnType<typeof divisionalChart>[];
  yogas: ReturnType<typeof detectYogas>;
  manglik: ReturnType<typeof manglik>;
  kaalSarp: ReturnType<typeof kaalSarp>;
  ashtakavarga: ReturnType<typeof ashtakavarga>;
  aspects: { from: string; toSign: number; houseOffset: number }[];
}

export interface WesternReport {
  chart: ChartResult;
  aspects: ReturnType<typeof natalAspects>;
  elements: ReturnType<typeof elementSummary>;
  patterns: ReturnType<typeof chartPatterns>;
}

const VEDIC_DRISHTI: Record<string, number[]> = { mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10] };

export function vedicReport(input: BirthInput & { placeName?: string }, config: ChartConfig = DEFAULT_VEDIC_CONFIG): VedicReport {
  const chart = buildChart(input, { ...config, system: 'vedic' });
  const vargas: Varga[] = ['D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12', 'D16', 'D20', 'D24', 'D30', 'D60'];
  const aspects = chart.placements
    .filter((p) => !['rahu', 'ketu'].includes(p.id))
    .flatMap((p) => (VEDIC_DRISHTI[p.id] ?? [7]).map((h) => ({ from: p.id, toSign: (p.sign + h - 1) % 12, houseOffset: h })));
  return {
    chart,
    dasha: vimshottari(placement(chart, 'moon').longitude, new Date(chart.utc), 3),
    vargas: vargas.map((v) => divisionalChart(chart, v)),
    yogas: detectYogas(chart),
    manglik: manglik(chart),
    kaalSarp: kaalSarp(chart),
    ashtakavarga: ashtakavarga(chart),
    aspects,
  };
}

export function westernReport(input: BirthInput & { placeName?: string }, config: ChartConfig = DEFAULT_WESTERN_CONFIG): WesternReport {
  const chart = buildChart(input, { ...config, system: 'western' });
  return {
    chart,
    aspects: natalAspects(bodiesFromPlacements(chart.placements, { asc: chart.ascendant?.longitude, mc: chart.midheaven?.longitude })),
    elements: elementSummary(chart.placements, chart.ascendant?.longitude ?? null),
    patterns: chartPatterns(chart.placements),
  };
}
