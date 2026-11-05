import { and, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { conflict, badRequest, notFound } from '../lib/http';
import { awardXp, grantAchievement, totalXp } from '../lib/rewards';
import { levelForXp } from '../../shared/gamification';
import {
  QUESTS, QUEST_BY_KEY, SEASONS, SEASON_BY_KEY, STREAK_GRACE_PER_WEEK, computeStreak, currentSeason, isoWeek,
  type QuestDef, type QuestMetric, type Vibe,
} from '../../shared/progression';
import { THOUGHT_KINDS } from '../modules/social';

/**
 * Progression engine (progression-v1). Every number here is derived on the server from real activity
 * rows; claims are idempotent through primary keys, and XP goes only through awardXp (xp_ledger).
 */
const SEASON_TZ = 'Asia/Kolkata';
const SEASON_CLAIM_GRACE_DAYS = 14;

export async function userTz(db: Executor, userId: string): Promise<string> {
  const [loc] = await db.select({ tz: s.userLocations.timezone }).from(s.userLocations).where(eq(s.userLocations.userId, userId));
  return loc?.tz ?? 'Asia/Kolkata';
}

interface Window { from: Date; to: Date; periodKey: string }

function windowFor(period: QuestDef['period'], tz: string, now = new Date()): Window {
  const local = DateTime.fromJSDate(now).setZone(tz);
  if (period === 'daily') return { from: local.startOf('day').toJSDate(), to: local.endOf('day').toJSDate(), periodKey: local.toISODate()! };
  if (period === 'weekly') return { from: local.startOf('week').toJSDate(), to: local.endOf('week').toJSDate(), periodKey: isoWeek(local.toISODate()!) };
  return { from: new Date(0), to: new Date(8.64e15), periodKey: 'once' };
}

const n = sql<number>`count(*)::int`;
const one = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);

