/**
 * Progression definitions (progression-v1), shared by the server (authoritative evaluation) and the
 * client (display only). All XP still flows through the single xp_ledger; quests, seasons and streaks
 * are views over real activity plus claim records — never client-reported counts.
 *
 * Design rules: reward meaningful participation (answering, replying to others, playing, showing up for
 * a circle), never raw volume; daily quests are small; missing a day never removes anything already
 * earned; streaks include grace days so one busy day does not reset them.
 */

export type QuestPeriod = 'daily' | 'weekly' | 'once' | 'season';
export type QuestMetric =
  | 'vibe_today' | 'rituals' | 'replies_to_others' | 'thoughts' | 'games_completed' | 'circle_days' | 'shares'
  | 'assessment' | 'labels' | 'pen_name' | 'circles_joined' | 'circles_owned' | 'circle_members_invited' | 'circle_games' | 'referrals_approved' | 'reactions_given';

export interface QuestStep { metric: QuestMetric; target: number; label: string }
export interface QuestDef {
  key: string;
  period: QuestPeriod;
  category: 'identity' | 'social' | 'circle' | 'game' | 'habit';
  title: string;
  description: string;
  steps: QuestStep[];
  xp: number;
}

export const QUESTS: QuestDef[] = [
  // Daily — small, one-tap-ish, no posting volume required.
  { key: 'daily_vibe', period: 'daily', category: 'habit', title: 'Vibe check', description: 'Pick one word for how today feels.', steps: [{ metric: 'vibe_today', target: 1, label: 'Check in' }], xp: 5 },
  { key: 'daily_prompt', period: 'daily', category: 'habit', title: 'Answer a prompt', description: 'Answer today’s choice, thought or circle question.', steps: [{ metric: 'rituals', target: 1, label: 'Answer one prompt' }], xp: 10 },
  { key: 'daily_reply', period: 'daily', category: 'social', title: 'Reply to someone', description: 'Reply to a Thought Drop that isn’t yours.', steps: [{ metric: 'replies_to_others', target: 1, label: 'Reply once' }], xp: 10 },
  // Weekly — showing up with people.
  { key: 'weekly_game', period: 'weekly', category: 'game', title: 'Game night', description: 'Finish a full game this week.', steps: [{ metric: 'games_completed', target: 1, label: 'Finish a game' }], xp: 40 },
  { key: 'weekly_circle', period: 'weekly', category: 'circle', title: 'Show up for your circle', description: 'Contribute in a circle on three different days.', steps: [{ metric: 'circle_days', target: 3, label: 'Three circle days' }], xp: 50 },
  { key: 'weekly_voice', period: 'weekly', category: 'social', title: 'Say what you think', description: 'Share two Thought Drops and reply to three others.', steps: [{ metric: 'thoughts', target: 2, label: 'Two Thought Drops' }, { metric: 'replies_to_others', target: 3, label: 'Three replies' }], xp: 40 },
  { key: 'weekly_share', period: 'weekly', category: 'identity', title: 'Show your card', description: 'Share your archetype link with someone.', steps: [{ metric: 'shares', target: 1, label: 'Create a share link' }], xp: 20 },
  // One-time exploration, including a multi-step founding quest.
  { key: 'explore_archetype', period: 'once', category: 'identity', title: 'Find your archetype', description: 'Take the twenty-statement assessment.', steps: [{ metric: 'assessment', target: 1, label: 'Save your result' }], xp: 30 },
  { key: 'explore_labels', period: 'once', category: 'identity', title: 'In your own words', description: 'Pick three labels that fit you.', steps: [{ metric: 'labels', target: 3, label: 'Three labels' }], xp: 15 },
  { key: 'explore_pen_name', period: 'once', category: 'identity', title: 'A name for the quiet thoughts', description: 'Choose a pen name for pseudonymous Thought Drops.', steps: [{ metric: 'pen_name', target: 1, label: 'Set a pen name' }], xp: 10 },
  { key: 'found_a_circle', period: 'once', category: 'circle', title: 'Found a circle', description: 'Start a circle, bring two friends in, and play a game together.', steps: [{ metric: 'circles_owned', target: 1, label: 'Create a circle' }, { metric: 'circle_members_invited', target: 2, label: 'Two friends join' }, { metric: 'circle_games', target: 1, label: 'Finish a game in it' }], xp: 100 },
  { key: 'bring_a_friend', period: 'once', category: 'social', title: 'Bring a friend', description: 'Someone you invited joins in for real.', steps: [{ metric: 'referrals_approved', target: 1, label: 'One active friend' }], xp: 50 },
];
export const QUEST_BY_KEY: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.key, q]));

