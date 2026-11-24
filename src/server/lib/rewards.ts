import { and, eq, isNull, or, sql, inArray } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Executor } from '../db/client';
import * as s from '../db/schema';
import { ACHIEVEMENTS, XP_RULES, type XpRule } from '../../shared/gamification';
import type { Ctx } from './context';
import { track } from './context';
import { notify } from './notify';

/**
 * Server-authoritative rewards. XP awards are idempotent via the unique
 * (user, rule, sourceKey) index; achievements via the (user, key) primary key.
 * Nothing here can be triggered directly by the client — only by domain actions.
 */
export async function awardXp(ctx: Ctx, db: Executor, userId: string, rule: XpRule, opts: { sourceId?: string; localDate?: string; amountOverride?: number } = {}): Promise<number> {
  const def = XP_RULES[rule];
  const sourceKey = def.repeat === 'once' ? 'once' : def.repeat === 'per_day' ? (opts.localDate ?? DateTime.utc().toISODate()!) : opts.sourceId!;
  if (!sourceKey) throw new Error(`XP rule ${rule} requires a source id`);
  const amount = opts.amountOverride ?? def.amount;
  const res = await db.insert(s.xpLedger).values({ userId, amount, rule, sourceKey }).onConflictDoNothing().returning({ id: s.xpLedger.id });
  return res.length ? amount : 0;
}

type Metric = (typeof ACHIEVEMENTS)[number]['metric'];

const count = (n: unknown) => Number(n ?? 0);

async function metricValue(db: Executor, userId: string, metric: Metric): Promise<number> {
  const c = async (q: Promise<{ n: number }[]>) => count((await q)[0]?.n);
  const n = sql<number>`count(*)::int`;
  switch (metric) {
    case 'cosmic_id':
      return c(db.select({ n }).from(s.profiles).where(and(eq(s.profiles.userId, userId), sql`${s.profiles.onboardingCompletedAt} is not null`)));
    case 'theme_customised':
      return c(db.select({ n }).from(s.profiles).where(and(eq(s.profiles.userId, userId), or(sql`${s.profiles.theme} <> 'midnight'`, sql`${s.profiles.emblem} <> 'orbit'`))));
    case 'profile_shared':
      return c(db.select({ n }).from(s.xpLedger).where(and(eq(s.xpLedger.userId, userId), eq(s.xpLedger.rule, 'profile_shared'))));
    case 'lessons':
      return (await c(db.select({ n }).from(s.lessonProgress).where(eq(s.lessonProgress.userId, userId))))
        + (await c(db.select({ n }).from(s.lessonProgressDaily).where(eq(s.lessonProgressDaily.userId, userId))));
    case 'courses_completed':
      return c(db.select({ n }).from(s.enrollments).where(and(eq(s.enrollments.userId, userId), eq(s.enrollments.status, 'completed'))));
    case 'perfect_quizzes':
      return c(db.select({ n }).from(s.quizAttempts).where(and(eq(s.quizAttempts.userId, userId), eq(s.quizAttempts.scorePercent, 100))));
    case 'reflections':
      return c(db.select({ n }).from(s.timelineEvents).where(and(eq(s.timelineEvents.userId, userId), inArray(s.timelineEvents.kind, ['reflection', 'intention']))));
    case 'rituals':
      return c(db.select({ n }).from(s.ritualCompletions).where(eq(s.ritualCompletions.userId, userId)));
    case 'bonds':
      return c(db.select({ n }).from(s.bonds).where(and(eq(s.bonds.ownerId, userId), isNull(s.bonds.deletedAt))));
    case 'mutual_bonds':
      return c(db.select({ n }).from(s.bonds).where(and(eq(s.bonds.status, 'active'), isNull(s.bonds.deletedAt), or(eq(s.bonds.ownerId, userId), eq(s.bonds.partnerUserId, userId)))));
    case 'posts':
      return c(db.select({ n }).from(s.posts).where(and(eq(s.posts.authorId, userId), isNull(s.posts.deletedAt))));
    case 'comments':
      return c(db.select({ n }).from(s.comments).where(and(eq(s.comments.authorId, userId), isNull(s.comments.deletedAt))));
    case 'groups':
      return c(db.select({ n }).from(s.groupMembers).where(and(eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active'))));
    case 'card_posts':
      return c(db.select({ n }).from(s.posts).where(and(eq(s.posts.authorId, userId), eq(s.posts.kind, 'cosmic_card'))));
    case 'poll_posts':
      return c(db.select({ n }).from(s.posts).where(and(eq(s.posts.authorId, userId), eq(s.posts.kind, 'poll'))));
    case 'assessment':
      return c(db.select({ n }).from(s.assessmentResults).where(eq(s.assessmentResults.userId, userId)));
    case 'games_completed':
      return c(db.select({ n }).from(s.xpLedger).where(and(eq(s.xpLedger.userId, userId), eq(s.xpLedger.rule, 'game_completed'))));
    case 'circles_activated':
      return c(db.select({ n }).from(s.xpLedger).where(and(eq(s.xpLedger.userId, userId), eq(s.xpLedger.rule, 'circle_activated'))));
    case 'events_attended':
      return c(db.select({ n }).from(s.eventRsvps).where(and(eq(s.eventRsvps.userId, userId), eq(s.eventRsvps.status, 'attended'))));
    default:
      return 0; // direct-award metrics (festival_rituals, wrapped_viewed)
  }
}

/** Evaluates achievements whose metric is in `metrics`, awarding any newly met. Returns new keys. */
export async function evaluateAchievements(ctx: Ctx, db: Executor, userId: string, metrics: Metric[]): Promise<string[]> {
  const relevant = ACHIEVEMENTS.filter((a) => metrics.includes(a.metric));
  const values = new Map<string, number>();
  const awarded: string[] = [];
  for (const a of relevant) {
    if (!values.has(a.metric)) values.set(a.metric, await metricValue(db, userId, a.metric));
    if (values.get(a.metric)! >= a.threshold && (await grantAchievement(ctx, db, userId, a.key))) awarded.push(a.key);
  }
  return awarded;
}

export async function grantAchievement(ctx: Ctx, db: Executor, userId: string, key: string): Promise<boolean> {
  const def = ACHIEVEMENTS.find((a) => a.key === key);
  if (!def) return false;
  const res = await db.insert(s.userAchievements).values({ userId, achievementKey: key }).onConflictDoNothing().returning();
  if (!res.length) return false;
  await track(db, userId, 'achievement_unlocked', { key });
  await notify(ctx, db, { userId, category: 'system', title: `Achievement unlocked: ${def.title}`, body: def.description, link: '/journey/rewards', dedupeKey: `achievement:${key}` });
  return true;
}

export async function totalXp(db: Executor, userId: string): Promise<number> {
  const [r] = await db.select({ total: sql<number>`coalesce(sum(${s.xpLedger.amount}), 0)::int` }).from(s.xpLedger).where(eq(s.xpLedger.userId, userId));
  return count(r?.total);
}
