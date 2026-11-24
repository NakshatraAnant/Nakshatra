import { PLANETS, SIGNS, angleDiff, norm360, signOf, type PlanetId } from '../constants';
import type { Placement } from '../types';

/**
 * Aspect detection with documented orbs. Orbs are widened by 2° when the Sun or
 * Moon is involved (a common modern convention). Minor aspects are opt-in.
 */
export const ASPECTS_VERSION = 'aspects-v1';

export type AspectType = 'conjunction' | 'opposition' | 'trine' | 'square' | 'sextile' | 'quincunx' | 'semisextile';

export const ASPECT_DEFS: Record<AspectType, { angle: number; orb: number; nature: 'harmonious' | 'challenging' | 'neutral'; glyph: string; minor: boolean }> = {
  conjunction: { angle: 0, orb: 8, nature: 'neutral', glyph: '☌', minor: false },
  opposition: { angle: 180, orb: 8, nature: 'challenging', glyph: '☍', minor: false },
  trine: { angle: 120, orb: 7, nature: 'harmonious', glyph: '△', minor: false },
  square: { angle: 90, orb: 7, nature: 'challenging', glyph: '□', minor: false },
  sextile: { angle: 60, orb: 5, nature: 'harmonious', glyph: '⚹', minor: false },
  quincunx: { angle: 150, orb: 3, nature: 'challenging', glyph: '⚻', minor: true },
  semisextile: { angle: 30, orb: 2, nature: 'neutral', glyph: '⚺', minor: true },
};

export interface Aspect {
  a: PlanetId | 'asc' | 'mc';
  b: PlanetId | 'asc' | 'mc';
  type: AspectType;
  orb: number;
  exactAngle: number;
  applying: boolean | null;
  nature: 'harmonious' | 'challenging' | 'neutral';
}

interface Body { id: PlanetId | 'asc' | 'mc'; longitude: number; speed: number }

export function bodiesFromPlacements(placements: Placement[], extras: { asc?: number | null; mc?: number | null } = {}): Body[] {
  const list: Body[] = placements.filter((p) => p.id !== 'ketu').map((p) => ({ id: p.id, longitude: p.longitude, speed: p.speed }));
  if (extras.asc != null) list.push({ id: 'asc', longitude: extras.asc, speed: 0 });
  if (extras.mc != null) list.push({ id: 'mc', longitude: extras.mc, speed: 0 });
  return list;
}

function orbFor(type: AspectType, a: Body['id'], b: Body['id'], scale: number): number {
  const lum = a === 'sun' || a === 'moon' || b === 'sun' || b === 'moon';
  return (ASPECT_DEFS[type].orb + (lum && !ASPECT_DEFS[type].minor ? 2 : 0)) * scale;
}

export function aspectBetween(x: Body, y: Body, includeMinor = false, orbScale = 1): Aspect | null {
  const sep = Math.abs(angleDiff(x.longitude, y.longitude));
  let best: Aspect | null = null;
  for (const [type, def] of Object.entries(ASPECT_DEFS) as [AspectType, (typeof ASPECT_DEFS)[AspectType]][]) {
    if (def.minor && !includeMinor) continue;
    const orb = Math.abs(sep - def.angle);
    if (orb <= orbFor(type, x.id, y.id, orbScale) && (!best || orb < best.orb)) {
      // Applying when the orb shrinks a little later (0.01 day) given current speeds.
      const dt = 0.01;
      const futureOrb = Math.abs(Math.abs(angleDiff(y.longitude + y.speed * dt, x.longitude + x.speed * dt)) - def.angle);
      const applying = x.speed === 0 && y.speed === 0 ? null : futureOrb < orb;
      best = { a: x.id, b: y.id, type, orb, exactAngle: def.angle, applying, nature: def.nature };
    }
  }
  return best;
}

export function natalAspects(bodies: Body[], includeMinor = false): Aspect[] {
  const out: Aspect[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if ((bodies[i].id === 'asc' && bodies[j].id === 'mc') || (bodies[i].id === 'mc' && bodies[j].id === 'asc')) continue;
      const a = aspectBetween(bodies[i], bodies[j], includeMinor);
      if (a) out.push(a);
    }
  }
  return out.sort((p, q) => p.orb - q.orb);
}

