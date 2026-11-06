import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth, requireCapability } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames } from '../services/identity';
import { ORG_KINDS, ORG_RULES as R, emailOnDomain, teamComposition } from '../../shared/orgs';
import type { Vector } from '../../shared/personality';

type Org = typeof s.organisations.$inferSelect;
type OrgMember = typeof s.orgMembers.$inferSelect;
const isOrgAdmin = (m: OrgMember) => m.role === 'owner' || m.role === 'admin';

export async function orgRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;

  /** Every org route goes through this: non-members get "not found", so organisations can't be probed. */
  async function requireOrg(orgId: string, userId: string): Promise<{ org: Org; me: OrgMember }> {
    const [org] = await db.select().from(s.organisations).where(eq(s.organisations.id, orgId));
    const [me] = org ? await db.select().from(s.orgMembers).where(and(eq(s.orgMembers.orgId, orgId), eq(s.orgMembers.userId, userId))) : [];
    if (!org || !me || org.status !== 'active') throw notFound('Organisation');
    return { org, me };
  }
  async function requireOrgAdmin(orgId: string, userId: string) {
    const r = await requireOrg(orgId, userId);
    if (!isOrgAdmin(r.me)) throw forbidden('Only organisation admins can do that.');
    return r;
  }

  /* ---------------- Staff ---------------- */

  app.get('/api/v1/admin/orgs', async (req) => {
    requireCapability(req, 'commerce');
    const orgs = await db.select().from(s.organisations).orderBy(desc(s.organisations.createdAt));
    const counts = orgs.length ? await db.select({ o: s.orgMembers.orgId, n: sql<number>`count(*)::int` }).from(s.orgMembers).where(inArray(s.orgMembers.orgId, orgs.map((o) => o.id))).groupBy(s.orgMembers.orgId) : [];
    return { orgs: orgs.map((o) => ({ ...o, members: counts.find((c) => c.o === o.id)?.n ?? 0 })) };
  });

  /** Staff set up an organisation and name its owner (an existing member, by email). */
  app.post('/api/v1/admin/orgs', async (req, reply) => {
    const a = requireCapability(req, 'commerce');
    const body = parse(z.object({ name: z.string().trim().min(2).max(80), kind: z.enum(ORG_KINDS), emailDomain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).optional(), seatLimit: z.number().int().min(2).max(R.maxSeats).default(50), ownerEmail: z.email() }), req.body);
    const [owner] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${body.ownerEmail.toLowerCase()}`);
    if (!owner) throw notFound('No Nakshatra account uses that email');
    const org = await db.transaction(async (tx) => {
      const [o] = await tx.insert(s.organisations).values({ name: body.name, kind: body.kind, emailDomain: body.emailDomain ?? null, seatLimit: body.seatLimit, createdBy: a.userId }).returning();
      await tx.insert(s.orgMembers).values({ orgId: o.id, userId: owner.id, role: 'owner' });
      return o;
    });
    await audit(db, { actorId: a.userId, action: 'orgs.created', targetType: 'organisation', targetId: org.id, meta: { name: org.name, seats: org.seatLimit } });
    return reply.code(201).send({ org: { id: org.id, name: org.name } });
  });

  app.patch('/api/v1/admin/orgs/:id', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ seatLimit: z.number().int().min(2).max(R.maxSeats), status: z.enum(['active', 'suspended']) }).partial(), req.body);
    const [o] = await db.update(s.organisations).set(body).where(eq(s.organisations.id, id)).returning();
    if (!o) throw notFound('Organisation');
    await audit(db, { actorId: a.userId, action: 'orgs.updated', targetType: 'organisation', targetId: id, meta: body });
    return { ok: true };
  });

  /* ---------------- Members ---------------- */

  app.get('/api/v1/orgs', async (req) => {
    const a = requireAuth(req);
    const rows = await db.select({ o: s.organisations, role: s.orgMembers.role }).from(s.orgMembers).innerJoin(s.organisations, eq(s.organisations.id, s.orgMembers.orgId))
      .where(and(eq(s.orgMembers.userId, a.userId), eq(s.organisations.status, 'active')));
    return { orgs: rows.map((r) => ({ id: r.o.id, name: r.o.name, kind: r.o.kind, role: r.role })) };
  });

  app.get('/api/v1/orgs/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { org, me } = await requireOrg(id, a.userId);
    const members = await db.select().from(s.orgMembers).where(eq(s.orgMembers.orgId, id)).orderBy(s.orgMembers.createdAt).limit(1000);
    const names = await displayNames(db, members.map((m) => m.userId));
    const circles = await db.select({ g: s.groups }).from(s.groups).where(and(eq(s.groups.orgId, id), isNull(s.groups.archivedAt))).orderBy(desc(s.groups.createdAt));
    const mineIn = circles.length ? new Set((await db.select({ g: s.groupMembers.groupId }).from(s.groupMembers).where(and(eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active'), inArray(s.groupMembers.groupId, circles.map((c) => c.g.id))))).map((r) => r.g)) : new Set<string>();
    const counts = circles.length ? await db.select({ g: s.groupMembers.groupId, n: sql<number>`count(*)::int` }).from(s.groupMembers).where(and(eq(s.groupMembers.status, 'active'), inArray(s.groupMembers.groupId, circles.map((c) => c.g.id)))).groupBy(s.groupMembers.groupId) : [];
    return {
      org: { id: org.id, name: org.name, kind: org.kind, emailDomain: org.emailDomain, seatLimit: org.seatLimit, seatsUsed: members.length },
      me: { role: me.role, isAdmin: isOrgAdmin(me), includeInAggregate: me.includeInAggregate },
      // Names and roles only — never personality, astrology or activity.
      members: members.map((m) => ({ userId: m.userId, name: names.get(m.userId)?.displayName ?? 'Member', handle: names.get(m.userId)?.handle ?? null, role: m.role, you: m.userId === a.userId })),
      circles: circles.map((c) => ({ id: c.g.id, name: c.g.name, description: c.g.description, memberCount: counts.find((x) => x.g === c.g.id)?.n ?? 0, joined: mineIn.has(c.g.id) })),
    };
  });

  app.put('/api/v1/orgs/:id/aggregate', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await requireOrg(id, a.userId);
    const { include } = parse(z.object({ include: z.boolean() }), req.body);
    await db.update(s.orgMembers).set({ includeInAggregate: include }).where(and(eq(s.orgMembers.orgId, id), eq(s.orgMembers.userId, a.userId)));
    return { include };
  });

  /** Leaving removes you from the organisation's circles too. Owners hand over first. */
  app.post('/api/v1/orgs/:id/leave', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { me } = await requireOrg(id, a.userId);
    if (me.role === 'owner') throw badRequest('Make someone else the owner before leaving.');
    await removeFromOrg(id, a.userId);
    return { ok: true };
  });

  async function removeFromOrg(orgId: string, userId: string) {
    await db.transaction(async (tx) => {
      const circles = (await tx.select({ id: s.groups.id }).from(s.groups).where(eq(s.groups.orgId, orgId))).map((r) => r.id);
      if (circles.length) await tx.delete(s.groupMembers).where(and(eq(s.groupMembers.userId, userId), inArray(s.groupMembers.groupId, circles), sql`${s.groupMembers.role} <> 'owner'`));
      await tx.delete(s.orgMembers).where(and(eq(s.orgMembers.orgId, orgId), eq(s.orgMembers.userId, userId)));
    });
  }

  app.post('/api/v1/orgs/:id/members/:userId', async (req) => {
    const a = requireAuth(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const { me } = await requireOrgAdmin(id, a.userId);
    const { action } = parse(z.object({ action: z.enum(['remove', 'make_admin', 'remove_admin', 'make_owner']) }), req.body);
    if (userId === a.userId) throw badRequest('Use “Leave” to change your own membership.');
    const [target] = await db.select().from(s.orgMembers).where(and(eq(s.orgMembers.orgId, id), eq(s.orgMembers.userId, userId)));
    if (!target) throw notFound('Member');
    if (target.role === 'owner') throw forbidden('The owner can’t be changed here.');
    if (action !== 'remove' && me.role !== 'owner') throw forbidden('Only the owner can change roles.');
    if (action === 'remove' && target.role === 'admin' && me.role !== 'owner') throw forbidden('Only the owner can remove an admin.');
    const where = and(eq(s.orgMembers.orgId, id), eq(s.orgMembers.userId, userId));
    if (action === 'remove') await removeFromOrg(id, userId);
    if (action === 'make_admin') await db.update(s.orgMembers).set({ role: 'admin' }).where(where);
    if (action === 'remove_admin') await db.update(s.orgMembers).set({ role: 'member' }).where(where);
    if (action === 'make_owner') await db.transaction(async (tx) => {
      await tx.update(s.orgMembers).set({ role: 'owner' }).where(where);
      await tx.update(s.orgMembers).set({ role: 'admin' }).where(and(eq(s.orgMembers.orgId, id), eq(s.orgMembers.userId, a.userId)));
    });
    await audit(db, { actorId: a.userId, action: `org.${action}`, targetType: 'organisation', targetId: id, meta: { userId } });
    return { ok: true };
  });

  /* ---------------- Invites ---------------- */

  app.post('/api/v1/orgs/:id/invites', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { org } = await requireOrgAdmin(id, a.userId);
    const { requireDomain, maxUses } = parse(z.object({ requireDomain: z.boolean().default(false), maxUses: z.number().int().min(1).max(R.maxInviteUses).default(50) }), req.body);
    if (requireDomain && !org.emailDomain) throw badRequest('This organisation has no email domain set.');
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + R.inviteDays * 864e5);
    await db.insert(s.orgInvites).values({ orgId: id, tokenHash: sha256(token), requireDomain, maxUses, expiresAt, createdBy: a.userId });
    return { token, url: `${ctx.config.APP_ORIGIN}/org/join/${token}`, expiresAt };
  });

  async function inviteFor(token: string) {
    const [inv] = await db.select().from(s.orgInvites).where(eq(s.orgInvites.tokenHash, sha256(token)));
    if (!inv || inv.revokedAt || inv.expiresAt < new Date()) throw new AppError(410, 'invite_expired', 'This invite link has expired or was turned off.');
    const [org] = await db.select().from(s.organisations).where(eq(s.organisations.id, inv.orgId));
    if (!org || org.status !== 'active') throw new AppError(410, 'invite_expired', 'This invite link has expired or was turned off.');
    return { inv, org };
  }

  /** Preview shows only the name and kind — no members or content. */
  app.get('/api/v1/org-invites/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { token } = parse(z.object({ token: z.string().min(16).max(64) }), req.params);
    const { inv, org } = await inviteFor(token);
    return { org: { name: org.name, kind: org.kind }, requiresDomain: inv.requireDomain ? org.emailDomain : null };
  });

  app.post('/api/v1/org-invites/:token/accept', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { token } = parse(z.object({ token: z.string().min(16).max(64) }), req.params);
    const { inv, org } = await inviteFor(token);
    const [existing] = await db.select().from(s.orgMembers).where(and(eq(s.orgMembers.orgId, org.id), eq(s.orgMembers.userId, a.userId)));
    if (existing) return { orgId: org.id, joined: false };
    if (inv.requireDomain) {
      if (!a.emailVerified) throw forbidden('Verify your email first.');
      if (!emailOnDomain(a.email, org.emailDomain)) throw forbidden(`This invite is for ${org.emailDomain} email addresses.`);
    }
    await db.transaction(async (tx) => {
      const used = await tx.update(s.orgInvites).set({ uses: sql`${s.orgInvites.uses} + 1` }).where(and(eq(s.orgInvites.id, inv.id), sql`${s.orgInvites.uses} < ${s.orgInvites.maxUses}`)).returning();
      if (!used.length) throw new AppError(410, 'invite_used_up', 'This invite link has been used the maximum number of times.');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.orgMembers).where(eq(s.orgMembers.orgId, org.id));
      if (n >= org.seatLimit) throw conflict('This organisation has no seats left. Ask its admin to add more.');
      await tx.insert(s.orgMembers).values({ orgId: org.id, userId: a.userId, role: 'member' });
    });
    await track(db, a.userId, 'org_joined', { kind: org.kind });
    return { orgId: org.id, joined: true };
  });

  /* ---------------- Org circles ---------------- */

  app.post('/api/v1/orgs/:id/circles', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await requireOrgAdmin(id, a.userId);
    const body = parse(z.object({ name: z.string().trim().min(2).max(40), description: z.string().trim().max(200).default('') }), req.body);
    const sc = screenText(`${body.name} ${body.description}`, await blockedPhrases(db));
    if (!sc.ok) throw badRequest(sc.reason!);
    const slug = `o-${randomToken(9).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
    const g = await db.transaction(async (tx) => {
      const [row] = await tx.insert(s.groups).values({ slug, name: body.name, description: body.description, visibility: 'private', kind: 'circle', ownerId: a.userId, theme: 'jade', orgId: id }).returning();
      await tx.insert(s.groupMembers).values({ groupId: row.id, userId: a.userId, role: 'owner', status: 'active' });
      return row;
    });
    await audit(db, { actorId: a.userId, action: 'org.circle_created', targetType: 'organisation', targetId: id, meta: { name: g.name } });
    return reply.code(201).send({ circle: { id: g.id } });
  });

  /** Any member of the organisation can join its circles; nobody else can. */
  app.post('/api/v1/orgs/:id/circles/:circleId/join', async (req) => {
    const a = requireAuth(req);
    const { id, circleId } = parse(z.object({ id: z.uuid(), circleId: z.uuid() }), req.params);
    await requireOrg(id, a.userId);
    const [g] = await db.select().from(s.groups).where(and(eq(s.groups.id, circleId), eq(s.groups.orgId, id), isNull(s.groups.archivedAt)));
    if (!g) throw notFound('Circle');
    const [m] = await db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, circleId), eq(s.groupMembers.userId, a.userId)));
    if (m?.status === 'banned') throw forbidden('You can’t join this circle.');
    if (!m) await db.insert(s.groupMembers).values({ groupId: circleId, userId: a.userId, role: 'member', status: 'active' });
    return { circleId };
  });

  /* ---------------- Insights (aggregate only) ---------------- */

  app.get('/api/v1/orgs/:id/insights', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await requireOrgAdmin(id, a.userId);
    const members = await db.select().from(s.orgMembers).where(eq(s.orgMembers.orgId, id));
    const ids = members.map((m) => m.userId);
    const since = new Date(Date.now() - 7 * 864e5);
    const [active] = ids.length ? await db.select({ n: sql<number>`count(distinct ${s.analyticsEvents.userId})::int` }).from(s.analyticsEvents).where(and(inArray(s.analyticsEvents.userId, ids), gte(s.analyticsEvents.createdAt, since))) : [{ n: 0 }];
    const circleIds = (await db.select({ id: s.groups.id }).from(s.groups).where(and(eq(s.groups.orgId, id), isNull(s.groups.archivedAt)))).map((r) => r.id);
    const [posts] = circleIds.length ? await db.select({ n: sql<number>`count(*)::int` }).from(s.posts).where(and(inArray(s.posts.groupId, circleIds), isNull(s.posts.deletedAt), gte(s.posts.createdAt, since))) : [{ n: 0 }];
    const [games] = circleIds.length ? await db.select({ n: sql<number>`count(*)::int` }).from(s.gameSessions).where(and(inArray(s.gameSessions.circleId, circleIds), eq(s.gameSessions.status, 'completed'), gte(s.gameSessions.completedAt, since))) : [{ n: 0 }];
    // Team composition: only members who opted in, latest result each, only above the threshold.
    const opted = members.filter((m) => m.includeInAggregate).map((m) => m.userId);
    const latest = opted.length ? (await db.execute(sql`select distinct on (user_id) user_id, scores from assessment_results where user_id in (${sql.join(opted.map((u) => sql`${u}`), sql`, `)}) order by user_id, created_at desc`) as unknown as { rows: { user_id: string; scores: Vector }[] }).rows : [];
    return {
      members: members.length, activeThisWeek: active?.n ?? 0, circles: circleIds.length, circlePostsThisWeek: posts?.n ?? 0, gamesThisWeek: games?.n ?? 0,
      composition: { counted: latest.length, needed: R.minAggregate, dimensions: teamComposition(latest.map((r) => r.scores)) },
      note: 'Aggregate only. No one’s individual result is ever shown to the organisation, and this view is not for hiring, evaluation or ranking.',
    };
  });
}
