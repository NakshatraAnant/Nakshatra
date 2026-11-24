import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { awardXp, totalXp } from '../lib/rewards';
import { notify } from '../lib/notify';
import { ACHIEVEMENTS, CHALLENGES, RANKS, XP_RULES, levelForXp, type ChallengeDef } from '../../shared/gamification';
import { collectibleStates } from '../services/progress';
import { cachedFestivals } from './astro';

/** Period window for a challenge in the user's time zone. Seasonal windows come from the festival calendar. */
export function challengeWindow(ch: ChallengeDef, now: DateTime, loc: { latitude: number; longitude: number; timezone: string }): { period: string; start: DateTime; end: DateTime } | null {
  if (ch.period === 'week') {
    const start = now.startOf('week');
    return { period: `${start.weekYear}-W${String(start.weekNumber).padStart(2, '0')}`, start, end: start.endOf('week') };
  }
  if (ch.period === 'month') {
    const start = now.startOf('month');
    return { period: start.toFormat('yyyy-LL'), start, end: start.endOf('month') };
  }
  const fest = cachedFestivals(now.year, loc.latitude, loc.longitude, loc.timezone).find((f) => f.key === ch.festivalKey);
  if (!fest) return null;
  const start = DateTime.fromISO(fest.date, { zone: loc.timezone }).startOf('day').minus({ days: ch.festivalKey === 'diwali' ? 2 : 0 });
  const end = start.plus({ days: (ch.windowDays ?? 1) - 1 }).endOf('day');
  return { period: `${now.year}-${ch.key}`, start, end };
}

async function metricInWindow(db: Executor, userId: string, metric: ChallengeDef['metric'], start: DateTime, end: DateTime): Promise<number> {
  const n = sql<number>`count(*)::int`;
  const sd = start.toISODate()!;
  const ed = end.toISODate()!;
  const from = start.toUTC().toJSDate();
  const to = end.toUTC().toJSDate();
  switch (metric) {
    case 'reflections': return (await db.select({ n }).from(s.timelineEvents).where(and(eq(s.timelineEvents.userId, userId), inArray(s.timelineEvents.kind, ['reflection', 'intention']), gte(s.timelineEvents.eventDate, sd), lte(s.timelineEvents.eventDate, ed))))[0].n;
    case 'rituals': return (await db.select({ n }).from(s.ritualCompletions).where(and(eq(s.ritualCompletions.userId, userId), gte(s.ritualCompletions.localDate, sd), lte(s.ritualCompletions.localDate, ed))))[0].n;
    case 'lessons': return (await db.select({ n }).from(s.lessonProgress).where(and(eq(s.lessonProgress.userId, userId), gte(s.lessonProgress.completedAt, from), lte(s.lessonProgress.completedAt, to))))[0].n
      + (await db.select({ n }).from(s.lessonProgressDaily).where(and(eq(s.lessonProgressDaily.userId, userId), gte(s.lessonProgressDaily.completedAt, from), lte(s.lessonProgressDaily.completedAt, to))))[0].n;
    case 'comments': return (await db.select({ n }).from(s.comments).where(and(eq(s.comments.authorId, userId), isNull(s.comments.deletedAt), gte(s.comments.createdAt, from), lte(s.comments.createdAt, to))))[0].n;
    case 'bonds_created': return (await db.select({ n }).from(s.bonds).where(and(eq(s.bonds.ownerId, userId), gte(s.bonds.createdAt, from), lte(s.bonds.createdAt, to))))[0].n;
  }
}

