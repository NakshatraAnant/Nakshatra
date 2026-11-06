import { and, desc, eq, gte, isNull, or } from 'drizzle-orm';
import type { Executor } from '../db/client';
import * as s from '../db/schema';

export interface PlusStatus {
  active: boolean;
  planKey: string | null;
  /** own = you pay for it; shared = you hold a seat on someone else's Duo */
  via: 'own' | 'shared' | null;
  expiresAt: Date | null;
  /** The paid entitlement the benefit comes from (the owner's, for a shared seat). */
  entitlementId: string | null;
  ownerId: string | null;
}

const NONE: PlusStatus = { active: false, planKey: null, via: null, expiresAt: null, entitlementId: null, ownerId: null };

/**
 * The one place that decides whether someone currently has Nakshatra+ benefits.
 * Benefits come only from an entitlement created by a confirmed payment (or an audited admin grant);
 * a Duo seat borrows the owner's entitlement while the owner's subscription is active.
 * Benefits are cosmetic or content — never points, ranking or visibility (no pay-to-win).
 */
export async function plusStatus(db: Executor, userId: string): Promise<PlusStatus> {
  const live = (uid: string) => and(eq(s.entitlements.userId, uid), eq(s.entitlements.kind, 'subscription'), isNull(s.entitlements.revokedAt), or(isNull(s.entitlements.expiresAt), gte(s.entitlements.expiresAt, new Date())));
  const [own] = await db.select().from(s.entitlements).where(live(userId)).orderBy(desc(s.entitlements.expiresAt)).limit(1);
  if (own) return { active: true, planKey: own.refId, via: 'own', expiresAt: own.expiresAt, entitlementId: own.id, ownerId: userId };
  const seats = await db.select({ sub: s.subscriptions }).from(s.subscriptionMembers)
    .innerJoin(s.subscriptions, eq(s.subscriptions.id, s.subscriptionMembers.subscriptionId))
    .where(and(eq(s.subscriptionMembers.userId, userId), isNull(s.subscriptionMembers.endedAt), eq(s.subscriptions.status, 'active')));
  for (const { sub } of seats) {
    const [ent] = await db.select().from(s.entitlements).where(and(live(sub.userId), eq(s.entitlements.refId, sub.planKey))).orderBy(desc(s.entitlements.expiresAt)).limit(1);
    if (ent) return { active: true, planKey: sub.planKey, via: 'shared', expiresAt: ent.expiresAt, entitlementId: ent.id, ownerId: sub.userId };
  }
  return NONE;
}
