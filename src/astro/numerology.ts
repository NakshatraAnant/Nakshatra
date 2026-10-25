/**
 * Pythagorean numerology — an optional system kept separate from astrology.
 * Master numbers 11, 22 and 33 are preserved during reduction.
 */
export const NUMEROLOGY_VERSION = 'pythagorean-v1';

const LETTER_VALUES: Record<string, number> = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => (LETTER_VALUES[c] = (i % 9) + 1));
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

export function reduce(n: number, keepMaster = true): number {
  while (n > 9 && !(keepMaster && (n === 11 || n === 22 || n === 33))) {
    n = String(n).split('').reduce((a, d) => a + Number(d), 0);
  }
  return n;
}

function latinLetters(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split('')
    .filter((c) => c in LETTER_VALUES);
}

export interface NumerologyResult {
  version: string;
  lifePath: number;
  birthday: number;
  expression: number | null;
  soulUrge: number | null;
  personality: number | null;
  personalYear: number;
  notes: string[];
}

export function numerology(dateOfBirth: string, fullName: string, currentYear: number): NumerologyResult {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  // Life path: reduce month, day and year separately, then sum and reduce.
  const lifePath = reduce(reduce(m) + reduce(d) + reduce(String(y).split('').reduce((a, c) => a + Number(c), 0)));
  const letters = latinLetters(fullName);
  const notes: string[] = [];
  let expression: number | null = null;
  let soulUrge: number | null = null;
  let personality: number | null = null;
  if (letters.length) {
    expression = reduce(letters.reduce((a, c) => a + LETTER_VALUES[c], 0));
    soulUrge = reduce(letters.filter((c) => VOWELS.has(c)).reduce((a, c) => a + LETTER_VALUES[c], 0));
    personality = reduce(letters.filter((c) => !VOWELS.has(c)).reduce((a, c) => a + LETTER_VALUES[c], 0));
  } else {
    notes.push('Name-based numbers use the Latin alphabet; enter a romanised name to calculate them.');
  }
  notes.push('Y is treated as a consonant in this convention.');
  return {
    version: NUMEROLOGY_VERSION,
    lifePath,
    birthday: reduce(d),
    expression,
    soulUrge,
    personality,
    personalYear: reduce(reduce(m) + reduce(d) + reduce(currentYear), false),
    notes,
  };
}
