import { NAKSHATRAS, NATURAL_RELATIONS, SIGNS, nakshatraOf, signOf, degreeInSign, type PlanetId, type Yoni } from '../constants';

/**
 * Ashtakoota Guna Milan (36 points). Score tables differ slightly between
 * publishers; the tables below are the "Nakshatra v1" convention and are
 * versioned. The method is traditionally asymmetric (groom/bride roles); for
 * pairs where those roles do not apply, both orientations are reported.
 */
export const GUNA_MILAN_VERSION = 'ashtakoota-v1';

type Varna = 'brahmin' | 'kshatriya' | 'vaishya' | 'shudra';
type Vashya = 'chatushpada' | 'manava' | 'jalachara' | 'vanachara' | 'keeta';
type Gana = 'deva' | 'manushya' | 'rakshasa';

const VARNA_RANK: Record<Varna, number> = { brahmin: 4, kshatriya: 3, vaishya: 2, shudra: 1 };
const ELEMENT_VARNA: Record<string, Varna> = { water: 'brahmin', fire: 'kshatriya', earth: 'vaishya', air: 'shudra' };

function varnaOf(sign: number): Varna {
  return ELEMENT_VARNA[SIGNS[sign].element];
}

function vashyaOf(longitude: number): Vashya {
  const s = signOf(longitude);
  const d = degreeInSign(longitude);
  switch (s) {
    case 0: case 1: return 'chatushpada';
    case 2: case 5: case 6: case 10: return 'manava';
    case 3: case 11: return 'jalachara';
    case 4: return 'vanachara';
    case 7: return 'keeta';
    case 8: return d < 15 ? 'manava' : 'chatushpada';
    case 9: return d < 15 ? 'chatushpada' : 'jalachara';
  }
  return 'manava';
}

