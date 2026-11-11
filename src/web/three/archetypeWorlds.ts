/**
 * The 24 archetype worlds, as data. One scene engine (identity.tsx) reads these; nothing here imports three.js.
 *
 * Each world is a distinct combination of: the form of the shell around the sigil, how that shell is built, how
 * it moves, what orbits it and what drifts through it. The choices follow each archetype's character note in
 * lib/visual.ts (Oracle, Jester, Keeper…), and no two archetypes share the same form + build pair (tested).
 * Colour always comes from the archetype's existing accent, never from here.
 */
export type WorldForm = 'icosahedron' | 'octahedron' | 'dodecahedron' | 'tetrahedron' | 'knot' | 'sphere' | 'prism' | 'lattice';
export type WorldBuild = 'wire' | 'facets' | 'glass';
export type WorldMotion = 'drift' | 'pulse' | 'spin' | 'sway' | 'flicker' | 'breathe';
export type WorldParticles = 'dust' | 'sparks' | 'motes' | 'embers';

export interface ArchetypeWorld {
  form: WorldForm;
  build: WorldBuild;
  motion: WorldMotion;
  /** Small bodies orbiting the shell (0–6). */
  satellites: number;
  particles: WorldParticles;
  /** Tilt of the whole composition in radians: how "upright" the world sits. */
  tilt: number;
  /** One line shown to people, describing what they are looking at. */
  caption: string;
}

const w = (form: WorldForm, build: WorldBuild, motion: WorldMotion, satellites: number, particles: WorldParticles, tilt: number, caption: string): ArchetypeWorld => ({ form, build, motion, satellites, particles, tilt, caption });

export const ARCHETYPE_WORLDS: Record<string, ArchetypeWorld> = {
  midnight_philosopher: w('sphere', 'glass', 'breathe', 1, 'dust', 0.12, 'A dark glass sphere with one slow moon: deep, quiet, inward.'),
  chaos_diplomat: w('knot', 'facets', 'spin', 5, 'sparks', 0.5, 'A bright knot with many companions: tension turned into play.'),
  unbothered_overthinker: w('lattice', 'wire', 'drift', 2, 'motes', 0.08, 'A calm outer lattice with a lot going on inside.'),
  lore_keeper: w('dodecahedron', 'facets', 'sway', 3, 'dust', 0.1, 'A twelve-sided keepsake box, steady and many-faced.'),
  soft_launch_romantic: w('sphere', 'facets', 'pulse', 1, 'embers', 0.2, 'A low, warm glow that shows itself a little at a time.'),
  human_plot_twist: w('tetrahedron', 'facets', 'flicker', 4, 'sparks', 0.7, 'A sharp spark that never sits the same way twice.'),
  professional_disappearing_act: w('octahedron', 'glass', 'drift', 0, 'dust', 0.3, 'A clear crystal that is there, and then nearly not.'),
  emotional_archivist: w('dodecahedron', 'glass', 'breathe', 4, 'embers', 0.15, 'A glass case of small warm lights, each one kept.'),
  delulu_strategist: w('prism', 'facets', 'spin', 3, 'sparks', 0.35, 'A tall prism pointed at something far away, with a plan.'),
  accidental_therapist: w('sphere', 'wire', 'breathe', 2, 'motes', 0.05, 'An open sphere: room for what other people bring.'),
  quiet_instigator: w('tetrahedron', 'wire', 'sway', 1, 'sparks', 0.4, 'A small sharp frame with one spark waiting.'),
  social_battery_economist: w('prism', 'glass', 'pulse', 2, 'motes', 0.1, 'A measured column of light that brightens and rests.'),
  group_chat_mayor: w('icosahedron', 'facets', 'spin', 6, 'sparks', 0.25, 'A busy many-sided hub with everyone in orbit.'),
  spreadsheet_optimist: w('lattice', 'facets', 'pulse', 3, 'motes', 0.0, 'A tidy grid that keeps lighting up.'),
  main_character_trainee: w('icosahedron', 'glass', 'flicker', 3, 'sparks', 0.45, 'A bright gem catching every light as it turns.'),
  calm_in_the_chaos: w('octahedron', 'facets', 'breathe', 4, 'dust', 0.0, 'A level, balanced stone while things circle around it.'),
  side_quest_collector: w('knot', 'wire', 'drift', 5, 'motes', 0.6, 'A wandering loop that keeps picking things up.'),
  kind_truth_teller: w('octahedron', 'wire', 'sway', 1, 'dust', 0.2, 'A clear-edged frame: direct lines, nothing hidden.'),
  cosy_contrarian: w('dodecahedron', 'wire', 'drift', 1, 'embers', 0.55, 'A warm lantern tilted its own way.'),
  loyal_night_owl: w('icosahedron', 'wire', 'breathe', 2, 'embers', 0.18, 'A night light that stays on, with its two regulars.'),
  hype_engineer: w('prism', 'wire', 'flicker', 5, 'sparks', 0.3, 'A scaffold throwing sparks upward for other people.'),
  gentle_detective: w('lattice', 'glass', 'sway', 2, 'dust', 0.22, 'A fine glass grid that notices small movements.'),
  plan_b_poet: w('knot', 'glass', 'sway', 2, 'embers', 0.65, 'A glass ribbon that bends and still makes a shape.'),
  steady_signal: w('tetrahedron', 'glass', 'pulse', 0, 'motes', 0.0, 'A simple beacon, pulsing at the same pace every time.'),
};

export const DEFAULT_WORLD: ArchetypeWorld = w('icosahedron', 'wire', 'drift', 2, 'dust', 0.15, 'A quiet shape still taking form.');
export const worldFor = (key: string): ArchetypeWorld => ARCHETYPE_WORLDS[key] ?? DEFAULT_WORLD;

/** Timings of the reveal, in seconds, shared by the scene and the on-page captions. */
export const REVEAL_STAGES = [
  { at: 0, label: 'Your five dimensions' },
  { at: 2.2, label: 'Your shape forms' },
  { at: 3.6, label: 'What orbits you' },
  { at: 4.8, label: 'This is you' },
] as const;
export const REVEAL_LENGTH = 5.6;
