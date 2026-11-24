import { DIMENSIONS, DIMENSION_INFO, type Dimension, type Vector } from './personality';
import { hashSeed } from './hash';

/**
 * Common Ground cards and conversation starters (common-ground-v1). Pure and deterministic: given
 * what two people have each chosen to share, list what they have in common and suggest a few light
 * questions. It never predicts compatibility and never uses hidden data.
 */
export interface SharedView { name: string; archetype: string | null; scores: Vector | null; labels: string[] }

const STARTERS: Record<Dimension, { same: string[]; diff: string[] }> = {
  energy: {
    same: ['What does a perfect Saturday look like for you two?', 'Big group plan or small hang — which did you both pick last time?'],
    diff: ['How do you each recharge after a long week?', 'What’s the right group size for a good night, for each of you?'],
  },
  compass: {
    same: ['What’s a decision you both still think about?', 'When did a gut feeling (or a spreadsheet) save you?'],
    diff: ['How did each of you choose your last big thing?', 'Logic or feeling — what settled your last argument with a friend?'],
  },
  voice: {
    same: ['What do you wish more people said out loud?', 'Who is the friend you can tell anything?'],
    diff: ['What’s something you only say once you trust someone?', 'Voice note or text — what does each of you prefer, and why?'],
  },
  tempo: {
    same: ['What’s the best plan (or non-plan) you both had this year?', 'Itinerary or wander — your ideal trip?'],
    diff: ['Planner and improviser: how would you split a weekend trip?', 'What’s one thing you always plan and one you never do?'],
  },
  horizon: {
    same: ['What did you try for the first time recently?', 'Which favourite have you both rewatched or reread?'],
    diff: ['What’s a comfort favourite you’d recommend to the other?', 'What’s the most random new thing you tried this month?'],
  },
};

export function commonGround(a: SharedView, b: SharedView, seed: string) {
  const sharedLabels = a.labels.filter((l) => b.labels.includes(l));
  const similar: Dimension[] = []; const different: Dimension[] = [];
  if (a.scores && b.scores) for (const d of DIMENSIONS) (Math.abs(a.scores[d] - b.scores[d]) <= 0.35 ? similar : different).push(d);
  const pick = (arr: string[], salt: string) => arr[hashSeed(`${seed}:${salt}`) % arr.length];
  const starters = [
    ...similar.slice(0, 2).map((d) => pick(STARTERS[d].same, d)),
    ...different.slice(0, 2).map((d) => pick(STARTERS[d].diff, d)),
  ];
  if (sharedLabels.length) starters.unshift(`You’re both “${sharedLabels[0]}” — what got you into it?`);
  if (!starters.length) starters.push('What’s one small thing that made your week better?', 'What are you looking forward to this month?');
  return {
    sameArchetype: Boolean(a.archetype && a.archetype === b.archetype),
    sharedLabels,
    similarDimensions: similar.map((d) => DIMENSION_INFO[d].name),
    differentDimensions: different.map((d) => DIMENSION_INFO[d].name),
    starters: [...new Set(starters)].slice(0, 4),
    note: 'Built only from what each of you chose to share. It is not a compatibility score.',
  };
}
