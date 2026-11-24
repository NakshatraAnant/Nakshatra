import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { awardXp } from '../lib/rewards';
import { notify } from '../lib/notify';
import { XP_RULES } from '../../shared/gamification';

/**
 * Refer-and-earn rules (referrals-v1).
 *
 * A referral is recorded at signup with a valid code (status `pending`). It is
 * approved — and the referrer earns points — only when, within 30 days of signup,
 * the referred person has (1) verified their email, (2) discovered an identity
 * (personality assessment or Cosmic ID), and (3) done one social action: a Thought
 * Drop, a ritual answer, a completed game, or joining a circle.
 *
 * It is rejected when the accounts look like the same person (same canonical
 * email), and held as `pending` with a reason once the referrer reaches the monthly
 * cap (platform setting `referral_monthly_cap`, default 10). Clicking a link or
 * creating an account alone never earns anything. No cash value is attached.
 */
export const REFERRAL_WINDOW_DAYS = 30;
export const DEFAULT_MONTHLY_CAP = 10;

/** Lower-cases and removes +tags (and dots for Gmail) so obvious aliases match. */
export function canonicalEmail(email: string): string {
  const [local, domain = ''] = email.toLowerCase().trim().split('@');
  const base = local.split('+')[0];
  const d = domain === 'googlemail.com' ? 'gmail.com' : domain;
  return `${d === 'gmail.com' ? base.replace(/\./g, '') : base}@${d}`;
}

async function hasSocialAction(db: Executor, userId: string, since: Date): Promise<boolean> {
  const n = sql<number>`count(*)::int`;
  const checks = [
    db.select({ n }).from(s.posts).where(and(eq(s.posts.authorId, userId), gte(s.posts.createdAt, since), isNull(s.posts.deletedAt))),
    db.select({ n }).from(s.ritualResponses).where(and(eq(s.ritualResponses.userId, userId), gte(s.ritualResponses.createdAt, since))),
    db.select({ n }).from(s.xpLedger).where(and(eq(s.xpLedger.userId, userId), eq(s.xpLedger.rule, 'game_completed'))),
    db.select({ n }).from(s.groupMembers).innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId)).where(and(eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active'), eq(s.groups.kind, 'circle'))),
  ];
  for (const q of checks) if (((await q)[0]?.n ?? 0) > 0) return true;
  return false;
}

export async function evaluateReferral(ctx: Ctx, db: Executor, referredId: string): Promise<'approved' | 'pending' | 'rejected' | 'none'> {
  const [ref] = await db.select().from(s.referrals).where(eq(s.referrals.referredId, referredId));
  if (!ref || ref.status !== 'pending') return ref ? (ref.status as 'approved' | 'rejected') : 'none';
  const [referred] = await db.select().from(s.users).where(eq(s.users.id, referredId));
  const [referrer] = await db.select().from(s.users).where(eq(s.users.id, ref.referrerId));
  if (!referred || !referrer) return 'none';
  const decide = async (status: 'approved' | 'rejected' | 'pending', reason: string, points = 0) => {
    await db.update(s.referrals).set({ status, decisionReason: reason, decidedAt: status === 'pending' ? null : new Date(), rewardPoints: points }).where(eq(s.referrals.id, ref.id));
  };
  if (referrer.id === referred.id || canonicalEmail(referrer.email) === canonicalEmail(referred.email)) {
    await decide('rejected', 'Self-referral');
    return 'rejected';
  }
  const deadline = new Date(referred.createdAt.getTime() + REFERRAL_WINDOW_DAYS * 86400000);
  // A referral already held back only by the monthly cap was activated in time; the window no longer applies.
  const heldByCap = ref.decisionReason?.startsWith('Monthly referral reward limit') ?? false;
  if (!heldByCap && new Date() > deadline) {
    await decide('rejected', `Not activated within ${REFERRAL_WINDOW_DAYS} days`);
    return 'rejected';
  }
  if (!referred.emailVerifiedAt) return 'pending';
  const [assessment] = await db.select({ id: s.assessmentResults.id }).from(s.assessmentResults).where(eq(s.assessmentResults.userId, referredId)).limit(1);
  const [birth] = await db.select({ id: s.birthProfiles.id }).from(s.birthProfiles).where(eq(s.birthProfiles.userId, referredId)).limit(1);
  if (!assessment && !birth) return 'pending';
  if (!(await hasSocialAction(db, referredId, referred.createdAt))) return 'pending';
  const [capRow] = await db.select().from(s.platformSettings).where(eq(s.platformSettings.key, 'referral_monthly_cap'));
  const cap = typeof capRow?.value === 'number' ? capRow.value : DEFAULT_MONTHLY_CAP;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.referrals).where(and(eq(s.referrals.referrerId, referrer.id), eq(s.referrals.status, 'approved'), gte(s.referrals.decidedAt, monthStart)));
  if (n >= cap) {
    await decide('pending', 'Monthly referral reward limit reached; it will be reviewed next month');
    return 'pending';
  }
  const points = await awardXp(ctx, db, referrer.id, 'referral_activated', { sourceId: referredId });
  await decide('approved', 'Activated: verified, identity discovered and first social action', points || XP_RULES.referral_activated.amount);
  await track(db, referrer.id, 'referral_approved', {});
  await notify(ctx, db, { userId: referrer.id, category: 'system', title: 'A friend you invited joined in', body: `You earned ${XP_RULES.referral_activated.amount} points.`, link: '/invite', dedupeKey: `referral:${referredId}` });
  return 'approved';
}
