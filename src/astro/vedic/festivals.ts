import { DateTime } from 'luxon';
import { LUNAR_MONTH_BY_SUN_SIGN, norm360, signOf } from '../constants';
import { nextMoonPhase, nextSunLongitude, riseSet, searchAngleCrossing } from '../ephemeris';
import { trueAyanamsa } from '../ayanamsa';
import { elongation, sunSidereal } from './panchang';

/**
 * Festival calendar derived from calculated tithis and solar ingresses.
 * Each festival names the amanta month, the tithi (1–30, Shukla 1–15, Krishna 16–30)
 * and the time-of-day rule used to pick the civil date. Regional traditions differ;
 * the rule applied is returned with every date.
 */
export const FESTIVAL_RULES_VERSION = 'festivals-v1';

type DayRule = 'sunrise' | 'pradosh' | 'nishita' | 'madhyahna' | 'aparahna';

interface LunarFestivalDef { key: string; name: string; month: string; tithi: number; rule: DayRule; offsetDays?: number; avoidBhadra?: boolean; description: string }

const RULE_LABEL: Record<DayRule, string> = {
  sunrise: 'tithi prevailing at local sunrise (udaya tithi)',
  pradosh: 'tithi prevailing at local sunset (pradosh kaal)',
  nishita: 'tithi prevailing at local midnight (nishita kaal)',
  madhyahna: 'tithi prevailing at local midday (madhyahna)',
  aparahna: 'tithi prevailing in the afternoon (aparahna: 4th of 5 daytime parts)',
};

export const LUNAR_FESTIVALS: LunarFestivalDef[] = [
  { key: 'ugadi', name: 'Chaitra Shukla Pratipada (Ugadi / Gudi Padwa)', month: 'Chaitra', tithi: 1, rule: 'sunrise', description: 'Lunar new year in many regions; Chaitra Navratri begins.' },
  { key: 'ram_navami', name: 'Ram Navami', month: 'Chaitra', tithi: 9, rule: 'madhyahna', description: 'Celebrates the birth of Shri Rama.' },
  { key: 'hanuman_jayanti', name: 'Hanuman Jayanti', month: 'Chaitra', tithi: 15, rule: 'sunrise', description: 'Observed on Chaitra Purnima in North India; other regions differ.' },
  { key: 'akshaya_tritiya', name: 'Akshaya Tritiya', month: 'Vaishakha', tithi: 3, rule: 'sunrise', description: 'Traditionally regarded as auspicious for beginnings.' },
  { key: 'guru_purnima', name: 'Guru Purnima', month: 'Ashadha', tithi: 15, rule: 'sunrise', description: 'Honours teachers and lineages of learning.' },
  { key: 'raksha_bandhan', name: 'Raksha Bandhan', month: 'Shravana', tithi: 15, rule: 'sunrise', description: 'Shravana Purnima; bhadra-period timing is not evaluated.' },
  { key: 'janmashtami', name: 'Krishna Janmashtami', month: 'Shravana', tithi: 23, rule: 'sunrise', description: 'Krishna Ashtami (Bhadrapada in purnimanta reckoning). Smarta and Vaishnava dates can differ.' },
  { key: 'ganesh_chaturthi', name: 'Ganesh Chaturthi', month: 'Bhadrapada', tithi: 4, rule: 'madhyahna', description: 'Bhadrapada Shukla Chaturthi.' },
  { key: 'navratri', name: 'Sharad Navratri begins', month: 'Ashwin', tithi: 1, rule: 'sunrise', description: 'Nine nights of the Goddess.' },
  { key: 'dussehra', name: 'Dussehra (Vijayadashami)', month: 'Ashwin', tithi: 10, rule: 'aparahna', description: 'Ashwin Shukla Dashami prevailing in the afternoon (aparahna). Bengal observes Vijayadashami by a different rule and may differ by a day.' },
  { key: 'sharad_purnima', name: 'Sharad Purnima', month: 'Ashwin', tithi: 15, rule: 'pradosh', description: 'Full moon of Ashwin.' },
  { key: 'karwa_chauth', name: 'Karwa Chauth', month: 'Ashwin', tithi: 19, rule: 'pradosh', description: 'Krishna Chaturthi (Kartika in purnimanta reckoning); moonrise timing is not applied.' },
  { key: 'dhanteras', name: 'Dhanteras', month: 'Ashwin', tithi: 28, rule: 'pradosh', description: 'Krishna Trayodashi before Diwali.' },
  { key: 'diwali', name: 'Diwali (Lakshmi Puja)', month: 'Ashwin', tithi: 30, rule: 'pradosh', description: 'Amavasya at the close of Ashwin (Kartika Amavasya in purnimanta reckoning).' },
  { key: 'govardhan', name: 'Govardhan Puja', month: 'Kartika', tithi: 1, rule: 'sunrise', description: 'Day after Diwali in most years.' },
  { key: 'bhai_dooj', name: 'Bhai Dooj', month: 'Kartika', tithi: 2, rule: 'sunrise', description: 'Kartika Shukla Dwitiya.' },
  { key: 'chhath', name: 'Chhath Puja (main day)', month: 'Kartika', tithi: 6, rule: 'sunrise', description: 'Kartika Shukla Shashthi.' },
  { key: 'kartik_purnima', name: 'Kartik Purnima', month: 'Kartika', tithi: 15, rule: 'sunrise', description: 'Full moon of Kartika.' },
  { key: 'vasant_panchami', name: 'Vasant Panchami', month: 'Magha', tithi: 5, rule: 'sunrise', description: 'Honours Saraswati; marks the coming of spring.' },
  { key: 'maha_shivaratri', name: 'Maha Shivaratri', month: 'Magha', tithi: 29, rule: 'nishita', description: 'Krishna Chaturdashi (Phalguna in purnimanta reckoning).' },
  { key: 'holika_dahan', name: 'Holika Dahan', month: 'Phalguna', tithi: 15, rule: 'pradosh', avoidBhadra: true, description: 'Phalguna Purnima bonfire after Bhadra (Vishti karana) has ended; if Bhadra lasts past local midnight it moves to the next evening.' },
  { key: 'holi', name: 'Holi', month: 'Phalguna', tithi: 15, rule: 'pradosh', offsetDays: 1, avoidBhadra: true, description: 'Festival of colours, the day after Holika Dahan.' },
];

