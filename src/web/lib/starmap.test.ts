import { describe, expect, it } from 'vitest';
import { MAX_STARS, RING_RADIUS, layoutStars, project2d, type MapStar } from './starmap';

const star = (id: string, ring: 0 | 1 | 2): MapStar => ({ id, ring, color: '#fff', size: 1, bright: true });

describe('star map layout', () => {
  it('is deterministic and keeps each star on its ring', () => {
    const stars = [star('a', 0), star('b', 0), star('c', 1), star('d', 2), star('e', 2), star('f', 2)];
    const one = layoutStars(stars), two = layoutStars(stars);
    expect(one).toEqual(two);
    for (const p of one) expect(p.radius).toBe(RING_RADIUS[p.ring]);
  });

  it('spreads the stars of one ring evenly so none overlap', () => {
    const placed = layoutStars(Array.from({ length: 12 }, (_, i) => star(`s${i}`, 1)));
    const angles = placed.map((p) => p.angle).sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++) expect(angles[i] - angles[i - 1]).toBeCloseTo((Math.PI * 2) / 12, 6);
  });

  it('caps how many stars are drawn and projects them inside the 2D frame', () => {
    const placed = layoutStars(Array.from({ length: 80 }, (_, i) => star(`p${i}`, (i % 3) as 0 | 1 | 2)));
    expect(placed).toHaveLength(MAX_STARS);
    for (const p of placed) {
      const { x, y } = project2d(p);
      expect(Math.abs(x)).toBeLessThanOrEqual(5.01);
      expect(Math.abs(y)).toBeLessThanOrEqual(2.9);
    }
  });
});
