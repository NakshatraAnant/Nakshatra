import { describe, expect, it } from 'vitest';
import { DIMENSIONS, PERSONA_ARCHETYPES, QUESTIONS, scorePersonality, type Answers, type Vector } from './personality';

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
      const ds = PERSONA_ARCHETYPES.map((a) => ({ k: a.key, d: Math.sqrt(DIMENSIONS.reduce((s, dd) => s + (v[dd] - a.prototype[dd]) ** 2, 0)) })).sort((x, y) => x.d - y.d);
      if (ds[0].k === key && (!best || ds[1].d - ds[0].d > best.gap)) best = { v, gap: ds[1].d - ds[0].d };
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