const VASHYA_ORDER: Vashya[] = ['chatushpada', 'manava', 'jalachara', 'vanachara', 'keeta'];
/** Rows: groom; columns: bride. */
const VASHYA_TABLE = [
  [2, 1, 1, 0.5, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0.5, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
];

export const YONI_ORDER: Yoni[] = ['horse', 'elephant', 'sheep', 'serpent', 'dog', 'cat', 'rat', 'cow', 'buffalo', 'tiger', 'deer', 'monkey', 'mongoose', 'lion'];
export const YONI_TABLE = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

const GANA_ORDER: Gana[] = ['deva', 'manushya', 'rakshasa'];
/** Rows: groom; columns: bride. */
const GANA_TABLE = [
  [6, 6, 1],
  [5, 6, 0],
  [1, 0, 6],
];

function relation(of: PlanetId, toward: PlanetId): 'friend' | 'neutral' | 'enemy' | 'same' {
  if (of === toward) return 'same';
  const r = NATURAL_RELATIONS[of];
  if (r.friends.includes(toward)) return 'friend';
  if (r.enemies.includes(toward)) return 'enemy';
  return 'neutral';
}

function maitriScore(a: PlanetId, b: PlanetId): number {
  const ab = relation(a, b);
  const ba = relation(b, a);
  if (ab === 'same') return 5;
  const key = [ab, ba].sort().join('+');
  const table: Record<string, number> = {
    'friend+friend': 5,
    'friend+neutral': 4,
    'neutral+neutral': 3,
    'enemy+friend': 1,
    'enemy+neutral': 0.5,
    'enemy+enemy': 0,
  };
  return table[key];
}

export interface KootaScore {
  key: 'varna' | 'vashya' | 'tara' | 'yoni' | 'graha_maitri' | 'gana' | 'bhakoot' | 'nadi';
  name: string;
  max: number;
  score: number;
  detail: string;
  meaning: string;
}

export interface GunaMilanResult {
  version: string;
  total: number;
  max: 36;
  kootas: KootaScore[];
  doshas: { key: string; present: boolean; detail: string }[];
  band: { label: string; range: string };
  caveats: string[];
}

export interface MoonInput {
  /** Sidereal Moon longitude. */
  moonLongitude: number;
}

/** @param groom person in the traditional groom role; @param bride person in the traditional bride role */
export function gunaMilan(groom: MoonInput, bride: MoonInput): GunaMilanResult {
  const gSign = signOf(groom.moonLongitude);
  const bSign = signOf(bride.moonLongitude);
  const gNak = nakshatraOf(groom.moonLongitude).index;
  const bNak = nakshatraOf(bride.moonLongitude).index;
  const gN = NAKSHATRAS[gNak];
  const bN = NAKSHATRAS[bNak];
  const kootas: KootaScore[] = [];

  const gv = varnaOf(gSign);
  const bv = varnaOf(bSign);
  kootas.push({
    key: 'varna', name: 'Varna', max: 1, score: VARNA_RANK[gv] >= VARNA_RANK[bv] ? 1 : 0,
    detail: `Groom-role ${gv}, bride-role ${bv} (by Moon sign element).`,
    meaning: 'Traditional temperament grouping of the Moon signs.',
  });

  const gva = vashyaOf(groom.moonLongitude);
  const bva = vashyaOf(bride.moonLongitude);
  kootas.push({
    key: 'vashya', name: 'Vashya', max: 2, score: VASHYA_TABLE[VASHYA_ORDER.indexOf(gva)][VASHYA_ORDER.indexOf(bva)],
    detail: `Groom-role ${gva}, bride-role ${bva}.`,
    meaning: 'Traditional notion of mutual influence between the Moon signs.',
  });

  const taraCount = (from: number, to: number) => {
    const n = ((to - from + 27) % 27) + 1;
    const t = n % 9 === 0 ? 9 : n % 9;
    return t;
  };
  const t1 = taraCount(bNak, gNak);
  const t2 = taraCount(gNak, bNak);
  const bad = [3, 5, 7];
  const taraScore = (bad.includes(t1) ? 0 : 1.5) + (bad.includes(t2) ? 0 : 1.5);
  kootas.push({
    key: 'tara', name: 'Tara (Dina)', max: 3, score: taraScore,
    detail: `Tara ${t1} counted from bride-role nakshatra, ${t2} from groom-role nakshatra (3, 5 and 7 are traditionally unfavourable).`,
    meaning: 'Nakshatra-distance rhythm between the two birth stars.',
  });

  const yScore = YONI_TABLE[YONI_ORDER.indexOf(gN.yoni)][YONI_ORDER.indexOf(bN.yoni)];
  kootas.push({
    key: 'yoni', name: 'Yoni', max: 4, score: yScore,
    detail: `${gN.name}: ${gN.yoni}; ${bN.name}: ${bN.yoni}.`,
    meaning: 'Animal symbolism assigned to each nakshatra, describing instinctive rapport.',
  });

  const gl = SIGNS[gSign].ruler;
  const bl = SIGNS[bSign].ruler;
  kootas.push({
    key: 'graha_maitri', name: 'Graha Maitri', max: 5, score: maitriScore(gl, bl),
    detail: `Moon-sign lords ${gl} and ${bl}: ${relation(gl, bl)} / ${relation(bl, gl)} (natural friendship).`,
    meaning: 'Natural friendship between the lords of the two Moon signs.',
  });

  const gScore = GANA_TABLE[GANA_ORDER.indexOf(gN.gana)][GANA_ORDER.indexOf(bN.gana)];
  kootas.push({
    key: 'gana', name: 'Gana', max: 6, score: gScore,
    detail: `${gN.name}: ${gN.gana}; ${bN.name}: ${bN.gana}.`,
    meaning: 'Traditional temperament class of each nakshatra.',
  });

  const d1 = ((bSign - gSign + 12) % 12) + 1;
  const d2 = ((gSign - bSign + 12) % 12) + 1;
  const badPairs = ['2-12', '12-2', '5-9', '9-5', '6-8', '8-6'];
  const bhakootBad = badPairs.includes(`${d1}-${d2}`);
  kootas.push({
    key: 'bhakoot', name: 'Bhakoot', max: 7, score: bhakootBad ? 0 : 7,
    detail: `Moon signs are ${d1}/${d2} from each other${bhakootBad ? ' (a 2/12, 5/9 or 6/8 relationship)' : ''}.`,
    meaning: 'Relative placement of the two Moon signs.',
  });

  const nadiSame = gN.nadi === bN.nadi;
  kootas.push({
    key: 'nadi', name: 'Nadi', max: 8, score: nadiSame ? 0 : 8,
    detail: `${gN.name}: ${gN.nadi}; ${bN.name}: ${bN.nadi}.`,
    meaning: 'Traditional constitution grouping of the nakshatras.',
  });

  const total = kootas.reduce((a, k) => a + k.score, 0);
  const band =
    total < 18 ? { label: 'Below the traditional threshold', range: '0–17.5' }
      : total <= 24 ? { label: 'Traditionally acceptable', range: '18–24' }
        : total <= 32 ? { label: 'Traditionally good', range: '24.5–32' }
          : { label: 'Traditionally excellent', range: '32.5–36' };

  return {
    version: GUNA_MILAN_VERSION,
    total,
    max: 36,
    kootas,
    doshas: [
      { key: 'nadi_dosha', present: nadiSame, detail: nadiSame ? 'Both Moons share the same nadi.' : 'Different nadis.' },
      { key: 'bhakoot_dosha', present: bhakootBad, detail: bhakootBad ? 'Moon signs form a 2/12, 5/9 or 6/8 relationship.' : 'No bhakoot dosha.' },
      { key: 'gana_dosha', present: gScore === 0, detail: gScore === 0 ? 'Manushya–Rakshasa gana pairing.' : 'No gana dosha.' },
    ],
    band,
    caveats: [
      'Guna Milan is a traditional framework, not a measured predictor of relationship outcomes.',
      'Score tables vary slightly between traditions; this uses the Nakshatra v1 tables.',
      'Traditional exceptions that may cancel a dosha are not applied to the score.',
      'Only the Moon is used; the rest of each chart is not considered by this method.',
    ],
  };
}