async function metric(db: Executor, userId: string, m: QuestMetric, w: Window, tz: string): Promise<number> {
  const inRange = (col: AnyPgColumn) => and(gte(col, w.from), lt(col, w.to));
  switch (m) {
    case 'vibe_today': return one(db.select({ n }).from(s.vibeCheckins).where(and(eq(s.vibeCheckins.userId, userId), eq(s.vibeCheckins.localDate, DateTime.fromJSDate(w.from).setZone(tz).toISODate()!))));
    case 'rituals': return one(db.select({ n }).from(s.ritualResponses).where(and(eq(s.ritualResponses.userId, userId), inRange(s.ritualResponses.createdAt))));
    case 'replies_to_others': {
      // Distinct Thought Drops by other people that you replied to — not raw comment volume.
      const r = await db.select({ n: sql<number>`count(distinct ${s.comments.postId})::int` }).from(s.comments).innerJoin(s.posts, eq(s.posts.id, s.comments.postId))
        .where(and(eq(s.comments.authorId, userId), ne(s.posts.authorId, userId), isNull(s.comments.deletedAt), inRange(s.comments.createdAt)));
      return Number(r[0]?.n ?? 0);
    }
    case 'thoughts': return one(db.select({ n }).from(s.posts).where(and(eq(s.posts.authorId, userId), isNull(s.posts.deletedAt), inArray(s.posts.kind, [...THOUGHT_KINDS, 'poll', 'text']), inRange(s.posts.createdAt))));
    case 'games_completed': return one(db.select({ n }).from(s.xpLedger).where(and(eq(s.xpLedger.userId, userId), eq(s.xpLedger.rule, 'game_completed'), inRange(s.xpLedger.createdAt))));
    case 'circle_days': {
      const r = await db.execute(sql`select count(distinct d)::int as n from (
          select (p.created_at at time zone ${tz})::date as d from posts p join groups g on g.id = p.group_id
            where p.author_id = ${userId} and g.kind = 'circle' and p.deleted_at is null and p.created_at >= ${w.from} and p.created_at < ${w.to}
          union all
          select (r.created_at at time zone ${tz})::date from ritual_responses r
            where r.user_id = ${userId} and r.circle_key <> '' and r.created_at >= ${w.from} and r.created_at < ${w.to}
          union all
          select (gs.created_at at time zone ${tz})::date from game_submissions gs join game_sessions ss on ss.id = gs.session_id
            where gs.user_id = ${userId} and ss.circle_id is not null and gs.created_at >= ${w.from} and gs.created_at < ${w.to}
        ) days`) as unknown as { rows: { n: number }[] };
      return Number(r.rows[0]?.n ?? 0);
    }
    case 'shares': return one(db.select({ n }).from(s.identityShares).where(and(eq(s.identityShares.userId, userId), inRange(s.identityShares.createdAt))));
    case 'assessment': return one(db.select({ n }).from(s.assessmentResults).where(eq(s.assessmentResults.userId, userId)));
    case 'labels': { const [p] = await db.select({ l: s.profiles.identityLabels }).from(s.profiles).where(eq(s.profiles.userId, userId)); return p?.l.length ?? 0; }
    case 'pen_name': { const [p] = await db.select({ p: s.profiles.pseudonym }).from(s.profiles).where(eq(s.profiles.userId, userId)); return p?.p ? 1 : 0; }
    case 'circles_joined': return one(db.select({ n }).from(s.groupMembers).innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId)).where(and(eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active'), eq(s.groups.kind, 'circle'), isNull(s.groups.archivedAt))));
    case 'circles_owned': return one(db.select({ n }).from(s.groups).where(and(eq(s.groups.ownerId, userId), eq(s.groups.kind, 'circle'), isNull(s.groups.archivedAt))));
    case 'circle_members_invited': {
      const r = await db.execute(sql`select coalesce(max(c.n), 0)::int as n from (select count(*) - 1 as n from group_members m join groups g on g.id = m.group_id
        where g.owner_id = ${userId} and g.kind = 'circle' and g.archived_at is null and m.status = 'active' group by g.id) c`) as unknown as { rows: { n: number }[] };
      return Number(r.rows[0]?.n ?? 0);
    }
    case 'circle_games': return one(db.select({ n }).from(s.gameSessions).innerJoin(s.groups, eq(s.groups.id, s.gameSessions.circleId)).where(and(eq(s.groups.ownerId, userId), eq(s.gameSessions.status, 'completed'))));
    case 'referrals_approved': return one(db.select({ n }).from(s.referrals).where(and(eq(s.referrals.referrerId, userId), eq(s.referrals.status, 'approved'))));
    case 'reactions_given': return one(db.select({ n }).from(s.reactions).where(and(eq(s.reactions.userId, userId), inRange(s.reactions.createdAt))));
    default: return 0;
  }
}

export async function questStates(db: Executor, userId: string, now = new Date()) {
  const tz = await userTz(db, userId);
  const claims = await db.select().from(s.questClaims).where(eq(s.questClaims.userId, userId));
  const out = [];
  for (const q of QUESTS) {
    const w = windowFor(q.period, tz, now);
    const steps = [];
    for (const st of q.steps) steps.push({ ...st, value: Math.min(st.target, await metric(db, userId, st.metric, w, tz)) });
    const complete = steps.every((st) => st.value >= st.target);
    const claimed = claims.some((c) => c.questKey === q.key && c.periodKey === w.periodKey);
    out.push({ key: q.key, period: q.period, category: q.category, title: q.title, description: q.description, xp: q.xp, periodKey: w.periodKey, resetsAt: q.period === 'once' ? null : w.to, steps, complete, claimed, claimable: complete && !claimed });
  }
  return out;
}

export async function claimQuest(ctx: Ctx, userId: string, key: string) {
  const q = QUEST_BY_KEY[key];
  if (!q) throw notFound('Quest');
  const state = (await questStates(ctx.db, userId)).find((x) => x.key === key)!;
  if (!state.complete) throw badRequest('This quest is not complete yet.');
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(s.questClaims).values({ userId, questKey: key, periodKey: state.periodKey, xp: q.xp }).onConflictDoNothing().returning();
    if (!row) throw conflict('Already claimed. A new one arrives next period.');
    const xp = await awardXp(ctx, tx, userId, 'quest_reward', { sourceId: `${key}:${state.periodKey}`, amountOverride: q.xp });
    await track(tx, userId, 'quest_claimed', { quest: key, period: q.period });
    const explored = (await tx.select({ k: s.questClaims.questKey }).from(s.questClaims).where(and(eq(s.questClaims.userId, userId), eq(s.questClaims.periodKey, 'once')))).length;
    if (explored >= 3) await grantAchievement(ctx, tx, userId, 'identity_explorer');
    return { xp, total: await totalXp(tx, userId) };
  });
}

