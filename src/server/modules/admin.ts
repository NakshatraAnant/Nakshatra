import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql, ne } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, EVENT_TAXONOMY } from '../lib/context';
import { badRequest, conflict, notFound, parse } from '../lib/http';
import { requireCapability, type Role } from '../lib/auth';
import { notify } from '../lib/notify';
import { approveRefund, rejectRefund, requestRefund } from '../lib/payments';
import { createStorage } from '../lib/storage';
import { setSetting, getSetting } from '../services/settings';
import { displayNames } from '../services/identity';
import { deleteAccount } from './account';
import { refreshRules } from '../services/content';

const ROLES: Role[] = ['admin', 'moderator', 'support', 'expert', 'creator', 'vendor', 'seller'];

export async function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = createStorage(ctx);
  const ip = (req: { ip: string }) => req.ip;

  /* ---------- Overview ---------- */
  app.get('/api/v1/admin/overview', async (req) => {
    requireCapability(req, 'users.view');
    const n = sql<number>`count(*)::int`;
    const [users] = await ctx.db.select({ n }).from(s.users).where(ne(s.users.status, 'deleted'));
    const [openReports] = await ctx.db.select({ n }).from(s.reports).where(eq(s.reports.status, 'open'));
    const [pendingVerif] = await ctx.db.select({ n }).from(s.verificationRequests).where(eq(s.verificationRequests.status, 'pending'));
    const [refundsPending] = await ctx.db.select({ n }).from(s.refunds).where(eq(s.refunds.status, 'requested'));
    const [disputesOpen] = await ctx.db.select({ n }).from(s.disputes).where(eq(s.disputes.status, 'open'));
    const [tickets] = await ctx.db.select({ n }).from(s.supportTickets).where(eq(s.supportTickets.status, 'open'));
    const [coursesReview] = await ctx.db.select({ n }).from(s.courses).where(eq(s.courses.status, 'in_review'));
    const [productsDraft] = await ctx.db.select({ n }).from(s.products).where(and(eq(s.products.status, 'draft'), sql`${s.products.sellerId} is not null`));
    const [appealsOpen] = await ctx.db.select({ n }).from(s.appeals).where(eq(s.appeals.status, 'open'));
    return { users: users.n, queues: { openReports: openReports.n, pendingVerification: pendingVerif.n, refundsPending: refundsPending.n, disputesOpen: disputesOpen.n, openTickets: tickets.n, coursesInReview: coursesReview.n, productsAwaitingReview: productsDraft.n, appealsOpen: appealsOpen.n } };
  });

  /* ---------- Users ---------- */
  app.get('/api/v1/admin/users', async (req) => {
    requireCapability(req, 'users.view');
    const { q, status } = parse(z.object({ q: z.string().max(80).optional(), status: z.enum(['active', 'suspended', 'deleted']).optional() }), req.query);
    const rows = await ctx.db.select({ id: s.users.id, email: s.users.email, status: s.users.status, createdAt: s.users.createdAt, emailVerifiedAt: s.users.emailVerifiedAt, handle: s.profiles.handle, displayName: s.profiles.displayName })
      .from(s.users).leftJoin(s.profiles, eq(s.profiles.userId, s.users.id))
      .where(and(status ? eq(s.users.status, status) : undefined, q ? sql`(${s.users.email} ilike ${'%' + q + '%'} or ${s.profiles.handle} ilike ${'%' + q + '%'} or ${s.profiles.displayName} ilike ${'%' + q + '%'})` : undefined))
      .orderBy(desc(s.users.createdAt)).limit(100);
    const roles = rows.length ? await ctx.db.select().from(s.userRoles).where(inArray(s.userRoles.userId, rows.map((r) => r.id))) : [];
    return { users: rows.map((u) => ({ ...u, roles: roles.filter((r) => r.userId === u.id).map((r) => r.role) })) };
  });

  /** Admin user detail intentionally excludes birth date/time/place. */
  app.get('/api/v1/admin/users/:id', async (req) => {
    const a = requireCapability(req, 'users.view');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [u] = await ctx.db.select({ id: s.users.id, email: s.users.email, status: s.users.status, suspendedReason: s.users.suspendedReason, createdAt: s.users.createdAt, mfaEnabled: s.users.mfaEnabled, emailVerifiedAt: s.users.emailVerifiedAt }).from(s.users).where(eq(s.users.id, id));
    if (!u) throw notFound('User');
    const [p] = await ctx.db.select({ handle: s.profiles.handle, displayName: s.profiles.displayName, visibility: s.profiles.visibility }).from(s.profiles).where(eq(s.profiles.userId, id));
    const roles = await ctx.db.select().from(s.userRoles).where(eq(s.userRoles.userId, id));
    const reports = await ctx.db.select().from(s.reports).where(eq(s.reports.targetUserId, id)).orderBy(desc(s.reports.createdAt)).limit(20);
    const actions = await ctx.db.select().from(s.moderationActions).where(eq(s.moderationActions.targetId, id)).orderBy(desc(s.moderationActions.createdAt));
    const [hasBirth] = await ctx.db.select({ id: s.birthProfiles.id }).from(s.birthProfiles).where(and(eq(s.birthProfiles.userId, id), eq(s.birthProfiles.isPrimary, true)));
    await audit(ctx.db, { actorId: a.userId, action: 'admin.user_viewed', targetType: 'user', targetId: id, ip: ip(req) });
    return { user: u, profile: p, roles: roles.map((r) => r.role), reports, moderationActions: actions, hasBirthProfile: Boolean(hasBirth), note: 'Birth details are not shown in the admin console.' };
  });

  app.post('/api/v1/admin/users/:id/status', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status, reason, confirm } = parse(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().min(5).max(500), confirm: z.literal(true) }), req.body);
    void confirm;
    if (id === a.userId) throw badRequest('You cannot change your own account status.');
    const targetRoles = await ctx.db.select().from(s.userRoles).where(eq(s.userRoles.userId, id));
    if (targetRoles.some((r) => r.role === 'admin') && !a.roles.includes('admin')) throw badRequest('Only administrators can moderate administrators.');
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.users).set({ status, suspendedReason: status === 'suspended' ? reason : null }).where(eq(s.users.id, id));
      if (status === 'suspended') await tx.update(s.sessions).set({ revokedAt: new Date() }).where(and(eq(s.sessions.userId, id), isNull(s.sessions.revokedAt)));
      await tx.insert(s.moderationActions).values({ moderatorId: a.userId, action: status === 'suspended' ? 'suspend_user' : 'unsuspend_user', targetType: 'user', targetId: id, reason });
      await audit(tx, { actorId: a.userId, action: `admin.user_${status}`, targetType: 'user', targetId: id, meta: { reason }, ip: ip(req) });
    });
    await notify(ctx, ctx.db, { userId: id, category: 'security', title: status === 'suspended' ? 'Your account has been suspended' : 'Your account has been restored', body: reason, link: '/settings/appeals' });
    return { ok: true };
  });

  app.post('/api/v1/admin/users/:id/roles', async (req) => {
    const a = requireCapability(req, 'users.manage');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { role, grant } = parse(z.object({ role: z.enum(ROLES as [Role, ...Role[]]), grant: z.boolean() }), req.body);
    if (id === a.userId && role === 'admin' && !grant) throw badRequest('You cannot remove your own admin role.');
    if (grant) await ctx.db.insert(s.userRoles).values({ userId: id, role, grantedBy: a.userId }).onConflictDoNothing();
    else await ctx.db.delete(s.userRoles).where(and(eq(s.userRoles.userId, id), eq(s.userRoles.role, role)));
    await audit(ctx.db, { actorId: a.userId, action: grant ? 'admin.role_grant' : 'admin.role_revoke', targetType: 'user', targetId: id, meta: { role }, ip: ip(req) });
    return { ok: true };
  });

  /* ---------- Moderation ---------- */
  app.get('/api/v1/admin/reports', async (req) => {
    requireCapability(req, 'moderation');
    const { queue, status } = parse(z.object({ queue: z.enum(['general', 'dating_safety', 'marketplace']).optional(), status: z.enum(['open', 'in_review', 'actioned', 'dismissed']).default('open') }), req.query);
    const rows = await ctx.db.select().from(s.reports).where(and(eq(s.reports.status, status), queue ? eq(s.reports.queue, queue) : undefined)).orderBy(asc(s.reports.priority), asc(s.reports.createdAt)).limit(100);
    const names = await displayNames(ctx.db, rows.flatMap((r) => [r.reporterId, r.targetUserId].filter(Boolean) as string[]));
    const out = [];
    for (const r of rows) {
      let preview: string | null = null;
      if (r.targetType === 'post') preview = (await ctx.db.select({ b: s.posts.body }).from(s.posts).where(eq(s.posts.id, r.targetId)))[0]?.b ?? null;
      if (r.targetType === 'comment') preview = (await ctx.db.select({ b: s.comments.body }).from(s.comments).where(eq(s.comments.id, r.targetId)))[0]?.b ?? null;
      if (r.targetType === 'message') preview = (await ctx.db.select({ b: s.messages.body }).from(s.messages).where(eq(s.messages.id, r.targetId)))[0]?.b ?? null;
      if (r.targetType === 'dating_profile') preview = (await ctx.db.select({ b: s.datingProfiles.bio }).from(s.datingProfiles).where(eq(s.datingProfiles.userId, r.targetId)))[0]?.b ?? null;
      const [{ priorReports }] = r.targetUserId ? await ctx.db.select({ priorReports: sql<number>`count(*)::int` }).from(s.reports).where(eq(s.reports.targetUserId, r.targetUserId)) : [{ priorReports: 0 }];
      out.push({ ...r, reporter: names.get(r.reporterId), targetUser: r.targetUserId ? names.get(r.targetUserId) : null, preview, priorReports });
    }
    return { reports: out };
  });

  app.post('/api/v1/admin/reports/:id/action', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { action, reason } = parse(z.object({ action: z.enum(['hide_content', 'warn_user', 'suspend_user', 'remove_from_dating', 'dismiss']), reason: z.string().min(3).max(500) }), req.body);
    const [r] = await ctx.db.select().from(s.reports).where(eq(s.reports.id, id));
    if (!r) throw notFound('Report');
    if (['actioned', 'dismissed'].includes(r.status)) throw conflict('This report has already been resolved.');
    await ctx.db.transaction(async (tx) => {
      if (action === 'hide_content') {
        if (r.targetType === 'post') await tx.update(s.posts).set({ hiddenByModeration: true }).where(eq(s.posts.id, r.targetId));
        else if (r.targetType === 'comment') await tx.update(s.comments).set({ hiddenByModeration: true }).where(eq(s.comments.id, r.targetId));
        else if (r.targetType === 'message') await tx.update(s.messages).set({ deletedAt: new Date() }).where(eq(s.messages.id, r.targetId));
        else if (r.targetType === 'review') await tx.update(s.reviews).set({ status: 'hidden' }).where(eq(s.reviews.id, r.targetId));
        else throw badRequest('This target type cannot be hidden; choose another action.');
      }
      if (action === 'suspend_user' && r.targetUserId) {
        await tx.update(s.users).set({ status: 'suspended', suspendedReason: reason }).where(eq(s.users.id, r.targetUserId));
        await tx.update(s.sessions).set({ revokedAt: new Date() }).where(and(eq(s.sessions.userId, r.targetUserId), isNull(s.sessions.revokedAt)));
      }
      if (action === 'remove_from_dating' && r.targetUserId) await tx.update(s.datingProfiles).set({ suspendedAt: new Date(), active: false }).where(eq(s.datingProfiles.userId, r.targetUserId));
      await tx.update(s.reports).set({ status: action === 'dismiss' ? 'dismissed' : 'actioned', resolution: `${action}: ${reason}`, resolvedAt: new Date(), assignedTo: a.userId }).where(eq(s.reports.id, id));
      await tx.insert(s.moderationActions).values({ reportId: id, moderatorId: a.userId, action, targetType: action === 'suspend_user' || action === 'warn_user' || action === 'remove_from_dating' ? 'user' : r.targetType, targetId: action === 'suspend_user' || action === 'warn_user' || action === 'remove_from_dating' ? r.targetUserId ?? r.targetId : r.targetId, reason });
      await audit(tx, { actorId: a.userId, action: `moderation.${action}`, targetType: 'report', targetId: id, meta: { reason }, ip: ip(req) });
    });
    if (action !== 'dismiss' && r.targetUserId) await notify(ctx, ctx.db, { userId: r.targetUserId, category: 'security', title: action === 'warn_user' ? 'A warning about community guidelines' : 'A moderation action was taken on your account', body: reason, link: '/settings/appeals' });
    await notify(ctx, ctx.db, { userId: r.reporterId, category: 'system', title: 'Update on your report', body: action === 'dismiss' ? 'We reviewed your report and found no violation.' : 'We reviewed your report and took action. Thank you.' });
    return { ok: true };
  });

  app.get('/api/v1/admin/appeals', async (req) => {
    requireCapability(req, 'moderation');
    const rows = await ctx.db.select().from(s.appeals).where(eq(s.appeals.status, 'open')).orderBy(asc(s.appeals.createdAt));
    const names = await displayNames(ctx.db, rows.map((r) => r.userId));
    return { appeals: rows.map((r) => ({ ...r, user: names.get(r.userId) })) };
  });

  app.post('/api/v1/admin/appeals/:id/decide', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { decision, note } = parse(z.object({ decision: z.enum(['upheld', 'overturned']), note: z.string().min(3).max(1000) }), req.body);
    const [pending] = await ctx.db.select().from(s.appeals).where(and(eq(s.appeals.id, id), eq(s.appeals.status, 'open')));
    if (!pending) throw notFound('Appeal');
    if (pending.moderationActionId) {
      const [orig] = await ctx.db.select().from(s.moderationActions).where(eq(s.moderationActions.id, pending.moderationActionId));
      // Independence rule: the moderator who took the action may not decide its appeal.
      if (orig?.moderatorId === a.userId) throw badRequest('Another moderator must review appeals against your own actions.');
    }
    const [ap] = await ctx.db.update(s.appeals).set({ status: decision, decidedBy: a.userId, decisionNote: note }).where(and(eq(s.appeals.id, id), eq(s.appeals.status, 'open'))).returning();
    if (!ap) throw notFound('Appeal');
    if (decision === 'overturned') {
      await ctx.db.update(s.users).set({ status: 'active', suspendedReason: null }).where(and(eq(s.users.id, ap.userId), eq(s.users.status, 'suspended')));
      await ctx.db.update(s.datingProfiles).set({ suspendedAt: null }).where(eq(s.datingProfiles.userId, ap.userId));
    }
    await audit(ctx.db, { actorId: a.userId, action: `appeal.${decision}`, targetType: 'appeal', targetId: id, meta: { note }, ip: ip(req) });
    await notify(ctx, ctx.db, { userId: ap.userId, category: 'security', title: `Your appeal was ${decision === 'overturned' ? 'accepted' : 'reviewed'}`, body: note });
    return { ok: true };
  });

  /* ---------- Verification ---------- */
  app.get('/api/v1/admin/verifications', async (req) => {
    requireCapability(req, 'verification');
    const { kind } = parse(z.object({ kind: z.enum(['dating', 'matchmaking', 'expert', 'vendor', 'seller', 'creator']).optional() }), req.query);
    const rows = await ctx.db.select().from(s.verificationRequests).where(and(eq(s.verificationRequests.status, 'pending'), kind ? eq(s.verificationRequests.kind, kind) : undefined)).orderBy(asc(s.verificationRequests.createdAt));
    const names = await displayNames(ctx.db, rows.map((r) => r.userId));
    const out = [];
    for (const r of rows) {
      const extra = r.kind === 'expert' ? { expert: (await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, r.userId)))[0], credentials: await ctx.db.select().from(s.expertCredentials).where(eq(s.expertCredentials.expertId, r.userId)) }
        : r.kind === 'vendor' ? { vendors: await ctx.db.select().from(s.vendors).where(and(eq(s.vendors.ownerId, r.userId), eq(s.vendors.verificationStatus, 'pending'))) } : {};
      out.push({ ...r, user: names.get(r.userId), evidenceCount: (r.evidence as string[]).length, ...extra });
    }
    return { requests: out };
  });

  app.get('/api/v1/admin/verifications/:id/evidence/:index', async (req, reply) => {
    const a = requireCapability(req, 'verification');
    const { id, index } = parse(z.object({ id: z.uuid(), index: z.coerce.number().int().min(0) }), req.params);
    const [r] = await ctx.db.select().from(s.verificationRequests).where(eq(s.verificationRequests.id, id));
    const path = (r?.evidence as string[] | undefined)?.[index];
    if (!path) throw notFound('Evidence');
    const [u] = await ctx.db.select().from(s.uploads).where(eq(s.uploads.path, path));
    await audit(ctx.db, { actorId: a.userId, action: 'verification.evidence_viewed', targetType: 'verification', targetId: id, ip: ip(req) });
    reply.header('content-type', u?.mime ?? 'application/octet-stream').header('cache-control', 'no-store');
    return reply.send(await storage.read(path));
  });

  app.post('/api/v1/admin/verifications/:id/decide', async (req) => {
    const a = requireCapability(req, 'verification');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { approve, note } = parse(z.object({ approve: z.boolean(), note: z.string().min(3).max(1000) }), req.body);
    const [r] = await ctx.db.select().from(s.verificationRequests).where(and(eq(s.verificationRequests.id, id), eq(s.verificationRequests.status, 'pending')));
    if (!r) throw notFound('Verification request');
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.verificationRequests).set({ status: approve ? 'approved' : 'rejected', reviewerId: a.userId, reviewNote: note, reviewedAt: new Date() }).where(eq(s.verificationRequests.id, id));
      const st = approve ? 'verified' : 'rejected';
      if (r.kind === 'dating') await tx.update(s.datingProfiles).set({ verification: st }).where(eq(s.datingProfiles.userId, r.userId));
      if (r.kind === 'matchmaking') await tx.update(s.matchmakingProfiles).set({ verification: st }).where(eq(s.matchmakingProfiles.userId, r.userId));
      if (r.kind === 'expert') {
        await tx.update(s.expertProfiles).set({ verificationStatus: st, verifiedAt: approve ? new Date() : null }).where(eq(s.expertProfiles.userId, r.userId));
        await tx.update(s.expertCredentials).set({ status: approve ? 'verified' : 'rejected', reviewedBy: a.userId }).where(and(eq(s.expertCredentials.expertId, r.userId), eq(s.expertCredentials.status, 'pending')));
        if (approve) await tx.insert(s.userRoles).values({ userId: r.userId, role: 'expert', grantedBy: a.userId }).onConflictDoNothing();
      }
      if (r.kind === 'vendor') {
        await tx.update(s.vendors).set({ verificationStatus: st }).where(and(eq(s.vendors.ownerId, r.userId), eq(s.vendors.verificationStatus, 'pending')));
        if (approve) await tx.insert(s.userRoles).values({ userId: r.userId, role: 'vendor', grantedBy: a.userId }).onConflictDoNothing();
      }
      if ((r.kind === 'creator' || r.kind === 'seller') && approve) await tx.insert(s.userRoles).values({ userId: r.userId, role: r.kind, grantedBy: a.userId }).onConflictDoNothing();
      await audit(tx, { actorId: a.userId, action: `verification.${approve ? 'approve' : 'reject'}`, targetType: 'verification', targetId: id, meta: { kind: r.kind, note }, ip: ip(req) });
    });
    await notify(ctx, ctx.db, { userId: r.userId, category: 'system', title: approve ? 'Verification approved' : 'Verification not approved', body: note });
    return { ok: true };
  });

  /* ---------- Bookings, disputes, refunds, payouts ---------- */
  app.get('/api/v1/admin/bookings', async (req) => {
    requireCapability(req, 'refunds');
    const rows = await ctx.db.select().from(s.bookings).orderBy(desc(s.bookings.createdAt)).limit(200);
    return { bookings: rows };
  });

  app.get('/api/v1/admin/disputes', async (req) => {
    requireCapability(req, 'refunds');
    const rows = await ctx.db.select().from(s.disputes).orderBy(desc(s.disputes.createdAt)).limit(200);
    return { disputes: rows };
  });

  app.post('/api/v1/admin/disputes/:id/resolve', async (req) => {
    const a = requireCapability(req, 'refunds');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { outcome, resolution, refundPaise } = parse(z.object({ outcome: z.enum(['resolved_refund', 'resolved_no_refund']), resolution: z.string().min(5).max(2000), refundPaise: z.number().int().positive().optional() }), req.body);
    const [d] = await ctx.db.select().from(s.disputes).where(and(eq(s.disputes.id, id), inArray(s.disputes.status, ['open', 'investigating'])));
    if (!d) throw notFound('Dispute');
    let refund = null;
    if (outcome === 'resolved_refund') {
      let paymentId: string | null = null;
      let amount = refundPaise ?? 0;
      if (d.subjectType === 'booking') {
        const [b] = await ctx.db.select().from(s.bookings).where(eq(s.bookings.id, d.subjectId));
        paymentId = b?.paymentId ?? null;
        amount = refundPaise ?? b?.pricePaise ?? 0;
      }
      if (!paymentId) throw badRequest('No payment is linked to this dispute.');
      const r = await requestRefund(ctx, ctx.db, { paymentId, amountPaise: amount, reason: `Dispute resolution: ${resolution}`, requestedBy: a.userId, idempotencyKey: `dispute:${id}` });
      refund = await approveRefund(ctx, r.id, a.userId);
    }
    await ctx.db.update(s.disputes).set({ status: outcome, resolution, resolvedBy: a.userId, resolvedAt: new Date() }).where(eq(s.disputes.id, id));
    if (d.subjectType === 'booking') await ctx.db.update(s.bookings).set({ status: outcome === 'resolved_refund' ? 'refunded' : 'completed' }).where(and(eq(s.bookings.id, d.subjectId), eq(s.bookings.status, 'disputed')));
    await audit(ctx.db, { actorId: a.userId, action: `dispute.${outcome}`, targetType: 'dispute', targetId: id, meta: { refundPaise }, ip: ip(req) });
    await notify(ctx, ctx.db, { userId: d.raisedBy, category: 'bookings', title: 'Your dispute has been resolved', body: resolution });
    return { ok: true, refund };
  });

  app.get('/api/v1/admin/refunds', async (req) => {
    requireCapability(req, 'refunds');
    const { status } = parse(z.object({ status: z.enum(['requested', 'approved', 'processing', 'succeeded', 'rejected', 'failed']).optional() }), req.query);
    const rows = await ctx.db.select({ r: s.refunds, p: s.payments }).from(s.refunds).innerJoin(s.payments, eq(s.payments.id, s.refunds.paymentId)).where(status ? eq(s.refunds.status, status) : undefined).orderBy(desc(s.refunds.createdAt)).limit(200);
    return { refunds: rows.map((x) => ({ ...x.r, payment: { id: x.p.id, purpose: x.p.purpose, purposeId: x.p.purposeId, amountPaise: x.p.amountPaise, refundedPaise: x.p.refundedPaise, status: x.p.status, provider: x.p.provider } })) };
  });

  app.post('/api/v1/admin/refunds/:id/decide', async (req) => {
    const a = requireCapability(req, 'refunds');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { approve, note } = parse(z.object({ approve: z.boolean(), note: z.string().min(3).max(500) }), req.body);
    const r = approve ? await approveRefund(ctx, id, a.userId) : await rejectRefund(ctx, id, a.userId, note);
    const [p] = await ctx.db.select().from(s.payments).where(eq(s.payments.id, r.paymentId));
    if (!approve) await notify(ctx, ctx.db, { userId: p.userId, category: 'orders', title: 'Your refund request was not approved', body: note });
    return { refund: r };
  });

  app.post('/api/v1/admin/payouts/generate', async (req) => {
    const a = requireCapability(req, 'refunds');
    const { periodEnd } = parse(z.object({ periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
    const end = DateTime.fromISO(periodEnd).endOf('day').toJSDate();
    const paidItems = await ctx.db.select({ items: s.payouts.items }).from(s.payouts).where(eq(s.payouts.payeeType, 'expert'));
    const alreadyPaid = new Set(paidItems.flatMap((p) => p.items as string[]));
    const done = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.status, 'completed'), lt(s.bookings.completedAt, end)));
    const byExpert = new Map<string, { amount: number; ids: string[] }>();
    for (const b of done.filter((x) => !alreadyPaid.has(x.id))) {
      const e = byExpert.get(b.expertId) ?? { amount: 0, ids: [] };
      e.amount += b.expertEarningsPaise;
      e.ids.push(b.id);
      byExpert.set(b.expertId, e);
    }
    const created = [];
    for (const [expertId, e] of byExpert) {
      const [p] = await ctx.db.insert(s.payouts).values({ payeeId: expertId, payeeType: 'expert', amountPaise: e.amount, periodStart: '2000-01-01', periodEnd, items: e.ids }).returning();
      created.push(p);
    }
    await audit(ctx.db, { actorId: a.userId, action: 'payouts.generate', meta: { count: created.length, periodEnd }, ip: ip(req) });
    return { payouts: created, note: ctx.config.PAYMENT_PROVIDER === 'dev_simulator' ? 'Payout records only — no bank transfer is made by the development payment adapter.' : undefined };
  });

  app.post('/api/v1/admin/payouts/:id/mark-paid', async (req) => {
    const a = requireCapability(req, 'refunds');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reference } = parse(z.object({ reference: z.string().min(3).max(100) }), req.body);
    const [p] = await ctx.db.update(s.payouts).set({ status: 'paid', paidAt: new Date(), providerRef: reference }).where(and(eq(s.payouts.id, id), eq(s.payouts.status, 'pending'))).returning();
    if (!p) throw notFound('Payout');
    await audit(ctx.db, { actorId: a.userId, action: 'payouts.mark_paid', targetType: 'payout', targetId: id, meta: { reference }, ip: ip(req) });
    await notify(ctx, ctx.db, { userId: p.payeeId, category: 'bookings', title: 'A payout was recorded', body: `₹${(p.amountPaise / 100).toFixed(2)} — ref ${reference}` });
    return { payout: p };
  });

  app.get('/api/v1/admin/payouts', async (req) => {
    requireCapability(req, 'refunds');
    return { payouts: await ctx.db.select().from(s.payouts).orderBy(desc(s.payouts.createdAt)).limit(200) };
  });

  /* ---------- Commerce ---------- */
  app.get('/api/v1/admin/products', async (req) => {
    requireCapability(req, 'commerce');
    const rows = await ctx.db.select().from(s.products).orderBy(desc(s.products.createdAt)).limit(300);
    const variants = rows.length ? await ctx.db.select().from(s.productVariants).where(inArray(s.productVariants.productId, rows.map((r) => r.id))) : [];
    return { products: rows.map((p) => ({ ...p, variants: variants.filter((v) => v.productId === p.id) })) };
  });

  app.post('/api/v1/admin/products/:id/status', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status, disclosure } = parse(z.object({ status: z.enum(['draft', 'active', 'archived']), disclosure: z.string().max(300).optional() }), req.body);
    const [p] = await ctx.db.update(s.products).set({ status, ...(disclosure !== undefined ? { commercialDisclosure: disclosure } : {}), updatedAt: new Date() }).where(eq(s.products.id, id)).returning();
    if (!p) throw notFound('Product');
    await audit(ctx.db, { actorId: a.userId, action: 'product.status', targetType: 'product', targetId: id, meta: { status }, ip: ip(req) });
    return { product: p };
  });

  app.post('/api/v1/admin/variants/:id/stock', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { delta, reason } = parse(z.object({ delta: z.number().int(), reason: z.enum(['restock', 'adjustment']) }), req.body);
    const [v] = await ctx.db.update(s.productVariants).set({ stock: sql`greatest(0, coalesce(${s.productVariants.stock}, 0) + ${delta})` }).where(and(eq(s.productVariants.id, id), sql`${s.productVariants.stock} is not null`)).returning();
    if (!v) throw notFound('Physical variant');
    await ctx.db.insert(s.inventoryMovements).values({ variantId: id, delta, reason });
    await audit(ctx.db, { actorId: a.userId, action: 'inventory.adjust', targetType: 'variant', targetId: id, meta: { delta, reason }, ip: ip(req) });
    return { variant: v };
  });

  app.get('/api/v1/admin/orders', async (req) => {
    requireCapability(req, 'commerce');
    const rows = await ctx.db.select().from(s.orders).orderBy(desc(s.orders.createdAt)).limit(200);
    return { orders: rows };
  });

  app.post('/api/v1/admin/orders/:id/shipment', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ status: z.enum(['preparing', 'shipped', 'in_transit', 'delivered', 'returned']), carrier: z.string().max(60).optional(), trackingNumber: z.string().max(80).optional() }), req.body);
    const [o] = await ctx.db.select().from(s.orders).where(eq(s.orders.id, id));
    if (!o) throw notFound('Order');
    await ctx.db.update(s.shipments).set({ ...body, updatedAt: new Date() }).where(eq(s.shipments.orderId, id));
    const orderStatus = body.status === 'delivered' ? 'delivered' : body.status === 'shipped' || body.status === 'in_transit' ? 'shipped' : o.status;
    await ctx.db.update(s.orders).set({ status: orderStatus, updatedAt: new Date() }).where(eq(s.orders.id, id));
    await audit(ctx.db, { actorId: a.userId, action: 'order.shipment', targetType: 'order', targetId: id, meta: { status: body.status }, ip: ip(req) });
    await notify(ctx, ctx.db, { userId: o.userId, category: 'orders', title: `Order ${o.number}: ${body.status.replace('_', ' ')}`, body: body.trackingNumber ? `${body.carrier ?? ''} ${body.trackingNumber}` : '', link: `/shop/orders/${id}` });
    return { ok: true };
  });

  app.post('/api/v1/admin/returns/:id', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status } = parse(z.object({ status: z.enum(['approved', 'rejected', 'received', 'refunded']) }), req.body);
    const [r] = await ctx.db.select().from(s.returnRequests).where(eq(s.returnRequests.id, id));
    if (!r) throw notFound('Return');
    if (status === 'received') {
      const [it] = await ctx.db.select().from(s.orderItems).where(eq(s.orderItems.id, r.orderItemId));
      await ctx.db.update(s.productVariants).set({ stock: sql`coalesce(${s.productVariants.stock},0) + ${r.quantity}` }).where(eq(s.productVariants.id, it.variantId));
      await ctx.db.insert(s.inventoryMovements).values({ variantId: it.variantId, delta: r.quantity, reason: 'refund', refId: r.orderId });
      await ctx.db.update(s.orderItems).set({ refundedQuantity: sql`${s.orderItems.refundedQuantity} + ${r.quantity}` }).where(eq(s.orderItems.id, it.id));
      const [o] = await ctx.db.select().from(s.orders).where(eq(s.orders.id, r.orderId));
      if (o.paymentId) {
        const rr = await requestRefund(ctx, ctx.db, { paymentId: o.paymentId, amountPaise: it.unitPricePaise * r.quantity, reason: `Return ${id}`, requestedBy: a.userId, idempotencyKey: `return:${id}` });
        await approveRefund(ctx, rr.id, a.userId);
      }
    }
    await ctx.db.update(s.returnRequests).set({ status: status === 'received' ? 'refunded' : status }).where(eq(s.returnRequests.id, id));
    await audit(ctx.db, { actorId: a.userId, action: 'return.update', targetType: 'return', targetId: id, meta: { status }, ip: ip(req) });
    return { ok: true };
  });

  app.get('/api/v1/admin/subscriptions', async (req) => {
    requireCapability(req, 'commerce');
    return { subscriptions: await ctx.db.select().from(s.subscriptions).orderBy(desc(s.subscriptions.createdAt)).limit(200) };
  });

  app.post('/api/v1/admin/discounts', async (req) => {
    const a = requireCapability(req, 'commerce');
    const body = parse(z.object({ code: z.string().min(3).max(30), kind: z.enum(['percent', 'fixed']), value: z.number().int().positive(), minOrderPaise: z.number().int().min(0).default(0), maxUses: z.number().int().positive().optional(), endsAt: z.iso.datetime().optional() }), req.body);
    if (body.kind === 'percent' && body.value > 90) throw badRequest('Percent discounts are capped at 90%.');
    const [d] = await ctx.db.insert(s.discounts).values({ ...body, endsAt: body.endsAt ? new Date(body.endsAt) : null }).returning();
    await audit(ctx.db, { actorId: a.userId, action: 'discount.create', targetType: 'discount', targetId: d.id, meta: { code: d.code }, ip: ip(req) });
    return { discount: d };
  });

  app.get('/api/v1/admin/discounts', async (req) => {
    requireCapability(req, 'commerce');
    return { discounts: await ctx.db.select().from(s.discounts) };
  });

  /* ---------- Courses, creators, vendors, weddings ---------- */
  app.get('/api/v1/admin/courses', async (req) => {
    requireCapability(req, 'content');
    return { courses: await ctx.db.select().from(s.courses).orderBy(desc(s.courses.createdAt)) };
  });

  app.post('/api/v1/admin/courses/:id/review', async (req) => {
    const a = requireCapability(req, 'content');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { approve, note } = parse(z.object({ approve: z.boolean(), note: z.string().max(1000).default('') }), req.body);
    const [c] = await ctx.db.update(s.courses).set({ status: approve ? 'published' : 'rejected', reviewNote: note, publishedAt: approve ? new Date() : null }).where(and(eq(s.courses.id, id), eq(s.courses.status, 'in_review'))).returning();
    if (!c) throw notFound('Course in review');
    if (approve && c.pricePaise > 0) {
      const existing = await ctx.db.select().from(s.products).where(sql`${s.products.digitalAsset}->>'courseId' = ${c.id}`);
      if (!existing.length) {
        const [p] = await ctx.db.insert(s.products).values({ sellerId: c.creatorId, slug: `course-${c.slug}`, title: c.title, description: c.subtitle || c.description.slice(0, 300), category: 'digital_course', fulfilment: 'digital', digitalAsset: { courseId: c.id }, status: 'active' }).returning();
        await ctx.db.insert(s.productVariants).values({ productId: p.id, sku: `course-${c.id.slice(0, 8)}`, name: 'Full course access', pricePaise: c.pricePaise, stock: null });
      }
    }
    await audit(ctx.db, { actorId: a.userId, action: `course.${approve ? 'publish' : 'reject'}`, targetType: 'course', targetId: id, meta: { note }, ip: ip(req) });
    await notify(ctx, ctx.db, { userId: c.creatorId, category: 'learning', title: approve ? `Published: ${c.title}` : `Changes requested: ${c.title}`, body: note, link: '/creator' });
    return { course: c };
  });

  app.get('/api/v1/admin/vendors', async (req) => {
    requireCapability(req, 'verification');
    return { vendors: await ctx.db.select().from(s.vendors).orderBy(desc(s.vendors.createdAt)) };
  });

  app.post('/api/v1/admin/vendors/:id/status', async (req) => {
    const a = requireCapability(req, 'verification');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status, reason } = parse(z.object({ status: z.enum(['verified', 'rejected', 'suspended']), reason: z.string().min(3).max(500) }), req.body);
    const [v] = await ctx.db.update(s.vendors).set({ verificationStatus: status }).where(eq(s.vendors.id, id)).returning();
    if (!v) throw notFound('Vendor');
    await audit(ctx.db, { actorId: a.userId, action: 'vendor.status', targetType: 'vendor', targetId: id, meta: { status, reason }, ip: ip(req) });
    return { vendor: v };
  });

  app.post('/api/v1/admin/experts/:id/status', async (req) => {
    const a = requireCapability(req, 'verification');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status, reason } = parse(z.object({ status: z.enum(['verified', 'suspended']), reason: z.string().min(3).max(500) }), req.body);
    const [e] = await ctx.db.update(s.expertProfiles).set({ verificationStatus: status, acceptsBookings: status === 'verified' }).where(eq(s.expertProfiles.userId, id)).returning();
    if (!e) throw notFound('Expert');
    await audit(ctx.db, { actorId: a.userId, action: 'expert.status', targetType: 'expert', targetId: id, meta: { status, reason }, ip: ip(req) });
    return { expert: e };
  });

  app.get('/api/v1/admin/wedding-bookings', async (req) => {
    requireCapability(req, 'refunds');
    return { bookings: await ctx.db.select().from(s.vendorBookings).orderBy(desc(s.vendorBookings.createdAt)).limit(200) };
  });

  app.post('/api/v1/admin/reviews/:id/status', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status } = parse(z.object({ status: z.enum(['published', 'hidden']) }), req.body);
    const [r] = await ctx.db.update(s.reviews).set({ status }).where(eq(s.reviews.id, id)).returning();
    if (!r) throw notFound('Review');
    await audit(ctx.db, { actorId: a.userId, action: 'review.status', targetType: 'review', targetId: id, meta: { status }, ip: ip(req) });
    return { review: r };
  });

  app.get('/api/v1/admin/reviews', async (req) => {
    requireCapability(req, 'moderation');
    return { reviews: await ctx.db.select().from(s.reviews).orderBy(desc(s.reviews.createdAt)).limit(200) };
  });

  /* ---------- Interpretation content & calculation configs ---------- */
  app.get('/api/v1/admin/interpretations', async (req) => {
    requireCapability(req, 'content');
    const { q } = parse(z.object({ q: z.string().max(60).optional() }), req.query);
    const rows = await ctx.db.select().from(s.interpretationContent).where(q ? sql`(${s.interpretationContent.ruleKey} ilike ${'%' + q + '%'} or ${s.interpretationContent.titleEn} ilike ${'%' + q + '%'})` : undefined).orderBy(asc(s.interpretationContent.ruleKey), desc(s.interpretationContent.version)).limit(300);
    return { rules: rows };
  });

  app.post('/api/v1/admin/interpretations/:ruleKey/versions', async (req) => {
    const a = requireCapability(req, 'content');
    const { ruleKey } = parse(z.object({ ruleKey: z.string() }), req.params);
    const body = parse(z.object({ titleEn: z.string().min(2).max(200), bodyEn: z.string().min(10).max(5000), titleHi: z.string().max(200).optional(), bodyHi: z.string().max(5000).optional(), caveat: z.string().max(500).optional(), source: z.string().min(3).max(300), status: z.enum(['draft', 'published']) }), req.body);
    const [latest] = await ctx.db.select().from(s.interpretationContent).where(eq(s.interpretationContent.ruleKey, ruleKey)).orderBy(desc(s.interpretationContent.version)).limit(1);
    if (!latest) throw notFound('Rule');
    const row = await ctx.db.transaction(async (tx) => {
      if (body.status === 'published') await tx.update(s.interpretationContent).set({ status: 'retired' }).where(and(eq(s.interpretationContent.ruleKey, ruleKey), eq(s.interpretationContent.status, 'published')));
      const [r] = await tx.insert(s.interpretationContent).values({ ...latest, id: undefined, version: latest.version + 1, ...body, editedBy: a.userId, createdAt: new Date() }).returning();
      return r;
    });
    await refreshRules(ctx.db);
    await audit(ctx.db, { actorId: a.userId, action: 'interpretation.version', targetType: 'interpretation', targetId: ruleKey, meta: { version: row.version, status: body.status }, ip: ip(req) });
    return { rule: row };
  });

  app.get('/api/v1/admin/calculation-configs', async (req) => {
    requireCapability(req, 'content');
    return { configs: await ctx.db.select().from(s.calculationConfigs) };
  });

  app.post('/api/v1/admin/calculation-configs/:key', async (req) => {
    const a = requireCapability(req, 'content');
    const { key } = parse(z.object({ key: z.string() }), req.params);
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    const [cur] = await ctx.db.select().from(s.calculationConfigs).where(eq(s.calculationConfigs.key, key));
    if (!cur) throw notFound('Config');
    if (cur.isDefault && !active) throw badRequest('The default configuration cannot be deactivated.');
    const [c] = await ctx.db.update(s.calculationConfigs).set({ active, updatedAt: new Date() }).where(eq(s.calculationConfigs.key, key)).returning();
    await audit(ctx.db, { actorId: a.userId, action: 'calc_config.update', targetType: 'calculation_config', targetId: key, meta: { active }, ip: ip(req) });
    return { config: c };
  });

  /* ---------- Notification templates, flags, settings ---------- */
  app.get('/api/v1/admin/notification-templates', async (req) => {
    requireCapability(req, 'content');
    return { templates: await ctx.db.select().from(s.notificationTemplates) };
  });

  app.put('/api/v1/admin/notification-templates/:key', async (req) => {
    const a = requireCapability(req, 'content');
    const { key } = parse(z.object({ key: z.string() }), req.params);
    const body = parse(z.object({ titleTemplate: z.string().min(2).max(200), bodyTemplate: z.string().max(1000) }), req.body);
    const [t] = await ctx.db.update(s.notificationTemplates).set({ ...body, updatedAt: new Date(), updatedBy: a.userId }).where(eq(s.notificationTemplates.key, key)).returning();
    if (!t) throw notFound('Template');
    await audit(ctx.db, { actorId: a.userId, action: 'notification_template.update', targetType: 'template', targetId: key, ip: ip(req) });
    return { template: t };
  });

  app.get('/api/v1/admin/flags', async (req) => {
    requireCapability(req, 'flags');
    return { flags: await ctx.db.select().from(s.featureFlags), experiments: await ctx.db.select().from(s.experiments) };
  });

  app.put('/api/v1/admin/flags/:key', async (req) => {
    const a = requireCapability(req, 'flags');
    const { key } = parse(z.object({ key: z.string() }), req.params);
    const body = parse(z.object({ enabled: z.boolean(), rolloutPercent: z.number().int().min(0).max(100) }), req.body);
    const [f] = await ctx.db.update(s.featureFlags).set({ ...body, updatedAt: new Date(), updatedBy: a.userId }).where(eq(s.featureFlags.key, key)).returning();
    if (!f) throw notFound('Flag');
    await audit(ctx.db, { actorId: a.userId, action: 'flag.update', targetType: 'flag', targetId: key, meta: body, ip: ip(req) });
    return { flag: f };
  });

  app.get('/api/v1/admin/settings', async (req) => {
    requireCapability(req, 'flags');
    return { settings: await ctx.db.select().from(s.platformSettings) };
  });

  app.put('/api/v1/admin/settings/:key', async (req) => {
    const a = requireCapability(req, 'flags');
    const { key } = parse(z.object({ key: z.enum(['expert_commission_percent', 'creator_revenue_share_percent']) }), req.params);
    const { value } = parse(z.object({ value: z.number().min(0).max(60) }), req.body);
    const before = await getSetting(ctx.db, key, null);
    await setSetting(ctx.db, key, value, a.userId);
    await audit(ctx.db, { actorId: a.userId, action: 'setting.update', targetType: 'setting', targetId: key, meta: { from: before, to: value }, ip: ip(req) });
    return { ok: true };
  });

  /* ---------- Support & privacy requests ---------- */
  app.get('/api/v1/admin/tickets', async (req) => {
    requireCapability(req, 'support');
    const { status } = parse(z.object({ status: z.enum(['open', 'pending_user', 'resolved', 'closed']).optional() }), req.query);
    const rows = await ctx.db.select().from(s.supportTickets).where(status ? eq(s.supportTickets.status, status) : undefined).orderBy(desc(s.supportTickets.updatedAt)).limit(200);
    const names = await displayNames(ctx.db, rows.map((r) => r.userId));
    return { tickets: rows.map((t) => ({ ...t, user: names.get(t.userId) })) };
  });

  app.get('/api/v1/admin/tickets/:id', async (req) => {
    requireCapability(req, 'support');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [t] = await ctx.db.select().from(s.supportTickets).where(eq(s.supportTickets.id, id));
    if (!t) throw notFound('Ticket');
    return { ticket: t, messages: await ctx.db.select().from(s.ticketMessages).where(eq(s.ticketMessages.ticketId, id)).orderBy(asc(s.ticketMessages.createdAt)) };
  });

  app.post('/api/v1/admin/tickets/:id/reply', async (req) => {
    const a = requireCapability(req, 'support');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { body, status } = parse(z.object({ body: z.string().min(1).max(5000), status: z.enum(['pending_user', 'resolved', 'closed']).default('pending_user') }), req.body);
    const [t] = await ctx.db.select().from(s.supportTickets).where(eq(s.supportTickets.id, id));
    if (!t) throw notFound('Ticket');
    await ctx.db.insert(s.ticketMessages).values({ ticketId: id, authorId: a.userId, isStaff: true, body });
    await ctx.db.update(s.supportTickets).set({ status, assignedTo: a.userId, updatedAt: new Date() }).where(eq(s.supportTickets.id, id));
    await notify(ctx, ctx.db, { userId: t.userId, category: 'system', title: `Support replied: ${t.subject}`, link: `/support/${id}` });
    return { ok: true };
  });

  app.get('/api/v1/admin/privacy-requests', async (req) => {
    requireCapability(req, 'privacy');
    const exports = await ctx.db.select({ id: s.dataExportRequests.id, userId: s.dataExportRequests.userId, status: s.dataExportRequests.status, createdAt: s.dataExportRequests.createdAt }).from(s.dataExportRequests).orderBy(desc(s.dataExportRequests.createdAt)).limit(100);
    const deletions = await ctx.db.select().from(s.deletionRequests).orderBy(desc(s.deletionRequests.createdAt)).limit(100);
    return { exports, deletions };
  });

  app.post('/api/v1/admin/users/:id/delete', async (req) => {
    const a = requireCapability(req, 'users.manage');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { confirm, reason } = parse(z.object({ confirm: z.literal('DELETE'), reason: z.string().min(5).max(500) }), req.body);
    void confirm;
    if (id === a.userId) throw badRequest('Use account settings to delete your own account.');
    const summary = await deleteAccount(ctx, id, `Admin: ${reason}`);
    await audit(ctx.db, { actorId: a.userId, action: 'admin.user_delete', targetType: 'user', targetId: id, meta: { reason }, ip: ip(req) });
    return { summary };
  });

  /* ---------- Audit log ---------- */
  app.get('/api/v1/admin/audit', async (req) => {
    requireCapability(req, 'audit');
    const { action, actorId } = parse(z.object({ action: z.string().max(60).optional(), actorId: z.uuid().optional() }), req.query);
    const rows = await ctx.db.select().from(s.auditLogs).where(and(action ? sql`${s.auditLogs.action} ilike ${action + '%'}` : undefined, actorId ? eq(s.auditLogs.actorId, actorId) : undefined)).orderBy(desc(s.auditLogs.createdAt)).limit(300);
    return { entries: rows };
  });

  /* ---------- Analytics ---------- */
  app.get('/api/v1/admin/analytics', async (req) => {
    requireCapability(req, 'analytics');
    const { weeks } = parse(z.object({ weeks: z.coerce.number().int().min(2).max(26).default(8) }), req.query);
    const start = DateTime.utc().startOf('week').minus({ weeks: weeks - 1 });
    const q = async <T>(query: ReturnType<typeof sql>) => ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows;
    const wmcu = await q<{ week: string; users: number }>(sql`select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(distinct user_id)::int as users
      from analytics_events where meaningful and user_id is not null and created_at >= ${start.toJSDate()} group by 1 order by 1`);
    const funnelNames = ['signup_completed', 'cosmic_id_completed', 'chart_explored', 'insight_saved', 'bond_created', 'invitation_accepted'];
    const funnel = await q<{ name: string; users: number }>(sql`select name, count(distinct user_id)::int as users from analytics_events where name in (${sql.join(funnelNames.map((n) => sql`${n}`), sql`, `)}) group by name`);
    // Public funnel: anonymous page events are counted as events (they carry no identifiers), account steps as distinct users.
    const publicSteps: { name: string; anonymous: boolean; label: string }[] = [
      { name: 'landing_viewed', anonymous: true, label: 'Landing views' },
      { name: 'cosmic_id_previewed', anonymous: true, label: 'Account-free Cosmic IDs' },
      { name: 'cosmic_id_preview_signup_clicked', anonymous: true, label: 'Save clicks' },
      { name: 'signup_completed', anonymous: false, label: 'Accounts created' },
      { name: 'cosmic_id_completed', anonymous: false, label: 'Cosmic IDs saved' },
      { name: 'cosmic_id_shared', anonymous: false, label: 'Members who shared a card' },
      { name: 'bond_invitation_sent', anonymous: false, label: 'Members who invited someone' },
      { name: 'invitation_accepted', anonymous: false, label: 'Invitations accepted' },
    ];
    const pub = await q<{ name: string; events: number; users: number }>(sql`select name, count(*)::int as events, count(distinct user_id)::int as users from analytics_events where created_at >= ${start.toJSDate()} and name in (${sql.join(publicSteps.map((s) => sql`${s.name}`), sql`, `)}) group by name`);
    const publicFunnel = publicSteps.map((s) => { const r = pub.find((p) => p.name === s.name); return { name: s.name, label: s.label, value: r ? (s.anonymous ? r.events : r.users) : 0, unit: s.anonymous ? 'events' : 'users' }; });
    const cohorts = await q<{ cohort: string; size: number; w1: number; w4: number }>(sql`with c as (select id, date_trunc('week', created_at) as cohort from users where created_at >= ${start.toJSDate()} and status <> 'deleted')
      select to_char(c.cohort,'YYYY-MM-DD') as cohort, count(*)::int as size,
        count(*) filter (where exists (select 1 from analytics_events e where e.user_id = c.id and e.meaningful and e.created_at >= c.cohort + interval '7 days' and e.created_at < c.cohort + interval '14 days'))::int as w1,
        count(*) filter (where exists (select 1 from analytics_events e where e.user_id = c.id and e.meaningful and e.created_at >= c.cohort + interval '28 days' and e.created_at < c.cohort + interval '35 days'))::int as w4
      from c group by c.cohort order by c.cohort`);
    const adoption = await q<{ name: string; users: number; events: number }>(sql`select name, count(distinct user_id)::int as users, count(*)::int as events from analytics_events where created_at >= ${start.toJSDate()} group by name order by users desc`);
    const revenue = await q<{ purpose: string; gross: number; refunded: number; count: number }>(sql`select purpose, coalesce(sum(amount_paise),0)::int as gross, coalesce(sum(refunded_paise),0)::int as refunded, count(*)::int as count from payments where status in ('succeeded','refunded','partially_refunded') group by purpose`);
    const consult = await q<{ status: string; n: number }>(sql`select status, count(*)::int as n from bookings group by status`);
    const commerce = await q<{ status: string; n: number }>(sql`select status, count(*)::int as n from orders group by status`);
    const learning = await q<{ enrolled: number; completed: number }>(sql`select count(*)::int as enrolled, count(*) filter (where status='completed')::int as completed from enrollments`);
    const invites = await q<{ sent: number; accepted: number }>(sql`select count(*)::int as sent, count(*) filter (where status='accepted')::int as accepted from bond_invitations`);
    const subs = await q<{ status: string; n: number }>(sql`select status, count(*)::int as n from subscriptions group by status`);
    const errors = await q<{ day: string; n: number }>(sql`select to_char(date_trunc('day', created_at),'YYYY-MM-DD') as day, count(*)::int as n from analytics_events where name = 'client_error' and created_at >= ${start.toJSDate()} group by 1 order by 1`);
    const experiments = await q<{ experiment_key: string; variant: string; n: number }>(sql`select experiment_key, variant, count(*)::int as n from experiment_assignments group by 1,2`);
    return {
      definition: 'Weekly Meaningful Cosmic Users (WMCU): distinct users with at least one meaningful event in the ISO week. Meaningful events: ' + Object.entries(EVENT_TAXONOMY).filter(([, v]) => v.meaningful).map(([k]) => k).join(', ') + '. App opens and passive views are excluded.',
      wmcu, publicFunnel, activationFunnel: funnelNames.map((n) => ({ name: n, users: funnel.find((f) => f.name === n)?.users ?? 0 })), retentionCohorts: cohorts, featureAdoption: adoption,
      revenue, consultationFunnel: consult, commerceFunnel: commerce, learning: learning[0], invitations: invites[0], subscriptions: subs, clientErrors: errors, experiments,
      taxonomy: EVENT_TAXONOMY,
      privacyNote: 'Analytics events never contain birth data, message content or contact details (enforced by a server-side sanitiser).',
    };
  });

  void gte;
}
