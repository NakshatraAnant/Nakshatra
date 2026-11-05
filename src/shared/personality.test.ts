import { describe, expect, it } from 'vitest';
import { DIMENSIONS, PERSONA_ARCHETYPES, QUESTIONS, archetypeMatches, scorePersonality, scorePersonalityV1, type Answers, type Vector } from './personality';
import { simulatePopulation, summariseResults } from './assessmentSim';

const all = (v: number): Answers => Object.fromEntries(QUESTIONS.map((q) => [q.id, v]));

/** Builds an answer sheet whose dimension scores equal the given lattice point (multiples of 0.25). */
function sheetFor(target: Vector): Answers {
  const out: Answers = {};
  for (const d of DIMENSIONS) {
    const qs = QUESTIONS.filter((q) => q.dimension === d);
    let need = Math.round(target[d] * 8); // Σ key·(a−3) over 4 items, each contributing −2..+2
    for (const q of qs) {
      const c = Math.max(-2, Math.min(2, need));
      need -= c;
      out[q.id] = 3 + q.key * c;
    }
  }
  return out;
}

/** Finds, for an archetype, the lattice point it wins with the largest margin. */
function bestPointFor(key: string): Vector {
  const levels = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  let best: { v: Vector; gap: number } | null = null;
  const rec = (i: number, acc: number[]) => {
    if (i === DIMENSIONS.length) {
      const v = Object.fromEntries(DIMENSIONS.map((d, j) => [d, acc[j]])) as Vector;
      const ds = archetypeMatches(v);
      if (ds[0].key === key && (!best || ds[0].match - ds[1].match > best.gap)) best = { v, gap: ds[0].match - ds[1].match };
      return;
    }
    for (const l of levels) rec(i + 1, [...acc, l]);
  };
  rec(0, []);
  return best!.v;
}

describe('personality scoring — response quality (quality-v1)', () => {
  it.each([1, 3, 5])('straight-lined sheet of all %i is inconclusive, never a clear match', (v) => {
    const r = scorePersonality(all(v));
    expect(r.confidence).toBe('inconclusive');
    expect(r.quality.flags).toContain('straight_lined');
    expect(r.quality.message).toBeTruthy();
  });

  it('strictly alternating answers are flagged and capped at low confidence', () => {
    const alt = Object.fromEntries(QUESTIONS.map((q, i) => [q.id, i % 2 ? 5 : 1]));
    const r = scorePersonality(alt);
    expect(r.quality.flags).toContain('patterned');
    expect(['low', 'inconclusive']).toContain(r.confidence);
  });

  it('reversed sheets mirror the dimension scores', () => {
    const sheet = sheetFor({ energy: 0.75, compass: -0.5, voice: 0.25, tempo: -1, horizon: 0.5 });
    const rev = Object.fromEntries(Object.entries(sheet).map(([k, v]) => [k, 6 - v]));
    const a = scorePersonality(sheet); const b = scorePersonality(rev);
    for (const d of DIMENSIONS) expect(b.scores[d]).toBeCloseTo(-a.scores[d], 6);
  });

  it('missing answers: fewer than 15 is rejected; a missing dimension is incomplete and low', () => {
    const few = Object.fromEntries(QUESTIONS.slice(0, 14).map((q) => [q.id, 4]));
    expect(() => scorePersonality(few)).toThrow();
    const sheet = sheetFor({ energy: 0.75, compass: -0.5, voice: 0.75, tempo: -1, horizon: 0.5 });
    for (const q of QUESTIONS.filter((x) => x.dimension === 'horizon').slice(0, 2)) delete sheet[q.id];
    const r = scorePersonality(sheet);
    expect(r.unknown).toEqual(['horizon']);
    expect(r.quality.flags).toContain('incomplete');
    expect(['low', 'inconclusive']).toContain(r.confidence);
  });

  it('is deterministic', () => {
    const sheet = sheetFor({ energy: 0.5, compass: 0.75, voice: -0.25, tempo: 0, horizon: 1 });
    expect(JSON.stringify(scorePersonality(sheet))).toBe(JSON.stringify(scorePersonality({ ...sheet })));
  });

  it.each(PERSONA_ARCHETYPES.map((a) => a.key))('archetype %s is reachable from a diverse, decisive sheet', (key) => {
    const r = scorePersonality(sheetFor(bestPointFor(key)));
    expect(r.archetype).toBe(key);
    expect(r.confidence).not.toBe('inconclusive');
  });

  it('random sheets no longer produce confident "Calm in the Chaos" matches', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let calmConfident = 0; const n = 5000;
    for (let i = 0; i < n; i++) {
      const r = scorePersonality(Object.fromEntries(QUESTIONS.map((q) => [q.id, 1 + Math.floor(rnd() * 5)])));
      if (r.archetype === 'calm_in_the_chaos' && (r.confidence === 'high' || r.confidence === 'medium')) calmConfident++;
    }
    // Before quality-v1, ~24% of random sheets became Calm in the Chaos and many were labelled clear or good matches.
    expect(calmConfident / n).toBeLessThan(0.03);
  });
});

