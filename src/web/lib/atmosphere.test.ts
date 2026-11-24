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

describe('assessment atmosphere', () => {
  const qs = [{ id: 'a', dimension: 'energy', key: 1 }, { id: 'b', dimension: 'energy', key: -1 }, { id: 'c', dimension: 'voice', key: 1 }];
  it('fills each light with progress and leans with the answers, without touching them', async () => {
    const { assessmentGlow } = await import('./atmosphere');
    const answers = { a: 5 };
    const g = assessmentGlow(qs, ['energy', 'voice'], answers);
    expect(g).toEqual([{ dimension: 'energy', glow: 0.5, lean: 1 }, { dimension: 'voice', glow: 0, lean: 0 }]);
    expect(answers).toEqual({ a: 5 });
    // A reverse-keyed statement leans the other way; the same answers always give the same picture.
    expect(assessmentGlow(qs, ['energy'], { a: 5, b: 5 })[0]).toEqual({ dimension: 'energy', glow: 1, lean: 0 });
    expect(assessmentGlow(qs, ['energy', 'voice'], answers)).toEqual(g);
  });
});
