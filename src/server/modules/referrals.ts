import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { displayNames } from '../services/identity';
import { DEFAULT_MONTHLY_CAP, REFERRAL_WINDOW_DAYS, evaluateReferral } from '../services/referrals';
import { XP_RULES } from '../../shared/gamification';

export async function referralRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/referrals', async (req) => {
    const a = requireAuth(req);
    const [me] = await ctx.db.select({ code: s.users.referralCode }).from(s.users).where(eq(s.users.id, a.userId));
    let rows = await ctx.db.select().from(s.referrals).where(eq(s.referrals.referrerId, a.userId)).orderBy(desc(s.referrals.createdAt)).limit(100);
    // Re-check pending referrals so the history is current.
    if (rows.some((r) => r.status === 'pending')) {
      for (const r of rows.filter((x) => x.status === 'pending')) await evaluateReferral(ctx, ctx.db, r.referredId);
      rows = await ctx.db.select().from(s.referrals).where(eq(s.referrals.referrerId, a.userId)).orderBy(desc(s.referrals.createdAt)).limit(100);
    }
    const names = await displayNames(ctx.db, rows.map((r) => r.referredId));
    return {
      code: me.code,
      link: `${ctx.config.APP_ORIGIN}/signup?ref=${encodeURIComponent(me.code)}`,
      rules: [
        `You earn ${XP_RULES.referral_activated.amount} points when someone joins with your link and, within ${REFERRAL_WINDOW_DAYS} days, verifies their email, discovers their archetype or Cosmic ID, and joins in once (a Thought Drop, ritual answer, game or circle).`,
        'Clicking a link or creating an account alone earns nothing.',
        `Up to ${DEFAULT_MONTHLY_CAP} referral rewards a month. Points are not money and cannot be exchanged for cash.`,
        'We never read your contacts or message anyone for you.',
      ],
      history: rows.map((r) => ({ name: (names.get(r.referredId)?.displayName ?? 'A friend').split(' ')[0], status: r.status, reason: r.decisionReason, points: r.rewardPoints, joinedAt: r.createdAt, decidedAt: r.decidedAt })),
      totals: { approved: rows.filter((r) => r.status === 'approved').length, pending: rows.filter((r) => r.status === 'pending').length, points: rows.reduce((t, r) => t + r.rewardPoints, 0) },
    };
  });
}