export interface FestivalDate {
  key: string;
  name: string;
  date: string;
  kind: 'lunar' | 'solar' | 'recurring';
  rule: string;
  description: string;
  tithiStart?: string;
  tithiEnd?: string;
}

interface Lunation { start: Date; end: Date; month: string; adhika: boolean }

function lunations(from: Date, to: Date): Lunation[] {
  const out: Lunation[] = [];
  let nm = nextMoonPhase(new Date(from.getTime() - 35 * 86400000), 0)!;
  while (nm.getTime() < to.getTime() + 35 * 86400000) {
    const next = nextMoonPhase(new Date(nm.getTime() + 86400000), 0)!;
    const s1 = signOf(sunSidereal(nm));
    const s2 = signOf(sunSidereal(next));
    out.push({ start: nm, end: next, month: LUNAR_MONTH_BY_SUN_SIGN[s1], adhika: s1 === s2 });
    nm = next;
  }
  return out;
}

function tithiInterval(l: Lunation, tithi: number): [Date, Date] {
  const startAngle = (tithi - 1) * 12;
  const endAngle = norm360(tithi * 12);
  const start = tithi === 1 ? l.start : searchAngleCrossing(elongation, startAngle, l.start, 32, 3)!;
  const end = tithi === 30 ? l.end : searchAngleCrossing(elongation, endAngle, start, 4, 1)!;
  return [start, end];
}

function referenceTime(date: DateTime, rule: DayRule, lat: number, lon: number): Date | null {
  const rs = riseSet(date.startOf('day').toUTC().toJSDate(), lat, lon);
  if (!rs.sunrise || !rs.sunset) return null;
  switch (rule) {
    case 'sunrise': return rs.sunrise;
    case 'pradosh': return rs.sunset;
    case 'madhyahna': return new Date((rs.sunrise.getTime() + rs.sunset.getTime()) / 2);
    // Aparahna is the 4th of five equal daytime parts; use its midpoint (0.7 of the day).
    case 'aparahna': return new Date(rs.sunrise.getTime() + 0.7 * (rs.sunset.getTime() - rs.sunrise.getTime()));
    case 'nishita': {
      const nextRs = riseSet(date.plus({ days: 1 }).startOf('day').toUTC().toJSDate(), lat, lon);
      if (!nextRs.sunrise) return null;
      return new Date((rs.sunset.getTime() + nextRs.sunrise.getTime()) / 2);
    }
  }
}

