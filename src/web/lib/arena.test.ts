import { describe, expect, it } from 'vitest';
import { ARENA_MAX, arenaLayout, seasonLayout, seasonProgress } from './arena';

describe('tournament arena layout', () => {
  it('puts places 1–3 on the podium in 2-1-3 order with heights from the score', () => {
    const p = arenaLayout([{ rank: 1, you: false, score: 5 }, { rank: 2, you: true, score: 4 }, { rank: 3, you: false, score: 2 }, { rank: 4, you: false, score: 1 }], 5);
    expect(p.map((r) => r.podium)).toEqual([true, true, true, false]);
    expect(p[1].x).toBeLessThan(p[0].x);
    expect(p[2].x).toBeGreaterThan(p[0].x);
    expect(p[0].height).toBeGreaterThan(p[1].height);
    expect(p[1].height).toBeGreaterThan(p[2].height);
  });

  it('shows a shared place as equal pillars side by side', () => {
    const p = arenaLayout([{ rank: 1, you: false, score: 3 }, { rank: 1, you: true, score: 3 }], 3);
    expect(p[0].height).toBe(p[1].height);
    expect(p[0].x).not.toBe(p[1].x);
    expect(p[0].x + p[1].x).toBeCloseTo(0, 6);
  });

  it('caps the number of pillars', () => {
    const runs = Array.from({ length: 40 }, (_, i) => ({ rank: i + 1, you: false, score: 1 }));
    expect(arenaLayout(runs, 3)).toHaveLength(ARENA_MAX);
  });
});

describe('season path', () => {
  const stops = [{ at: 100 }, { at: 300 }, { at: 600 }];
  it('places points between milestones proportionally', () => {
    expect(seasonProgress(0, stops)).toBe(0);
    expect(seasonProgress(50, stops)).toBeCloseTo(1 / 6, 6);
    expect(seasonProgress(100, stops)).toBeCloseTo(1 / 3, 6);
    expect(seasonProgress(200, stops)).toBeCloseTo(0.5, 6);
    expect(seasonProgress(9999, stops)).toBe(1);
    expect(seasonProgress(10, [])).toBe(0);
  });

  it('rises steadily along the path', () => {
    const placed = seasonLayout(stops.map((s) => ({ ...s, title: 'x', reached: false, claimed: false, claimable: false })));
    expect(placed[0].y).toBeLessThan(placed[1].y);
    expect(placed[1].y).toBeLessThan(placed[2].y);
  });
});
