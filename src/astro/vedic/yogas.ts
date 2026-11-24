import { SIGNS, type PlanetId } from '../constants';
import { placement, dignityOf } from '../chart';
import type { ChartResult } from '../types';

/**
 * Rule-based yoga detection. Only yogas whose rules are stated below are
 * evaluated; cancellation (bhanga) conditions are NOT evaluated and every
 * result says so. Sign-based (whole-sign) counting is used throughout.
 */
export interface YogaResult {
  key: string;
  name: string;
  present: boolean;
  rule: string;
  factors: string[];
  requiresBirthTime: boolean;
  caveat: string;
}

const CAVEAT = 'Detected from its classical rule only; strength, cancellation conditions and the wider chart are not assessed.';

/** 1-based house distance from sign a to sign b, counted forward. */
export const houseFrom = (fromSign: number, toSign: number) => ((toSign - fromSign + 12) % 12) + 1;
const KENDRA = [1, 4, 7, 10];
const TRIKONA = [1, 5, 9];

function lordOfSign(sign: number): PlanetId {
  return SIGNS[sign].ruler;
}

export function detectYogas(chart: ChartResult): YogaResult[] {
  const P = (id: PlanetId) => placement(chart, id);
  const moon = P('moon');
  const sun = P('sun');
  const results: YogaResult[] = [];
  const add = (r: Omit<YogaResult, 'caveat'>) => results.push({ ...r, caveat: CAVEAT });

  const jFromMoon = houseFrom(moon.sign, P('jupiter').sign);
  add({
    key: 'gajakesari', name: 'Gajakesari Yoga', present: KENDRA.includes(jFromMoon),
    rule: 'Jupiter in a kendra (1st, 4th, 7th or 10th) counted from the Moon.',
    factors: [`Jupiter is ${ordinal(jFromMoon)} from the Moon`], requiresBirthTime: false,
  });
  add({
    key: 'budhaditya', name: 'Budhaditya Yoga', present: sun.sign === P('mercury').sign,
    rule: 'Sun and Mercury occupy the same sign.',
    factors: [`Sun in ${sun.signName}, Mercury in ${P('mercury').signName}`], requiresBirthTime: false,
  });
  add({
    key: 'chandra_mangala', name: 'Chandra-Mangala Yoga', present: moon.sign === P('mars').sign,
    rule: 'Moon and Mars occupy the same sign.',
    factors: [`Moon in ${moon.signName}, Mars in ${P('mars').signName}`], requiresBirthTime: false,
  });

  const others: PlanetId[] = ['mars', 'mercury', 'jupiter', 'venus', 'saturn'];
  const in2 = others.filter((id) => houseFrom(moon.sign, P(id).sign) === 2);
  const in12 = others.filter((id) => houseFrom(moon.sign, P(id).sign) === 12);
  const nameList = (ids: PlanetId[]) => ids.map((id) => P(id).name).join(', ') || 'none';
  add({ key: 'sunapha', name: 'Sunapha Yoga', present: in2.length > 0 && in12.length === 0,
    rule: 'One or more of Mars, Mercury, Jupiter, Venus, Saturn in the 2nd from the Moon, none in the 12th.',
    factors: [`2nd from Moon: ${nameList(in2)}`, `12th from Moon: ${nameList(in12)}`], requiresBirthTime: false });
  add({ key: 'anapha', name: 'Anapha Yoga', present: in12.length > 0 && in2.length === 0,
    rule: 'One or more of Mars, Mercury, Jupiter, Venus, Saturn in the 12th from the Moon, none in the 2nd.',
    factors: [`2nd from Moon: ${nameList(in2)}`, `12th from Moon: ${nameList(in12)}`], requiresBirthTime: false });
  add({ key: 'durudhara', name: 'Durudhara Yoga', present: in2.length > 0 && in12.length > 0,
    rule: 'Planets (other than Sun and nodes) on both sides of the Moon (2nd and 12th).',
    factors: [`2nd from Moon: ${nameList(in2)}`, `12th from Moon: ${nameList(in12)}`], requiresBirthTime: false });
  add({ key: 'kemadruma', name: 'Kemadruma Yoga', present: in2.length === 0 && in12.length === 0,
    rule: 'No planet other than the Sun and nodes in the 2nd or 12th from the Moon.',
    factors: [`2nd and 12th from Moon are empty of Mars–Saturn`], requiresBirthTime: false });

  const sOthers: PlanetId[] = ['mars', 'mercury', 'jupiter', 'venus', 'saturn'];
  const s2 = sOthers.filter((id) => houseFrom(sun.sign, P(id).sign) === 2);
  const s12 = sOthers.filter((id) => houseFrom(sun.sign, P(id).sign) === 12);
  add({ key: 'vesi', name: 'Vesi Yoga', present: s2.length > 0 && s12.length === 0,
    rule: 'Planets other than Moon and nodes in the 2nd from the Sun only.', factors: [`2nd from Sun: ${nameList(s2)}`], requiresBirthTime: false });
  add({ key: 'vasi', name: 'Vasi Yoga', present: s12.length > 0 && s2.length === 0,
    rule: 'Planets other than Moon and nodes in the 12th from the Sun only.', factors: [`12th from Sun: ${nameList(s12)}`], requiresBirthTime: false });
  add({ key: 'ubhayachari', name: 'Ubhayachari Yoga', present: s2.length > 0 && s12.length > 0,
    rule: 'Planets other than Moon and nodes on both sides of the Sun.', factors: [`2nd: ${nameList(s2)}`, `12th: ${nameList(s12)}`], requiresBirthTime: false });

  if (chart.ascendant) {
    const lagna = chart.ascendant.sign;
    const mahapurusha: [PlanetId, string, string][] = [
      ['mars', 'ruchaka', 'Ruchaka'], ['mercury', 'bhadra', 'Bhadra'], ['jupiter', 'hamsa', 'Hamsa'],
      ['venus', 'malavya', 'Malavya'], ['saturn', 'shasha', 'Shasha'],
    ];
    for (const [id, key, name] of mahapurusha) {
      const p = P(id);
      const h = houseFrom(lagna, p.sign);
      const dig = dignityOf(id, p.sign);
      add({
        key, name: `${name} Yoga (Pancha Mahapurusha)`,
        present: KENDRA.includes(h) && (dig === 'own' || dig === 'exalted'),
        rule: `${p.name} in its own or exaltation sign and in a kendra from the Lagna.`,
        factors: [`${p.name} in ${p.signName} (${dig ?? 'no special dignity'}), house ${h} from Lagna`],
        requiresBirthTime: true,
      });
    }

    // Kendra–trikona lord association (Raja yoga, conjunction form) and yogakaraka.
    const lordOfHouse = (h: number) => lordOfSign((lagna + h - 1) % 12);
    const kendraLords = new Set(KENDRA.filter((h) => h !== 1).map(lordOfHouse));
    const trikonaLords = new Set(TRIKONA.filter((h) => h !== 1).map(lordOfHouse));
    const yogakaraka = [...kendraLords].filter((l) => trikonaLords.has(l));
    add({
      key: 'yogakaraka', name: 'Yogakaraka planet', present: yogakaraka.length > 0,
      rule: 'A single planet rules both a kendra (4/7/10) and a trikona (5/9) from the Lagna.',
      factors: yogakaraka.length ? yogakaraka.map((l) => `${P(l).name} rules a kendra and a trikona`) : ['No single planet rules both'],
      requiresBirthTime: true,
    });
    const pairs: string[] = [];
    for (const k of kendraLords) for (const t of trikonaLords) {
      if (k !== t && P(k).sign === P(t).sign) pairs.push(`${P(k).name} (kendra lord) with ${P(t).name} (trikona lord) in ${P(k).signName}`);
    }
    add({
      key: 'raja_conjunction', name: 'Raja Yoga (kendra–trikona lords conjoined)', present: pairs.length > 0,
      rule: 'Lord of a kendra (4/7/10) and lord of a trikona (5/9) from the Lagna occupy the same sign.',
      factors: pairs.length ? pairs : ['No such conjunction'], requiresBirthTime: true,
    });

    const dusthana = [6, 8, 12];
    const vip: string[] = [];
    for (const h of dusthana) {
      const lord = lordOfHouse(h);
      const placed = houseFrom(lagna, P(lord).sign);
      if (dusthana.includes(placed)) vip.push(`${ordinal(h)} lord ${P(lord).name} in house ${placed}`);
    }
    add({
      key: 'viparita_raja', name: 'Viparita Raja Yoga', present: vip.length > 0,
      rule: 'Lord of the 6th, 8th or 12th placed in another of the 6th, 8th or 12th houses.',
      factors: vip.length ? vip : ['No dusthana lord in a dusthana'], requiresBirthTime: true,
    });
  }
  return results;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
