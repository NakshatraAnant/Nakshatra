import { describe, expect, it } from 'vitest';
import { SKY, journalConstellation, moonLight, skyTime, starField } from './atmosphere';

describe('atmospheres', () => {
  it('names the time of day from the local hour', () => {
    expect([4, 5, 9, 17, 19, 20, 23].map(skyTime)).toEqual(['night', 'dawn', 'day', 'dusk', 'dusk', 'night', 'night']);
    expect(SKY.day.stars).toBe(0);
    expect(SKY.night.stars).toBe(1);
  });

  it('keeps the same stars for the same seed', () => {
    expect(starField('2026-11', 20)).toEqual(starField('2026-11', 20));
    expect(starField('2026-11', 20)).not.toEqual(starField('2026-12', 20));
    for (const [x, y] of starField('x', 50)) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(100); expect(y).toBeLessThan(100); }
  });

  it('draws a star only for days with a journal entry, in date order', () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, journal: [2, 9, 20].includes(i) ? 1 : 0 }));
    const c = journalConstellation(days);
    expect(c.map((s) => s.date)).toEqual(['2026-11-03', '2026-11-10', '2026-11-21']);
    expect(c[0].x).toBeLessThan(c[1].x);
    expect(journalConstellation(days.map((d) => ({ ...d, journal: 0 })))).toEqual([]);
  });

  it('describes the Moon plainly from its phase angle', () => {
    expect(moonLight(0)).toBe('New moon — the sky is dark');
    expect(moonLight(180)).toBe('Full moon');
    expect(moonLight(90)).toBe('50% lit and growing');
    expect(moonLight(270)).toBe('50% lit and shrinking');
  });
});
