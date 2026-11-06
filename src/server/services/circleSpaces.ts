import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import { forbidden } from '../lib/http';
import { RECURRENCE_RULES, occurrencesBetween, type Frequency } from '../../shared/recurrence';

type Series = typeof s.eventSeries.$inferSelect;

/**
 * Creates the series' occurrences up to the horizon as ordinary events. Idempotent: the (series_id, starts_at)
 * unique index means running it twice — or on two instances — never duplicates an occurrence.
 */
export async function materialiseSeries(db: Executor, series: Series, now = new Date()): Promise<number> {
  if (series.endedAt) return 0;
  const [last] = await db.select({ at: s.events.startsAt }).from(s.events).where(eq(s.events.seriesId, series.id)).orderBy(desc(s.events.startsAt)).limit(1);
  const [{ ahead }] = await db.select({ ahead: sql<number>`count(*)::int` }).from(s.events).where(and(eq(s.events.seriesId, series.id), gt(s.events.startsAt, now)));
  const room = Math.max(0, RECURRENCE_RULES.maxAhead - ahead);
  if (!room) return 0;
  // First run starts from the first occurrence; later runs continue after the latest one (never back-filling the past).
  const after = last ? new Date(Math.max(last.at.getTime(), now.getTime())) : new Date(series.firstStartsAt.getTime() - 1);
  // A series that starts far ahead still gets its first occurrences, so members can see and RSVP to it.
  const horizon = new Date(Math.max(now.getTime(), series.firstStartsAt.getTime()) + RECURRENCE_RULES.horizonDays * 864e5);
  const dates = occurrencesBetween({ firstStartsAt: series.firstStartsAt, timezone: series.timezone, frequency: series.frequency as Frequency, until: series.until }, after, horizon, room);
  if (!dates.length) return 0;
  const rows = await db.insert(s.events).values(dates.map((startsAt) => ({
    hostId: series.hostId, groupId: series.circleId, title: series.title, description: series.description, startsAt, endsAt: new Date(startsAt.getTime() + series.durationMinutes * 60000),
    mode: series.mode, location: series.location, liveUrl: series.liveUrl, capacity: series.capacity, kind: 'community', seriesId: series.id,
  }))).onConflictDoNothing().returning({ id: s.events.id });
  return rows.length;
}

/** Scheduler job: keep every active series stocked a few weeks ahead. */
export async function materialiseAllSeries(db: Executor, now = new Date()): Promise<number> {
  const all = await db.select().from(s.eventSeries).where(isNull(s.eventSeries.endedAt));
  let n = 0;
  for (const series of all) n += await materialiseSeries(db, series, now);
  return n;
}

/** Throws if the member is paused from posting in this circle. */
export async function assertNotTimedOut(db: Executor, circleId: string, userId: string) {
  const [t] = await db.select().from(s.circleTimeouts).where(and(eq(s.circleTimeouts.circleId, circleId), eq(s.circleTimeouts.userId, userId), gt(s.circleTimeouts.until, new Date())));
  if (t) throw forbidden(`A circle moderator paused your posting here until ${t.until.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`);
}

/**
 * Members-only channels this member may NOT see, across the given circles. A tier channel is open to members of
 * that tier or a higher one, and always to owners and moderators. Archived tier channels stay closed (their posts
 * are never moved into General). Used by every path that lists or opens circle posts.
 */
export async function hiddenChannels(db: Executor, userId: string, circleIds: string[]): Promise<Set<string>> {
  if (!circleIds.length) return new Set();
  const gated = await db.select({ id: s.circleChannels.id, circleId: s.circleChannels.circleId, required: s.circleTiers.position })
    .from(s.circleChannels).innerJoin(s.circleTiers, eq(s.circleTiers.id, s.circleChannels.tierId)).where(inArray(s.circleChannels.circleId, circleIds));
  if (!gated.length) return new Set();
  const roles = await db.select({ c: s.groupMembers.groupId, role: s.groupMembers.role }).from(s.groupMembers).where(and(eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active'), inArray(s.groupMembers.groupId, circleIds)));
  const mine = await db.select({ c: s.circleMemberTiers.circleId, pos: s.circleTiers.position }).from(s.circleMemberTiers).innerJoin(s.circleTiers, eq(s.circleTiers.id, s.circleMemberTiers.tierId))
    .where(and(eq(s.circleMemberTiers.userId, userId), inArray(s.circleMemberTiers.circleId, circleIds), isNull(s.circleTiers.archivedAt)));
  const hidden = new Set<string>();
  for (const g of gated) {
    const role = roles.find((r) => r.c === g.circleId)?.role;
    if (role === 'owner' || role === 'moderator') continue;
    const pos = mine.find((m) => m.c === g.circleId)?.pos;
    if (pos === undefined || pos < g.required) hidden.add(g.id);
  }
  return hidden;
}
