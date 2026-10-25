/**
 * Cosmic Journey progression definitions, shared by server (authoritative
 * evaluation) and client (display only). The client never awards anything.
 */

export type XpRule =
  | 'cosmic_id_completed' | 'chart_explored' | 'insight_saved' | 'reflection_written' | 'ritual_completed'
  | 'daily_checkin' | 'lesson_completed' | 'daily_lesson_completed' | 'quiz_passed' | 'course_completed'
  | 'bond_created' | 'bond_accepted' | 'post_created' | 'comment_created' | 'challenge_completed'
  | 'event_attended' | 'profile_shared' | 'group_joined'
  | 'assessment_completed' | 'reply_received' | 'game_completed' | 'ritual_response' | 'circle_activated' | 'referral_activated';

/** XP per rule and the repeat policy that defines the idempotency source key. */
export const XP_RULES: Record<XpRule, { amount: number; repeat: 'once' | 'per_day' | 'per_source'; label: string }> = {
  cosmic_id_completed: { amount: 100, repeat: 'once', label: 'Completed your Cosmic ID' },
  chart_explored: { amount: 5, repeat: 'per_day', label: 'Explored your chart' },
  insight_saved: { amount: 10, repeat: 'per_source', label: 'Saved an insight' },
  reflection_written: { amount: 10, repeat: 'per_day', label: 'Wrote a reflection' },
  ritual_completed: { amount: 10, repeat: 'per_day', label: 'Completed a ritual' },
  daily_checkin: { amount: 5, repeat: 'per_day', label: 'Daily check-in' },
  lesson_completed: { amount: 20, repeat: 'per_source', label: 'Completed a lesson' },
  daily_lesson_completed: { amount: 10, repeat: 'per_source', label: 'Completed a daily chart lesson' },
  quiz_passed: { amount: 30, repeat: 'per_source', label: 'Passed a quiz' },
  course_completed: { amount: 150, repeat: 'per_source', label: 'Completed a course' },
  bond_created: { amount: 25, repeat: 'per_source', label: 'Created a Bond' },
  bond_accepted: { amount: 40, repeat: 'per_source', label: 'Joined a mutual Bond' },
  post_created: { amount: 5, repeat: 'per_day', label: 'Shared a post' },
  comment_created: { amount: 2, repeat: 'per_day', label: 'Joined a conversation' },
  challenge_completed: { amount: 0, repeat: 'per_source', label: 'Completed a challenge' },
  event_attended: { amount: 20, repeat: 'per_source', label: 'Attended an event' },
  profile_shared: { amount: 15, repeat: 'per_day', label: 'Shared your Cosmic ID' },
  group_joined: { amount: 10, repeat: 'per_source', label: 'Joined a community group' },
  assessment_completed: { amount: 50, repeat: 'once', label: 'Discovered your archetype' },
  // One award per (post, replier) pair, and only when the replier is someone else.
  reply_received: { amount: 3, repeat: 'per_source', label: 'Someone replied to your Thought Drop' },
  // Only for players who acted in at least half of the rounds open to them.
  game_completed: { amount: 20, repeat: 'per_source', label: 'Played a full game' },
  ritual_response: { amount: 5, repeat: 'per_source', label: 'Answered a ritual' },
  // Founder reward once three members have each contributed in the circle.
  circle_activated: { amount: 50, repeat: 'per_source', label: 'Your circle came alive' },
  // Granted only after the referred person activates (see services/referrals.ts).
  referral_activated: { amount: 100, repeat: 'per_source', label: 'A friend you invited joined in' },
};

export function levelForXp(xp: number): { level: number; current: number; next: number; rank: string } {
  let level = 1;
  while (xp >= threshold(level + 1)) level++;
  return { level, current: threshold(level), next: threshold(level + 1), rank: rankFor(level) };
}

export function threshold(level: number): number {
  return (100 * (level - 1) * level) / 2;
}

/** Level names: progress from a first signal to keeping a whole constellation. */
export const RANKS = [
  { from: 1, name: 'New Signal' },
  { from: 3, name: 'Orbiting' },
  { from: 6, name: 'Inner Circle' },
  { from: 10, name: 'Supernova' },
  { from: 15, name: 'Constellation Keeper' },
] as const;

export function rankFor(level: number): string {
  return [...RANKS].reverse().find((r) => level >= r.from)!.name;
}

export type AchievementFamily = 'identity' | 'learning' | 'reflection' | 'relationships' | 'community' | 'creativity' | 'events' | 'annual';