describe('personality-v2 — archetype balance and honest confidence', () => {
  it.each(PERSONA_ARCHETYPES.map((a) => a.key))('%s: a decisive sheet matching it gives a confident, unblended result', (key) => {
    const r = scorePersonality(sheetFor(bestPointFor(key)));
    expect(r.archetype).toBe(key);
    expect(['high', 'medium']).toContain(r.confidence);
    expect(r.blend).toBeNull();
  });

  it('answering exactly like the prototype (rounded to the answer scale) lands on that archetype for every archetype', () => {
    const hits = PERSONA_ARCHETYPES.filter((a) => {
      const target = Object.fromEntries(DIMENSIONS.map((d) => [d, Math.round(a.prototype[d] * 4) / 4])) as Vector;
      return scorePersonality(sheetFor(target)).archetype === a.key;
    });
    expect(hits.map((h) => h.key)).toEqual(PERSONA_ARCHETYPES.map((a) => a.key));
  });

  it.each([['uniform', 7], ['persons', 11], ['mild', 13]] as const)('%s population: every archetype between 2.5%% and 6.5%% (uniform share 4.2%%)', (kind, seed) => {
    const s = summariseResults(simulatePopulation(kind, 6000, seed).map(scorePersonality));
    expect(s.minShare).toBeGreaterThan(0.025);
    expect(s.maxShare).toBeLessThan(0.065);
  });

  it('v1 bias is reproduced (so stored v1 results stay explainable) and removed in v2', () => {
    const sheets = simulatePopulation('mild', 4000, 21);
    const v1 = summariseResults(sheets.map(scorePersonalityV1));
    const v2 = summariseResults(sheets.map(scorePersonality));
    expect(v1.share.calm_in_the_chaos).toBeGreaterThan(20);
    expect(v2.share.calm_in_the_chaos).toBeLessThan(6.5);
    expect(scorePersonalityV1(sheets[0]).version).toBe('personality-v1');
  });

  it('random answering is almost never presented as a confident match', () => {
    const s = summariseResults(simulatePopulation('uniform', 6000, 99).map(scorePersonality));
    expect(s.confidence.high + s.confidence.medium).toBeLessThan(12);
  });

  it('a near-tie is reported as a blend of the two closest archetypes', () => {
    const tied = simulatePopulation('persons', 3000, 5).map(scorePersonality).find((r) => r.blend && r.confidence !== 'inconclusive');
    expect(tied).toBeTruthy();
    expect(tied!.blend!.primary).toBe(tied!.archetype);
    expect(tied!.blend!.secondary).toBe(tied!.secondary);
    expect(tied!.margin).toBeLessThan(0.02);
    expect(tied!.blend!.primaryWeight).toBeGreaterThanOrEqual(0.5);
  });

  it('strength scales with how strongly someone answers; direction alone picks the archetype', () => {
    const strong = sheetFor({ energy: 1, compass: 0.5, voice: 1, tempo: 0.25, horizon: 0 });
    const weak = sheetFor({ energy: 0.5, compass: 0.25, voice: 0.5, tempo: 0, horizon: 0 });
    const a = scorePersonality(strong); const b = scorePersonality(weak);
    expect(a.strength).toBeGreaterThan(b.strength);
    expect(a.archetype).toBe('group_chat_mayor');
  });
});
