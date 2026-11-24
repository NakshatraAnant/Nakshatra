/**
 * Seeded, simulated answer populations for checking archetype balance (tests, admin diagnostics,
 * scripts/assessment-distribution.ts). A reference for balance — not a claim about real users.
 *  - uniform: every answer drawn uniformly from 1–5 (careless / random answering)
 *  - persons: a latent lean per dimension θ ~ U(−1, 1); each answer = round(3 + 2·key·θ + noise), noise ~ N(0, 0.7)
 *  - mild:    as persons, with θ ~ U(−0.4, 0.4)
 */
import { DIMENSIONS, PERSONA_ARCHETYPES, QUESTIONS, type Answers, type PersonalityResult, type Vector } from './personality';

export type Population = 'uniform' | 'persons' | 'mild';

export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const clip = (x: number) => Math.max(1, Math.min(5, Math.round(x)));

export function simulatePopulation(kind: Population, n: number, seed: number): Answers[] {
  const r = seededRandom(seed);
  const out: Answers[] = [];
  for (let i = 0; i < n; i++) {
    if (kind === 'uniform') { out.push(Object.fromEntries(QUESTIONS.map((q) => [q.id, 1 + Math.floor(r() * 5)]))); continue; }
    const span = kind === 'mild' ? 0.4 : 1;
    const theta = Object.fromEntries(DIMENSIONS.map((d) => [d, (r() * 2 - 1) * span])) as Vector;
    out.push(Object.fromEntries(QUESTIONS.map((q) => [q.id, clip(3 + 2 * q.key * theta[q.dimension] + 0.7 * gauss(r))])));
  }
  return out;
}

export interface DistributionSummary {
  n: number; maxShare: number; minShare: number; maxOverMin: number;
  confidence: Record<'high' | 'medium' | 'low' | 'inconclusive', number>;
  blendPct: number;
  /** Percentage of results per archetype key. */
  share: Record<string, number>;
}

export function summariseResults(results: Pick<PersonalityResult, 'archetype' | 'confidence' | 'blend'>[]): DistributionSummary {
  const n = results.length;
  const count: Record<string, number> = Object.fromEntries(PERSONA_ARCHETYPES.map((a) => [a.key, 0]));
  const conf = { high: 0, medium: 0, low: 0, inconclusive: 0 };
  let blends = 0;
  for (const r of results) { count[r.archetype] = (count[r.archetype] ?? 0) + 1; conf[r.confidence]++; if (r.blend) blends++; }
  const shares = Object.values(count).map((c) => (n ? c / n : 0));
  const pct = (c: number) => (n ? Math.round((1000 * c) / n) / 10 : 0);
  return {
    n,
    maxShare: Math.max(...shares), minShare: Math.min(...shares),
    maxOverMin: Math.min(...shares) ? Math.max(...shares) / Math.min(...shares) : Infinity,
    confidence: { high: pct(conf.high), medium: pct(conf.medium), low: pct(conf.low), inconclusive: pct(conf.inconclusive) },
    blendPct: pct(blends),
    share: Object.fromEntries(Object.entries(count).map(([k, c]) => [k, n ? Math.round((10000 * c) / n) / 100 : 0])),
  };
}