/* ---------------- Streaks ---------------- */

export async function activeDays(db: Executor, userId: string, tz: string, days = 120): Promise<string[]> {
  const since = new Date(Date.now() - days * 86400000);
  const r = await db.execute(sql`select distinct d::text as d from (
      select (created_at at time zone ${tz})::date as d from xp_ledger where user_id = ${userId} and amount > 0 and created_at >= ${since}
      union all select local_date as d from vibe_checkins where user_id = ${userId} and created_at >= ${since}
      union all select (created_at at time zone ${tz})::date from ritual_responses where user_id = ${userId} and created_at >= ${since}
    ) x`) as unknown as { rows: { d: string }[] };
  return r.rows.map((x) => x.d.slice(0, 10));
}

export async function circleStreaks(db: Executor, userId: string) {
  const since = new Date(Date.now() - 60 * 86400000);
  const circles = await db.select({ id: s.groups.id, name: s.groups.name }).from(s.groupMembers).innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId))
    .where(and(eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active'), eq(s.groups.kind, 'circle'), isNull(s.groups.archivedAt)));
  const today = DateTime.now().setZone(SEASON_TZ).toISODate()!;
  const out = [];
  for (const c of circles) {
    const r = await db.execute(sql`select distinct d::text as d from (
        select (created_at at time zone ${SEASON_TZ})::date as d from posts where group_id = ${c.id} and deleted_at is null and created_at >= ${since}
        union all select (created_at at time zone ${SEASON_TZ})::date from ritual_responses where circle_key = ${c.id} and created_at >= ${since}
      ) x`) as unknown as { rows: { d: string }[] };
    const st = computeStreak(r.rows.map((x) => x.d.slice(0, 10)), today);
    out.push({ circleId: c.id, name: c.name, current: st.current, best: st.best, activeToday: st.activeToday });
  }
  return out;
}

/* ---------------- Seasons ---------------- */

async function seasonPoints(db: Executor, userId: string, seasonKey: string): Promise<number> {
  const def = SEASON_BY_KEY[seasonKey];
  const from = DateTime.fromISO(def.startsOn, { zone: SEASON_TZ }).startOf('day').toJSDate();
  const to = DateTime.fromISO(def.endsOn, { zone: SEASON_TZ }).endOf('day').toJSDate();
  const [r] = await db.select({ total: sql<number>`coalesce(sum(${s.xpLedger.amount}), 0)::int` }).from(s.xpLedger)
    .where(and(eq(s.xpLedger.userId, userId), gte(s.xpLedger.createdAt, from), lt(s.xpLedger.createdAt, to), ne(s.xpLedger.rule, 'season_reward')));
  return Math.max(0, Number(r?.total ?? 0));
}

export async function seasonStates(db: Executor, userId: string) {
  const today = DateTime.now().setZone(SEASON_TZ).toISODate()!;
  const claims = await db.select().from(s.seasonClaims).where(eq(s.seasonClaims.userId, userId));
  const out = [];
  for (const def of SEASONS) {
    const status = today < def.startsOn ? 'upcoming' : today > def.endsOn ? 'ended' : 'current';
    const points = status === 'upcoming' ? 0 : await seasonPoints(db, userId, def.key);
    const claimOpen = status === 'current' || (status === 'ended' && DateTime.fromISO(today).diff(DateTime.fromISO(def.endsOn), 'days').days <= SEASON_CLAIM_GRACE_DAYS);
    out.push({
      key: def.key, name: def.name, theme: def.theme, startsOn: def.startsOn, endsOn: def.endsOn, status, points,
      milestones: def.milestones.map((m) => {
        const claimed = claims.some((c) => c.seasonKey === def.key && c.track === 'free' && c.milestone === m.at);
        return { at: m.at, reward: m.reward, reached: points >= m.at, claimed, claimable: claimOpen && points >= m.at && !claimed };
      }),
      premiumTrack: { enabled: false, note: 'A premium track is designed but switched off while payments are disabled.' },
    });
  }
  return { current: currentSeason(today)?.key ?? null, seasons: out };
}

export async function claimSeasonMilestone(ctx: Ctx, userId: string, seasonKey: string, at: number) {
  const def = SEASON_BY_KEY[seasonKey];
  if (!def) throw notFound('Season');
  const st = (await seasonStates(ctx.db, userId)).seasons.find((x) => x.key === seasonKey)!;
  const m = st.milestones.find((x) => x.at === at);
  if (!m) throw notFound('Milestone');
  if (!m.claimable) throw badRequest(m.claimed ? 'Already claimed.' : m.reached ? 'This season’s claim window has closed.' : 'Not reached yet.');
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(s.seasonClaims).values({ userId, seasonKey, milestone: at, track: 'free' }).onConflictDoNothing().returning();
    if (!row) throw conflict('Already claimed.');
    await tx.insert(s.userCollectibles).values({ userId, itemKey: m.reward.key, source: 'earned' }).onConflictDoNothing();
    await track(tx, userId, 'season_reward_claimed', { season: seasonKey, milestone: at });
    return { reward: m.reward };
  });
}

