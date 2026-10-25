import { describe, expect, it } from 'vitest';
import { ARCHETYPE_KEYS, archetypeKeyFor, buildChart, deriveArchetype, DEFAULT_VEDIC_CONFIG, type ChartResult } from './index';
import { ARCHETYPES } from '../content/archetypes';
import { INTERPRETATION_RULES } from '../content/interpretations';

const BIRTH = { date: '1996-01-14', time: '06:40', timePrecision: 'exact' as const, latitude: 26.9124, longitude: 75.7873, timezone: 'Asia/Kolkata' };

/** Minimal chart with planets placed at the middle of the given signs. */
function fake(signs: Partial<Record<'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn', number>>, asc: number | null): ChartResult {
  const placements = Object.entries(signs).map(([id, sign]) => ({ id, sign: sign!, longitude: sign! * 30 + 15 }));
  return { system: 'vedic', placements, ascendant: asc === null ? null : { sign: asc, longitude: asc * 30 + 15 } } as unknown as ChartResult;
}

describe('Cosmic ID archetypes', () => {
  it('covers all twelve element × modality combinations with one authored archetype each', () => {
    expect(new Set(ARCHETYPE_KEYS).size).toBe(12);
    for (const k of ARCHETYPE_KEYS) {
      const a = ARCHETYPES[k];
      expect(archetypeKeyFor(a.element, a.modality)).toBe(k);
      expect(a.portrait.split(' ').length).toBeGreaterThan(50);
    }
    expect(new Set(ARCHETYPE_KEYS.map((k) => ARCHETYPES[k].name)).size).toBe(12);
  });

  it('is deterministic and documents its method', () => {
    const chart = buildChart(BIRTH, DEFAULT_VEDIC_CONFIG);
    const a = deriveArchetype(chart);
    expect(deriveArchetype(buildChart(BIRTH, DEFAULT_VEDIC_CONFIG))).toEqual(a);
    expect(a.method).toMatch(/sidereal/);
    expect(a.includesAscendant).toBe(true);
    const total = Object.values(a.elements).reduce((x, y) => x + y, 0);
    expect(Object.values(a.modalities).reduce((x, y) => x + y, 0)).toBeCloseTo(total);
  });

  it('picks the weighted dominant element and modality', () => {
    // Sun, Moon, Ascendant in water signs (weight 6) outweigh Mercury/Venus/Mars in fire (4.5).
    const a = deriveArchetype(fake({ sun: 3, moon: 7, mercury: 0, venus: 4, mars: 8 }, 11));
    expect(a.element).toBe('water');
  });

  it('breaks exact ties by the Moon sign rather than by list order', () => {
    // Sun in Mesha (fire, cardinal) vs Moon in Kumbha (air, fixed): equal weights, no Ascendant.
    const a = deriveArchetype(fake({ sun: 0, moon: 10 }, null));
    expect(a.element).toBe('air');
    expect(a.modality).toBe('fixed');
    expect(a.key).toBe('moon_static');
    expect(a.blend).not.toBeNull();
    expect(a.includesAscendant).toBe(false);
  });
});

describe('Vedic content pack v2', () => {
  it('never reuses Western body text for Rashi, Lagna or Surya', () => {
    const western = new Set(INTERPRETATION_RULES.filter((r) => r.system === 'western').map((r) => r.body.en));
    const vedic = INTERPRETATION_RULES.filter((r) => ['rashi', 'lagna', 'vedic_sun'].includes(r.group));
    expect(vedic).toHaveLength(36);
    for (const r of vedic) {
      expect(western.has(r.body.en)).toBe(false);
      expect(r.version).toBe(2);
    }
    expect(new Set(vedic.map((r) => r.body.en)).size).toBe(36);
  });
});
