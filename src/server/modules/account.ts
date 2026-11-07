import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, notFound, parse, unauthorized } from '../lib/http';
import { requireAuth, SESSION_COOKIE } from '../lib/auth';
import { decryptField, sha256, verifyPassword } from '../lib/crypto';
import { NOTIFICATION_CATEGORIES } from '../lib/notify';
import { textRelevance } from '../services/ranking';
import { eventVisibleSql } from '../services/events';
import { enabledModules } from '../services/modules';
import { IDENTITY_OFFER_SLUGS } from '../../shared/modules';
import { POLICY_VERSION } from './auth';
import { adViewerKey } from './ads';

/**
 * Account, privacy, notifications, search and support routes.
 * Deletion rules (documented in SECURITY_AND_PRIVACY.md):
 *  - Deleted immediately: birth profiles, charts, saved insights, timeline, bonds, grants, dating & matchmaking profiles,
 *    family links, posts/comments (scrubbed), messages (bodies scrubbed), notifications, sessions, uploads metadata.
 *  - Retained (legal/accounting): orders, payments, refunds, bookings — linked to a pseudonymised, deactivated user row.
 *  - Audit log entries are retained without personal content.
 */
export async function accountRoutes(app: FastifyInstance, ctx: Ctx) {
  /* ---------- Notifications ---------- */
  app.get('/api/v1/notifications', async (req) => {
    const a = requireAuth(req);
    const { unread } = parse(z.object({ unread: z.coerce.boolean().optional() }), req.query);
    const rows = await ctx.db.select().from(s.notifications).where(and(eq(s.notifications.userId, a.userId), unread ? isNull(s.notifications.readAt) : undefined)).orderBy(desc(s.notifications.createdAt)).limit(100);
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.notifications).where(and(eq(s.notifications.userId, a.userId), isNull(s.notifications.readAt)));
    return { notifications: rows, unreadCount: n };
  });

  app.post('/api/v1/notifications/read', async (req) => {
    const a = requireAuth(req);
    const { ids, all } = parse(z.object({ ids: z.array(z.uuid()).max(200).optional(), all: z.boolean().optional() }), req.body);
    if (all) await ctx.db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, a.userId), isNull(s.notifications.readAt)));
    else if (ids?.length) await ctx.db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, a.userId), inArray(s.notifications.id, ids)));
    return { ok: true };
  });

  app.get('/api/v1/notification-preferences', async (req) => {
    const a = requireAuth(req);
    const prefs = await ctx.db.select().from(s.notificationPreferences).where(eq(s.notificationPreferences.userId, a.userId));
    const [settings] = await ctx.db.select().from(s.notificationSettings).where(eq(s.notificationSettings.userId, a.userId));
    return {
      preferences: NOTIFICATION_CATEGORIES.map((c) => prefs.find((p) => p.category === c) ?? { category: c, inApp: true, email: false, push: false }),
      settings: { quietStart: settings?.quietStart ?? null, quietEnd: settings?.quietEnd ?? null, dailyCap: settings?.dailyCap ?? 10, timezone: settings?.timezone ?? 'Asia/Kolkata', unsubscribedAllEmail: Boolean(settings?.unsubscribedAllEmailAt) },
      essential: ['security', 'orders', 'bookings'],
      pushAvailable: false, pushNote: 'Push notifications are unavailable: no push provider is configured.',
    };
  });

  app.put('/api/v1/notification-preferences', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({
      preferences: z.array(z.object({ category: z.enum(NOTIFICATION_CATEGORIES), inApp: z.boolean(), email: z.boolean() })).optional(),
      settings: z.object({ quietStart: z.string().regex(/^\d{2}:\d{2}$/).nullable(), quietEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable(), dailyCap: z.number().int().min(1).max(50), unsubscribedAllEmail: z.boolean() }).partial().optional(),
    }), req.body);
    for (const p of body.preferences ?? []) {
      await ctx.db.insert(s.notificationPreferences).values({ userId: a.userId, category: p.category, inApp: p.inApp, email: p.email }).onConflictDoUpdate({ target: [s.notificationPreferences.userId, s.notificationPreferences.category], set: { inApp: p.inApp, email: p.email } });
    }
    if (body.settings) {
      const { unsubscribedAllEmail, ...rest } = body.settings;
      await ctx.db.update(s.notificationSettings).set({ ...rest, ...(unsubscribedAllEmail !== undefined ? { unsubscribedAllEmailAt: unsubscribedAllEmail ? new Date() : null } : {}) }).where(eq(s.notificationSettings.userId, a.userId));
    }
    return { ok: true };
  });

  /* ---------- Consents ---------- */
  app.get('/api/v1/consents', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.consentRecords).where(eq(s.consentRecords.userId, a.userId)).orderBy(desc(s.consentRecords.createdAt));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.purpose)) latest.set(r.purpose, r);
    return { consents: [...latest.values()], history: rows, policyVersion: POLICY_VERSION };
  });

  app.post('/api/v1/consents', async (req) => {
    const a = requireAuth(req);
    const { purpose, granted } = parse(z.object({ purpose: z.enum(['marketing_email', 'analytics', 'birth_data_processing']), granted: z.boolean() }), req.body);
    await ctx.db.insert(s.consentRecords).values({ userId: a.userId, purpose, granted, policyVersion: POLICY_VERSION });
    if (purpose === 'birth_data_processing' && !granted) {
      // Withdrawing consent removes birth data and every chart derived from it.
      await ctx.db.delete(s.birthProfiles).where(eq(s.birthProfiles.userId, a.userId));
      await ctx.db.update(s.profiles).set({ onboardingCompletedAt: null }).where(eq(s.profiles.userId, a.userId));
      await ctx.db.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(and(eq(s.chartShareGrants.grantorId, a.userId), isNull(s.chartShareGrants.revokedAt)));
      await audit(ctx.db, { actorId: a.userId, action: 'privacy.birth_consent_withdrawn' });
    }
    return { ok: true };
  });

  /* ---------- Data export ---------- */
  app.post('/api/v1/privacy/export', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req, { allowSuspended: true });
    const uid = a.userId;
    const q = async <T>(p: Promise<T>) => p;
    const payload = {
      exportedAt: new Date().toISOString(),
      account: (await q(ctx.db.select({ id: s.users.id, email: s.users.email, createdAt: s.users.createdAt, status: s.users.status, emailVerifiedAt: s.users.emailVerifiedAt }).from(s.users).where(eq(s.users.id, uid))))[0],
      profile: (await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, uid)))[0],
      birthProfiles: await ctx.db.select().from(s.birthProfiles).where(eq(s.birthProfiles.userId, uid)),
      chartSnapshots: await ctx.db.select({ id: s.charts.id, label: s.charts.label, system: s.charts.system, engineVersion: s.charts.engineVersion, createdAt: s.charts.createdAt, result: s.charts.result }).from(s.charts).where(and(eq(s.charts.userId, uid), eq(s.charts.isSnapshot, true))),
      savedInsights: await ctx.db.select().from(s.savedInsights).where(eq(s.savedInsights.userId, uid)),
      timeline: await ctx.db.select().from(s.timelineEvents).where(eq(s.timelineEvents.userId, uid)),
      rituals: await ctx.db.select().from(s.ritualCompletions).where(eq(s.ritualCompletions.userId, uid)),
      bonds: await ctx.db.select().from(s.bonds).where(or(eq(s.bonds.ownerId, uid), eq(s.bonds.partnerUserId, uid))),
      bondNotes: await ctx.db.select().from(s.bondNotes).where(eq(s.bondNotes.authorId, uid)),
      chartShareGrants: await ctx.db.select().from(s.chartShareGrants).where(or(eq(s.chartShareGrants.grantorId, uid), eq(s.chartShareGrants.granteeId, uid))),
      posts: await ctx.db.select().from(s.posts).where(eq(s.posts.authorId, uid)),
      comments: await ctx.db.select().from(s.comments).where(eq(s.comments.authorId, uid)),
      messagesSent: await ctx.db.select({ id: s.messages.id, conversationId: s.messages.conversationId, body: s.messages.body, createdAt: s.messages.createdAt }).from(s.messages).where(eq(s.messages.senderId, uid)),
      datingProfile: (await ctx.db.select().from(s.datingProfiles).where(eq(s.datingProfiles.userId, uid)))[0] ?? null,
      matchmakingProfile: (await ctx.db.select().from(s.matchmakingProfiles).where(eq(s.matchmakingProfiles.userId, uid)))[0] ?? null,
      enrollments: await ctx.db.select().from(s.enrollments).where(eq(s.enrollments.userId, uid)),
      certificates: await ctx.db.select().from(s.certificates).where(eq(s.certificates.userId, uid)),
      xp: await ctx.db.select().from(s.xpLedger).where(eq(s.xpLedger.userId, uid)),
      achievements: await ctx.db.select().from(s.userAchievements).where(eq(s.userAchievements.userId, uid)),
      orders: await ctx.db.select().from(s.orders).where(eq(s.orders.userId, uid)),
      bookings: await ctx.db.select().from(s.bookings).where(eq(s.bookings.customerId, uid)),
      subscriptions: await ctx.db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, uid)),
      consents: await ctx.db.select().from(s.consentRecords).where(eq(s.consentRecords.userId, uid)),
      notifications: await ctx.db.select().from(s.notifications).where(eq(s.notifications.userId, uid)),
      weddingProjects: await ctx.db.select().from(s.weddingProjects).where(eq(s.weddingProjects.ownerId, uid)),
      personalityAssessments: await ctx.db.select().from(s.assessmentResults).where(eq(s.assessmentResults.userId, uid)),
      ritualResponses: await ctx.db.select().from(s.ritualResponses).where(eq(s.ritualResponses.userId, uid)),
      circleMemberships: await ctx.db.select({ circleId: s.groupMembers.groupId, role: s.groupMembers.role, status: s.groupMembers.status, joinedAt: s.groupMembers.createdAt }).from(s.groupMembers).where(eq(s.groupMembers.userId, uid)),
      gameSubmissions: await ctx.db.select({ sessionId: s.gameSubmissions.sessionId, roundIndex: s.gameSubmissions.roundIndex, payload: s.gameSubmissions.payload, createdAt: s.gameSubmissions.createdAt }).from(s.gameSubmissions).where(eq(s.gameSubmissions.userId, uid)),
      referralsMade: await ctx.db.select({ status: s.referrals.status, createdAt: s.referrals.createdAt, decidedAt: s.referrals.decidedAt }).from(s.referrals).where(eq(s.referrals.referrerId, uid)),
      // Added features: everything you created or that is about you.
      yearCards: await ctx.db.select({ year: s.yearCards.year, facts: s.yearCards.facts, named: sql<boolean>`${s.yearCards.displayName} is not null`, views: s.yearCards.views, revokedAt: s.yearCards.revokedAt, createdAt: s.yearCards.createdAt }).from(s.yearCards).where(eq(s.yearCards.userId, uid)),
      journal: (await ctx.db.select().from(s.journalEntries).where(eq(s.journalEntries.userId, uid))).map((e) => ({ date: e.localDate, prompt: e.promptKey, body: decryptField(ctx.config.appSecret, e.bodyEnc), createdAt: e.createdAt, updatedAt: e.updatedAt })),
      vibeCheckins: await ctx.db.select({ date: s.vibeCheckins.localDate, mood: s.vibeCheckins.mood }).from(s.vibeCheckins).where(eq(s.vibeCheckins.userId, uid)),
      quizzesMade: await ctx.db.select().from(s.memberQuizzes).where(eq(s.memberQuizzes.authorId, uid)),
      quizAttempts: await ctx.db.select().from(s.memberQuizAttempts).where(eq(s.memberQuizAttempts.userId, uid)),
      tournamentsHosted: await ctx.db.select({ id: s.tournaments.id, title: s.tournaments.title, definition: s.tournaments.definition, opensAt: s.tournaments.opensAt, closesAt: s.tournaments.closesAt }).from(s.tournaments).where(eq(s.tournaments.hostId, uid)),
      tournamentEntries: await ctx.db.select().from(s.tournamentEntries).where(eq(s.tournamentEntries.userId, uid)),
      creatorProfile: (await ctx.db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, uid)))[0] ?? null,
      creatorOfferings: await ctx.db.select().from(s.creatorOfferings).where(eq(s.creatorOfferings.creatorId, uid)),
      tipsSent: await ctx.db.select({ amountPaise: s.creatorTips.amountPaise, message: s.creatorTips.message, status: s.creatorTips.status, createdAt: s.creatorTips.createdAt }).from(s.creatorTips).where(eq(s.creatorTips.fromUserId, uid)),
      creatorEarnings: await ctx.db.select().from(s.creatorLedger).where(eq(s.creatorLedger.creatorId, uid)),
      closeFriends: await ctx.db.select({ friendId: s.closeFriends.friendId, addedAt: s.closeFriends.createdAt }).from(s.closeFriends).where(eq(s.closeFriends.ownerId, uid)),
      savedPosts: await ctx.db.select().from(s.savedPosts).where(eq(s.savedPosts.userId, uid)),
      collections: await ctx.db.select().from(s.postCollections).where(eq(s.postCollections.ownerId, uid)),
      collectionItems: await ctx.db.select({ collectionId: s.collectionItems.collectionId, postId: s.collectionItems.postId, note: s.collectionItems.note }).from(s.collectionItems).innerJoin(s.postCollections, eq(s.postCollections.id, s.collectionItems.collectionId)).where(eq(s.postCollections.ownerId, uid)),
      marketListings: await ctx.db.select().from(s.circleListings).where(eq(s.circleListings.sellerId, uid)),
      marketInterests: await ctx.db.select().from(s.listingInterests).where(eq(s.listingInterests.userId, uid)),
      marketMessagesSent: await ctx.db.select({ listingId: s.listingMessages.listingId, body: s.listingMessages.body, createdAt: s.listingMessages.createdAt }).from(s.listingMessages).where(eq(s.listingMessages.senderId, uid)),
      organisations: await ctx.db.select({ orgId: s.orgMembers.orgId, role: s.orgMembers.role, includeInAggregate: s.orgMembers.includeInAggregate, joinedAt: s.orgMembers.createdAt }).from(s.orgMembers).where(eq(s.orgMembers.userId, uid)),
      circleTiers: await ctx.db.select({ circleId: s.circleMemberTiers.circleId, tierId: s.circleMemberTiers.tierId }).from(s.circleMemberTiers).where(eq(s.circleMemberTiers.userId, uid)),
      leaderboardVisible: (await ctx.db.select({ v: s.profiles.leaderboardVisible }).from(s.profiles).where(eq(s.profiles.userId, uid)))[0]?.v ?? true,
    };
    const [r] = await ctx.db.insert(s.dataExportRequests).values({ userId: uid, status: 'ready', payload: payload as unknown as Record<string, unknown>, completedAt: new Date() }).returning({ id: s.dataExportRequests.id });
    await audit(ctx.db, { actorId: uid, action: 'privacy.export', targetType: 'data_export', targetId: r.id });
    return { exportId: r.id, data: payload };
  });

  /* ---------- Account deletion ---------- */
  app.post('/api/v1/privacy/delete-account', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req, { allowSuspended: true });
    const { password, reason } = parse(z.object({ password: z.string(), confirm: z.literal('DELETE'), reason: z.string().max(500).optional() }), req.body);
    const [u] = await ctx.db.select().from(s.users).where(eq(s.users.id, a.userId));
    if (!(await verifyPassword(password, u.passwordHash))) throw unauthorized('Password is incorrect.');
    const summary = await deleteAccount(ctx, a.userId, reason ?? null);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { deleted: true, summary };
  });

  /* ---------- Global search ---------- */
  app.get('/api/v1/search', async (req) => {
    const a = requireAuth(req);
    const { q, scope } = parse(z.object({ q: z.string().trim().min(1).max(80), scope: z.enum(['all', 'people', 'experts', 'courses', 'products', 'events', 'vendors', 'groups', 'thoughts']).default('all') }), req.query);
    const like = `%${q}%`;
    // Scopes owned by a switched-off module return nothing (the module's API is off too).
    const mods = await enabledModules(ctx.db, a.userId);
    const SCOPE_MODULE: Record<string, string> = { experts: 'experts', courses: 'learning', products: 'premium', vendors: 'weddings', groups: 'community' };
    const want = (x: string) => (scope === 'all' || scope === x) && (!SCOPE_MODULE[x] || mods[SCOPE_MODULE[x]]);
    const results: Record<string, unknown[]> = {};
    if (want('people')) {
      const rows = await ctx.db.select({ userId: s.profiles.userId, handle: s.profiles.handle, displayName: s.profiles.displayName, avatarUrl: s.profiles.avatarUrl }).from(s.profiles).innerJoin(s.users, eq(s.users.id, s.profiles.userId))
        .where(and(eq(s.users.status, 'active'), eq(s.profiles.visibility, 'public'), sql`(${s.profiles.displayName} ilike ${like} or ${s.profiles.handle} ilike ${like})`,
          sql`not exists (select 1 from blocks b where (b.blocker_id = ${a.userId} and b.blocked_id = ${s.profiles.userId}) or (b.blocker_id = ${s.profiles.userId} and b.blocked_id = ${a.userId}))`)).limit(20);
      results.people = rows.sort((x, y) => textRelevance(q, y.displayName) - textRelevance(q, x.displayName));
    }
    if (want('experts')) results.experts = await ctx.db.select({ userId: s.expertProfiles.userId, displayName: s.expertProfiles.displayName, headline: s.expertProfiles.headline, isSample: s.expertProfiles.isSample }).from(s.expertProfiles).where(and(eq(s.expertProfiles.verificationStatus, 'verified'), sql`(${s.expertProfiles.displayName} ilike ${like} or ${s.expertProfiles.headline} ilike ${like})`)).limit(20);
    if (want('courses')) results.courses = await ctx.db.select({ id: s.courses.id, slug: s.courses.slug, title: s.courses.title, level: s.courses.level }).from(s.courses).where(and(eq(s.courses.status, 'published'), sql`(${s.courses.title} ilike ${like} or ${s.courses.description} ilike ${like})`)).limit(20);
    if (want('products')) results.products = await ctx.db.select({ id: s.products.id, slug: s.products.slug, title: s.products.title, category: s.products.category, isSample: s.products.isSample }).from(s.products).where(and(eq(s.products.status, 'active'), mods.marketplace ? undefined : inArray(s.products.slug, IDENTITY_OFFER_SLUGS), sql`(${s.products.title} ilike ${like} or ${s.products.description} ilike ${like})`)).limit(20);
    if (want('events')) results.events = await ctx.db.select({ id: s.events.id, title: s.events.title, startsAt: s.events.startsAt }).from(s.events).where(and(sql`${s.events.endsAt} > now()`, sql`${s.events.title} ilike ${like}`, eventVisibleSql(a.userId))).limit(20);
    if (want('vendors')) results.vendors = await ctx.db.select({ id: s.vendors.id, name: s.vendors.name, category: s.vendors.category, city: s.vendors.city, isSample: s.vendors.isSample }).from(s.vendors).where(and(eq(s.vendors.verificationStatus, 'verified'), sql`(${s.vendors.name} ilike ${like} or ${s.vendors.city} ilike ${like})`)).limit(20);
    // Only public community groups are searchable; private groups and circles never appear.
    if (want('groups')) results.groups = await ctx.db.select({ id: s.groups.id, slug: s.groups.slug, name: s.groups.name, visibility: s.groups.visibility }).from(s.groups).where(and(isNull(s.groups.archivedAt), eq(s.groups.visibility, 'public'), sql`${s.groups.kind} <> 'circle'`, sql`(${s.groups.name} ilike ${like} or ${s.groups.description} ilike ${like})`)).limit(20);
    // Public Thought Drops (post-level visibility); pen-name posts show only the pen name snapshot.
    if (want('thoughts')) {
      const rows = await ctx.db.select({ id: s.posts.id, kind: s.posts.kind, body: s.posts.body, pseudonymous: s.posts.pseudonymous, penName: s.posts.penName, authorId: s.posts.authorId, displayName: s.profiles.displayName, handle: s.profiles.handle, pseudonym: s.profiles.pseudonym, createdAt: s.posts.createdAt })
        .from(s.posts).innerJoin(s.profiles, eq(s.profiles.userId, s.posts.authorId))
        .where(and(isNull(s.posts.deletedAt), eq(s.posts.hiddenByModeration, false), eq(s.posts.visibility, 'public'), sql`${s.posts.body} ilike ${like}`,
          sql`not exists (select 1 from blocks b where (b.blocker_id = ${a.userId} and b.blocked_id = ${s.posts.authorId}) or (b.blocker_id = ${s.posts.authorId} and b.blocked_id = ${a.userId}))`)).orderBy(sql`${s.posts.createdAt} desc`).limit(20);
      results.thoughts = rows.map((r) => ({ id: r.id, kind: r.kind, body: r.body.slice(0, 200), createdAt: r.createdAt, author: r.pseudonymous && r.authorId !== a.userId ? { pseudonym: r.penName ?? r.pseudonym ?? 'Anonymous member' } : { handle: r.handle, displayName: r.displayName } }));
    }
    const [prefsRow] = await ctx.db.select({ p: s.profiles.fieldVisibility }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    if ((prefsRow?.p as Record<string, unknown> | undefined)?.searchHistory !== 'off') await ctx.db.insert(s.searchHistory).values({ userId: a.userId, query: q, scope });
    return { query: q, results };
  });

  app.get('/api/v1/search/history', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.searchHistory).where(eq(s.searchHistory.userId, a.userId)).orderBy(desc(s.searchHistory.createdAt)).limit(20);
    const saved = await ctx.db.select().from(s.savedSearches).where(eq(s.savedSearches.userId, a.userId));
    return { history: rows, saved };
  });

  app.delete('/api/v1/search/history', async (req) => {
    const a = requireAuth(req);
    await ctx.db.delete(s.searchHistory).where(eq(s.searchHistory.userId, a.userId));
    return { ok: true };
  });

  app.post('/api/v1/search/saved', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ name: z.string().min(1).max(60), scope: z.string().max(20), query: z.record(z.string(), z.string()) }), req.body);
    const [row] = await ctx.db.insert(s.savedSearches).values({ ...body, userId: a.userId }).returning();
    return { saved: row };
  });

  app.delete('/api/v1/search/saved/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ctx.db.delete(s.savedSearches).where(and(eq(s.savedSearches.id, id), eq(s.savedSearches.userId, a.userId)));
    return { ok: true };
  });

  /* ---------- Support & appeals ---------- */
  app.get('/api/v1/support/tickets', async (req) => {
    const a = requireAuth(req, { allowSuspended: true });
    const rows = await ctx.db.select().from(s.supportTickets).where(eq(s.supportTickets.userId, a.userId)).orderBy(desc(s.supportTickets.updatedAt));
    return { tickets: rows };
  });

  app.post('/api/v1/support/tickets', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req, { allowSuspended: true });
    const body = parse(z.object({ subject: z.string().trim().min(3).max(140), category: z.enum(['account', 'billing', 'booking', 'order', 'safety', 'privacy', 'technical', 'other']), body: z.string().trim().min(10).max(5000), relatedType: z.string().max(30).optional(), relatedId: z.uuid().optional() }), req.body);
    const t = await ctx.db.transaction(async (tx) => {
      const [ticket] = await tx.insert(s.supportTickets).values({ userId: a.userId, subject: body.subject, category: body.category, relatedType: body.relatedType, relatedId: body.relatedId }).returning();
      await tx.insert(s.ticketMessages).values({ ticketId: ticket.id, authorId: a.userId, body: body.body });
      return ticket;
    });
    return { ticket: t };
  });

  app.get('/api/v1/support/tickets/:id', async (req) => {
    const a = requireAuth(req, { allowSuspended: true });
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [t] = await ctx.db.select().from(s.supportTickets).where(and(eq(s.supportTickets.id, id), eq(s.supportTickets.userId, a.userId)));
    if (!t) throw notFound('Ticket');
    const msgs = await ctx.db.select().from(s.ticketMessages).where(eq(s.ticketMessages.ticketId, id)).orderBy(s.ticketMessages.createdAt);
    return { ticket: t, messages: msgs };
  });

  app.post('/api/v1/support/tickets/:id/messages', async (req) => {
    const a = requireAuth(req, { allowSuspended: true });
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(5000) }), req.body);
    const [t] = await ctx.db.select().from(s.supportTickets).where(and(eq(s.supportTickets.id, id), eq(s.supportTickets.userId, a.userId)));
    if (!t) throw notFound('Ticket');
    if (t.status === 'closed') throw badRequest('This ticket is closed. Open a new one if you need more help.');
    await ctx.db.insert(s.ticketMessages).values({ ticketId: id, authorId: a.userId, body });
    await ctx.db.update(s.supportTickets).set({ status: 'open', updatedAt: new Date() }).where(eq(s.supportTickets.id, id));
    return { ok: true };
  });

  app.get('/api/v1/appeals', async (req) => {
    const a = requireAuth(req, { allowSuspended: true });
    const actions = await ctx.db.select().from(s.moderationActions).where(and(eq(s.moderationActions.targetId, a.userId))).orderBy(desc(s.moderationActions.createdAt));
    const appeals = await ctx.db.select().from(s.appeals).where(eq(s.appeals.userId, a.userId)).orderBy(desc(s.appeals.createdAt));
    return { actions: actions.map((x) => ({ id: x.id, action: x.action, reason: x.reason, createdAt: x.createdAt })), appeals };
  });

  app.post('/api/v1/appeals', { config: { rateLimit: { max: 5, timeWindow: '1 day' } } }, async (req) => {
    const a = requireAuth(req, { allowSuspended: true });
    const { moderationActionId, body } = parse(z.object({ moderationActionId: z.uuid().optional(), body: z.string().trim().min(20).max(3000) }), req.body);
    const [r] = await ctx.db.insert(s.appeals).values({ userId: a.userId, moderationActionId, body }).returning();
    return { appeal: r };
  });

  /* ---------- Client error reporting (no personal data) ---------- */
  app.post('/api/v1/client-errors', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(z.object({ message: z.string().max(300), route: z.string().max(120), kind: z.string().max(40) }), req.body);
    req.log.warn({ clientError: { kind: body.kind, route: body.route, message: body.message.slice(0, 200) } }, 'client error');
    await track(ctx.db, req.auth?.userId ?? null, 'client_error', { kind: body.kind, route: body.route });
    return { ok: true };
  });
}

