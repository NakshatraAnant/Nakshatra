import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DateTime } from 'luxon';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { notify } from '../lib/notify';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames } from '../services/identity';
import { circleMembership, isAdmin, requireCircle } from '../services/circles';
import { activeTier, hiddenChannels, materialiseSeries } from '../services/circleSpaces';
import { createPayment, registerPaymentHandlers } from '../lib/payments';
import { CIRCLE_TIER_FEE, PAID_RULES as PR, TICKET_FEE, paidSplit, passWindow, rupeesLabel } from '../../shared/paidAccess';
import { refundDueTickets } from '../services/eventTickets';
import { FREQUENCIES, RECURRENCE_RULES as RR } from '../../shared/recurrence';

/** Circle channels, circle events (one-off and recurring) and the circle moderator dashboard. */
export async function circleSpaceRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;

  async function requireCircleAdmin(circleId: string, userId: string) {
    const r = await requireCircle(db, circleId, userId);
    if (!isAdmin(r.member)) throw forbidden('Only circle owners and moderators can do that.');
    return r;
  }
  async function screen(texts: string[]) {
    const phrases = await blockedPhrases(db);
    for (const t of texts.filter(Boolean)) { const r = screenText(t, phrases); if (!r.ok) throw badRequest(r.reason!); }
  }

  /* ---------------- Channels ---------------- */

  app.get('/api/v1/circles/:id/channels', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(db, id, a.userId);
    const rows = await db.select().from(s.circleChannels).where(and(eq(s.circleChannels.circleId, id), isNull(s.circleChannels.archivedAt))).orderBy(asc(s.circleChannels.position), asc(s.circleChannels.createdAt));
    const since = new Date(Date.now() - 7 * 864e5);
    const activity = await db.select({ c: s.posts.channelId, n: sql<number>`count(*)::int` }).from(s.posts).where(and(eq(s.posts.groupId, id), isNull(s.posts.deletedAt), gte(s.posts.createdAt, since))).groupBy(s.posts.channelId);
    const canPost = (kind: string) => kind !== 'announcements' || isAdmin(member);
    const locked = await hiddenChannels(db, a.userId, [id]);
    const tiers = await db.select().from(s.circleTiers).where(eq(s.circleTiers.circleId, id));
    return {
      channels: [
        { id: null, name: 'General', description: 'Everything else.', kind: 'discussion', canPost: true, postsThisWeek: activity.find((x) => x.c === null)?.n ?? 0, tier: null },
        ...rows.filter((c) => !locked.has(c.id)).map((c) => ({ id: c.id, name: c.name, description: c.description, kind: c.kind, canPost: canPost(c.kind), postsThisWeek: activity.find((x) => x.c === c.id)?.n ?? 0, tier: tiers.find((t) => t.id === c.tierId)?.name ?? null, tierId: c.tierId })),
      ],
      canManage: isAdmin(member),
      max: RR.maxChannels,
    };
  });

  const ChannelBody = z.object({ name: z.string().trim().min(2).max(30).regex(/^[\p{L}\p{N} _-]+$/u, 'Use letters, numbers, spaces, - or _.'), description: z.string().trim().max(140).default(''), kind: z.enum(['discussion', 'announcements']).default('discussion'), tierId: z.uuid().nullable().optional() });
  async function checkTier(circleId: string, tierId: string | null | undefined) {
    if (!tierId) return;
    const [t] = await db.select().from(s.circleTiers).where(and(eq(s.circleTiers.id, tierId), eq(s.circleTiers.circleId, circleId), isNull(s.circleTiers.archivedAt)));
    if (!t) throw badRequest('That tier doesn’t exist in this circle.');
  }

  app.post('/api/v1/circles/:id/channels', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const body = parse(ChannelBody, req.body);
    await screen([body.name, body.description]);
    if (body.name.toLowerCase() === 'general') throw badRequest('Every circle already has General.');
    const existing = await db.select().from(s.circleChannels).where(and(eq(s.circleChannels.circleId, id), isNull(s.circleChannels.archivedAt)));
    if (existing.length >= RR.maxChannels) throw conflict(`A circle can have up to ${RR.maxChannels} channels.`);
    if (existing.some((c) => c.name.toLowerCase() === body.name.toLowerCase())) throw conflict('There is already a channel with that name.');
    await checkTier(id, body.tierId);
    const [c] = await db.insert(s.circleChannels).values({ circleId: id, ...body, position: existing.length + 1, createdBy: a.userId }).returning();
    await audit(db, { actorId: a.userId, action: 'circle.channel_created', targetType: 'group', targetId: id, meta: { name: c.name } });
    return reply.code(201).send({ channel: { id: c.id, name: c.name } });
  });

  app.patch('/api/v1/circles/:id/channels/:channelId', async (req) => {
    const a = requireAuth(req);
    const { id, channelId } = parse(z.object({ id: z.uuid(), channelId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const body = parse(ChannelBody.partial().extend({ archived: z.boolean().optional() }), req.body);
    await screen([body.name ?? '', body.description ?? '']);
    await checkTier(id, body.tierId);
    const { archived, ...rest } = body;
    const [c] = await db.update(s.circleChannels).set({ ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
      .where(and(eq(s.circleChannels.id, channelId), eq(s.circleChannels.circleId, id))).returning();
    if (!c) throw notFound('Channel');
    // Archiving keeps the posts; they show up in General again — except members-only channels, whose posts stay closed.
    if (archived && !c.tierId) await db.update(s.posts).set({ channelId: null }).where(and(eq(s.posts.groupId, id), eq(s.posts.channelId, channelId)));
    await audit(db, { actorId: a.userId, action: archived ? 'circle.channel_archived' : 'circle.channel_updated', targetType: 'group', targetId: id, meta: { name: c.name } });
    return { ok: true };
  });

  /* ---------------- Membership tiers (free or paid passes) ---------------- */

  const paymentsOn = () => ctx.config.PAYMENT_PROVIDER !== 'none';

  registerPaymentHandlers('circle_tier', {
    onSucceeded: async (c, tx, payment) => {
      const [p] = await tx.select().from(s.circleTierPurchases).where(and(eq(s.circleTierPurchases.id, payment.purposeId), ne(s.circleTierPurchases.status, 'paid')));
      if (!p) return;
      const [g] = await tx.select({ ownerId: s.groups.ownerId, name: s.groups.name }).from(s.groups).where(eq(s.groups.id, p.circleId));
      const [cur] = await tx.select().from(s.circleMemberTiers).where(and(eq(s.circleMemberTiers.circleId, p.circleId), eq(s.circleMemberTiers.userId, p.userId)));
      const sameTierPass = cur && cur.tierId === p.tierId && cur.source === 'purchase' ? cur.expiresAt : null;
      const w = passWindow(new Date(), sameTierPass);
      await tx.update(s.circleTierPurchases).set({ status: 'paid', startsAt: w.startsAt, expiresAt: w.expiresAt }).where(eq(s.circleTierPurchases.id, p.id));
      // Never replace an open-ended tier the member was given; the purchase still records the paid pass.
      if (!(cur && cur.source === 'assigned' && cur.expiresAt === null && cur.tierId !== p.tierId)) {
        await tx.insert(s.circleMemberTiers).values({ circleId: p.circleId, userId: p.userId, tierId: p.tierId, assignedBy: p.userId, source: 'purchase', expiresAt: w.expiresAt })
          .onConflictDoUpdate({ target: [s.circleMemberTiers.circleId, s.circleMemberTiers.userId], set: { tierId: p.tierId, assignedBy: p.userId, source: 'purchase', expiresAt: w.expiresAt, createdAt: new Date() } });
      }
      const simulated = payment.provider === 'dev_simulator';
      await tx.insert(s.creatorLedger).values({ creatorId: g.ownerId, kind: 'circle_tier', sourceId: p.id, ...paidSplit(p.amountPaise, CIRCLE_TIER_FEE), status: 'held', simulated }).onConflictDoNothing();
      const [t] = await tx.select({ name: s.circleTiers.name }).from(s.circleTiers).where(eq(s.circleTiers.id, p.tierId));
      await notify(c, tx, { userId: p.userId, category: 'circles', title: `You’re ${t.name} in ${g.name}`, body: `Your pass runs until ${w.expiresAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}. It doesn’t renew by itself.`, link: `/circles/${p.circleId}`, dedupeKey: `tier-pass:${p.id}` });
      await notify(c, tx, { userId: g.ownerId, category: 'circles', title: `Someone bought a ${t.name} pass in ${g.name}`, body: rupeesLabel(p.amountPaise), link: `/circles/${p.circleId}`, dedupeKey: `tier-sale:${p.id}` });
      await track(tx, p.userId, 'circle_tier_purchased', { simulated });
    },
    onFailed: async (_c, tx, payment) => {
      await tx.update(s.circleTierPurchases).set({ status: 'failed' }).where(and(eq(s.circleTierPurchases.id, payment.purposeId), eq(s.circleTierPurchases.status, 'pending')));
    },
    onRefunded: async (_c, tx, payment, amountPaise) => {
      const [p] = await tx.select().from(s.circleTierPurchases).where(eq(s.circleTierPurchases.id, payment.purposeId));
      if (!p) return;
      const [orig] = await tx.select().from(s.creatorLedger).where(and(eq(s.creatorLedger.kind, 'circle_tier'), eq(s.creatorLedger.sourceId, p.id)));
      if (orig) {
        const fee = Math.round((orig.feePaise * amountPaise) / orig.grossPaise);
        await tx.insert(s.creatorLedger).values({ creatorId: orig.creatorId, kind: 'circle_tier_refund', sourceId: p.id, grossPaise: -amountPaise, feePaise: -fee, netPaise: -(amountPaise - fee), status: 'held', simulated: orig.simulated }).onConflictDoNothing();
      }
      if (payment.refundedPaise >= payment.amountPaise) {
        await tx.update(s.circleTierPurchases).set({ status: 'refunded' }).where(eq(s.circleTierPurchases.id, p.id));
        // Remove the access this purchase paid for (only if it is still that pass).
        await tx.delete(s.circleMemberTiers).where(and(eq(s.circleMemberTiers.circleId, p.circleId), eq(s.circleMemberTiers.userId, p.userId), eq(s.circleMemberTiers.tierId, p.tierId), eq(s.circleMemberTiers.source, 'purchase')));
      }
    },
  });

  app.get('/api/v1/circles/:id/tiers', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(db, id, a.userId);
    const tiers = await db.select().from(s.circleTiers).where(and(eq(s.circleTiers.circleId, id), isNull(s.circleTiers.archivedAt))).orderBy(desc(s.circleTiers.position));
    const counts = await db.select({ t: s.circleMemberTiers.tierId, n: sql<number>`count(*)::int` }).from(s.circleMemberTiers).where(and(eq(s.circleMemberTiers.circleId, id), activeTier())).groupBy(s.circleMemberTiers.tierId);
    const [mine] = await db.select({ t: s.circleMemberTiers.tierId, source: s.circleMemberTiers.source, expiresAt: s.circleMemberTiers.expiresAt }).from(s.circleMemberTiers).where(and(eq(s.circleMemberTiers.circleId, id), eq(s.circleMemberTiers.userId, a.userId), activeTier()));
    return {
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, description: t.description, color: t.color, position: t.position, pricePaise: t.pricePaise, members: counts.find((c) => c.t === t.id)?.n ?? 0 })),
      myTierId: mine?.t ?? null, myPassEndsAt: mine?.source === 'purchase' ? mine.expiresAt : null, canManage: isAdmin(member), isOwner: member.role === 'owner', max: TIER_MAX,
      paymentsAvailable: paymentsOn(), passDays: PR.passDays, limits: { minPaise: PR.tierMinPaise, maxPaise: PR.tierMaxPaise },
      paidNote: paymentsOn() ? `A priced tier is a ${PR.passDays}-day pass that doesn’t renew by itself. The owner’s share (85%) is held — payouts to circle owners aren’t built yet.` : 'Priced tiers can be bought once payments are switched on. Until then tiers are given by the owner and moderators.',
    };
  });

  const TIER_MAX = 5;
  const TierBody = z.object({ name: z.string().trim().min(2).max(30), description: z.string().trim().max(140).default(''), color: z.enum(['saffron', 'jade', 'dusk', 'ember', 'monsoon']).default('saffron') });

  app.post('/api/v1/circles/:id/tiers', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const body = parse(TierBody, req.body);
    await screen([body.name, body.description]);
    const existing = await db.select().from(s.circleTiers).where(and(eq(s.circleTiers.circleId, id), isNull(s.circleTiers.archivedAt)));
    if (existing.length >= TIER_MAX) throw conflict(`A circle can have up to ${TIER_MAX} tiers.`);
    if (existing.some((t) => t.name.toLowerCase() === body.name.toLowerCase())) throw conflict('There is already a tier with that name.');
    // New tiers go on top; reorder with PATCH.
    const [t] = await db.insert(s.circleTiers).values({ circleId: id, ...body, position: Math.max(0, ...existing.map((x) => x.position)) + 1 }).returning();
    await audit(db, { actorId: a.userId, action: 'circle.tier_created', targetType: 'group', targetId: id, meta: { name: t.name } });
    return reply.code(201).send({ tier: { id: t.id, name: t.name } });
  });

  app.patch('/api/v1/circles/:id/tiers/:tierId', async (req) => {
    const a = requireAuth(req);
    const { id, tierId } = parse(z.object({ id: z.uuid(), tierId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const body = parse(TierBody.partial().extend({ position: z.number().int().min(1).max(100).optional(), archived: z.literal(true).optional(), pricePaise: z.number().int().min(PR.tierMinPaise).max(PR.tierMaxPaise).nullable().optional() }), req.body);
    if (body.pricePaise !== undefined) {
      const { member } = await requireCircle(db, id, a.userId);
      if (member.role !== 'owner') throw forbidden('Only the circle owner can set prices.');
    }
    await screen([body.name ?? '', body.description ?? '']);
    const [t] = await db.select().from(s.circleTiers).where(and(eq(s.circleTiers.id, tierId), eq(s.circleTiers.circleId, id), isNull(s.circleTiers.archivedAt)));
    if (!t) throw notFound('Tier');
    if (body.archived) {
      const [ch] = await db.select({ id: s.circleChannels.id }).from(s.circleChannels).where(and(eq(s.circleChannels.tierId, tierId), isNull(s.circleChannels.archivedAt)));
      if (ch) throw conflict('Move or archive the channels that use this tier first.');
      await db.delete(s.circleMemberTiers).where(eq(s.circleMemberTiers.tierId, tierId));
    }
    const { archived, ...rest } = body;
    await db.update(s.circleTiers).set({ ...rest, ...(archived ? { archivedAt: new Date() } : {}) }).where(eq(s.circleTiers.id, tierId));
    await audit(db, { actorId: a.userId, action: archived ? 'circle.tier_archived' : 'circle.tier_updated', targetType: 'group', targetId: id, meta: { name: t.name } });
    return { ok: true };
  });

  /** Starts buying a tier pass. The tier is given only when a verified payment succeeds. */
  app.post('/api/v1/circles/:id/tiers/:tierId/purchase', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before buying a pass.');
    const { id, tierId } = parse(z.object({ id: z.uuid(), tierId: z.uuid() }), req.params);
    const { idempotencyKey } = parse(z.object({ idempotencyKey: z.string().min(8).max(80) }), req.body);
    const { member } = await requireCircle(db, id, a.userId);
    if (isAdmin(member)) throw badRequest('Owners and moderators already see every channel here.');
    const [t] = await db.select().from(s.circleTiers).where(and(eq(s.circleTiers.id, tierId), eq(s.circleTiers.circleId, id), isNull(s.circleTiers.archivedAt)));
    if (!t) throw notFound('Tier');
    if (!t.pricePaise) throw badRequest('This tier isn’t for sale — the circle owner gives it.');
    if (!paymentsOn()) throw badRequest('Passes can be bought once payments are switched on.');
    const [cur] = await db.select({ tierId: s.circleMemberTiers.tierId, source: s.circleMemberTiers.source, pos: s.circleTiers.position }).from(s.circleMemberTiers).innerJoin(s.circleTiers, eq(s.circleTiers.id, s.circleMemberTiers.tierId))
      .where(and(eq(s.circleMemberTiers.circleId, id), eq(s.circleMemberTiers.userId, a.userId), isNull(s.circleTiers.archivedAt), activeTier()));
    if (cur && cur.source === 'assigned' && cur.pos >= t.position) throw conflict('You already have this tier or a higher one.');
    return db.transaction(async (tx) => {
      const [p] = await tx.insert(s.circleTierPurchases).values({ circleId: id, tierId, userId: a.userId, amountPaise: t.pricePaise! }).returning();
      const checkout = await createPayment(ctx, tx, { userId: a.userId, purpose: 'circle_tier', purposeId: p.id, amountPaise: t.pricePaise!, idempotencyKey: `tier:${a.userId}:${idempotencyKey}` });
      await tx.update(s.circleTierPurchases).set({ paymentId: checkout.paymentId }).where(eq(s.circleTierPurchases.id, p.id));
      return { purchase: { id: p.id }, checkout, passDays: PR.passDays };
    });
  });

  /** The owner's held share from tier passes. Nothing can be paid out yet. */
  app.get('/api/v1/circles/:id/earnings', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(db, id, a.userId);
    if (member.role !== 'owner') throw forbidden('Only the circle owner can see earnings.');
    const purchaseIds = (await db.select({ id: s.circleTierPurchases.id }).from(s.circleTierPurchases).where(eq(s.circleTierPurchases.circleId, id))).map((r) => r.id);
    const lines = purchaseIds.length ? await db.select().from(s.creatorLedger).where(and(inArray(s.creatorLedger.kind, ['circle_tier', 'circle_tier_refund']), inArray(s.creatorLedger.sourceId, purchaseIds))) : [];
    const sum = (sim: boolean) => lines.filter((l) => l.simulated === sim).reduce((t, l) => ({ net: t.net + l.netPaise, fee: t.fee + l.feePaise }), { net: 0, fee: 0 });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.circleTierPurchases).where(and(eq(s.circleTierPurchases.circleId, id), eq(s.circleTierPurchases.status, 'paid')));
    return { passesSold: n, heldNetPaise: sum(false).net, platformFeePaise: sum(false).fee, simulatedNetPaise: sum(true).net, payoutsAvailable: false, note: 'Your share is held. Payouts need identity checks and a payout provider, which aren’t built yet.' };
  });

  /** Give a member a tier, or clear it (tierId: null). They're told about a new tier. */
  app.put('/api/v1/circles/:id/members/:userId/tier', async (req) => {
    const a = requireAuth(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const { circle } = await requireCircleAdmin(id, a.userId);
    const { tierId } = parse(z.object({ tierId: z.uuid().nullable() }), req.body);
    if (!(await circleMembership(db, id, userId))) throw notFound('Member');
    if (tierId === null) {
      await db.delete(s.circleMemberTiers).where(and(eq(s.circleMemberTiers.circleId, id), eq(s.circleMemberTiers.userId, userId)));
    } else {
      await checkTier(id, tierId);
      await db.insert(s.circleMemberTiers).values({ circleId: id, userId, tierId, assignedBy: a.userId, source: 'assigned', expiresAt: null }).onConflictDoUpdate({ target: [s.circleMemberTiers.circleId, s.circleMemberTiers.userId], set: { tierId, assignedBy: a.userId, source: 'assigned', expiresAt: null, createdAt: new Date() } });
      const [t] = await db.select({ name: s.circleTiers.name }).from(s.circleTiers).where(eq(s.circleTiers.id, tierId));
      if (userId !== a.userId) await notify(ctx, db, { userId, category: 'circles', title: `You’re now ${t.name} in ${circle.name}`, link: `/circles/${id}`, dedupeKey: `circle-tier:${id}:${userId}:${tierId}` });
    }
    await audit(db, { actorId: a.userId, action: tierId ? 'circle.tier_assigned' : 'circle.tier_cleared', targetType: 'group', targetId: id, meta: { userId } });
    return { ok: true };
  });

  /* ---------------- Events ---------------- */

  registerPaymentHandlers('event_ticket', {
    onSucceeded: async (c, tx, payment) => {
      const [t] = await tx.select().from(s.eventTickets).where(and(eq(s.eventTickets.id, payment.purposeId), inArray(s.eventTickets.status, ['pending', 'failed'])));
      if (!t) return;
      const [e] = await tx.select().from(s.events).where(eq(s.events.id, t.eventId));
      const simulated = payment.provider === 'dev_simulator';
      const [{ going }] = await tx.select({ going: sql<number>`count(*)::int` }).from(s.eventRsvps).where(and(eq(s.eventRsvps.eventId, e.id), eq(s.eventRsvps.status, 'going')));
      // Paid after the event was cancelled, started or filled up: refund automatically.
      const [other] = await tx.select({ id: s.eventTickets.id }).from(s.eventTickets).where(and(eq(s.eventTickets.eventId, e.id), eq(s.eventTickets.userId, t.userId), eq(s.eventTickets.status, 'paid'), ne(s.eventTickets.id, t.id)));
      if (other || e.status === 'cancelled' || e.startsAt <= new Date() || (e.capacity && going >= e.capacity)) {
        await tx.update(s.eventTickets).set({ status: 'refund_due' }).where(eq(s.eventTickets.id, t.id));
        await notify(c, tx, { userId: t.userId, category: 'circles', title: `We’re refunding your ticket for ${e.title}`, body: other ? 'You already had a ticket.' : e.status === 'cancelled' ? 'The event was cancelled.' : 'The event filled up or started before your payment arrived.', link: `/circles/${e.groupId}?tab=events`, dedupeKey: `ticket-late:${t.id}` });
        return;
      }
      await tx.update(s.eventTickets).set({ status: 'paid' }).where(eq(s.eventTickets.id, t.id));
      await tx.insert(s.eventRsvps).values({ eventId: e.id, userId: t.userId, status: 'going' }).onConflictDoUpdate({ target: [s.eventRsvps.eventId, s.eventRsvps.userId], set: { status: 'going' } });
      await tx.insert(s.scheduledReminders).values({ userId: t.userId, category: 'social', title: `Starting soon: ${e.title}`, link: `/circles/${e.groupId}?tab=events`, dueAt: new Date(e.startsAt.getTime() - 3600000), sourceKey: `event:${e.id}` }).onConflictDoNothing();
      await tx.insert(s.creatorLedger).values({ creatorId: e.hostId, kind: 'event_ticket', sourceId: t.id, ...paidSplit(t.amountPaise, TICKET_FEE), status: 'held', simulated }).onConflictDoNothing();
      await notify(c, tx, { userId: t.userId, category: 'circles', title: `You’re going: ${e.title}`, body: 'If the host cancels, your ticket is refunded automatically.', link: `/circles/${e.groupId}?tab=events`, dedupeKey: `ticket:${t.id}` });
      await notify(c, tx, { userId: e.hostId, category: 'circles', title: `Ticket sold: ${e.title}`, body: rupeesLabel(t.amountPaise), link: `/circles/${e.groupId}?tab=events`, dedupeKey: `ticket-sale:${t.id}` });
      await track(tx, t.userId, 'event_ticket_purchased', { simulated });
    },
    onFailed: async (_c, tx, payment) => {
      await tx.update(s.eventTickets).set({ status: 'failed' }).where(and(eq(s.eventTickets.id, payment.purposeId), eq(s.eventTickets.status, 'pending')));
    },
    onRefunded: async (c, tx, payment, amountPaise) => {
      const [t] = await tx.select().from(s.eventTickets).where(eq(s.eventTickets.id, payment.purposeId));
      if (!t) return;
      const [orig] = await tx.select().from(s.creatorLedger).where(and(eq(s.creatorLedger.kind, 'event_ticket'), eq(s.creatorLedger.sourceId, t.id)));
      if (orig) {
        const fee = Math.round((orig.feePaise * amountPaise) / orig.grossPaise);
        await tx.insert(s.creatorLedger).values({ creatorId: orig.creatorId, kind: 'event_ticket_refund', sourceId: t.id, grossPaise: -amountPaise, feePaise: -fee, netPaise: -(amountPaise - fee), status: 'held', simulated: orig.simulated }).onConflictDoNothing();
      }
      if (payment.refundedPaise >= payment.amountPaise) {
        await tx.update(s.eventTickets).set({ status: 'refunded' }).where(eq(s.eventTickets.id, t.id));
        const [other] = await tx.select({ id: s.eventTickets.id }).from(s.eventTickets).where(and(eq(s.eventTickets.eventId, t.eventId), eq(s.eventTickets.userId, t.userId), eq(s.eventTickets.status, 'paid')));
        // Refunding a duplicate must not take away the place the other ticket paid for.
        if (!other) await tx.update(s.eventRsvps).set({ status: 'cancelled' }).where(and(eq(s.eventRsvps.eventId, t.eventId), eq(s.eventRsvps.userId, t.userId)));
        const [e] = await tx.select({ title: s.events.title, groupId: s.events.groupId }).from(s.events).where(eq(s.events.id, t.eventId));
        await notify(c, tx, { userId: t.userId, category: 'circles', title: `Refunded: ${e.title}`, body: `${rupeesLabel(amountPaise)} is on its way back to you.`, link: `/circles/${e.groupId}?tab=events`, dedupeKey: `ticket-refunded:${t.id}` });
      }
    },
  });

  /** Buy a ticket to a paid circle event. You're going only once a verified payment succeeds. */
  app.post('/api/v1/circles/:id/events/:eventId/ticket', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before buying a ticket.');
    const { id, eventId } = parse(z.object({ id: z.uuid(), eventId: z.uuid() }), req.params);
    const { idempotencyKey } = parse(z.object({ idempotencyKey: z.string().min(8).max(80) }), req.body);
    await requireCircle(db, id, a.userId);
    const [e] = await db.select().from(s.events).where(and(eq(s.events.id, eventId), eq(s.events.groupId, id)));
    if (!e || e.status === 'cancelled') throw notFound('Event');
    if (!e.pricePaise) throw badRequest('This event is free — just say you’re going.');
    if (e.hostId === a.userId) throw badRequest('You’re hosting this event.');
    if (e.startsAt <= new Date()) throw badRequest('This event has already started.');
    if (ctx.config.PAYMENT_PROVIDER === 'none') throw badRequest('Tickets can be bought once payments are switched on.');
    const [held] = await db.select().from(s.eventTickets).where(and(eq(s.eventTickets.eventId, e.id), eq(s.eventTickets.userId, a.userId), inArray(s.eventTickets.status, ['paid', 'refund_due'])));
    if (held) throw conflict('You already have a ticket.');
    if (e.capacity) {
      const holdFrom = new Date(Date.now() - PR.ticketHoldMinutes * 60000);
      const [{ going }] = await db.select({ going: sql<number>`count(*)::int` }).from(s.eventRsvps).where(and(eq(s.eventRsvps.eventId, e.id), eq(s.eventRsvps.status, 'going')));
      const [{ pending }] = await db.select({ pending: sql<number>`count(*)::int` }).from(s.eventTickets).where(and(eq(s.eventTickets.eventId, e.id), eq(s.eventTickets.status, 'pending'), gte(s.eventTickets.createdAt, holdFrom), ne(s.eventTickets.userId, a.userId)));
      if (going + pending >= e.capacity) throw conflict('This event is full.');
    }
    return db.transaction(async (tx) => {
      const [t] = await tx.insert(s.eventTickets).values({ eventId: e.id, userId: a.userId, amountPaise: e.pricePaise }).returning();
      const checkout = await createPayment(ctx, tx, { userId: a.userId, purpose: 'event_ticket', purposeId: t.id, amountPaise: e.pricePaise, idempotencyKey: `ticket:${a.userId}:${idempotencyKey}` });
      await tx.update(s.eventTickets).set({ paymentId: checkout.paymentId }).where(eq(s.eventTickets.id, t.id));
      return { ticket: { id: t.id }, checkout };
    });
  });

  app.get('/api/v1/circles/:id/events', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(db, id, a.userId);
    const rows = await db.select().from(s.events).where(and(eq(s.events.groupId, id), gt(s.events.endsAt, new Date()))).orderBy(asc(s.events.startsAt)).limit(40);
    const ids = rows.map((r) => r.id);
    const mine = ids.length ? await db.select().from(s.eventRsvps).where(and(eq(s.eventRsvps.userId, a.userId), inArray(s.eventRsvps.eventId, ids))) : [];
    const counts = ids.length ? await db.select({ e: s.eventRsvps.eventId, n: sql<number>`count(*)::int` }).from(s.eventRsvps).where(and(inArray(s.eventRsvps.eventId, ids), eq(s.eventRsvps.status, 'going'))).groupBy(s.eventRsvps.eventId) : [];
    const series = await db.select().from(s.eventSeries).where(and(eq(s.eventSeries.circleId, id), isNull(s.eventSeries.endedAt)));
    const names = await displayNames(db, rows.map((r) => r.hostId));
    const tickets = ids.length ? await db.select({ e: s.eventTickets.eventId, status: s.eventTickets.status }).from(s.eventTickets).where(and(eq(s.eventTickets.userId, a.userId), inArray(s.eventTickets.eventId, ids), inArray(s.eventTickets.status, ['paid', 'refund_due', 'refunded']))) : [];
    const ticketOf = (eventId: string) => (['paid', 'refund_due', 'refunded'] as const).map((st) => tickets.find((t) => t.e === eventId && t.status === st)).find(Boolean)?.status ?? null;
    return {
      canManage: isAdmin(member), isOwner: member.role === 'owner', ticketsAvailable: ctx.config.PAYMENT_PROVIDER !== 'none', ticketLimits: { minPaise: PR.ticketMinPaise, maxPaise: PR.ticketMaxPaise },
      events: rows.map((e) => {
        const r = mine.find((x) => x.eventId === e.id);
        const sr = series.find((x) => x.id === e.seriesId);
        return { id: e.id, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt, mode: e.mode, location: e.location, liveUrl: r?.status === 'going' ? e.liveUrl : null, capacity: e.capacity, status: e.status, host: names.get(e.hostId)?.displayName ?? 'Member', going: counts.find((c) => c.e === e.id)?.n ?? 0, myRsvp: r?.status ?? null, seriesId: e.seriesId, repeats: sr?.frequency ?? null, pricePaise: e.pricePaise, myTicket: ticketOf(e.id), isHost: e.hostId === a.userId };
      }),
      series: series.map((x) => ({ id: x.id, title: x.title, frequency: x.frequency, until: x.until })),
    };
  });

  app.post('/api/v1/circles/:id/events', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { circle } = await requireCircleAdmin(id, a.userId);
    const body = parse(z.object({
      title: z.string().trim().min(3).max(100), description: z.string().trim().max(1000).default(''),
      startsAt: z.iso.datetime(), durationMinutes: z.number().int().min(15).max(12 * 60).default(60),
      mode: z.enum(['online', 'in_person']), location: z.string().trim().max(200).optional(), liveUrl: z.url().startsWith('https://').optional(),
      capacity: z.number().int().min(2).max(500).optional(),
      ticketPricePaise: z.number().int().min(PR.ticketMinPaise).max(PR.ticketMaxPaise).optional(),
      repeat: z.enum(['none', ...FREQUENCIES]).default('none'), until: z.iso.datetime().optional(), timezone: z.string().max(60).default('Asia/Kolkata'),
    }), req.body);
    await screen([body.title, body.description, body.location ?? '']);
    if (body.ticketPricePaise) {
      const { member } = await requireCircle(db, id, a.userId);
      if (member.role !== 'owner') throw forbidden('Only the circle owner can sell tickets.');
      if (body.repeat !== 'none') throw badRequest('Tickets can be sold for one-off events only.');
    }
    const startsAt = new Date(body.startsAt);
    if (startsAt.getTime() < Date.now() + 5 * 60000) throw badRequest('Pick a start time in the future.');
    if (startsAt.getTime() > Date.now() + 365 * 864e5) throw badRequest('Pick a date within the next year.');
    if (!DateTime.local().setZone(body.timezone).isValid) throw badRequest('Unknown time zone.');
    const common = { title: body.title, description: body.description, mode: body.mode, location: body.location ?? null, liveUrl: body.liveUrl ?? null, capacity: body.capacity ?? null };
    let eventId: string | null = null;
    let seriesId: string | null = null;
    if (body.repeat === 'none') {
      const [e] = await db.insert(s.events).values({ ...common, hostId: a.userId, groupId: id, startsAt, endsAt: new Date(startsAt.getTime() + body.durationMinutes * 60000), kind: 'community', pricePaise: body.ticketPricePaise ?? 0 }).returning();
      eventId = e.id;
    } else {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.eventSeries).where(and(eq(s.eventSeries.circleId, id), isNull(s.eventSeries.endedAt)));
      if (n >= RR.maxSeriesPerCircle) throw conflict(`A circle can run up to ${RR.maxSeriesPerCircle} repeating events.`);
      const until = body.until ? new Date(body.until) : null;
      if (until && until <= startsAt) throw badRequest('The end date must be after the first event.');
      const [sr] = await db.insert(s.eventSeries).values({ ...common, circleId: id, hostId: a.userId, frequency: body.repeat, firstStartsAt: startsAt, durationMinutes: body.durationMinutes, timezone: body.timezone, until }).returning();
      seriesId = sr.id;
      await materialiseSeries(db, sr);
    }
    const members = (await db.select({ u: s.groupMembers.userId }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active'))).limit(200)).map((r) => r.u).filter((u) => u !== a.userId);
    for (const u of members) await notify(ctx, db, { userId: u, category: 'circles', title: `New event in ${circle.name}`, body: `${body.title}${body.repeat !== 'none' ? ' (repeats)' : ''}`, link: `/circles/${id}?tab=events`, dedupeKey: `circle-event:${eventId ?? seriesId}` });
    await track(db, a.userId, 'circle_event_created', { repeat: body.repeat, mode: body.mode });
    return reply.code(201).send({ eventId, seriesId });
  });

  /** Cancel one occurrence (or a one-off event). People who said they're going are told. */
  app.post('/api/v1/circles/:id/events/:eventId/cancel', async (req) => {
    const a = requireAuth(req);
    const { id, eventId } = parse(z.object({ id: z.uuid(), eventId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const [e] = await db.update(s.events).set({ status: 'cancelled' }).where(and(eq(s.events.id, eventId), eq(s.events.groupId, id), ne(s.events.status, 'cancelled'))).returning();
    if (!e) throw notFound('Event');
    const going = await db.select({ u: s.eventRsvps.userId }).from(s.eventRsvps).where(and(eq(s.eventRsvps.eventId, eventId), eq(s.eventRsvps.status, 'going')));
    const refunding = e.pricePaise > 0 ? await db.update(s.eventTickets).set({ status: 'refund_due' }).where(and(eq(s.eventTickets.eventId, eventId), eq(s.eventTickets.status, 'paid'))).returning({ id: s.eventTickets.id }) : [];
    for (const { u } of going) await notify(ctx, db, { userId: u, category: 'circles', title: `Cancelled: ${e.title}`, body: `${e.startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}${e.pricePaise > 0 ? ' — your ticket is being refunded automatically.' : ''}`, link: `/circles/${id}?tab=events`, dedupeKey: `event-cancel:${eventId}` });
    await db.update(s.scheduledReminders).set({ cancelledAt: new Date() }).where(and(eq(s.scheduledReminders.sourceKey, `event:${eventId}`), isNull(s.scheduledReminders.sentAt)));
    await audit(db, { actorId: a.userId, action: 'circle.event_cancelled', targetType: 'group', targetId: id, meta: { title: e.title, ticketsRefunded: refunding.length } });
    if (refunding.length) await refundDueTickets(ctx);
    return { ok: true, ticketsRefunded: refunding.length };
  });

  /** Stop a repeating event: no new occurrences, and upcoming ones are cancelled. */
  app.post('/api/v1/circles/:id/series/:seriesId/end', async (req) => {
    const a = requireAuth(req);
    const { id, seriesId } = parse(z.object({ id: z.uuid(), seriesId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const [sr] = await db.update(s.eventSeries).set({ endedAt: new Date() }).where(and(eq(s.eventSeries.id, seriesId), eq(s.eventSeries.circleId, id), isNull(s.eventSeries.endedAt))).returning();
    if (!sr) throw notFound('Repeating event');
    const future = await db.update(s.events).set({ status: 'cancelled' }).where(and(eq(s.events.seriesId, seriesId), gt(s.events.startsAt, new Date()), ne(s.events.status, 'cancelled'))).returning({ id: s.events.id });
    if (future.length) await db.update(s.scheduledReminders).set({ cancelledAt: new Date() }).where(and(inArray(s.scheduledReminders.sourceKey, future.map((f) => `event:${f.id}`)), isNull(s.scheduledReminders.sentAt)));
    await audit(db, { actorId: a.userId, action: 'circle.series_ended', targetType: 'group', targetId: id, meta: { title: sr.title, cancelled: future.length } });
    return { ok: true, cancelled: future.length };
  });

  /* ---------------- Moderator dashboard ---------------- */

  app.get('/api/v1/circles/:id/moderation', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircleAdmin(id, a.userId);
    // Reports about posts and comments in this circle that no circle moderator has reviewed yet. Reporters stay anonymous.
    const reported = await db.execute(sql`
      select r.id, r.reason, r.target_type, r.target_id, r.created_at, coalesce(p.body, c.body) as body, coalesce(p.author_id, c.author_id) as author_id, coalesce(p.id, c.post_id) as post_id,
        coalesce(p.pseudonymous, c.as_pseudonym) as hidden, coalesce(p.pen_name, cp.pen_name) as pen_name
      from reports r
      left join posts p on r.target_type = 'post' and p.id = r.target_id and p.group_id = ${id} and p.deleted_at is null
      left join comments c on r.target_type = 'comment' and c.id = r.target_id and c.deleted_at is null
        and exists (select 1 from posts pp where pp.id = c.post_id and pp.group_id = ${id})
      left join posts cp on cp.id = c.post_id
      where (p.id is not null or c.id is not null)
        and not exists (select 1 from circle_report_reviews v where v.report_id = r.id)
      order by r.created_at desc limit 50`) as unknown as { rows: { id: string; reason: string; target_type: string; target_id: string; created_at: string; body: string; author_id: string; post_id: string; hidden: boolean; pen_name: string | null }[] };
    const timeouts = await db.select().from(s.circleTimeouts).where(and(eq(s.circleTimeouts.circleId, id), gt(s.circleTimeouts.until, new Date())));
    const banned = await db.select({ u: s.groupMembers.userId }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'banned')));
    const log = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.targetType, 'group'), eq(s.auditLogs.targetId, id))).orderBy(desc(s.auditLogs.createdAt)).limit(30);
    const since = new Date(Date.now() - 7 * 864e5);
    const n = sql<number>`count(*)::int`;
    const [posts] = await db.select({ n }).from(s.posts).where(and(eq(s.posts.groupId, id), isNull(s.posts.deletedAt), gte(s.posts.createdAt, since)));
    const [joined] = await db.select({ n }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active'), gte(s.groupMembers.createdAt, since)));
    const [members] = await db.select({ n }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active')));
    const ids = [...reported.rows.map((r) => r.author_id), ...timeouts.map((t) => t.userId), ...banned.map((b) => b.u), ...log.map((l) => l.actorId).filter(Boolean) as string[], ...log.map((l) => (l.meta as { userId?: string })?.userId).filter(Boolean) as string[]];
    const names = await displayNames(db, ids);
    const name = (u: string | null | undefined) => (u ? names.get(u)?.displayName ?? 'Member' : 'System');
    return {
      role: member.role,
      stats: { members: members.n, newMembers: joined.n, postsThisWeek: posts.n, openReports: reported.rows.length, activeTimeouts: timeouts.length },
      reports: reported.rows.map((r) => ({ id: r.id, reason: r.reason, targetType: r.target_type, postId: r.post_id, preview: (r.body ?? '').slice(0, 200), author: r.hidden ? r.pen_name ?? 'Anonymous member' : name(r.author_id), authorId: r.hidden ? null : r.author_id, createdAt: r.created_at })),
      timeouts: timeouts.map((t) => ({ userId: t.userId, name: name(t.userId), until: t.until, reason: t.reason })),
      banned: banned.map((b) => ({ userId: b.u, name: name(b.u) })),
      log: log.map((l) => ({ action: l.action.replace(/^circle\./, '').replace(/_/g, ' '), by: name(l.actorId), about: (l.meta as { userId?: string })?.userId ? name((l.meta as { userId: string }).userId) : null, at: l.createdAt })),
    };
  });

  async function removeContent(circleId: string, actorId: string, targetType: string, targetId: string) {
    if (targetType === 'comment') {
      const [c] = await db.select({ c: s.comments, g: s.posts.groupId }).from(s.comments).innerJoin(s.posts, eq(s.posts.id, s.comments.postId)).where(eq(s.comments.id, targetId));
      if (!c || c.g !== circleId) throw notFound('Comment');
      await db.update(s.comments).set({ deletedAt: new Date() }).where(eq(s.comments.id, targetId));
      await audit(db, { actorId, action: 'circle.comment_removed', targetType: 'group', targetId: circleId, meta: { ...(c.c.asPseudonym ? {} : { userId: c.c.authorId }), commentId: targetId } });
      return;
    }
    const [p] = await db.select().from(s.posts).where(and(eq(s.posts.id, targetId), eq(s.posts.groupId, circleId)));
    if (!p) throw notFound('Post');
    await db.update(s.posts).set({ deletedAt: new Date() }).where(eq(s.posts.id, targetId));
    await audit(db, { actorId, action: 'circle.post_removed', targetType: 'group', targetId: circleId, meta: { ...(p.pseudonymous ? {} : { userId: p.authorId }), postId: targetId } });
  }

  /** Circle moderators decide for their circle. The platform report stays open for Nakshatra's own review. */
  app.post('/api/v1/circles/:id/moderation/reports/:reportId', async (req) => {
    const a = requireAuth(req);
    const { id, reportId } = parse(z.object({ id: z.uuid(), reportId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const { decision, note } = parse(z.object({ decision: z.enum(['remove', 'keep']), note: z.string().trim().max(300).default('') }), req.body);
    const [r] = await db.select().from(s.reports).where(eq(s.reports.id, reportId));
    if (!r || !['post', 'comment'].includes(r.targetType)) throw notFound('Report');
    // Confirms the reported content is in this circle (throws otherwise) before recording anything.
    if (decision === 'remove') await removeContent(id, a.userId, r.targetType, r.targetId);
    else {
      const inCircle = r.targetType === 'post'
        ? (await db.select({ g: s.posts.groupId }).from(s.posts).where(eq(s.posts.id, r.targetId)))[0]?.g === id
        : (await db.select({ g: s.posts.groupId }).from(s.comments).innerJoin(s.posts, eq(s.posts.id, s.comments.postId)).where(eq(s.comments.id, r.targetId)))[0]?.g === id;
      if (!inCircle) throw notFound('Report');
    }
    await db.insert(s.circleReportReviews).values({ reportId, circleId: id, decision: decision === 'remove' ? 'removed' : 'kept', reviewerId: a.userId, note }).onConflictDoNothing();
    await audit(db, { actorId: a.userId, action: decision === 'remove' ? 'circle.report_actioned' : 'circle.report_kept', targetType: 'group', targetId: id, meta: { reportId } });
    return { ok: true };
  });

  app.post('/api/v1/circles/:id/posts/:postId/remove', async (req) => {
    const a = requireAuth(req);
    const { id, postId } = parse(z.object({ id: z.uuid(), postId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    await removeContent(id, a.userId, 'post', postId);
    return { ok: true };
  });

  /** Pause a member's posting and commenting in this circle. Owners can pause moderators; moderators can't. */
  app.post('/api/v1/circles/:id/timeouts', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member, circle } = await requireCircleAdmin(id, a.userId);
    const { userId, hours, reason } = parse(z.object({ userId: z.uuid(), hours: z.union([z.literal(1), z.literal(24), z.literal(72), z.literal(168)]), reason: z.string().trim().min(3).max(200) }), req.body);
    if (userId === a.userId) throw badRequest('You can’t pause yourself.');
    const target = await circleMembership(db, id, userId);
    if (!target) throw notFound('Member');
    if (target.member.role === 'owner' || (target.member.role === 'moderator' && member.role !== 'owner')) throw forbidden('You can’t pause this member.');
    const until = new Date(Date.now() + hours * 3600e3);
    await db.insert(s.circleTimeouts).values({ circleId: id, userId, until, reason, byUserId: a.userId }).onConflictDoUpdate({ target: [s.circleTimeouts.circleId, s.circleTimeouts.userId], set: { until, reason, byUserId: a.userId, createdAt: new Date() } });
    await audit(db, { actorId: a.userId, action: 'circle.member_paused', targetType: 'group', targetId: id, meta: { userId, hours } });
    await notify(ctx, db, { userId, category: 'circles', title: `Posting paused in ${circle.name}`, body: `For ${hours === 1 ? '1 hour' : hours === 24 ? '1 day' : hours === 72 ? '3 days' : '1 week'}. Reason: ${reason}`, link: `/circles/${id}` });
    return { ok: true, until };
  });

  app.delete('/api/v1/circles/:id/timeouts/:userId', async (req) => {
    const a = requireAuth(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    await db.delete(s.circleTimeouts).where(and(eq(s.circleTimeouts.circleId, id), eq(s.circleTimeouts.userId, userId)));
    await audit(db, { actorId: a.userId, action: 'circle.member_unpaused', targetType: 'group', targetId: id, meta: { userId } });
    return { ok: true };
  });

  /** Ban: removes the member and stops them rejoining through invite links. Unban lets them be invited again. */
  app.post('/api/v1/circles/:id/bans', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircleAdmin(id, a.userId);
    const { userId, ban } = parse(z.object({ userId: z.uuid(), ban: z.boolean() }), req.body);
    if (userId === a.userId) throw badRequest('You can’t ban yourself.');
    const [target] = await db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
    if (ban) {
      if (!target) throw notFound('Member');
      if (target.role === 'owner' || (target.role === 'moderator' && member.role !== 'owner')) throw forbidden('You can’t ban this member.');
      await db.update(s.groupMembers).set({ status: 'banned', role: 'member' }).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
      await db.delete(s.circleTimeouts).where(and(eq(s.circleTimeouts.circleId, id), eq(s.circleTimeouts.userId, userId)));
      await db.delete(s.circleMemberTiers).where(and(eq(s.circleMemberTiers.circleId, id), eq(s.circleMemberTiers.userId, userId)));
    } else {
      await db.delete(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'banned')));
    }
    await audit(db, { actorId: a.userId, action: ban ? 'circle.member_banned' : 'circle.member_unbanned', targetType: 'group', targetId: id, meta: { userId } });
    return { ok: true };
  });

}
