import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { notFound } from '../lib/http';
import { notify } from '../lib/notify';
import { awardXp, evaluateAchievements } from '../lib/rewards';

/**
 * Private circles: small groups of people who already know each other.
 * A circle is a `groups` row with kind = 'circle' (always private). Roles:
 * owner (one; can archive and transfer), admin (stored as 'moderator'; manages
 * members and invites), member. Every endpoint checks active membership on the
 * server, and non-members get 404 so circle names are never disclosed.
 */
export const CIRCLE_THEMES = ['dusk', 'saffron', 'monsoon', 'aurora', 'ember', 'jade'] as const;
export const INVITE_TTL_DAYS = 7;
export const INVITE_MAX_USES = 20;
export const MAX_OWNED_CIRCLES = 20;
export const ACTIVATION_MEMBERS = 3;

type Member = typeof s.groupMembers.$inferSelect;

export async function circleMembership(db: Executor, circleId: string, userId: string): Promise<{ circle: typeof s.groups.$inferSelect; member: Member } | null> {
  const [circle] = await db.select().from(s.groups).where(and(eq(s.groups.id, circleId), eq(s.groups.kind, 'circle'), isNull(s.groups.archivedAt)));
  if (!circle) return null;
  const [member] = await db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, circleId), eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active')));
  return member ? { circle, member } : null;
}

export async function requireCircle(db: Executor, circleId: string, userId: string) {
  const m = await circleMembership(db, circleId, userId);
  if (!m) throw notFound('Circle');
  return m;
}

export const isAdmin = (m: Member) => m.role === 'owner' || m.role === 'moderator';

/** Contribution points: circle posts and ritual answers count 1, completed games 5. */
export async function circlePoints(db: Executor, circleId: string): Promise<number> {
  const [posts] = await db.select({ n: sql<number>`count(*)::int` }).from(s.posts).where(and(eq(s.posts.groupId, circleId), isNull(s.posts.deletedAt)));
  const [rituals] = await db.select({ n: sql<number>`count(*)::int` }).from(s.ritualResponses).where(eq(s.ritualResponses.circleKey, circleId));
  const [games] = await db.select({ n: sql<number>`count(*)::int` }).from(s.gameSessions).where(and(eq(s.gameSessions.circleId, circleId), eq(s.gameSessions.status, 'completed')));
  return (posts?.n ?? 0) + (rituals?.n ?? 0) + 5 * (games?.n ?? 0);
}

/** Same as circlePoints for many circles at once (grouped counts, no per-circle queries). */
export async function circlePointsMany(db: Executor, circleIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(circleIds.map((id) => [id, 0]));
  if (!circleIds.length) return out;
  const n = sql<number>`count(*)::int`;
  const add = (rows: { id: string | null; n: number }[], w: number) => { for (const r of rows) if (r.id) out.set(r.id, (out.get(r.id) ?? 0) + w * r.n); };
  add(await db.select({ id: s.posts.groupId, n }).from(s.posts).where(and(inArray(s.posts.groupId, circleIds), isNull(s.posts.deletedAt))).groupBy(s.posts.groupId), 1);
  add(await db.select({ id: s.ritualResponses.circleKey, n }).from(s.ritualResponses).where(inArray(s.ritualResponses.circleKey, circleIds)).groupBy(s.ritualResponses.circleKey), 1);
  add(await db.select({ id: s.gameSessions.circleId, n }).from(s.gameSessions).where(and(inArray(s.gameSessions.circleId, circleIds), eq(s.gameSessions.status, 'completed'))).groupBy(s.gameSessions.circleId), 5);
  return out;
}

/** Members who have contributed anything in the circle (a post, ritual answer or game move). */
export async function contributingMembers(db: Executor, circleId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const r of await db.select({ u: s.posts.authorId }).from(s.posts).where(and(eq(s.posts.groupId, circleId), isNull(s.posts.deletedAt)))) ids.add(r.u);
  for (const r of await db.select({ u: s.ritualResponses.userId }).from(s.ritualResponses).where(eq(s.ritualResponses.circleKey, circleId))) ids.add(r.u);
  for (const r of await db.select({ u: s.gameSubmissions.userId }).from(s.gameSubmissions).innerJoin(s.gameSessions, eq(s.gameSessions.id, s.gameSubmissions.sessionId)).where(eq(s.gameSessions.circleId, circleId))) ids.add(r.u);
  const active = new Set((await db.select({ u: s.groupMembers.userId }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, circleId), eq(s.groupMembers.status, 'active')))).map((r) => r.u));
  return new Set([...ids].filter((id) => active.has(id)));
}

/** Rewards the founder once three members have each contributed (a real, active circle — not just invites). */
export async function checkCircleActivation(ctx: Ctx, db: Executor, circleId: string): Promise<void> {
  const [circle] = await db.select().from(s.groups).where(eq(s.groups.id, circleId));
  if (!circle || circle.kind !== 'circle') return;
  if ((await contributingMembers(db, circleId)).size < ACTIVATION_MEMBERS) return;
  const pts = await awardXp(ctx, db, circle.ownerId, 'circle_activated', { sourceId: circleId });
  if (pts > 0) {
    await track(db, circle.ownerId, 'circle_activated', {});
    await evaluateAchievements(ctx, db, circle.ownerId, ['circles_activated']);
    await notify(ctx, db, { userId: circle.ownerId, category: 'circles', title: `${circle.name} came alive`, body: 'Three members have joined in. You earned founder points.', link: `/circles/${circleId}`, dedupeKey: `circle-activated:${circleId}` });
  }
}

