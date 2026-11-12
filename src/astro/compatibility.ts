import { PLANETS, SIGNS, type PlanetId } from './constants';
import { placement } from './chart';
import type { ChartResult } from './types';
import { ASPECT_DEFS, type Aspect } from './western/aspects';
import { synastry } from './western/techniques';
import { gunaMilan, type GunaMilanResult } from './vedic/gunaMilan';
import { manglik } from './vedic/doshas';

/**
 * Deterministic, explainable compatibility engine. It reports several separate
 * dimensions; it deliberately does NOT combine them into one overall score,
 * because no weighting has been empirically validated against real outcomes.
 */
export const COMPATIBILITY_VERSION = 'compat-v1';

export type RelationshipKind =
  | 'friend' | 'romantic' | 'dating' | 'partner' | 'spouse' | 'sibling' | 'parent_child'
  | 'family' | 'colleague' | 'business' | 'custom';

type DimensionKey = 'emotional' | 'communication' | 'attraction' | 'stability' | 'growth';

const DIMENSIONS: Record<DimensionKey, { label: string; description: string; pairs: [PlanetId | 'asc', PlanetId | 'asc'][] }> = {
  emotional: {
    label: 'Emotional rhythm',
    description: 'Contacts involving the Moon — how each person’s emotional needs meet the other’s.',
    pairs: [['moon', 'moon'], ['moon', 'sun'], ['sun', 'moon'], ['moon', 'venus'], ['venus', 'moon'], ['moon', 'asc'], ['asc', 'moon']],
  },
  communication: {
    label: 'Communication',
    description: 'Contacts involving Mercury — thinking styles and conversation.',
    pairs: [['mercury', 'mercury'], ['mercury', 'moon'], ['moon', 'mercury'], ['mercury', 'sun'], ['sun', 'mercury'], ['mercury', 'jupiter'], ['jupiter', 'mercury']],
  },
  attraction: {
    label: 'Attraction & affection',
    description: 'Venus–Mars and related contacts, traditionally read as chemistry and affection.',
    pairs: [['venus', 'mars'], ['mars', 'venus'], ['venus', 'venus'], ['sun', 'venus'], ['venus', 'sun'], ['mars', 'mars']],
  },
  stability: {
    label: 'Commitment & structure',
    description: 'Saturn contacts and Sun–Sun aspects, read as durability and shared structure.',
    pairs: [['saturn', 'sun'], ['sun', 'saturn'], ['saturn', 'moon'], ['moon', 'saturn'], ['saturn', 'venus'], ['venus', 'saturn'], ['sun', 'sun']],
  },
  growth: {
    label: 'Growth & encouragement',
    description: 'Jupiter contacts, read as mutual encouragement and shared optimism.',
    pairs: [['jupiter', 'sun'], ['sun', 'jupiter'], ['jupiter', 'moon'], ['moon', 'jupiter'], ['jupiter', 'venus'], ['venus', 'jupiter']],
  },
};

const KIND_DIMENSIONS: Record<RelationshipKind, DimensionKey[]> = {
  romantic: ['emotional', 'communication', 'attraction', 'stability', 'growth'],
  dating: ['emotional', 'communication', 'attraction', 'stability', 'growth'],
  partner: ['emotional', 'communication', 'attraction', 'stability', 'growth'],
  spouse: ['emotional', 'communication', 'attraction', 'stability', 'growth'],
  friend: ['emotional', 'communication', 'growth', 'stability'],
  sibling: ['emotional', 'communication', 'growth'],
  parent_child: ['emotional', 'communication', 'stability', 'growth'],
  family: ['emotional', 'communication', 'growth'],
  colleague: ['communication', 'stability', 'growth'],
  business: ['communication', 'stability', 'growth'],
  custom: ['emotional', 'communication', 'stability', 'growth'],
};

/** Weight of one aspect: harmonious +1, conjunction +0.6 (+0.2 if Mars/Saturn involved), challenging −0.6; scaled by tightness. */
export function aspectWeight(a: Aspect): number {
  const def = ASPECT_DEFS[a.type];
  const tight = 1 - Math.min(1, a.orb / (def.orb + 2)) * 0.5;
  const hard = a.a === 'mars' || a.a === 'saturn' || a.b === 'mars' || a.b === 'saturn';
  const base = a.nature === 'harmonious' ? 1 : a.type === 'conjunction' ? (hard ? 0.2 : 0.6) : -0.6;
  return base * tight;
}

export interface DimensionResult {
  key: DimensionKey;
  label: string;
  description: string;
  score: number;
  factors: { text: string; weight: number }[];
  missingData: string[];
}

export interface CompatibilityResult {
  version: string;
  relationship: RelationshipKind;
  western: DimensionResult[];
  elementNote: string;
  vedic: {
    available: boolean;
    reason?: string;
    gunaMilan?: GunaMilanResult;
    gunaMilanReverse?: GunaMilanResult;
    rolesAssigned: boolean;
    manglik?: { a: boolean; b: boolean; summary: string };
  };
  methodology: string[];
  limitations: string[];
}

function bodyName(id: string) {
  return id === 'asc' ? 'Ascendant' : PLANETS[id as PlanetId].name;
}