export async function deleteAccount(ctx: Ctx, userId: string, reason: string | null) {
  const diskFiles: string[] = [];
  const result = await ctx.db.transaction(async (tx) => {
    const [req] = await tx.insert(s.deletionRequests).values({ userId, status: 'requested', reason }).returning();
    const counts: Record<string, number> = {};
    const del = async (name: string, p: Promise<unknown[]>) => { counts[name] = (await p).length; };
    await del('birthProfiles', tx.delete(s.birthProfiles).where(eq(s.birthProfiles.userId, userId)).returning({ id: s.birthProfiles.id }));
    await del('charts', tx.delete(s.charts).where(eq(s.charts.userId, userId)).returning({ id: s.charts.id }));
    await del('savedInsights', tx.delete(s.savedInsights).where(eq(s.savedInsights.userId, userId)).returning({ id: s.savedInsights.id }));
    await del('timeline', tx.delete(s.timelineEvents).where(eq(s.timelineEvents.userId, userId)).returning({ id: s.timelineEvents.id }));
    await tx.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(or(eq(s.chartShareGrants.grantorId, userId), eq(s.chartShareGrants.granteeId, userId)));
    await del('bonds', tx.update(s.bonds).set({ deletedAt: new Date(), status: 'revoked' }).where(or(eq(s.bonds.ownerId, userId), eq(s.bonds.partnerUserId, userId))).returning({ id: s.bonds.id }));
    await tx.delete(s.bondNotes).where(eq(s.bondNotes.authorId, userId));
    await del('datingProfile', tx.delete(s.datingProfiles).where(eq(s.datingProfiles.userId, userId)).returning({ id: s.datingProfiles.userId }));
    await tx.update(s.datingMatches).set({ unmatchedAt: new Date(), unmatchedBy: userId }).where(and(isNull(s.datingMatches.unmatchedAt), or(eq(s.datingMatches.userA, userId), eq(s.datingMatches.userB, userId))));
    await del('matchmakingProfile', tx.delete(s.matchmakingProfiles).where(eq(s.matchmakingProfiles.userId, userId)).returning({ id: s.matchmakingProfiles.userId }));
    await tx.update(s.familyMembers).set({ status: 'revoked', revokedAt: new Date() }).where(or(eq(s.familyMembers.principalId, userId), eq(s.familyMembers.memberUserId, userId)));
    await del('posts', tx.update(s.posts).set({ deletedAt: new Date(), body: '', imageUrl: null, card: null }).where(eq(s.posts.authorId, userId)).returning({ id: s.posts.id }));
    await tx.update(s.comments).set({ deletedAt: new Date(), body: '' }).where(eq(s.comments.authorId, userId));
    await del('messages', tx.update(s.messages).set({ deletedAt: new Date(), body: '', attachmentUrl: null }).where(eq(s.messages.senderId, userId)).returning({ id: s.messages.id }));
    await tx.update(s.conversationMembers).set({ state: 'left' }).where(eq(s.conversationMembers.userId, userId));
    await tx.delete(s.follows).where(or(eq(s.follows.followerId, userId), eq(s.follows.followeeId, userId)));
    await del('personalityAssessments', tx.delete(s.assessmentResults).where(eq(s.assessmentResults.userId, userId)).returning({ id: s.assessmentResults.id }));
    await del('ritualResponses', tx.delete(s.ritualResponses).where(eq(s.ritualResponses.userId, userId)).returning({ id: s.ritualResponses.id }));
    // Game lines are withdrawn (so Memory Lane can never reuse them) and blanked.
    await del('gameSubmissions', tx.update(s.gameSubmissions).set({ withdrawnAt: new Date(), payload: {} }).where(eq(s.gameSubmissions.userId, userId)).returning({ id: s.gameSubmissions.id }));
    await tx.update(s.gameParticipants).set({ leftAt: new Date(), allowReuse: false, shareIdentity: false }).where(eq(s.gameParticipants.userId, userId));
    await tx.update(s.circleInvites).set({ revokedAt: new Date() }).where(eq(s.circleInvites.createdBy, userId));
    await tx.delete(s.groupMembers).where(and(eq(s.groupMembers.userId, userId), sql`${s.groupMembers.role} <> 'owner'`));
    await tx.update(s.groups).set({ archivedAt: new Date() }).where(and(eq(s.groups.ownerId, userId), eq(s.groups.kind, 'circle'), isNull(s.groups.archivedAt)));
    await tx.delete(s.notifications).where(eq(s.notifications.userId, userId));
    await tx.delete(s.sessions).where(eq(s.sessions.userId, userId));
    await tx.delete(s.userLocations).where(eq(s.userLocations.userId, userId));
    await tx.delete(s.searchHistory).where(eq(s.searchHistory.userId, userId));
    await tx.delete(s.cartItems).where(eq(s.cartItems.userId, userId));
    // Uploaded files (avatars, post images, verification selfies): database copies now, disk copies after commit.
    const files = await tx.select({ path: s.uploads.path }).from(s.uploads).where(eq(s.uploads.ownerId, userId));
    if (files.length) await tx.delete(s.storedFiles).where(inArray(s.storedFiles.path, files.map((f) => f.path)));
    await del('uploads', tx.delete(s.uploads).where(eq(s.uploads.ownerId, userId)).returning({ id: s.uploads.id }));
    diskFiles.push(...files.map((f) => f.path));
    // Analytics keep only anonymous aggregates after deletion.
    await tx.update(s.analyticsEvents).set({ userId: null }).where(eq(s.analyticsEvents.userId, userId));
    await tx.delete(s.penMutes).where(or(eq(s.penMutes.muterId, userId), eq(s.penMutes.authorId, userId)));
    await tx.delete(s.mfaRecoveryCodes).where(eq(s.mfaRecoveryCodes.userId, userId));
    const adKey = adViewerKey(ctx.config.appSecret, userId);
    await tx.delete(s.adDelivery).where(eq(s.adDelivery.viewerKey, adKey));
    await tx.delete(s.adHides).where(eq(s.adHides.viewerKey, adKey));
    await tx.update(s.affiliateClicks).set({ viewerKey: 'deleted' }).where(eq(s.affiliateClicks.viewerKey, adKey));
    await tx.delete(s.orgMembers).where(and(eq(s.orgMembers.userId, userId), sql`${s.orgMembers.role} <> 'owner'`));
    await tx.delete(s.circleMemberTiers).where(eq(s.circleMemberTiers.userId, userId));
    await tx.delete(s.journalEntries).where(eq(s.journalEntries.userId, userId));
    await tx.delete(s.yearCards).where(eq(s.yearCards.userId, userId));
    await tx.update(s.circleListings).set({ status: 'closed', description: '', imageUrls: [] }).where(eq(s.circleListings.sellerId, userId));
    await tx.delete(s.listingInterests).where(eq(s.listingInterests.userId, userId));
    await tx.update(s.listingMessages).set({ body: '[deleted]' }).where(eq(s.listingMessages.senderId, userId));
    await tx.delete(s.closeFriends).where(or(eq(s.closeFriends.ownerId, userId), eq(s.closeFriends.friendId, userId)));
    await tx.delete(s.postCollections).where(eq(s.postCollections.ownerId, userId));
    await tx.update(s.memberQuizzes).set({ status: 'removed' }).where(eq(s.memberQuizzes.authorId, userId));
    await tx.delete(s.memberQuizAttempts).where(eq(s.memberQuizAttempts.userId, userId));
    // Tournaments: hosted ones that are still running are called off; your entries (and answers) are removed.
    await tx.update(s.tournaments).set({ cancelledAt: new Date() }).where(and(eq(s.tournaments.hostId, userId), isNull(s.tournaments.cancelledAt)));
    await tx.delete(s.tournamentEntries).where(eq(s.tournamentEntries.userId, userId));
    await tx.update(s.eventSeries).set({ endedAt: new Date() }).where(and(eq(s.eventSeries.hostId, userId), isNull(s.eventSeries.endedAt)));
    // Creator page goes; the earnings ledger and tip amounts stay for accounting, without names or messages.
    await tx.delete(s.creatorProfiles).where(eq(s.creatorProfiles.userId, userId));
    await tx.update(s.creatorOfferings).set({ status: 'archived' }).where(eq(s.creatorOfferings.creatorId, userId));
    await tx.delete(s.creatorOfferingInterests).where(eq(s.creatorOfferingInterests.userId, userId));
    await tx.update(s.creatorTips).set({ message: '', anonymous: true, showOnWall: false }).where(or(eq(s.creatorTips.fromUserId, userId), eq(s.creatorTips.creatorId, userId)));
    // COD orders: drafts go; finished orders keep amounts for accounting but lose the delivery address. Orders still
    // on their way keep the address until they are delivered or returned.
    await tx.delete(s.codOrders).where(and(eq(s.codOrders.userId, userId), eq(s.codOrders.status, 'draft')));
    await tx.update(s.codOrders).set({ address: { redacted: true } }).where(and(eq(s.codOrders.userId, userId), inArray(s.codOrders.status, ['delivered', 'cancelled', 'returned', 'rto', 'refunded'])));
    await tx.update(s.identityShares).set({ revokedAt: new Date(), displayName: null }).where(eq(s.identityShares.userId, userId));
    await tx.update(s.expertProfiles).set({ verificationStatus: 'suspended', acceptsBookings: false, bio: '', displayName: 'Former expert' }).where(eq(s.expertProfiles.userId, userId));
    await tx.update(s.profiles).set({ handle: `deleted-${userId.slice(0, 8)}`, displayName: 'Deleted user', fullName: null, bio: '', statusText: '', avatarUrl: null, interests: [], visibility: 'private', featuredBadges: [], featuredInsights: [], pseudonym: null, identityLabels: [] }).where(eq(s.profiles.userId, userId));
    await tx.update(s.users).set({ email: `deleted+${userId}@invalid.nakshatra`, passwordHash: 'disabled', mfaSecret: null, mfaEnabled: false, status: 'deleted', deletedAt: new Date() }).where(eq(s.users.id, userId));
    await tx.update(s.deletionRequests).set({ status: 'completed', completedAt: new Date(), summary: counts }).where(eq(s.deletionRequests.id, req.id));
    await audit(tx, { actorId: userId, action: 'privacy.account_deleted', targetType: 'user', targetId: sha256(userId).slice(0, 16) });
    await track(tx, null, 'account_deleted', {});
    return { ...counts, retained: ['orders', 'payments', 'refunds', 'bookings (accounting records, pseudonymised)', 'security audit log entries'] };
  });
  // Local-disk uploads are removed after the transaction commits (no-op for database storage).
  if (ctx.config.STORAGE_DRIVER === 'local') {
    const { rm } = await import('node:fs/promises');
    const { resolve, normalize } = await import('node:path');
    const root = resolve(ctx.config.UPLOAD_DIR);
    for (const p of diskFiles) {
      const full = resolve(root, normalize(p));
      if (full.startsWith(root)) await rm(full, { force: true }).catch(() => undefined);
    }
  }
  return result;
}
