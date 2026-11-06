import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { AppError, badRequest, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { notify } from '../lib/notify';
import { displayNames } from '../services/identity';
import { circleLevel } from '../services/progress';
import { evaluateReferral } from '../services/referrals';
import { recordFirstAction } from '../services/activation';
import { blockedPhrases, screenText } from '../services/moderation';
import { hydratePosts, muteFilters } from './social';
import { flagEnabled, requireFeature } from '../services/settings';
import { enabledModules } from '../services/modules';
import { PERSONA_BY_KEY, type Vector } from '../../shared/personality';
import { commonGround, type SharedView } from '../../shared/commonGround';

import { ACTIVATION_MEMBERS, CIRCLE_THEMES, INVITE_MAX_USES, INVITE_TTL_DAYS, MAX_OWNED_CIRCLES, circleMembership, circlePoints, circlePointsMany, contributingMembers, isAdmin, requireCircle } from '../services/circles';

export async function circleRoutes(app: FastifyInstance, ctx: Ctx) {
  /** Which product areas are switched on for this viewer (feature flags, server-authoritative). */
  app.get('/api/v1/features', async (req) => {
    const uid = req.auth?.userId ?? null;
    const modules = await enabledModules(ctx.db, uid);
    // `features` keeps the original shape for older clients; `modules` covers every product module.
    const keys = ['circles', 'play', 'dating', 'matchmaking', 'weddings', 'experts'];
    return {
      features: Object.fromEntries(await Promise.all(keys.map(async (k) => [k, modules[k] ?? (await flagEnabled(ctx.db, k, uid))] as const))),
      modules,
      payments: { enabled: ctx.config.PAYMENTS_ENABLED === 'true' || (ctx.config.PAYMENT_PROVIDER === 'dev_simulator' && !ctx.config.isProd), provider: ctx.config.PAYMENT_PROVIDER, testMode: ctx.config.PAYMENT_PROVIDER === 'dev_simulator' },
    };
  });

  app.get('/api/v1/circles', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select({ g: s.groups, role: s.groupMembers.role }).from(s.groupMembers).innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId))
      .where(and(eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active'), eq(s.groups.kind, 'circle'), isNull(s.groups.archivedAt))).orderBy(desc(s.groups.createdAt));
    const ids = rows.map((r) => r.g.id);
    const counts = ids.length ? await ctx.db.select({ g: s.groupMembers.groupId, n: sql<number>`count(*)::int` }).from(s.groupMembers).where(and(inArray(s.groupMembers.groupId, ids), eq(s.groupMembers.status, 'active'))).groupBy(s.groupMembers.groupId) : [];
    const live = ids.length ? await ctx.db.select({ c: s.gameSessions.circleId, n: sql<number>`count(*)::int` }).from(s.gameSessions).where(and(inArray(s.gameSessions.circleId, ids), inArray(s.gameSessions.status, ['lobby', 'active']))).groupBy(s.gameSessions.circleId) : [];
    // Contribution points for every circle in three grouped queries (was three queries per circle).
    const points = await circlePointsMany(ctx.db, ids);
    const circles = rows.map((r) => ({ id: r.g.id, name: r.g.name, description: r.g.description, theme: r.g.theme, role: r.role, memberCount: counts.find((c) => c.g === r.g.id)?.n ?? 0, liveGames: live.find((l) => l.c === r.g.id)?.n ?? 0, level: circleLevel(points.get(r.g.id) ?? 0) }));
    return { circles };
  });

  app.post('/api/v1/circles', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    await requireFeature(ctx.db, 'circles', a.userId);
    const body = parse(z.object({ name: z.string().trim().min(2).max(40), description: z.string().trim().max(200).default(''), theme: z.enum(CIRCLE_THEMES).default('dusk') }), req.body);
    const screened = screenText(`${body.name} ${body.description}`, await blockedPhrases(ctx.db));
    if (!screened.ok) throw badRequest(screened.reason!);
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.groups).where(and(eq(s.groups.ownerId, a.userId), eq(s.groups.kind, 'circle'), isNull(s.groups.archivedAt)));
    if (n >= MAX_OWNED_CIRCLES) throw badRequest(`You can run up to ${MAX_OWNED_CIRCLES} circles.`);
    const slug = `c-${randomToken(9).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
    const circle = await ctx.db.transaction(async (tx) => {
      const [g] = await tx.insert(s.groups).values({ slug, name: body.name, description: body.description, visibility: 'private', kind: 'circle', ownerId: a.userId, theme: body.theme }).returning();
      await tx.insert(s.groupMembers).values({ groupId: g.id, userId: a.userId, role: 'owner', status: 'active' });
      await track(tx, a.userId, 'circle_created', { theme: body.theme });
      return g;
    });
    return { circle: { id: circle.id, name: circle.name, theme: circle.theme } };
  });

  app.get('/api/v1/circles/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { circle, member } = await requireCircle(ctx.db, id, a.userId);
    const members = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active'))).orderBy(s.groupMembers.createdAt);
    const names = await displayNames(ctx.db, members.map((m) => m.userId));
    const profiles = await ctx.db.select({ u: s.profiles.userId, fv: s.profiles.fieldVisibility }).from(s.profiles).where(inArray(s.profiles.userId, members.map((m) => m.userId)));
    const latest = await ctx.db.execute(sql`select distinct on (user_id) user_id, archetype_key from assessment_results where user_id in (${sql.join(members.map((m) => sql`${m.userId}`), sql`, `)}) order by user_id, created_at desc`) as unknown as { rows: { user_id: string; archetype_key: string }[] };
    const contributors = await contributingMembers(ctx.db, id);
    return {
      circle: { id: circle.id, name: circle.name, description: circle.description, theme: circle.theme, invitePolicy: circle.invitePolicy, createdAt: circle.createdAt, ownerId: circle.ownerId },
      me: { role: member.role, canInvite: isAdmin(member) || circle.invitePolicy === 'members', isAdmin: isAdmin(member) },
      members: members.map((m) => {
        // Circle members see an archetype only when its owner made it public (persona visibility).
        const vis = ((profiles.find((p) => p.u === m.userId)?.fv ?? {}) as Record<string, string>).persona ?? 'public';
        const key = latest.rows.find((r) => r.user_id === m.userId)?.archetype_key;
        return { userId: m.userId, role: m.role, joinedAt: m.createdAt, ...names.get(m.userId), archetype: key && (vis === 'public' || m.userId === a.userId) ? PERSONA_BY_KEY[key]?.name ?? null : null, contributed: contributors.has(m.userId) };
      }),
      level: circleLevel(await circlePoints(ctx.db, id)),
      activation: { contributors: contributors.size, needed: ACTIVATION_MEMBERS },
    };
  });

  app.patch('/api/v1/circles/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(ctx.db, id, a.userId);
    if (!isAdmin(member)) throw forbidden('Only circle admins can change settings.');
    const body = parse(z.object({ name: z.string().trim().min(2).max(40), description: z.string().trim().max(200), theme: z.enum(CIRCLE_THEMES), invitePolicy: z.enum(['admins', 'members']) }).partial(), req.body);
    if (body.name || body.description) {
      const screened = screenText(`${body.name ?? ''} ${body.description ?? ''}`, await blockedPhrases(ctx.db));
      if (!screened.ok) throw badRequest(screened.reason!);
    }
    await ctx.db.update(s.groups).set(body).where(eq(s.groups.id, id));
    return { ok: true };
  });

  app.delete('/api/v1/circles/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member, circle } = await requireCircle(ctx.db, id, a.userId);
    if (member.role !== 'owner') throw forbidden('Only the owner can archive a circle.');
    await ctx.db.update(s.groups).set({ archivedAt: new Date() }).where(eq(s.groups.id, id));
    await ctx.db.update(s.circleInvites).set({ revokedAt: new Date() }).where(and(eq(s.circleInvites.circleId, id), isNull(s.circleInvites.revokedAt)));
    await audit(ctx.db, { actorId: a.userId, action: 'circle.archive', targetType: 'group', targetId: id, meta: { name: circle.name } });
    return { ok: true };
  });

  /* ---------- Invitations ---------- */

  app.post('/api/v1/circles/:id/invites', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member, circle } = await requireCircle(ctx.db, id, a.userId);
    if (!isAdmin(member) && circle.invitePolicy !== 'members') throw forbidden('Only circle admins can invite in this circle.');
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);
    const [inv] = await ctx.db.insert(s.circleInvites).values({ circleId: id, createdBy: a.userId, tokenHash: sha256(token), expiresAt, maxUses: INVITE_MAX_USES }).returning();
    await track(ctx.db, a.userId, 'circle_invite_created', {});
    return { invite: { id: inv.id, expiresAt, maxUses: inv.maxUses }, url: `${ctx.config.APP_ORIGIN}/c/join/${token}`, token };
  });

  app.get('/api/v1/circles/:id/invites', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(ctx.db, id, a.userId);
    const rows = await ctx.db.select().from(s.circleInvites).where(and(eq(s.circleInvites.circleId, id), isNull(s.circleInvites.revokedAt), gte(s.circleInvites.expiresAt, new Date()), isAdmin(member) ? undefined : eq(s.circleInvites.createdBy, a.userId))).orderBy(desc(s.circleInvites.createdAt));
    const names = await displayNames(ctx.db, rows.map((r) => r.createdBy));
    return { invites: rows.map((r) => ({ id: r.id, createdBy: names.get(r.createdBy)?.displayName, expiresAt: r.expiresAt, uses: r.uses, maxUses: r.maxUses })) };
  });

  app.delete('/api/v1/circles/:id/invites/:inviteId', async (req) => {
    const a = requireAuth(req);
    const { id, inviteId } = parse(z.object({ id: z.uuid(), inviteId: z.uuid() }), req.params);
    const { member } = await requireCircle(ctx.db, id, a.userId);
    const res = await ctx.db.update(s.circleInvites).set({ revokedAt: new Date() }).where(and(eq(s.circleInvites.id, inviteId), eq(s.circleInvites.circleId, id), isAdmin(member) ? undefined : eq(s.circleInvites.createdBy, a.userId))).returning();
    if (!res.length) throw notFound('Invite');
    return { ok: true };
  });

  async function inviteFor(token: string) {
    const [inv] = await ctx.db.select().from(s.circleInvites).where(eq(s.circleInvites.tokenHash, sha256(token)));
    if (!inv) throw notFound('Invite');
    const [circle] = await ctx.db.select().from(s.groups).where(and(eq(s.groups.id, inv.circleId), isNull(s.groups.archivedAt)));
    if (!circle) throw notFound('Invite');
    if (inv.revokedAt) throw new AppError(410, 'invite_revoked', 'This invite link was turned off. Ask for a new one.');
    if (inv.expiresAt < new Date()) throw new AppError(410, 'invite_expired', 'This invite link has expired. Ask for a new one.');
    if (inv.uses >= inv.maxUses) throw new AppError(410, 'invite_used_up', 'This invite link has been used the maximum number of times.');
    return { inv, circle };
  }

  /** Public preview of an invite: only the circle name, theme, size and inviter. No members, posts or activity. */
  app.get('/api/v1/circle-invites/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { token } = parse(z.object({ token: z.string().min(16).max(64) }), req.params);
    const { inv, circle } = await inviteFor(token);
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, circle.id), eq(s.groupMembers.status, 'active')));
    const inviter = (await displayNames(ctx.db, [inv.createdBy])).get(inv.createdBy);
    const viewerId = req.auth?.userId;
    const already = viewerId ? Boolean(await circleMembership(ctx.db, circle.id, viewerId)) : false;
    return { circle: { name: circle.name, theme: circle.theme, memberCount: n }, invitedBy: inviter?.displayName ?? 'A member', expiresAt: inv.expiresAt, alreadyMember: already, circleId: already ? circle.id : undefined };
  });

  app.post('/api/v1/circle-invites/:token/accept', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { token } = parse(z.object({ token: z.string().min(16).max(64) }), req.params);
    await requireFeature(ctx.db, 'circles', a.userId);
    const { inv, circle } = await inviteFor(token);
    const [existing] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, circle.id), eq(s.groupMembers.userId, a.userId)));
    if (existing?.status === 'banned') throw forbidden('You cannot join this circle.');
    if (existing?.status === 'active') return { circleId: circle.id, joined: false };
    const joined = await ctx.db.transaction(async (tx) => {
      // Atomic use count: concurrent accepts can never exceed maxUses.
      const used = await tx.update(s.circleInvites).set({ uses: sql`${s.circleInvites.uses} + 1` }).where(and(eq(s.circleInvites.id, inv.id), lt(s.circleInvites.uses, s.circleInvites.maxUses))).returning();
      if (!used.length) throw new AppError(410, 'invite_used_up', 'This invite link has been used the maximum number of times.');
      if (existing) await tx.update(s.groupMembers).set({ status: 'active', role: 'member' }).where(and(eq(s.groupMembers.groupId, circle.id), eq(s.groupMembers.userId, a.userId)));
      else await tx.insert(s.groupMembers).values({ groupId: circle.id, userId: a.userId, role: 'member', status: 'active' });
      await track(tx, a.userId, 'circle_invite_accepted', {});
      await recordFirstAction(tx, a.userId, 'circle');
      return true;
    });
    const me = (await displayNames(ctx.db, [a.userId])).get(a.userId);
    if (inv.createdBy !== a.userId) await notify(ctx, ctx.db, { userId: inv.createdBy, category: 'circles', title: `${me?.displayName ?? 'Someone'} joined ${circle.name}`, link: `/circles/${circle.id}`, dedupeKey: `circle-join:${circle.id}:${a.userId}` });
    await evaluateReferral(ctx, ctx.db, a.userId);
    return { circleId: circle.id, joined };
  });

  /* ---------- Membership ---------- */

  app.post('/api/v1/circles/:id/leave', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(ctx.db, id, a.userId);
    if (member.role === 'owner') {
      const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active'), ne(s.groupMembers.userId, a.userId)));
      if (n > 0) throw badRequest('Transfer ownership to another member before leaving, or archive the circle.');
      await ctx.db.update(s.groups).set({ archivedAt: new Date() }).where(eq(s.groups.id, id));
    }
    await ctx.db.delete(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, a.userId)));
    return { ok: true };
  });

  app.post('/api/v1/circles/:id/members/:userId', async (req) => {
    const a = requireAuth(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const { action } = parse(z.object({ action: z.enum(['remove', 'make_admin', 'remove_admin', 'transfer_ownership']) }), req.body);
    const { member } = await requireCircle(ctx.db, id, a.userId);
    if (!isAdmin(member)) throw forbidden('Only circle admins can manage members.');
    if (['make_admin', 'remove_admin', 'transfer_ownership'].includes(action) && member.role !== 'owner') throw forbidden('Only the owner can change roles.');
    if (userId === a.userId) throw badRequest('Use “Leave circle” to change your own membership.');
    const target = await circleMembership(ctx.db, id, userId);
    if (!target) throw notFound('Member');
    if (target.member.role === 'owner') throw forbidden('The owner cannot be removed.');
    if (action === 'remove' && target.member.role === 'moderator' && member.role !== 'owner') throw forbidden('Only the owner can remove an admin.');
    await ctx.db.transaction(async (tx) => {
      const where = and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId));
      if (action === 'remove') await tx.delete(s.groupMembers).where(where);
      if (action === 'make_admin') await tx.update(s.groupMembers).set({ role: 'moderator' }).where(where);
      if (action === 'remove_admin') await tx.update(s.groupMembers).set({ role: 'member' }).where(where);
      if (action === 'transfer_ownership') {
        await tx.update(s.groupMembers).set({ role: 'owner' }).where(where);
        await tx.update(s.groupMembers).set({ role: 'moderator' }).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, a.userId)));
        await tx.update(s.groups).set({ ownerId: userId }).where(eq(s.groups.id, id));
      }
    });
    await audit(ctx.db, { actorId: a.userId, action: `circle.${action}`, targetType: 'group', targetId: id, meta: { userId } });
    return { ok: true };
  });

  /* ---------- Common ground (two co-members) ---------- */

  /**
   * Common Ground card between you and another member of the same circle: shared labels, similar and
   * different dimensions, and a few conversation starters. Uses only what each person made public
   * (archetype and labels visibility); returns no ids beyond the circle membership both already share.
   */
  app.get('/api/v1/circles/:id/common-ground/:userId', async (req) => {
    const a = requireAuth(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    await requireCircle(ctx.db, id, a.userId);
    if (userId === a.userId) throw badRequest('Pick someone else in the circle.');
    if (!(await circleMembership(ctx.db, id, userId))) throw notFound('Member');
    const view = async (uid: string, self: boolean): Promise<SharedView> => {
      const [p] = await ctx.db.select({ name: s.profiles.displayName, labels: s.profiles.identityLabels, fv: s.profiles.fieldVisibility }).from(s.profiles).where(eq(s.profiles.userId, uid));
      const fv = (p?.fv ?? {}) as Record<string, string>;
      const personaOk = self || (fv.persona ?? 'public') === 'public';
      const labelsOk = self || (fv.labels ?? 'public') === 'public';
      const [r] = personaOk ? await ctx.db.select({ k: s.assessmentResults.archetypeKey, sc: s.assessmentResults.scores }).from(s.assessmentResults).where(eq(s.assessmentResults.userId, uid)).orderBy(desc(s.assessmentResults.createdAt)).limit(1) : [];
      return { name: p?.name ?? 'Member', archetype: r?.k ?? null, scores: (r?.sc as Vector | undefined) ?? null, labels: labelsOk ? p?.labels ?? [] : [] };
    };
    const me = await view(a.userId, true);
    const them = await view(userId, false);
    const cg = commonGround(me, them, [a.userId, userId].sort().join(':'));
    return { with: { name: them.name, archetype: them.archetype ? PERSONA_BY_KEY[them.archetype]?.name ?? null : null }, ...cg };
  });

  /* ---------- Circle feed and recap ---------- */

  app.get('/api/v1/circles/:id/feed', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { before, channel } = parse(z.object({ before: z.iso.datetime().optional(), channel: z.union([z.literal('general'), z.uuid()]).optional() }), req.query);
    await requireCircle(ctx.db, id, a.userId);
    const isMuted = await muteFilters(ctx.db, a.userId);
    const rows = await ctx.db.select().from(s.posts).where(and(eq(s.posts.groupId, id), isNull(s.posts.deletedAt), eq(s.posts.hiddenByModeration, false), channel === 'general' ? isNull(s.posts.channelId) : channel ? eq(s.posts.channelId, channel) : undefined, before ? lt(s.posts.createdAt, new Date(before)) : undefined)).orderBy(desc(s.posts.createdAt)).limit(21);
    const page = rows.slice(0, 20).filter((r) => !isMuted(r));
    return { posts: await hydratePosts(ctx.db, a.userId, page), nextBefore: rows.length > 20 ? rows[19].createdAt.toISOString() : null };
  });

  /** Weekly recap built only from real activity in the last 7 days. */
  app.get('/api/v1/circles/:id/recap', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await requireCircle(ctx.db, id, a.userId);
    const since = new Date(Date.now() - 7 * 86400000);
    const n = sql<number>`count(*)::int`;
    const [posts] = await ctx.db.select({ n }).from(s.posts).where(and(eq(s.posts.groupId, id), isNull(s.posts.deletedAt), gte(s.posts.createdAt, since)));
    const [answers] = await ctx.db.select({ n }).from(s.ritualResponses).where(and(eq(s.ritualResponses.circleKey, id), gte(s.ritualResponses.createdAt, since)));
    const games = await ctx.db.select({ key: s.gameSessions.gameKey, n }).from(s.gameSessions).where(and(eq(s.gameSessions.circleId, id), eq(s.gameSessions.status, 'completed'), gte(s.gameSessions.completedAt, since))).groupBy(s.gameSessions.gameKey);
    const [joined] = await ctx.db.select({ n }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active'), gte(s.groupMembers.createdAt, since)));
    const gamesTotal = games.reduce((t, g) => t + g.n, 0);
    return {
      since, posts: posts.n, ritualAnswers: answers.n, gamesCompleted: gamesTotal, newMembers: joined.n,
      topGame: games.sort((x, y) => y.n - x.n)[0]?.key ?? null,
      quiet: posts.n + answers.n + gamesTotal === 0,
    };
  });
}
