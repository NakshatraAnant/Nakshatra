import { DateTime } from 'luxon';
import { PLANETS, type PlanetId } from '../astro/constants';
import { placement } from '../astro/chart';
import type { ChartResult } from '../astro/types';
import type { PanchangResult } from '../astro/vedic/panchang';
import type { Aspect } from '../astro/western/aspects';
import { houseFrom } from '../astro/vedic/yogas';
import {
  DAILY_COLOR_BY_WEEKDAY, DAILY_LESSONS, MOON_TRANSIT_FROM_NATAL, PHASE_NOTES, REFLECTION_PROMPTS, RITUALS, TITHI_NOTES,
  type Ritual,
} from './daily';
import { PLANET_THEMES } from './signs';
import { CONTENT_PACK_VERSION } from './interpretations';

/**
 * Deterministic daily briefing composer. Inputs are calculated facts; outputs are
 * authored content selected by explicit rules. No prediction is generated.
 */
export interface BriefingSection { key: string; title: string; body: string; factor: string; kind: 'calculated' | 'traditional' | 'reflection' | 'learning' }

export interface DailyBriefing {
  date: string;
  contentVersion: string;
  personalised: boolean;
  sections: BriefingSection[];
  ritual: Ritual;
  ritualReason: string;
  reflectionPrompt: string;
  lesson: (typeof DAILY_LESSONS)[number];
  colourOfDay: { colour: string; note: string };
}

export function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function selectRitual(p: Pick<PanchangResult, 'tithi' | 'moon' | 'vara'>, seed: number): { ritual: Ritual; reason: string } {
  const byTithi = RITUALS.filter((r) => r.tithis?.includes(p.tithi.name));
  if (byTithi.length) return { ritual: byTithi[seed % byTithi.length], reason: `Chosen because today’s tithi is ${p.tithi.name}.` };
  const byPhase = RITUALS.filter((r) => r.phases?.includes(p.moon.phaseName));
  const byDay = RITUALS.filter((r) => r.weekdays?.includes(p.vara.index));
  if (byDay.length && seed % 2 === 0) return { ritual: byDay[seed % byDay.length], reason: `Chosen for ${p.vara.name}.` };
  if (byPhase.length) return { ritual: byPhase[seed % byPhase.length], reason: `Chosen for the ${p.moon.phaseName.toLowerCase()}.` };
  if (byDay.length) return { ritual: byDay[seed % byDay.length], reason: `Chosen for ${p.vara.name}.` };
  const general = RITUALS.filter((r) => !r.tithis && !r.phases && !r.weekdays);
  return { ritual: general[seed % general.length], reason: 'A general practice for any day.' };
}

const ASPECT_WORD: Record<string, string> = {
  conjunction: 'meets', opposition: 'faces', trine: 'flows with', square: 'challenges', sextile: 'supports',
};

export function composeBriefing(params: {
  date: string;
  userSeed: string;
  panchang: PanchangResult;
  vedic?: ChartResult | null;
  transitAspects?: Aspect[];
  lessonIndex?: number;
}): DailyBriefing {
  const { panchang: p } = params;
  const doy = DateTime.fromISO(params.date).ordinal;
  const seed = stableHash(`${params.userSeed}:${params.date}`);
  const sections: BriefingSection[] = [];
  sections.push({
    key: 'tithi', title: `${p.tithi.paksha === 'shukla' ? 'Shukla' : 'Krishna'} ${p.tithi.name}`,
    body: TITHI_NOTES[p.tithi.name] ?? '', factor: `Tithi at sunrise (${p.lunarMonth.amanta} month, amanta)`, kind: 'traditional',
  });
  sections.push({ key: 'phase', title: p.moon.phaseName, body: PHASE_NOTES[p.moon.phaseName] ?? '', factor: `Moon ${Math.round(p.moon.illumination * 100)}% illuminated`, kind: 'calculated' });

  let personalised = false;
  if (params.vedic) {
    personalised = true;
    const natalMoon = placement(params.vedic, 'moon').sign;
    const h = houseFrom(natalMoon, p.moonSign);
    const t = MOON_TRANSIT_FROM_NATAL[h - 1];
    sections.push({ key: 'moon_transit', title: t.title, body: t.body, factor: `Transiting Moon is ${h} sign(s) from your natal Moon (sidereal)`, kind: 'traditional' });
  }
  for (const a of (params.transitAspects ?? []).filter((x) => x.type in ASPECT_WORD && x.a !== 'moon').slice(0, 3)) {
    personalised = true;
    const tp = a.a as PlanetId;
    const np = a.b;
    const nName = np === 'asc' ? 'Ascendant' : np === 'mc' ? 'Midheaven' : PLANETS[np as PlanetId].name;
    const theme = np === 'asc' || np === 'mc' ? 'how you meet the world' : PLANET_THEMES[np as string]?.theme ?? '';
    sections.push({
      key: `transit_${a.a}_${a.b}`,
      title: `Transiting ${PLANETS[tp].name} ${ASPECT_WORD[a.type]} your ${nName}`,
      body: `A ${a.type} (orb ${a.orb.toFixed(1)}°${a.applying ? ', applying' : ''}). ${PLANETS[tp].name} symbolises ${PLANET_THEMES[tp].theme}; your natal ${nName} is linked with ${theme}. Astrologers traditionally read this as a time when those themes are in conversation.`,
      factor: 'Tropical transit-to-natal aspect', kind: 'calculated',
    });
  }

  const { ritual, reason } = selectRitual(p, seed);
  const lessonIdx = params.lessonIndex ?? doy % DAILY_LESSONS.length;
  return {
    date: params.date,
    contentVersion: CONTENT_PACK_VERSION,
    personalised,
    sections,
    ritual,
    ritualReason: reason,
    reflectionPrompt: REFLECTION_PROMPTS[(doy + seed) % REFLECTION_PROMPTS.length],
    lesson: DAILY_LESSONS[lessonIdx % DAILY_LESSONS.length],
    colourOfDay: { colour: DAILY_COLOR_BY_WEEKDAY[p.vara.index], note: `A traditional colour association for ${p.vara.name}; a cultural custom, not a prediction.` },
  };
}
