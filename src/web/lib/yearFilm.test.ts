import { describe, expect, it } from 'vitest';
import { filmBeats } from './yearFilm';

const months = (m: Record<number, number>) => Array.from({ length: 12 }, (_, i) => m[i] ?? 0);

describe('year film beats', () => {
  it('opens, finds the first and busiest months, adds highlights, then closes', () => {
    const b = filmBeats({ year: 2026, soFar: true, months: months({ 2: 1, 6: 9, 10: 4 }), highlights: ['You posted 5 drops.', 'You joined 2 circles.'] });
    expect(b.map((x) => x.key)).toEqual(['open', 'first', 'busiest', 'h0', 'h1', 'close']);
    expect(b[0].body).toContain('14 things');
    expect(b[1]).toMatchObject({ title: 'It started in March', month: 2 });
    expect(b[2]).toMatchObject({ title: 'July was your busiest month', month: 6 });
    expect(b.at(-1)!.title).toBe('And the year isn’t over yet.');
  });

  it('does not repeat a month when the first month is also the busiest', () => {
    const b = filmBeats({ year: 2025, soFar: false, months: months({ 0: 3 }), highlights: [] });
    expect(b.map((x) => x.key)).toEqual(['open', 'busiest', 'close']);
    expect(b[1].body).toBe('3 things that month.');
    expect(b.at(-1)!.title).toBe('That was your 2025.');
  });

  it('tells a quiet year honestly, with no invented beats', () => {
    const b = filmBeats({ year: 2026, soFar: true, months: months({}), highlights: [] });
    expect(b.map((x) => x.key)).toEqual(['open', 'close']);
    expect(b[0].body).toBe('A quiet year here so far.');
  });
});
