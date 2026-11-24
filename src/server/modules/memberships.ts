import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit } from '../lib/context';
import { requireAuth, requireCapability } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { notify } from '../lib/notify';
import { plusStatus } from '../services/entitlements';

/** Institution email domains accepted for a student request (still reviewed by staff). */
export const STUDENT_DOMAIN = /(\.ac\.in|\.edu|\.edu\.in|\.ac\.uk|\.edu\.au)$/i;

/** Eligibility rules for a plan, checked before any payment is created. */
export async function checkPlanEligibility(db: Executor, userId: string, plan: typeof s.subscriptionPlans.$inferSelect) {
  if (plan.eligibility === 'student') {
    const [v] = await db.select().from(s.studentVerifications).where(and(eq(s.studentVerifications.userId, userId), eq(s.studentVerifications.status, 'approved'), gt(s.studentVerifications.expiresAt, new Date())));
    if (!v) throw forbidden('The student plan needs an approved student verification first.');
  }
  if (plan.seatCap !== null) {
    const [{ n }] = await db.select({ n: sql<number>`count(distinct ${s.subscriptions.userId})::int` }).from(s.subscriptions)
      .where(and(eq(s.subscriptions.planKey, plan.key), inArray(s.subscriptions.status, ['active', 'past_due', 'cancelled'])));
    if (n >= plan.seatCap) throw conflict(`All ${plan.seatCap} founding memberships have been taken.`);
  }
}

async function foundingRemaining(db: Executor, plan: typeof s.subscriptionPlans.$inferSelect) {
  if (plan.seatCap === null) return null;
  const [{ n }] = await db.select({ n: sql<number>`count(distinct ${s.subscriptions.userId})::int` }).from(s.subscriptions)
    .where(and(eq(s.subscriptions.planKey, plan.key), inArray(s.subscriptions.status, ['active', 'past_due', 'cancelled'])));
  return Math.max(0, plan.seatCap - n);
}