/** Evaluates current challenges; completion is recorded and rewarded once per period. */
export async function evaluateChallenges(ctx: Ctx, db: Executor, userId: string) {
  const [loc] = await db.select().from(s.userLocations).where(eq(s.userLocations.userId, userId));
  const l = loc ?? { latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' };
  const now = DateTime.now().setZone(l.timezone);
  const out = [];
  for (const ch of CHALLENGES) {
    const w = challengeWindow(ch, now, l);
    if (!w) continue;
    const active = now >= w.start && now <= w.end;
    const upcoming = now < w.start;
    if (!active && !upcoming && ch.period === 'season') continue;
    const progress = active ? await metricInWindow(db, userId, ch.metric, w.start, w.end) : 0;
    let completedAt: Date | null = null;
    const [row] = await db.select().from(s.challengeProgress).where(and(eq(s.challengeProgress.userId, userId), eq(s.challengeProgress.challengeKey, ch.key), eq(s.challengeProgress.period, w.period)));
    completedAt = row?.completedAt ?? null;
    if (active) {
      await db.insert(s.challengeProgress).values({ userId, challengeKey: ch.key, period: w.period, progress }).onConflictDoUpdate({ target: [s.challengeProgress.userId, s.challengeProgress.challengeKey, s.challengeProgress.period], set: { progress } });
      if (progress >= ch.target && !completedAt) {
        completedAt = new Date();
        await db.update(s.challengeProgress).set({ completedAt }).where(and(eq(s.challengeProgress.userId, userId), eq(s.challengeProgress.challengeKey, ch.key), eq(s.challengeProgress.period, w.period)));
        const xp = await awardXp(ctx, db, userId, 'challenge_completed', { sourceId: `${ch.key}:${w.period}`, amountOverride: ch.xp });
        if (xp) {
          await notify(ctx, db, { userId, category: 'system', title: `Challenge complete: ${ch.title}`, body: `+${ch.xp} XP`, link: '/journey/rewards', dedupeKey: `challenge:${ch.key}:${w.period}` });
          await track(db, userId, 'challenge_completed', { key: ch.key });
        }
      }
    }
    out.push({ ...ch, period: w.period, start: w.start.toISODate(), end: w.end.toISODate(), progress: Math.min(progress, ch.target), active, upcoming, completedAt });
  }
  return out;
}

export async function journeyRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/journey', async (req) => {
    const a = requireAuth(req);
    const xp = await totalXp(ctx.db, a.userId);
    const level = levelForXp(xp);
    const achieved = await ctx.db.select().from(s.userAchievements).where(eq(s.userAchievements.userId, a.userId));
    const history = await ctx.db.select().from(s.xpLedger).where(eq(s.xpLedger.userId, a.userId)).orderBy(desc(s.xpLedger.createdAt)).limit(50);
    const challenges = await evaluateChallenges(ctx, ctx.db, a.userId);
    const collectibles = await collectibleStates(ctx.db, a.userId);
    return {
      xp, level,
      achievements: ACHIEVEMENTS.map((d) => ({ ...d, awardedAt: achieved.find((x) => x.achievementKey === d.key)?.awardedAt ?? null })),
      history: history.map((h) => ({ ...h, label: XP_RULES[h.rule as keyof typeof XP_RULES]?.label ?? h.rule })),
      challenges, collectibles, ranks: RANKS,
      earn: Object.entries(XP_RULES).filter(([, r]) => r.amount > 0).map(([key, r]) => ({ key, label: r.label, amount: r.amount, repeat: r.repeat })),
      principles: ['Points come only from real actions, recorded on our servers.', 'Rest days never reset or reduce your progress.', 'Purchased cosmetics are labelled separately from earned rewards.'],
    };
  });

  app.post('/api/v1/journey/achievements/:key/seen', async (req) => {
    const a = requireAuth(req);
    const { key } = parse(z.object({ key: z.string() }), req.params);
    const res = await ctx.db.update(s.userAchievements).set({ seenAt: new Date() }).where(and(eq(s.userAchievements.userId, a.userId), eq(s.userAchievements.achievementKey, key))).returning();
    if (!res.length) throw notFound('Achievement');
    return { ok: true };
  });

  /** Optional daily check-in: a gentle, skippable acknowledgement. Missing days never matter. */
  app.post('/api/v1/journey/checkin', async (req) => {
    const a = requireAuth(req);
    const [loc] = await ctx.db.select().from(s.userLocations).where(eq(s.userLocations.userId, a.userId));
    const date = DateTime.now().setZone(loc?.timezone ?? 'Asia/Kolkata').toISODate()!;
    const res = await ctx.db.insert(s.meaningfulActions).values({ userId: a.userId, localDate: date }).onConflictDoNothing().returning();
    const xp = res.length ? await awardXp(ctx, ctx.db, a.userId, 'daily_checkin', { localDate: date }) : 0;
    const [{ days }] = await ctx.db.select({ days: sql<number>`count(*)::int` }).from(s.meaningfulActions).where(eq(s.meaningfulActions.userId, a.userId));
    return { checkedIn: true, xpAwarded: xp, totalDays: days };
  });
}