/* ---------------- Vibe check-in ---------------- */
export const VIBES = ['bright', 'calm', 'busy', 'tired', 'restless', 'tender', 'curious', 'low'] as const;
export type Vibe = (typeof VIBES)[number];

/* ---------------- Seasons ---------------- */
export interface SeasonReward { key: string; title: string; kind: 'badge' }
export interface SeasonDef {
  key: string;
  name: string;
  theme: string;
  startsOn: string; // inclusive, Asia/Kolkata date
  endsOn: string; // inclusive
  /** Season points = XP earned inside the season window. */
  milestones: { at: number; reward: SeasonReward }[];
  /** Defined for the future; never claimable while payments are disabled. */
  premiumTrack: { enabled: false; milestones: { at: number; reward: SeasonReward }[] };
}

export const SEASONS: SeasonDef[] = [
  {
    key: 's1-first-light', name: 'Season 1 · First Light', theme: 'Finding your people', startsOn: '2026-11-01', endsOn: '2027-01-31',
    milestones: [
      { at: 100, reward: { key: 'badge_s1_spark', title: 'Spark', kind: 'badge' } },
      { at: 300, reward: { key: 'badge_s1_ember', title: 'Ember', kind: 'badge' } },
      { at: 600, reward: { key: 'badge_s1_lantern', title: 'Lantern', kind: 'badge' } },
      { at: 1000, reward: { key: 'badge_s1_beacon', title: 'Beacon', kind: 'badge' } },
      { at: 1500, reward: { key: 'badge_s1_first_light', title: 'First Light', kind: 'badge' } },
    ],
    premiumTrack: { enabled: false, milestones: [] },
  },
];
export const SEASON_BY_KEY: Record<string, SeasonDef> = Object.fromEntries(SEASONS.map((s) => [s.key, s]));

export function currentSeason(today: string): SeasonDef | null {
  return SEASONS.find((s) => today >= s.startsOn && today <= s.endsOn) ?? null;
}

/* ---------------- Streaks ---------------- */

/** Grace days per rolling 7 days: a single missed day does not break a streak. */
export const STREAK_GRACE_PER_WEEK = 1;

const dayNum = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);

/**
 * Streak over local calendar days (ISO yyyy-mm-dd, already in the member's time zone). Today not yet
 * active does not break the streak. A gap of missed days is bridged if it uses no more than
 * STREAK_GRACE_PER_WEEK grace days within any 7-day window. Pure and deterministic.
 */
export function computeStreak(activeDays: string[], today: string, grace = STREAK_GRACE_PER_WEEK): { current: number; best: number; activeToday: boolean; graceUsed: number } {
  const set = new Set(activeDays.map(dayNum));
  const t = dayNum(today);
  const sorted = [...set].sort((a, b) => a - b);
  // Walk backwards from today (or yesterday) counting active days; bridge small gaps with grace.
  const walk = (start: number) => {
    let d = start; let count = 0; const graceDays: number[] = [];
    while (true) {
      if (set.has(d)) { count++; d--; continue; }
      const recent = graceDays.filter((g) => g - d < 7).length;
      if (recent < grace && set.has(d - 1)) { graceDays.push(d); d--; continue; }
      break;
    }
    return { count, graceUsed: graceDays.length };
  };
  const activeToday = set.has(t);
  const cur = walk(activeToday ? t : t - 1);
  // Best: longest run anywhere, with the same grace rule.
  let best = 0;
  for (const d of sorted) if (!set.has(d + 1) && !(set.has(d + 2) && grace > 0)) best = Math.max(best, walk(d).count);
  best = Math.max(best, cur.count);
  return { current: cur.count, best, activeToday, graceUsed: cur.graceUsed };
}

export function isoWeek(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
