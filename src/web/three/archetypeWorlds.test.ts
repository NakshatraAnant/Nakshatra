import { describe, expect, it } from 'vitest';
import { PERSONA_ARCHETYPES } from '../../shared/personality';
import { ARCHETYPE_WORLDS, REVEAL_LENGTH, REVEAL_STAGES, worldFor } from './archetypeWorlds';
import { GRAPHICS_LEVELS, profileFor } from './quality';

describe('archetype worlds', () => {
  it('covers exactly the 24 archetypes', () => {
    expect(Object.keys(ARCHETYPE_WORLDS).sort()).toEqual(PERSONA_ARCHETYPES.map((a) => a.key).sort());
  });

  it('gives every archetype a different form + build, and a unique full signature', () => {
    const pairs = Object.values(ARCHETYPE_WORLDS).map((x) => `${x.form}/${x.build}`);
    expect(new Set(pairs).size).toBe(24);
    const captions = Object.values(ARCHETYPE_WORLDS).map((x) => x.caption);
    expect(new Set(captions).size).toBe(24);
    for (const x of Object.values(ARCHETYPE_WORLDS)) {
      expect(x.satellites).toBeGreaterThanOrEqual(0);
      expect(x.satellites).toBeLessThanOrEqual(6);
      expect(x.caption.length).toBeGreaterThan(20);
    }
  });

  it('falls back to a neutral world for unknown keys, and reveal stages are ordered', () => {
    expect(worldFor('nope').form).toBe('icosahedron');
    const times = REVEAL_STAGES.map((s) => s.at);
    expect(REVEAL_STAGES.map((s) => s.key)).toEqual(['silence', 'dimensions', 'connection', 'archetype', 'blend', 'awakening', 'arrival']);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(REVEAL_LENGTH).toBeGreaterThan(times[times.length - 1]);
  });
});

describe('graphics profiles', () => {
  it('scales cost upward from eco to ultra', () => {
    const p = Object.fromEntries(GRAPHICS_LEVELS.map((l) => [l.key, profileFor(l.key)]));
    expect(p.eco).toMatchObject({ onDemand: true, maxDpr: 1, tier: 'low' });
    expect(p.eco.density).toBeLessThan(p.balanced.density);
    expect(p.balanced.density).toBeLessThan(p.high.density);
    expect(p.high.density).toBeLessThan(p.ultra.density);
    expect(p.ultra.maxDpr).toBe(2);
    expect(p.auto.tier).toBeNull();
  });
});
