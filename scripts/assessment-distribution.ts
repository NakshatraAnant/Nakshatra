/**
 * Archetype distribution analysis for the personality assessment.
 *
 *   npx tsx scripts/assessment-distribution.ts              # v1 vs v2 on three simulated populations
 *   npx tsx scripts/assessment-distribution.ts --out=x.json # also write the full report
 *   npx tsx scripts/assessment-distribution.ts --fit        # re-fit the v2 calibration offsets (prints JSON)
 *
 * The fit uses seed 20261106; the report uses different seeds (7, 11, 13), so balance is checked on held-out sheets.
 * Changing the offsets changes results for the same answers: ship any re-fit as a new personality version.
 */
import { writeFileSync } from 'node:fs';
import { PERSONA_ARCHETYPES, QUESTIONS, archetypeMatches, dimensionScores, scorePersonality, scorePersonalityV1 } from '../src/shared/personality';
import { simulatePopulation, summariseResults, type Population } from '../src/shared/assessmentSim';

/**
 * Anchor sheets: answering every statement of a dimension the same way, as close to the prototype as the
 * 1–5 scale allows. Each archetype must win its own anchor, so offsets can never make an archetype
 * unreachable for someone who answers just like it.
 */
function anchors() {
  return PERSONA_ARCHETYPES.map((a) => ({
    key: a.key,
    v: dimensionScores(Object.fromEntries(QUESTIONS.map((q) => [q.id, Math.max(1, Math.min(5, Math.round(3 + 2 * q.key * a.prototype[q.dimension])))]))).scores,
  }));
}

function fit(): Record<string, number> {
  const vecs = simulatePopulation('persons', 60000, 20261106).map((a) => dimensionScores(a).scores);
  const offsets: Record<string, number> = Object.fromEntries(PERSONA_ARCHETYPES.map((a) => [a.key, 0]));
  const target = 1 / PERSONA_ARCHETYPES.length;
  const anchorSheets = anchors();
  const clamp = (x: number) => Math.max(-0.12, Math.min(0.12, x));
  for (let it = 0; it < 400; it++) {
    const count: Record<string, number> = Object.fromEntries(PERSONA_ARCHETYPES.map((a) => [a.key, 0]));
    for (const v of vecs) count[archetypeMatches(v, offsets)[0].key]++;
    const lr = 0.25 * (1 - it / 450);
    for (const a of PERSONA_ARCHETYPES) offsets[a.key] = clamp(offsets[a.key] - lr * (count[a.key] / vecs.length - target));
    // Constraint: each archetype wins its own anchor by at least 0.01.
    for (const an of anchorSheets) {
      const m = archetypeMatches(an.v, offsets);
      const own = m.find((x) => x.key === an.key)!;
      const rival = m.find((x) => x.key !== an.key)!;
      const short = rival.match + 0.01 - own.match;
      if (short > 0) { offsets[an.key] = clamp(offsets[an.key] + short / 2); offsets[rival.key] = clamp(offsets[rival.key] - short / 2); }
    }
  }
  for (const an of anchorSheets) if (archetypeMatches(an.v, offsets)[0].key !== an.key) console.error(`anchor not satisfied: ${an.key}`);
  return Object.fromEntries(Object.entries(offsets).map(([k, o]) => [k, Math.round(o * 10000) / 10000]));
}

if (process.argv.includes('--fit')) {
  console.log(JSON.stringify(fit(), null, 2));
} else {
  const seeds: Record<Population, number> = { uniform: 7, persons: 11, mild: 13 };
  const report = Object.fromEntries((Object.keys(seeds) as Population[]).map((kind) => {
    const sheets = simulatePopulation(kind, 20000, seeds[kind]);
    return [kind, { v1: summariseResults(sheets.map(scorePersonalityV1)), v2: summariseResults(sheets.map(scorePersonality)) }];
  }));
  const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  for (const [kind, r] of Object.entries(report)) {
    for (const ver of ['v1', 'v2'] as const) {
      const s = r[ver];
      const sorted = Object.entries(s.share).sort((a, b) => b[1] - a[1]);
      console.log(`${kind.padEnd(8)} ${ver}  max ${(100 * s.maxShare).toFixed(1)}%  min ${(100 * s.minShare).toFixed(1)}%  ratio ${s.maxOverMin.toFixed(2)}  blend ${s.blendPct}%  conf ${JSON.stringify(s.confidence)}  top ${sorted[0].join(' ')}%  bottom ${sorted.at(-1)!.join(' ')}%`);
    }
  }
}
