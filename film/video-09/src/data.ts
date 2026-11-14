/**
 * Everything the film says about the product comes from the product: the 24 archetypes, their worlds,
 * their accents and artwork slots, and the five dimensions. Nothing here is retyped.
 */
import { PERSONA_ARCHETYPES, DIMENSIONS, DIMENSION_INFO, QUESTIONS } from '@app/shared/personality';
import { ARCHETYPE_WORLDS, type ArchetypeWorld } from '@app/web/three/archetypeWorlds';
import { ARCHETYPE_VISUALS, archetypeArt, BRAND } from '@app/web/lib/visual';
import { LOOKS, type Look } from './figure';

/** src/web/components/IdentityIntro.tsx DIMENSION_COLOR (that module is a React component, so the values are mirrored). */
export const DIMENSION_COLOR: Record<string, string> = { energy: '#e9a23b', compass: '#c98a96', voice: '#8d7bd8', tempo: '#7fb69a', horizon: '#6fa8dc' };

export interface Archetype { index: number; key: string; name: string; signature: string; accent: string; world: ArchetypeWorld; sigil: string; look: Look }

export const ARCHETYPES: Archetype[] = PERSONA_ARCHETYPES.map((a, index) => {
  const world = ARCHETYPE_WORLDS[a.key];
  const visual = ARCHETYPE_VISUALS[a.key];
  const look = LOOKS[a.key];
  if (!world || !visual || !look) throw new Error(`Film data is missing for archetype ${a.key}`);
  return { index, key: a.key, name: a.name, signature: a.signature, accent: visual.accent, world, sigil: archetypeArt(a.key, 'sigil')!, look };
});
if (ARCHETYPES.length !== 24) throw new Error(`Expected 24 archetypes, found ${ARCHETYPES.length}`);

export const DIMS = DIMENSIONS.map((key) => ({ key, name: DIMENSION_INFO[key].name, low: DIMENSION_INFO[key].low, high: DIMENSION_INFO[key].high, color: DIMENSION_COLOR[key] }));
export const QUESTION_COUNT = QUESTIONS.length;
export { BRAND };
