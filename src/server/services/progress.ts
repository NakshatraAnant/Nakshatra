import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import * as s from '../db/schema';
import { COLLECTIBLES, levelForXp, type CollectibleDef } from '../../shared/gamification';
import { totalXp } from '../lib/rewards';
import { plusStatus } from './entitlements';

export interface CollectibleState extends CollectibleDef { unlocked: boolean; source: 'earned' | 'subscription' | 'purchased' | null }

/**
 * Server-authoritative unlock state. Earned (level/achievement) and paid
 * (subscription/purchase) unlocks are reported separately so the UI can label
 * them honestly, and so purchases never affect points or levels.
 */
export async function collectibleStates(db: Executor, userId: string): Promise<CollectibleState[]> {
  const level = levelForXp(await totalXp(db, userId)).level;
  const achieved = new Set((await db.select({ k: s.userAchievements.achievementKey }).from(s.userAchievements).where(eq(s.userAchievements.userId, userId))).map((r) => r.k));
  const active = and(eq(s.entitlements.userId, userId), isNull(s.entitlements.revokedAt), or(isNull(s.entitlements.expiresAt), gte(s.entitlements.expiresAt, new Date())));
  const hasPlus = (await plusStatus(db, userId)).active;
  const slugs = [...new Set(COLLECTIBLES.flatMap((c) => (c.unlock.type === 'purchase' ? [c.unlock.productSlug] : [])))];
  const owned = slugs.length
    ? new Set((await db.select({ slug: s.products.slug }).from(s.entitlements).innerJoin(s.products, sql`${s.products.id}::text = ${s.entitlements.refId}`)
      .where(and(active, eq(s.entitlements.kind, 'product'), inArray(s.products.slug, slugs)))).map((r) => r.slug))
    : new Set<string>();
  const seasonClaims = new Set((await db.select({ s: s.seasonClaims.seasonKey, m: s.seasonClaims.milestone }).from(s.seasonClaims).where(and(eq(s.seasonClaims.userId, userId), eq(s.seasonClaims.track, 'free')))).map((r) => `${r.s}:${r.m}`));
  return COLLECTIBLES.map((c) => {
    const u = c.unlock;
    const earned = u.type === 'level' ? level >= u.level : u.type === 'achievement' ? achieved.has(u.key) : u.type === 'season' ? seasonClaims.has(`${u.season}:${u.milestone}`) : false;
    const viaPlus = u.type === 'subscription' && hasPlus;
    const bought = u.type === 'purchase' && owned.has(u.productSlug);
    return { ...c, unlocked: earned || viaPlus || bought, source: earned ? 'earned' : viaPlus ? 'subscription' : bought ? 'purchased' : null };
  });
}

/** Circle level from real contributions (ritual answers, completed games, circle posts). */
export const CIRCLE_LEVELS = [
  { from: 0, name: 'Spark' }, { from: 10, name: 'Campfire' }, { from: 40, name: 'Hearth' }, { from: 100, name: 'Lighthouse' }, { from: 250, name: 'Constellation' },
];
export function circleLevel(points: number) {
  const idx = [...CIRCLE_LEVELS].map((l, i) => ({ ...l, i })).reverse().find((l) => points >= l.from)!;
  const next = CIRCLE_LEVELS[idx.i + 1];
  return { name: idx.name, points, next: next ? { name: next.name, at: next.from } : null };
}