export async function membershipRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/membership', async (req) => {
    const a = requireAuth(req);
    const plus = await plusStatus(ctx.db, a.userId);
    const plans = await ctx.db.select().from(s.subscriptionPlans).where(eq(s.subscriptionPlans.active, true));
    const [mine] = await ctx.db.select().from(s.subscriptions).where(and(eq(s.subscriptions.userId, a.userId), inArray(s.subscriptions.status, ['active', 'past_due']))).orderBy(desc(s.subscriptions.createdAt)).limit(1);
    const plan = mine ? plans.find((p) => p.key === mine.planKey) : null;
    const seats = mine && plan && plan.seats > 1 ? await ctx.db.select().from(s.subscriptionMembers).where(and(eq(s.subscriptionMembers.subscriptionId, mine.id), isNull(s.subscriptionMembers.endedAt))) : [];
    const names = seats.filter((x) => x.userId).length ? await ctx.db.select({ userId: s.profiles.userId, name: s.profiles.displayName, handle: s.profiles.handle }).from(s.profiles).where(inArray(s.profiles.userId, seats.flatMap((x) => (x.userId ? [x.userId] : [])))) : [];
    const [student] = await ctx.db.select().from(s.studentVerifications).where(eq(s.studentVerifications.userId, a.userId)).orderBy(desc(s.studentVerifications.createdAt)).limit(1);
    let owner: { name: string } | null = null;
    if (plus.via === 'shared' && plus.ownerId) { const [o] = await ctx.db.select({ name: s.profiles.displayName }).from(s.profiles).where(eq(s.profiles.userId, plus.ownerId)); owner = o ?? null; }
    return {
      plus: { active: plus.active, planKey: plus.planKey, via: plus.via, expiresAt: plus.expiresAt, sharedBy: owner?.name ?? null },
      paymentsEnabled: ctx.config.PAYMENTS_ENABLED === 'true' || ctx.config.PAYMENT_PROVIDER === 'dev_simulator',
      plans: await Promise.all(plans.map(async (p) => ({ key: p.key, name: p.name, description: p.description, pricePaise: p.pricePaise, intervalMonths: p.intervalMonths, benefits: p.benefits, seats: p.seats, eligibility: p.eligibility, founding: p.founding, remaining: await foundingRemaining(ctx.db, p) }))),
      subscription: mine ? { id: mine.id, planKey: mine.planKey, status: mine.status, currentPeriodEnd: mine.currentPeriodEnd, cancelAtPeriodEnd: mine.cancelAtPeriodEnd, lockedPricePaise: mine.lockedPricePaise } : null,
      duo: plan && plan.seats > 1 ? {
        seats: plan.seats,
        members: seats.filter((x) => x.userId).map((x) => { const n = names.find((y) => y.userId === x.userId); return { id: x.id, joinedAt: x.joinedAt, name: n?.name ?? null, handle: n?.handle ?? null }; }),
        pendingInvite: seats.some((x) => !x.userId && x.inviteExpiresAt && x.inviteExpiresAt > new Date()),
      } : null,
      student: student ? { status: student.status, institution: student.institution, note: student.note, expiresAt: student.expiresAt } : null,
      note: 'Benefits are cosmetic and content only. Paying never changes points, levels, ranking or who sees your posts.',
    };
  });

  /** Duo owner creates a one-time invite link (7 days) for the second seat. */
  app.post('/api/v1/membership/duo/invite', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const [sub] = await ctx.db.select({ sub: s.subscriptions, plan: s.subscriptionPlans }).from(s.subscriptions).innerJoin(s.subscriptionPlans, eq(s.subscriptionPlans.key, s.subscriptions.planKey))
      .where(and(eq(s.subscriptions.userId, a.userId), eq(s.subscriptions.status, 'active')));
    if (!sub || sub.plan.seats < 2) throw forbidden('Only an active Duo membership can invite someone.');
    const seats = await ctx.db.select().from(s.subscriptionMembers).where(and(eq(s.subscriptionMembers.subscriptionId, sub.sub.id), isNull(s.subscriptionMembers.endedAt)));
    if (seats.filter((x) => x.userId).length >= sub.plan.seats - 1) throw conflict('Your Duo is full. Remove the current member to invite someone else.');
    // A new link replaces any earlier unused one.
    await ctx.db.update(s.subscriptionMembers).set({ endedAt: new Date(), inviteTokenHash: null }).where(and(eq(s.subscriptionMembers.subscriptionId, sub.sub.id), isNull(s.subscriptionMembers.userId), isNull(s.subscriptionMembers.endedAt)));
    const token = randomToken(24);
    await ctx.db.insert(s.subscriptionMembers).values({ subscriptionId: sub.sub.id, inviteTokenHash: sha256(token), inviteExpiresAt: new Date(Date.now() + 7 * 864e5) });
    await audit(ctx.db, { actorId: a.userId, action: 'membership.duo_invite', targetType: 'subscription', targetId: sub.sub.id });
    return { link: `${ctx.config.APP_ORIGIN}/membership/join/${token}`, expiresInDays: 7 };
  });

  app.post('/api/v1/membership/duo/join', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before joining a Duo.');
    const { token } = parse(z.object({ token: z.string().min(16).max(80) }), req.body);
    return ctx.db.transaction(async (tx) => {
      const [seat] = await tx.select({ m: s.subscriptionMembers, sub: s.subscriptions }).from(s.subscriptionMembers).innerJoin(s.subscriptions, eq(s.subscriptions.id, s.subscriptionMembers.subscriptionId))
        .where(and(eq(s.subscriptionMembers.inviteTokenHash, sha256(token)), isNull(s.subscriptionMembers.userId), isNull(s.subscriptionMembers.endedAt), gt(s.subscriptionMembers.inviteExpiresAt, new Date())));
      if (!seat || seat.sub.status !== 'active') throw notFound('Invite');
      if (seat.sub.userId === a.userId) throw badRequest('This is your own Duo invite — send it to the person you want to share with.');
      const current = await plusStatus(tx, a.userId);
      if (current.active) throw conflict('You already have Nakshatra+. Cancel your own membership before joining a Duo.');
      const claimed = await tx.update(s.subscriptionMembers).set({ userId: a.userId, joinedAt: new Date(), inviteTokenHash: null })
        .where(and(eq(s.subscriptionMembers.id, seat.m.id), isNull(s.subscriptionMembers.userId))).returning();
      if (!claimed.length) throw conflict('That invite was just used.');
      await audit(tx, { actorId: a.userId, action: 'membership.duo_joined', targetType: 'subscription', targetId: seat.sub.id });
      await notify(ctx, tx, { userId: seat.sub.userId, category: 'orders', title: 'Someone joined your Duo membership', link: '/membership' });
      return { ok: true };
    });
  });

  /** Owner removes a member, or a member leaves. Benefits stop immediately. */
  app.post('/api/v1/membership/duo/members/:id/end', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [row] = await ctx.db.select({ m: s.subscriptionMembers, sub: s.subscriptions }).from(s.subscriptionMembers).innerJoin(s.subscriptions, eq(s.subscriptions.id, s.subscriptionMembers.subscriptionId)).where(eq(s.subscriptionMembers.id, id));
    if (!row || (row.sub.userId !== a.userId && row.m.userId !== a.userId)) throw notFound('Member');
    await ctx.db.update(s.subscriptionMembers).set({ endedAt: new Date() }).where(and(eq(s.subscriptionMembers.id, id), isNull(s.subscriptionMembers.endedAt)));
    await audit(ctx.db, { actorId: a.userId, action: row.sub.userId === a.userId ? 'membership.duo_removed' : 'membership.duo_left', targetType: 'subscription', targetId: row.sub.id });
    return { ok: true };
  });

  app.post('/api/v1/membership/duo/leave', async (req) => {
    const a = requireAuth(req);
    const ended = await ctx.db.update(s.subscriptionMembers).set({ endedAt: new Date() }).where(and(eq(s.subscriptionMembers.userId, a.userId), isNull(s.subscriptionMembers.endedAt))).returning();
    if (!ended.length) throw notFound('Duo membership');
    return { ok: true };
  });

  /** Student plan: request with a verified institution email; staff approve. */
  app.post('/api/v1/membership/student', { config: { rateLimit: { max: 5, timeWindow: '1 day' } } }, async (req) => {
    const a = requireAuth(req);
    const { institution } = parse(z.object({ institution: z.string().trim().min(3).max(120) }), req.body);
    if (!a.emailVerified) throw forbidden('Verify your email first.');
    const domain = a.email.split('@')[1]?.toLowerCase() ?? '';
    if (!STUDENT_DOMAIN.test(domain)) throw badRequest('Use an account whose verified email is from your institution (for example name@college.ac.in).');
    const [open] = await ctx.db.select().from(s.studentVerifications).where(and(eq(s.studentVerifications.userId, a.userId), inArray(s.studentVerifications.status, ['pending'])));
    if (open) throw conflict('Your request is already being reviewed.');
    const [v] = await ctx.db.insert(s.studentVerifications).values({ userId: a.userId, institution, emailDomain: domain }).returning();
    return { request: { status: v.status, institution: v.institution } };
  });

  app.get('/api/v1/admin/student-verifications', async (req) => {
    requireCapability(req, 'support');
    const rows = await ctx.db.select({ v: s.studentVerifications, name: s.profiles.displayName }).from(s.studentVerifications).innerJoin(s.profiles, eq(s.profiles.userId, s.studentVerifications.userId))
      .where(eq(s.studentVerifications.status, 'pending')).orderBy(s.studentVerifications.createdAt).limit(100);
    return { requests: rows.map((r) => ({ id: r.v.id, name: r.name, institution: r.v.institution, emailDomain: r.v.emailDomain, createdAt: r.v.createdAt })) };
  });

  app.post('/api/v1/admin/student-verifications/:id', async (req) => {
    const a = requireCapability(req, 'support');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { decision, note } = parse(z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(300).default('') }), req.body);
    const [v] = await ctx.db.update(s.studentVerifications).set({ status: decision, note, reviewerId: a.userId, decidedAt: new Date(), expiresAt: decision === 'approved' ? new Date(Date.now() + 365 * 864e5) : null })
      .where(and(eq(s.studentVerifications.id, id), eq(s.studentVerifications.status, 'pending'))).returning();
    if (!v) throw notFound('Request');
    await audit(ctx.db, { actorId: a.userId, action: `student_verification.${decision}`, targetType: 'user', targetId: v.userId });
    await notify(ctx, ctx.db, { userId: v.userId, category: 'orders', title: decision === 'approved' ? 'Student plan unlocked' : 'Student request not approved', body: note || undefined, link: '/membership' });
    return { ok: true };
  });
}