/** Aspects from one set of bodies (e.g. transits or a partner) to another. */
export function crossAspects(from: Body[], to: Body[], includeMinor = false, orbScale = 0.75): Aspect[] {
  const out: Aspect[] = [];
  for (const x of from) for (const y of to) {
    const a = aspectBetween(x, y, includeMinor, orbScale);
    if (a) out.push(a);
  }
  return out.sort((p, q) => p.orb - q.orb);
}

export interface ElementSummary {
  elements: Record<'fire' | 'earth' | 'air' | 'water', number>;
  modalities: Record<'cardinal' | 'fixed' | 'mutable', number>;
  dominantElement: string;
  dominantModality: string;
  method: string;
}

/** Weighted count: Sun, Moon, Ascendant = 2; personal planets = 1.5; others = 1. */
export function elementSummary(placements: Placement[], ascendant: number | null): ElementSummary {
  const weights: Partial<Record<PlanetId, number>> = { sun: 2, moon: 2, mercury: 1.5, venus: 1.5, mars: 1.5, jupiter: 1, saturn: 1, uranus: 0.5, neptune: 0.5, pluto: 0.5 };
  const elements = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities = { cardinal: 0, fixed: 0, mutable: 0 };
  const add = (lon: number, w: number) => {
    const s = SIGNS[signOf(lon)];
    elements[s.element] += w;
    modalities[s.modality] += w;
  };
  for (const p of placements) if (weights[p.id]) add(p.longitude, weights[p.id]!);
  if (ascendant !== null) add(ascendant, 2);
  const top = <T extends string>(r: Record<T, number>) => (Object.entries(r) as [T, number][]).sort((a, b) => b[1] - a[1])[0][0];
  return { elements, modalities, dominantElement: top(elements), dominantModality: top(modalities), method: 'Weights: Sun/Moon/Ascendant 2, Mercury/Venus/Mars 1.5, Jupiter/Saturn 1, outer planets 0.5.' };
}

export interface ChartPattern { type: 'grand_trine' | 't_square' | 'grand_cross' | 'yod' | 'stellium'; bodies: string[]; description: string }

export function chartPatterns(placements: Placement[]): ChartPattern[] {
  const bodies = placements.filter((p) => p.id !== 'ketu' && p.id !== 'rahu');
  const b = bodies.map((p) => ({ id: p.id, longitude: p.longitude, speed: p.speed }));
  const asp = (i: number, j: number, t: AspectType) => {
    const a = aspectBetween(b[i], b[j], true);
    return a?.type === t;
  };
  const out: ChartPattern[] = [];
  const name = (i: number) => PLANETS[b[i].id as PlanetId].name;
  const n = b.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    if (asp(i, j, 'trine') && asp(j, k, 'trine') && asp(i, k, 'trine')) {
      out.push({ type: 'grand_trine', bodies: [name(i), name(j), name(k)], description: 'Three bodies mutually trine.' });
    }
    for (const [x, y, apex] of [[i, j, k], [i, k, j], [j, k, i]]) {
      if (asp(x, y, 'opposition') && asp(x, apex, 'square') && asp(y, apex, 'square')) {
        out.push({ type: 't_square', bodies: [name(x), name(y), name(apex)], description: `${name(x)}–${name(y)} opposition, both square ${name(apex)} (apex).` });
      }
      if (asp(x, y, 'sextile') && asp(x, apex, 'quincunx') && asp(y, apex, 'quincunx')) {
        out.push({ type: 'yod', bodies: [name(x), name(y), name(apex)], description: `${name(x)} sextile ${name(y)}, both quincunx ${name(apex)} (apex).` });
      }
    }
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
    const q = [i, j, k, l];
    let opp = 0;
    let sq = 0;
    for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) {
      if (asp(q[x], q[y], 'opposition')) opp++;
      if (asp(q[x], q[y], 'square')) sq++;
    }
    if (opp === 2 && sq === 4) out.push({ type: 'grand_cross', bodies: q.map(name), description: 'Two oppositions linked by four squares.' });
  }
  const bySign = new Map<number, string[]>();
  for (const p of bodies) {
    const s = signOf(p.longitude);
    bySign.set(s, [...(bySign.get(s) ?? []), PLANETS[p.id].name]);
  }
  for (const [s, names] of bySign) if (names.length >= 4) out.push({ type: 'stellium', bodies: names, description: `${names.length} bodies in ${SIGNS[s].name}.` });
  return out;
}

export function midpoint(a: number, b: number): number {
  const d = angleDiff(b, a);
  return norm360(a + d / 2);
}