export interface AchievementDef {
  key: string;
  family: AchievementFamily;
  title: string;
  description: string;
  /** Server-side metric and threshold. */
  metric: string;
  threshold: number;
  constellation: number[][];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_light', family: 'identity', title: 'First Light', description: 'Completed your Cosmic ID.', metric: 'cosmic_id', threshold: 1, constellation: [[0, 0], [1, 1], [2, 0]] },
  { key: 'self_portrait', family: 'identity', title: 'Self Portrait', description: 'Customised your Cosmic ID theme.', metric: 'theme_customised', threshold: 1, constellation: [[0, 1], [1, 0], [2, 1], [1, 2]] },
  { key: 'shared_star', family: 'identity', title: 'Shared Star', description: 'Shared your Cosmic ID.', metric: 'profile_shared', threshold: 1, constellation: [[0, 0], [2, 2]] },
  { key: 'first_lesson', family: 'learning', title: 'First Lesson', description: 'Completed your first lesson.', metric: 'lessons', threshold: 1, constellation: [[0, 2], [1, 0], [2, 2]] },
  { key: 'scholar', family: 'learning', title: 'Scholar', description: 'Completed five lessons.', metric: 'lessons', threshold: 5, constellation: [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0]] },
  { key: 'course_complete', family: 'learning', title: 'Course Complete', description: 'Finished a full course.', metric: 'courses_completed', threshold: 1, constellation: [[0, 1], [1, 0], [2, 1], [3, 0]] },
  { key: 'quiz_ace', family: 'learning', title: 'Perfect Recall', description: 'Scored 100% on a quiz.', metric: 'perfect_quizzes', threshold: 1, constellation: [[1, 0], [0, 2], [2, 2]] },
  { key: 'first_reflection', family: 'reflection', title: 'Inner Sky', description: 'Wrote your first reflection.', metric: 'reflections', threshold: 1, constellation: [[0, 0], [1, 2]] },
  { key: 'seven_reflections', family: 'reflection', title: 'Seven Lamps', description: 'Wrote seven reflections (any days, no streak needed).', metric: 'reflections', threshold: 7, constellation: [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1], [6, 0]] },
  { key: 'ritual_seven', family: 'reflection', title: 'Steady Flame', description: 'Completed seven rituals (rest days never count against you).', metric: 'rituals', threshold: 7, constellation: [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]] },
  { key: 'first_bond', family: 'relationships', title: 'Twin Stars', description: 'Created your first Bond.', metric: 'bonds', threshold: 1, constellation: [[0, 1], [2, 1]] },
  { key: 'constellation', family: 'relationships', title: 'Constellation', description: 'Created five Bonds.', metric: 'bonds', threshold: 5, constellation: [[0, 0], [1, 2], [2, 1], [3, 2], [4, 0]] },
  { key: 'mutual_bond', family: 'relationships', title: 'Mutual Orbit', description: 'A Bond invitation was accepted.', metric: 'mutual_bonds', threshold: 1, constellation: [[0, 0], [1, 1], [0, 2], [2, 1]] },
  { key: 'first_post', family: 'community', title: 'First Signal', description: 'Published your first post.', metric: 'posts', threshold: 1, constellation: [[0, 1], [1, 0], [2, 1]] },
  { key: 'conversation_starter', family: 'community', title: 'Conversation Starter', description: 'Wrote ten comments.', metric: 'comments', threshold: 10, constellation: [[0, 0], [1, 1], [2, 2], [3, 1]] },
  { key: 'group_joined', family: 'community', title: 'Gathering', description: 'Joined a community group.', metric: 'groups', threshold: 1, constellation: [[0, 2], [1, 0], [2, 2], [1, 1]] },
  { key: 'card_maker', family: 'creativity', title: 'Card Maker', description: 'Shared a Cosmic Card post.', metric: 'card_posts', threshold: 1, constellation: [[0, 0], [2, 0], [2, 2], [0, 2]] },
  { key: 'poll_creator', family: 'creativity', title: 'Curious Mind', description: 'Created a poll.', metric: 'poll_posts', threshold: 1, constellation: [[1, 0], [1, 2], [0, 1], [2, 1]] },
  { key: 'first_event', family: 'events', title: 'Gathered Under Stars', description: 'Attended an event.', metric: 'events_attended', threshold: 1, constellation: [[0, 0], [1, 1], [2, 0], [1, 2]] },
  { key: 'festival_observer', family: 'events', title: 'Festival Observer', description: 'Completed a ritual on a festival day.', metric: 'festival_rituals', threshold: 1, constellation: [[1, 0], [0, 1], [1, 2], [2, 1]] },
  { key: 'archetype_found', family: 'identity', title: 'Signal Found', description: 'Discovered your personality archetype.', metric: 'assessment', threshold: 1, constellation: [[0, 1], [1, 0], [2, 1], [1, 2]] },
  { key: 'first_game', family: 'community', title: 'Game Night', description: 'Played a full game with others.', metric: 'games_completed', threshold: 1, constellation: [[0, 0], [1, 1], [2, 0]] },
  { key: 'game_regular', family: 'community', title: 'Regular at the Table', description: 'Played five full games.', metric: 'games_completed', threshold: 5, constellation: [[0, 2], [1, 0], [2, 2], [3, 0], [4, 2]] },
  { key: 'circle_founder', family: 'community', title: 'Circle Founder', description: 'Started a circle that came alive (three contributing members).', metric: 'circles_activated', threshold: 1, constellation: [[1, 0], [0, 2], [2, 2], [1, 1]] },
  { key: 'wrapped', family: 'annual', title: 'Year in Stars', description: 'Opened your Cosmic Wrapped.', metric: 'wrapped_viewed', threshold: 1, constellation: [[0, 0], [1, 1], [2, 2], [3, 3]] },
];

