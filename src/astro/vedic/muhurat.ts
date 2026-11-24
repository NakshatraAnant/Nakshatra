import { DateTime } from 'luxon';
import { angleDiff } from '../constants';
import { eclipticPosition } from '../ephemeris';
import { panchang, type PanchangResult } from './panchang';

/**
 * Muhurat discovery using an explicit, simplified rule set. Every candidate lists
 * each rule and whether it passed, so a practitioner can review the reasoning.
 * Rules not evaluated are listed in `notEvaluated`.
 */
export const MUHURAT_RULES_VERSION = 'muhurat-v1';

export type MuhuratPurpose = 'marriage' | 'griha_pravesh' | 'new_venture' | 'general';

interface RuleSet {
  label: string;
  favourableNakshatras: number[];
  avoidTithiNumbers: number[]; // within paksha (1..15); Amavasya handled separately
  avoidWeekdays: number[]; // 0 = Sunday
  avoidKharmas: boolean;
  checkCombustion: boolean;
}

// Nakshatra indices: 3 Rohini, 4 Mrigashira, 9 Magha, 11 U.Phalguni, 12 Hasta, 14 Swati, 16 Anuradha,
// 18 Mula, 20 U.Ashadha, 25 U.Bhadrapada, 26 Revati, 0 Ashwini, 6 Punarvasu, 7 Pushya, 21 Shravana, 22 Dhanishta, 23 Shatabhisha, 13 Chitra
const RULES: Record<MuhuratPurpose, RuleSet> = {
  marriage: { label: 'Vivaha (marriage)', favourableNakshatras: [3, 4, 9, 11, 12, 14, 16, 18, 20, 25, 26], avoidTithiNumbers: [4, 9, 14], avoidWeekdays: [2], avoidKharmas: true, checkCombustion: true },
  griha_pravesh: { label: 'Griha Pravesh (house warming)', favourableNakshatras: [3, 4, 11, 13, 16, 20, 21, 22, 23, 25, 26], avoidTithiNumbers: [4, 9, 14], avoidWeekdays: [0, 2], avoidKharmas: true, checkCombustion: true },
  new_venture: { label: 'New venture', favourableNakshatras: [0, 3, 4, 6, 7, 12, 13, 16, 21, 26], avoidTithiNumbers: [4, 9, 14], avoidWeekdays: [2, 6], avoidKharmas: false, checkCombustion: false },
  general: { label: 'General auspicious activity', favourableNakshatras: [0, 3, 4, 6, 7, 11, 12, 16, 20, 21, 25, 26], avoidTithiNumbers: [4, 9, 14], avoidWeekdays: [], avoidKharmas: false, checkCombustion: false },
};

export interface RuleCheck { rule: string; passed: boolean; detail: string }

export interface MuhuratCandidate {
  date: string;
  passed: boolean;
  checks: RuleCheck[];
  goodWindows: { start: string; end: string; label: string }[];
  panchang: Pick<PanchangResult, 'tithi' | 'nakshatra' | 'vara' | 'karana' | 'yoga' | 'sunrise' | 'sunset'>;
}

export interface MuhuratSearchResult {
  version: string;
  purpose: MuhuratPurpose;
  label: string;
  candidates: MuhuratCandidate[];
  notEvaluated: string[];
  disclaimer: string;
}

export function findMuhurats(
  purpose: MuhuratPurpose, fromDate: string, days: number, latitude: number, longitude: number, timezone: string,
): MuhuratSearchResult {
  const rules = RULES[purpose];
  const start = DateTime.fromISO(fromDate, { zone: timezone });
  const candidates: MuhuratCandidate[] = [];
  const n = Math.min(Math.max(days, 1), 120);
  for (let i = 0; i < n; i++) {
    const date = start.plus({ days: i }).toISODate()!;
    const p = panchang(date, latitude, longitude, timezone);
    const checks: RuleCheck[] = [];
    checks.push({
      rule: 'Favourable nakshatra at sunrise', passed: rules.favourableNakshatras.includes(p.nakshatra.index),
      detail: `${p.nakshatra.name}`,
    });
    const amavasya = p.tithi.index === 29;
    const rikta = rules.avoidTithiNumbers.includes(p.tithi.number) && !(p.tithi.index === 14);
    checks.push({ rule: 'Not a Rikta tithi (4th, 9th, 14th) or Amavasya', passed: !amavasya && !rikta, detail: `${p.tithi.paksha} ${p.tithi.name}` });
    checks.push({ rule: 'Karana is not Vishti (Bhadra)', passed: p.karana.name !== 'Vishti', detail: p.karana.name });
    if (rules.avoidWeekdays.length) {
      checks.push({ rule: 'Weekday traditionally suitable', passed: !rules.avoidWeekdays.includes(p.vara.index), detail: p.vara.name });
    }
    if (rules.avoidKharmas) {
      checks.push({ rule: 'Sun not in sidereal Dhanu or Meena (Kharmas)', passed: p.sunSign !== 8 && p.sunSign !== 11, detail: `Sun sign index ${p.sunSign}` });
    }
    if (rules.checkCombustion && p.sunrise) {
      const at = new Date(p.sunrise);
      const sun = eclipticPosition('sun', at).longitude;
      const jup = Math.abs(angleDiff(eclipticPosition('jupiter', at).longitude, sun));
      const ven = Math.abs(angleDiff(eclipticPosition('venus', at).longitude, sun));
      checks.push({ rule: 'Jupiter not combust (> 11° from Sun)', passed: jup > 11, detail: `${jup.toFixed(1)}° from Sun` });
      checks.push({ rule: 'Venus not combust (> 10° from Sun)', passed: ven > 10, detail: `${ven.toFixed(1)}° from Sun` });
    }
    const passed = checks.every((c) => c.passed);
    const avoid = p.windows.filter((w) => ['Rahu Kaal', 'Yamaganda', 'Gulika Kaal'].includes(w.name));
    const goodWindows = p.windows
      .filter((w) => w.name === 'Abhijit Muhurta' && p.vara.index !== 3)
      .filter((w) => !avoid.some((a) => a.start < w.end && w.start < a.end))
      .map((w) => ({ start: w.start, end: w.end, label: w.name }));
    candidates.push({
      date, passed, checks, goodWindows,
      panchang: { tithi: p.tithi, nakshatra: p.nakshatra, vara: p.vara, karana: p.karana, yoga: p.yoga, sunrise: p.sunrise, sunset: p.sunset },
    });
  }
  return {
    version: MUHURAT_RULES_VERSION,
    purpose,
    label: rules.label,
    candidates,
    notEvaluated: [
      'Lagna shuddhi (ascendant purity at the ceremony time)',
      'Chaturmas and regional observance calendars',
      'Individual charts of the participants (tara bala, chandra bala)',
      'Panchaka and other regional exclusions',
    ],
    disclaimer: 'A simplified, transparent rule set. Traditions vary; confirm any muhurat with a practitioner of your tradition.',
  };
}