function pickDate(start: Date, end: Date, rule: DayRule, lat: number, lon: number, zone: string): string {
  const first = DateTime.fromJSDate(start, { zone }).startOf('day').minus({ days: 1 });
  for (let i = 0; i < 4; i++) {
    const day = first.plus({ days: i });
    const ref = referenceTime(day, rule, lat, lon);
    if (ref && ref >= start && ref < end) return day.toISODate()!;
  }
  // Kshaya (skipped) tithi: fall back to the civil date on which the tithi begins.
  return DateTime.fromJSDate(start, { zone }).toISODate()!;
}

export function festivalsForYear(year: number, latitude: number, longitude: number, zone: string): FestivalDate[] {
  const from = DateTime.fromObject({ year, month: 1, day: 1 }, { zone });
  const to = from.plus({ years: 1 });
  const results: FestivalDate[] = [];
  const inYear = (d: string) => d.startsWith(`${year}-`);

  for (const l of lunations(from.toJSDate(), to.toJSDate())) {
    if (l.adhika) continue;
    for (const f of LUNAR_FESTIVALS.filter((x) => x.month === l.month)) {
      const [s, e] = tithiInterval(l, f.tithi);
      let date = pickDate(s, e, f.rule, latitude, longitude, zone);
      if (f.avoidBhadra && f.tithi === 15) {
        // Bhadra is the first half of Purnima (Vishti karana). It must end by local midnight of the chosen evening.
        const bhadraEnd = DateTime.fromMillis(s.getTime() + (e.getTime() - s.getTime()) / 2, { zone });
        const midnight = DateTime.fromISO(date, { zone }).plus({ days: 1 }).startOf('day');
        if (bhadraEnd > midnight) date = DateTime.fromISO(date).plus({ days: 1 }).toISODate()!;
      }
      if (f.offsetDays) date = DateTime.fromISO(date).plus({ days: f.offsetDays }).toISODate()!;
      if (inYear(date)) {
        results.push({ key: f.key, name: f.name, date, kind: 'lunar', rule: RULE_LABEL[f.rule], description: f.description, tithiStart: s.toISOString(), tithiEnd: e.toISOString() });
      }
    }
    for (const [tithi, key, name] of [[11, 'ekadashi_shukla', 'Shukla Ekadashi'], [26, 'ekadashi_krishna', 'Krishna Ekadashi'], [15, 'purnima', 'Purnima'], [30, 'amavasya', 'Amavasya']] as const) {
      const [s, e] = tithiInterval(l, tithi);
      const date = pickDate(s, e, 'sunrise', latitude, longitude, zone);
      if (inYear(date)) {
        results.push({ key, name: `${name} (${l.month}${l.adhika ? ', adhika' : ''})`, date, kind: 'recurring', rule: RULE_LABEL.sunrise, description: 'Recurring lunar observance.', tithiStart: s.toISOString(), tithiEnd: e.toISOString() });
      }
    }
  }

  // Solar ingresses (sankranti) into each sidereal sign.
  const signNames = ['Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya', 'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'];
  let cursor = from.minus({ days: 5 }).toJSDate();
  for (let i = 0; i < 13; i++) {
    const sid = Math.floor(sunSidereal(cursor) / 30);
    const nextSign = (sid + 1) % 12;
    const tropTarget = norm360(nextSign * 30 + trueAyanamsa(cursor));
    const when = nextSunLongitude(cursor, tropTarget, 40);
    if (!when) break;
    const date = DateTime.fromJSDate(when, { zone }).toISODate()!;
    if (inYear(date)) {
      const special = nextSign === 9 ? 'Makar Sankranti' : nextSign === 0 ? 'Mesha Sankranti (Vaisakhi / solar new year)' : `${signNames[nextSign]} Sankranti`;
      results.push({ key: `sankranti_${nextSign}`, name: special, date, kind: 'solar', rule: 'Civil date of the Sun’s sidereal ingress (Lahiri)', description: 'Solar ingress into a new sidereal sign.' });
    }
    cursor = new Date(when.getTime() + 86400000);
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}
