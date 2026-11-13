import { hashSeed } from '../../shared/hash';

/**
 * Atmospheres for the journal and calendar: light SVG skies driven by real data — the local time of day, the
 * Moon's real phase for a day, and the days you actually wrote in your journal. Pure functions, so the drawing
 * and its words always agree, and so they can be tested.
 */
export type SkyTime = 'dawn' | 'day' | 'dusk' | 'night';

export function skyTime(hour: number): SkyTime {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** Gradient stops per time of day (top → bottom). Always deep enough that the light text on it stays readable. */
export const SKY: Record<SkyTime, { top: string; bottom: string; words: string; stars: number }> = {
  dawn: { top: '#2b2350', bottom: '#b0657a', words: 'Early light', stars: 0.35 },
  day: { top: '#1d3a63', bottom: '#4f6f9a', words: 'Daylight', stars: 0 },
  dusk: { top: '#231a46', bottom: '#8a4a5e', words: 'Dusk', stars: 0.55 },
  night: { top: '#07081a', bottom: '#1d1f45', words: 'Night sky', stars: 1 },
};

/** Fixed starfield for a seed: [x 0–100, y 0–100, r]. */
export function starField(seed: string, n: number): [number, number, number][] {
  let h = hashSeed(seed) || 1;
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  return Array.from({ length: n }, () => [rand() * 100, rand() * 100, 0.25 + rand() * 0.55]);
}

/**
 * Journal days as a constellation: one star per day you wrote, placed left to right by date, at a height fixed
 * by the date, joined in order. Days without an entry are not drawn.
 */
export function journalConstellation(days: { date: string; journal: number }[]): { date: string; x: number; y: number }[] {
  const n = Math.max(1, days.length);
  return days
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.journal > 0)
    .map(({ d, i }) => ({ date: d.date, x: 4 + (92 * (i + 0.5)) / n, y: 18 + (hashSeed(d.date) % 64) }));
}

/** Plain words for the Moon's illumination from its phase angle (0 new, 180 full). */
export function moonLight(phaseAngle: number): string {
  const lit = Math.round(((1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2) * 100);
  const way = phaseAngle < 180 ? 'growing' : 'shrinking';
  if (lit <= 2) return 'New moon — the sky is dark';
  if (lit >= 98) return 'Full moon';
  return `${lit}% lit and ${way}`;
}
