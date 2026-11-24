/**
 * Universe Studio — a member's own identity environment. Like the rest of the appearance settings, every value is
 * a key from a fixed list (no free-form input), stored with the profile's appearance and applied wherever that
 * member's identity world is drawn. Purely visual: it never touches assessment results.
 */
const opts = <T extends string>(...o: [T, string, string][]) => o.map(([key, label, hint]) => ({ key, label, hint }));

export const UNIVERSE_OPTIONS = {
  backdrop: opts(['nebula', 'Nebula', 'Soft violet cloud'], ['aurora', 'Aurora', 'Green and teal light'], ['dawn', 'Dawn', 'Warm rose horizon'], ['void', 'Deep space', 'Stars only']),
  lighting: opts(['warm', 'Warm', 'Golden key light'], ['cool', 'Cool', 'Blue-white light'], ['moonlit', 'Moonlit', 'Dim and silvery']),
  celestial: opts(['none', 'None', 'Nothing in the sky'], ['moon', 'Moon', 'A pale moon'], ['ringed', 'Ringed planet', 'A planet with a ring'], ['twin', 'Twin stars', 'Two bright stars']),
  decoration: opts(['none', 'None', 'Just your world'], ['halo', 'Halo', 'A ring of light behind it'], ['lanterns', 'Lanterns', 'Small lights in slow orbit']),
  particles: opts(['archetype', 'From my archetype', 'What your archetype gives you'], ['dust', 'Dust', 'Fine and slow'], ['motes', 'Motes', 'Larger drifting points'], ['sparks', 'Sparks', 'Quick and bright'], ['embers', 'Embers', 'Rising from below'], ['none', 'None', 'No particles']),
} as const;

export type UniversePart = keyof typeof UNIVERSE_OPTIONS;
export type Universe = { [K in UniversePart]: string };
export const UNIVERSE_PARTS = Object.keys(UNIVERSE_OPTIONS) as UniversePart[];
export const UNIVERSE_LABEL: Record<UniversePart, string> = { backdrop: 'Environment', lighting: 'Lighting', celestial: 'In the sky', decoration: 'Decoration', particles: 'Particles' };
export const universeKeys = (p: UniversePart) => UNIVERSE_OPTIONS[p].map((o) => o.key) as [string, ...string[]];
export const DEFAULT_UNIVERSE: Universe = { backdrop: 'nebula', lighting: 'warm', celestial: 'none', decoration: 'none', particles: 'archetype' };

/** Anything unknown falls back to the default for that part. */
export function normaliseUniverse(raw: unknown): Universe {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(UNIVERSE_PARTS.map((p) => [p, typeof r[p] === 'string' && universeKeys(p).includes(r[p] as string) ? r[p] : DEFAULT_UNIVERSE[p]])) as Universe;
}

/** Colours each choice resolves to, shared by the 3D scene and the flat preview. */
export const BACKDROP_COLORS: Record<string, [string, string]> = { nebula: ['#0b0c1f', '#3a2f6b'], aurora: ['#04141a', '#1f6b5c'], dawn: ['#1a0f1f', '#8a4a5e'], void: ['#020308', '#0a0c18'] };
export const LIGHT_COLORS: Record<string, { key: string; fill: number }> = { warm: { key: '#f3e4c0', fill: 0.5 }, cool: { key: '#cfe4ff', fill: 0.55 }, moonlit: { key: '#b9c2e6', fill: 0.3 } };
