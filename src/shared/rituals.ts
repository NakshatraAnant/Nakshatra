import { DateTime } from 'luxon';
import { CHAOS_PAIRS, CIRCLE_QUESTIONS, DAILY_THOUGHT_PROMPTS, MICRO_CHALLENGES, THIS_OR_THAT, WEEKLY_REFLECTIONS, type PairPrompt, type Prompt } from './play/content';
import { hashSeed } from './play/engine';

/**
 * Social ritual engine, version rituals-v1.
 *
 * Each ritual has a cadence (daily or weekly, in the user's time zone), an
 * audience (personal or circle), a prompt bank and a response type. The prompt for
 * a period is chosen deterministically so everyone in the same scope sees the same
 * prompt, and nothing repeats until the whole bank has been used:
 *   index = (offset + period × stride) mod n, where stride is coprime with n.
 * Adding prompts to a bank changes future selections but never past responses
 * (the chosen prompt id is stored with each response).
 */
export const RITUALS_VERSION = 'rituals-v1';

export type RitualKey = 'daily_choice' | 'daily_thought' | 'micro_challenge' | 'circle_question' | 'weekly_reflection';

export interface RitualDef {
  key: RitualKey;
  title: string;
  description: string;
  cadence: 'daily' | 'weekly';
  audience: 'personal' | 'circle';
  response: 'choice' | 'text' | 'done';
  maxLength?: number;
  /** What others can see. */
  visibility: string;
}

export const RITUALS: RitualDef[] = [
  { key: 'daily_choice', title: 'Daily Choice', description: 'One would-you-rather a day. Answer to see how everyone split.', cadence: 'daily', audience: 'personal', response: 'choice', visibility: 'Only the total split is shown; your choice is never shown to others.' },
  { key: 'daily_thought', title: 'Daily Thought', description: 'A question worth a sentence. Keep it private or post it as a Thought Drop.', cadence: 'daily', audience: 'personal', response: 'text', maxLength: 280, visibility: 'Private unless you choose to post it.' },
  { key: 'micro_challenge', title: 'Micro-Challenge', description: 'A tiny, kind experiment for today.', cadence: 'daily', audience: 'personal', response: 'done', maxLength: 200, visibility: 'Private.' },
  { key: 'circle_question', title: 'Circle Question', description: 'The same question for everyone in a circle. Answers unlock after you answer.', cadence: 'daily', audience: 'circle', response: 'text', maxLength: 200, visibility: 'Visible to circle members who have answered.' },
  { key: 'weekly_reflection', title: 'Weekly Reflection', description: 'One gentle look back at your week.', cadence: 'weekly', audience: 'personal', response: 'text', maxLength: 500, visibility: 'Private.' },
];
export const RITUAL_BY_KEY = Object.fromEntries(RITUALS.map((r) => [r.key, r])) as Record<RitualKey, RitualDef>;

type Bank = (Prompt | PairPrompt)[];
const BANKS: Record<RitualKey, Bank> = {
  daily_choice: [...CHAOS_PAIRS, ...THIS_OR_THAT],
  daily_thought: DAILY_THOUGHT_PROMPTS,
  micro_challenge: MICRO_CHALLENGES,
  circle_question: CIRCLE_QUESTIONS,
  weekly_reflection: WEEKLY_REFLECTIONS,
};

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
export function coprimeStride(n: number, seed: number): number {
  if (n <= 2) return 1;
  let s = 1 + (seed % (n - 1));
  while (gcd(s, n) !== 1) s = (s % (n - 1)) + 1;
  return s;
}

export interface Period { key: string; index: number; endsAt: string }

/** Period for a ritual at `now` in the given IANA time zone (DST-safe: uses calendar dates, not 24-hour offsets). */
export function periodFor(def: RitualDef, now: Date, timezone: string): Period {
  const local = DateTime.fromJSDate(now).setZone(timezone);
  const zone = local.isValid ? local : DateTime.fromJSDate(now).setZone('Asia/Kolkata');
  if (def.cadence === 'weekly') {
    const start = zone.startOf('week');
    const index = Math.floor(start.toUTC().startOf('day').diff(DateTime.utc(2024, 1, 1), 'weeks').weeks);
    return { key: `${zone.weekYear}-W${String(zone.weekNumber).padStart(2, '0')}`, index, endsAt: start.plus({ weeks: 1 }).toISO()! };
  }
  const day = zone.startOf('day');
  const index = Math.round(DateTime.utc(day.year, day.month, day.day).diff(DateTime.utc(2024, 1, 1), 'days').days);
  return { key: day.toISODate()!, index, endsAt: day.plus({ days: 1 }).toISO()! };
}

/** Deterministic, non-repeating prompt for a ritual, period and scope ('' for personal, a circle id for circle rituals). */
export function promptFor(key: RitualKey, periodIndex: number, scope: string) {
  const bank = BANKS[key];
  const n = bank.length;
  const seed = hashSeed(`${RITUALS_VERSION}:${key}:${scope}`);
  const stride = coprimeStride(n, seed >>> 8);
  const idx = (((seed % n) + periodIndex * stride) % n + n) % n;
  return bank[idx];
}