/* ---------------- Vibe ---------------- */

export async function checkInVibe(ctx: Ctx, userId: string, mood: Vibe) {
  const tz = await userTz(ctx.db, userId);
  const today = DateTime.now().setZone(tz).toISODate()!;
  await ctx.db.insert(s.vibeCheckins).values({ userId, localDate: today, mood }).onConflictDoUpdate({ target: [s.vibeCheckins.userId, s.vibeCheckins.localDate], set: { mood } });
  // The mood itself is never sent to analytics.
  await track(ctx.db, userId, 'vibe_checked_in', {});
  return { date: today, mood };
}

/* ---------------- Overview ---------------- */

export async function progressOverview(ctx: Ctx, userId: string) {
  const db = ctx.db;
  const tz = await userTz(db, userId);
  const today = DateTime.now().setZone(tz).toISODate()!;
  const xp = await totalXp(db, userId);
  const streak = computeStreak(await activeDays(db, userId, tz), today);
  if (streak.best >= 7) await grantAchievement(ctx, db, userId, 'steady_week');
  const [shareSignups] = await db.select({ n: sql<number>`coalesce(sum(${s.identityShares.signups}), 0)::int` }).from(s.identityShares).where(eq(s.identityShares.userId, userId));
  if (Number(shareSignups?.n ?? 0) >= 1) await grantAchievement(ctx, db, userId, 'connector');
  const vibes = await db.select({ date: s.vibeCheckins.localDate, mood: s.vibeCheckins.mood }).from(s.vibeCheckins).where(and(eq(s.vibeCheckins.userId, userId), gte(s.vibeCheckins.createdAt, new Date(Date.now() - 31 * 86400000)))).orderBy(s.vibeCheckins.localDate);
  return {
    timezone: tz,
    xp, level: levelForXp(xp),
    streak: { ...streak, graceDaysPerWeek: STREAK_GRACE_PER_WEEK, note: 'Any meaningful action counts. One missed day a week is forgiven, and nothing you earned is ever taken away.' },
    circleStreaks: await circleStreaks(db, userId),
    vibe: { today: vibes.find((v) => v.date === today)?.mood ?? null, recent: vibes },
    quests: await questStates(db, userId),
    ...(await seasonStates(db, userId)),
  };
}

/** Staff correction: reverses one XP award with an audited negative entry (at most once per award). */
export async function reverseXp(ctx: Ctx, entryId: string, actorId: string, reason: string) {
  const [e] = await ctx.db.select().from(s.xpLedger).where(eq(s.xpLedger.id, entryId));
  if (!e) throw notFound('XP entry');
  if (e.amount <= 0 || e.rule === 'reversal') throw badRequest('Only positive awards can be reversed.');
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(s.xpLedger).values({ userId: e.userId, amount: -e.amount, rule: 'reversal', sourceKey: `rev:${e.id}`, reversesId: e.id, meta: { reason: reason.slice(0, 200), by: actorId, originalRule: e.rule } }).onConflictDoNothing().returning();
    if (!row) throw conflict('This award was already reversed.');
    await audit(tx, { actorId, action: 'xp.reverse', targetType: 'xp_entry', targetId: e.id, meta: { amount: e.amount, rule: e.rule } });
    return row;
  });
}
