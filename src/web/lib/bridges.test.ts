import { describe, expect, it } from 'vitest';
import { bridgeLayout, bridgeWord } from './bridges';

describe('compatibility bridges', () => {
  it('maps each score to its own bridge without combining them', () => {
    const placed = bridgeLayout([{ key: 'a', label: 'A', score: 90 }, { key: 'b', label: 'B', score: 10 }, { key: 'c', label: 'C', score: 50 }]);
    expect(placed.map((p) => p.strength)).toEqual([0.9, 0.1, 0.5]);
    expect(placed[0].width).toBeGreaterThan(placed[2].width);
    expect(placed[2].width).toBeGreaterThan(placed[1].width);
  });

  it('fans bridges symmetrically and deterministically', () => {
    const input = Array.from({ length: 5 }, (_, i) => ({ key: `d${i}`, label: `D${i}`, score: 50 }));
    const a = bridgeLayout(input), b = bridgeLayout(input);
    expect(a).toEqual(b);
    expect(a[0].fan).toBeCloseTo(-a[4].fan, 6);
    expect(a[2].fan).toBeCloseTo(0, 6);
    expect(bridgeLayout([{ key: 'x', label: 'X', score: 40 }])[0].fan).toBe(0);
    // No two bridges share a height, so none hide behind another.
    expect(new Set(a.map((p) => p.control[1].toFixed(4))).size).toBe(5);
  });

  it('clamps out-of-range scores and words them plainly', () => {
    const [p] = bridgeLayout([{ key: 'x', label: 'X', score: 140 }]);
    expect(p.strength).toBe(1);
    expect(bridgeWord(80)).toBe('a strong bridge');
    expect(bridgeWord(50)).toBe('a mixed bridge');
    expect(bridgeWord(5)).toBe('a real stretch');
  });
});

describe('game hub layout', () => {
  it('keeps a category together and leaves a gap before the next one', async () => {
    const { hubAngles } = await import('./hub');
    const g = (key: string, category: string) => ({ key, name: key, category, color: '#fff', live: 0 });
    const a = hubAngles([g('a', 'x'), g('b', 'x'), g('c', 'y'), g('d', 'y')]);
    const within = a[1] - a[0], across = a[2] - a[1];
    expect(across).toBeGreaterThan(within);
    expect(a[3] - a[2]).toBeCloseTo(within, 6);
    expect(Math.max(...a)).toBeLessThan(Math.PI * 2);
  });
});