export function compatibility(params: {
  westernA: ChartResult;
  westernB: ChartResult;
  vedicA?: ChartResult;
  vedicB?: ChartResult;
  relationship: RelationshipKind;
  /** When true, A is treated as the traditional groom role and B as bride role for Guna Milan. */
  traditionalRoles?: boolean;
  nameA?: string;
  nameB?: string;
}): CompatibilityResult {
  const { westernA, westernB, relationship } = params;
  const nA = params.nameA ?? 'Person A';
  /** Possessive that reads naturally for 'You' as well as a name: 'Your Moon', 'Meera’s Moon'. */
  const poss = (n: string) => (n === 'You' ? 'Your' : `${n}'s`);
  const nB = params.nameB ?? 'Person B';
  const aspects = synastry(westernA, westernB);
  const western: DimensionResult[] = KIND_DIMENSIONS[relationship].map((key) => {
    const dim = DIMENSIONS[key];
    const missing: string[] = [];
    const relevant = aspects.filter((asp) => dim.pairs.some(([x, y]) => asp.a === x && asp.b === y));
    if (!westernA.ascendant && dim.pairs.some(([x]) => x === 'asc')) missing.push(`${poss(nA)} Ascendant (birth time unknown)`);
    if (!westernB.ascendant && dim.pairs.some(([, y]) => y === 'asc')) missing.push(`${poss(nB)} Ascendant (birth time unknown)`);
    if (westernA.reliability.moonSign !== 'reliable' && dim.pairs.some(([x]) => x === 'moon')) missing.push(`${poss(nA)} Moon sign is uncertain`);
    if (westernB.reliability.moonSign !== 'reliable' && dim.pairs.some(([, y]) => y === 'moon')) missing.push(`${poss(nB)} Moon sign is uncertain`);
    const factors = relevant.map((asp) => ({
      text: `${poss(nA)} ${bodyName(asp.a)} ${asp.type} ${poss(nB)} ${bodyName(asp.b)} (orb ${asp.orb.toFixed(1)}°)`,
      weight: Number(aspectWeight(asp).toFixed(2)),
    }));
    const sum = factors.reduce((s, f) => s + f.weight, 0);
    const score = Math.round(50 + 50 * Math.tanh(sum / 2.5));
    if (!factors.length) factors.push({ text: 'No close contacts between the relevant bodies; this dimension reads as neutral.', weight: 0 });
    return { key, label: dim.label, description: dim.description, score, factors, missingData: missing };
  });

  const mA = SIGNS[placement(westernA, 'moon').sign].element;
  const mB = SIGNS[placement(westernB, 'moon').sign].element;
  const compatibleElements = (x: string, y: string) => x === y || (['fire', 'air'].includes(x) && ['fire', 'air'].includes(y)) || (['earth', 'water'].includes(x) && ['earth', 'water'].includes(y));
  const elementNote = `Moon elements: ${mA} and ${mB} — ${compatibleElements(mA, mB) ? 'traditionally complementary' : 'traditionally contrasting, which many astrologers read as a source of growth'}.`;

  let vedic: CompatibilityResult['vedic'] = { available: false, reason: 'Vedic charts unavailable for one or both people.', rolesAssigned: false };
  if (params.vedicA && params.vedicB) {
    const moonA = placement(params.vedicA, 'moon').longitude;
    const moonB = placement(params.vedicB, 'moon').longitude;
    const ma = manglik(params.vedicA).present;
    const mb = manglik(params.vedicB).present;
    vedic = {
      available: true,
      rolesAssigned: Boolean(params.traditionalRoles),
      gunaMilan: gunaMilan({ moonLongitude: moonA }, { moonLongitude: moonB }),
      gunaMilanReverse: params.traditionalRoles ? undefined : gunaMilan({ moonLongitude: moonB }, { moonLongitude: moonA }),
      manglik: {
        a: ma, b: mb,
        summary: ma && mb
          ? 'Both charts meet the Manglik rule; tradition generally regards this as balanced.'
          : ma || mb
            ? 'Only one chart meets the Manglik rule; traditions list several exceptions and remedies — discuss with a practitioner if this matters to you.'
            : 'Neither chart meets the Manglik rule.',
      },
    };
  }

  return {
    version: COMPATIBILITY_VERSION,
    relationship,
    western,
    elementNote,
    vedic,
    methodology: [
      'Western dimensions use tropical synastry aspects (major aspects, orbs at 75% of natal orbs).',
      'Each aspect contributes: harmonious +1, conjunction +0.6 (+0.2 with Mars/Saturn), challenging −0.6, scaled by orb tightness; score = 50 + 50·tanh(sum/2.5).',
      'Dimensions shown depend on the relationship type. Dimensions are not combined into one score.',
      'Vedic Guna Milan uses the Ashtakoota method on sidereal (Lahiri) Moon positions.',
    ],
    limitations: [
      'These are traditional symbolic readings, not measurements of real-world compatibility or predictions of relationship success.',
      'Scores have not been validated against relationship outcomes.',
      'No chart makes a person good or bad for anyone; use this as a conversation starter.',
    ],
  };
}