export interface ChallengeDef {
  key: string;
  title: string;
  description: string;
  period: 'week' | 'month' | 'season';
  metric: 'reflections' | 'lessons' | 'rituals' | 'comments' | 'bonds_created';
  target: number;
  xp: number;
  /** Seasonal challenges are tied to a festival window computed by the Panchang engine. */
  festivalKey?: string;
  windowDays?: number;
}

export const CHALLENGES: ChallengeDef[] = [
  { key: 'weekly_reflections', title: 'Three reflections', description: 'Write three reflections this week.', period: 'week', metric: 'reflections', target: 3, xp: 40 },
  { key: 'weekly_lessons', title: 'Two lessons', description: 'Complete two lessons this week.', period: 'week', metric: 'lessons', target: 2, xp: 40 },
  { key: 'monthly_rituals', title: 'Ten rituals', description: 'Complete ten rituals this month — any days you like.', period: 'month', metric: 'rituals', target: 10, xp: 80 },
  { key: 'monthly_community', title: 'Five conversations', description: 'Comment on five posts this month.', period: 'month', metric: 'comments', target: 5, xp: 60 },
  { key: 'monthly_bonds', title: 'Connect two', description: 'Create two Bonds this month.', period: 'month', metric: 'bonds_created', target: 2, xp: 60 },
  { key: 'navratri_quest', title: 'Navratri quest', description: 'Complete nine rituals during Sharad Navratri.', period: 'season', metric: 'rituals', target: 9, xp: 150, festivalKey: 'navratri', windowDays: 10 },
  { key: 'diwali_lights', title: 'Festival of lights', description: 'Complete three rituals in the Diwali week.', period: 'season', metric: 'rituals', target: 3, xp: 100, festivalKey: 'diwali', windowDays: 5 },
];

export interface CollectibleDef { key: string; kind: 'frame' | 'theme' | 'card'; title: string; unlock: { type: 'level'; level: number } | { type: 'achievement'; key: string } | { type: 'subscription' } | { type: 'purchase'; productSlug: string } }

export const COLLECTIBLES: CollectibleDef[] = [
  { key: 'theme_midnight', kind: 'theme', title: 'Midnight', unlock: { type: 'level', level: 1 } },
  { key: 'theme_dawn', kind: 'theme', title: 'Dawn', unlock: { type: 'level', level: 1 } },
  { key: 'theme_aurora', kind: 'theme', title: 'Aurora', unlock: { type: 'level', level: 3 } },
  { key: 'theme_saffron', kind: 'theme', title: 'Saffron', unlock: { type: 'achievement', key: 'ritual_seven' } },
  { key: 'theme_nebula', kind: 'theme', title: 'Nebula', unlock: { type: 'level', level: 6 } },
  { key: 'theme_eclipse', kind: 'theme', title: 'Eclipse', unlock: { type: 'subscription' } },
  { key: 'frame_orbit', kind: 'frame', title: 'Orbit frame', unlock: { type: 'level', level: 1 } },
  { key: 'frame_lotus', kind: 'frame', title: 'Lotus frame', unlock: { type: 'achievement', key: 'seven_reflections' } },
  { key: 'frame_constellation', kind: 'frame', title: 'Constellation frame', unlock: { type: 'achievement', key: 'constellation' } },
  { key: 'frame_scholar', kind: 'frame', title: 'Scholar frame', unlock: { type: 'achievement', key: 'course_complete' } },
  { key: 'frame_gold', kind: 'frame', title: 'Gilded frame', unlock: { type: 'subscription' } },
  // Identity-card styles. Earned styles come from participation; purchased styles from a paid cosmetic pack.
  { key: 'card_classic', kind: 'card', title: 'Classic', unlock: { type: 'level', level: 1 } },
  { key: 'card_dusk', kind: 'card', title: 'Dusk', unlock: { type: 'level', level: 3 } },
  { key: 'card_aurora', kind: 'card', title: 'Aurora', unlock: { type: 'level', level: 6 } },
  { key: 'card_table', kind: 'card', title: 'Game Night', unlock: { type: 'achievement', key: 'game_regular' } },
  { key: 'card_eclipse_ink', kind: 'card', title: 'Eclipse Ink', unlock: { type: 'purchase', productSlug: 'cosmetic-card-styles' } },
  { key: 'card_saffron_foil', kind: 'card', title: 'Saffron Foil', unlock: { type: 'purchase', productSlug: 'cosmetic-card-styles' } },
];
