import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { notify } from '../lib/notify';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames } from '../services/identity';
import { isAdmin, requireCircle } from '../services/circles';
import { assertNotTimedOut } from '../services/circleSpaces';
import { CONDITIONS, LISTING_KINDS, MARKET_RULES as R, SAFETY_TIPS, prohibitedCategory } from '../../shared/market';

/** Circle market: member-to-member listings inside one circle. No payments, no checkout. */
export async function circleMarketRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;

  async function blockedWith(userId: string): Promise<Set<string>> {
    const rows = await db.select({ a: s.blocks.blockerId, b: s.blocks.blockedId }).from(s.blocks).where(or(eq(s.blocks.blockerId, userId), eq(s.blocks.blockedId, userId)));
    return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
  }
  async function check(texts: string[]) {
    const phrases = await blockedPhrases(db);
    for (const t of texts.filter(Boolean)) { const r = screenText(t, phrases); if (!r.ok) throw badRequest(r.reason!); }
    const cat = prohibitedCategory(texts.join(' '));
    if (cat) throw badRequest(`Listings for ${cat} aren’t allowed in circle markets.`);
  }
  /** The listing, if this member may see it: same circle, not removed (unless seller/admin), no block either way. */
  async function load(circleId: string, listingId: string, userId: string) {
    const { member } = await requireCircle(db, circleId, userId);
    const [l] = await db.select().from(s.circleListings).where(and(eq(s.circleListings.id, listingId), eq(s.circleListings.circleId, circleId)));
    if (!l) throw notFound('Listing');
    const mine = l.sellerId === userId;
    if (!mine && !isAdmin(member) && (l.status === 'removed' || (await blockedWith(userId)).has(l.sellerId))) throw notFound('Listing');
    return { l, member, mine };
  }

  const Body = z.object({
    kind: z.enum(LISTING_KINDS), title: z.string().trim().min(3).max(R.title), description: z.string().trim().max(R.description).default(''),
    pricePaise: z.number().int().min(0).max(R.maxPricePaise).nullable().default(null), condition: z.enum(CONDITIONS).nullable().default(null),
    imageUrls: z.array(z.string().startsWith('/uploads/public/')).max(R.maxPhotos).default([]),
  });

  app.get('/api/v1/circles/:id/listings', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const q = parse(z.object({ kind: z.enum(LISTING_KINDS).optional(), mine: z.coerce.boolean().default(false) }), req.query);
    await requireCircle(db, id, a.userId);
    const hidden = await blockedWith(a.userId);
    const rows = (await db.select().from(s.circleListings).where(and(eq(s.circleListings.circleId, id), q.kind ? eq(s.circleListings.kind, q.kind) : undefined,
      q.mine ? and(eq(s.circleListings.sellerId, a.userId), ne(s.circleListings.status, 'removed')) : inArray(s.circleListings.status, ['active', 'reserved'])))
      .orderBy(desc(s.circleListings.createdAt)).limit(100)).filter((l) => !hidden.has(l.sellerId));
    const names = await displayNames(db, rows.map((r) => r.sellerId));
    const ids = rows.map((r) => r.id);
    const myInterest = ids.length ? await db.select().from(s.listingInterests).where(and(eq(s.listingInterests.userId, a.userId), inArray(s.listingInterests.listingId, ids))) : [];
    return {
      listings: rows.map((l) => ({ id: l.id, kind: l.kind, title: l.title, pricePaise: l.pricePaise, condition: l.condition, image: l.imageUrls[0] ?? null, status: l.status, seller: names.get(l.sellerId)?.displayName ?? 'Member', mine: l.sellerId === a.userId, myInterest: myInterest.find((i) => i.listingId === l.id)?.status ?? null, createdAt: l.createdAt })),
      safety: SAFETY_TIPS,
    };
  });

  app.post('/api/v1/circles/:id/listings', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before listing.');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await requireCircle(db, id, a.userId);
    await assertNotTimedOut(db, id, a.userId);
    const body = parse(Body, req.body);
    if (body.kind === 'sell' && body.pricePaise === null) throw badRequest('Add a price, or list it as free or a swap.');
    if (body.kind !== 'sell') body.pricePaise = null;
    if (body.kind === 'wanted') body.condition = null;
    await check([body.title, body.description]);
    if (body.imageUrls.length) {
      const own = await db.select({ path: s.uploads.path }).from(s.uploads).where(and(eq(s.uploads.ownerId, a.userId), inArray(s.uploads.path, body.imageUrls.map((u) => u.slice('/uploads/'.length)))));
      if (own.length !== new Set(body.imageUrls).size) throw badRequest('Upload the photos first.');
    }
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.circleListings).where(and(eq(s.circleListings.circleId, id), eq(s.circleListings.sellerId, a.userId), inArray(s.circleListings.status, ['active', 'reserved'])));
    if (n >= R.maxActivePerMember) throw conflict(`You can have up to ${R.maxActivePerMember} open listings in a circle.`);
    const [l] = await db.insert(s.circleListings).values({ circleId: id, sellerId: a.userId, ...body }).returning();
    await track(db, a.userId, 'listing_created', { kind: body.kind });
    return reply.code(201).send({ listing: { id: l.id } });
  });

  app.get('/api/v1/circles/:id/listings/:listingId', async (req) => {
    const a = requireAuth(req);
    const { id, listingId } = parse(z.object({ id: z.uuid(), listingId: z.uuid() }), req.params);
    const { l, member, mine } = await load(id, listingId, a.userId);
    const interests = await db.select().from(s.listingInterests).where(eq(s.listingInterests.listingId, listingId)).orderBy(asc(s.listingInterests.createdAt));
    const me = interests.find((i) => i.userId === a.userId);
    const accepted = interests.find((i) => i.status === 'accepted');
    const names = await displayNames(db, [l.sellerId, ...interests.map((i) => i.userId)]);
    // The thread is visible only to the seller and the accepted member.
    const inThread = accepted && (mine || accepted.userId === a.userId);
    const messages = inThread ? await db.select().from(s.listingMessages).where(and(eq(s.listingMessages.listingId, listingId), eq(s.listingMessages.buyerId, accepted.userId))).orderBy(asc(s.listingMessages.createdAt)).limit(200) : [];
    return {
      listing: { id: l.id, kind: l.kind, title: l.title, description: l.description, pricePaise: l.pricePaise, condition: l.condition, imageUrls: l.imageUrls, status: l.status, createdAt: l.createdAt, seller: { userId: l.sellerId, name: names.get(l.sellerId)?.displayName ?? 'Member', handle: names.get(l.sellerId)?.handle ?? null } },
      mine, canModerate: isAdmin(member),
      myInterest: me ? { status: me.status, note: me.note } : null,
      // Only the seller sees who is interested (names and notes).
      interests: mine ? interests.map((i) => ({ userId: i.userId, name: names.get(i.userId)?.displayName ?? 'Member', note: i.note, status: i.status })) : null,
      thread: inThread ? { with: mine ? names.get(accepted.userId)?.displayName ?? 'Member' : names.get(l.sellerId)?.displayName ?? 'Member', messages: messages.map((m) => ({ id: m.id, mine: m.senderId === a.userId, body: m.body, createdAt: m.createdAt })) } : null,
      safety: SAFETY_TIPS,
    };
  });

  app.patch('/api/v1/circles/:id/listings/:listingId', async (req) => {
    const a = requireAuth(req);
    const { id, listingId } = parse(z.object({ id: z.uuid(), listingId: z.uuid() }), req.params);
    const { l, mine } = await load(id, listingId, a.userId);
    if (!mine) throw forbidden('Only the person who listed it can change it.');
    if (l.status === 'removed') throw badRequest('This listing was removed by a moderator.');
    const body = parse(Body.pick({ title: true, description: true, pricePaise: true, condition: true }).partial().extend({ status: z.enum(['active', 'reserved', 'closed']).optional() }), req.body);
    await check([body.title ?? '', body.description ?? '']);
    await db.update(s.circleListings).set({ ...body, updatedAt: new Date() }).where(eq(s.circleListings.id, listingId));
    return { ok: true };
  });

  /** Circle owners and moderators can remove any listing (audited, seller told). */
  app.post('/api/v1/circles/:id/listings/:listingId/remove', async (req) => {
    const a = requireAuth(req);
    const { id, listingId } = parse(z.object({ id: z.uuid(), listingId: z.uuid() }), req.params);
    const { l, member, mine } = await load(id, listingId, a.userId);
    if (!mine && !isAdmin(member)) throw forbidden('Only circle owners and moderators can remove listings.');
    const { reason } = parse(z.object({ reason: z.string().trim().max(200).default('') }), req.body);
    await db.update(s.circleListings).set({ status: mine ? 'closed' : 'removed', removedBy: mine ? null : a.userId, updatedAt: new Date() }).where(eq(s.circleListings.id, listingId));
    if (!mine) {
      await audit(db, { actorId: a.userId, action: 'circle.listing_removed', targetType: 'group', targetId: id, meta: { userId: l.sellerId, listingId, reason } });
      await notify(ctx, db, { userId: l.sellerId, category: 'circles', title: 'A moderator removed your listing', body: `“${l.title}”${reason ? ` — ${reason}` : ''}`, link: `/circles/${id}?tab=market` });
    }
    return { ok: true };
  });

  /* ---------------- Interest and the private thread ---------------- */

  app.post('/api/v1/circles/:id/listings/:listingId/interest', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const { id, listingId } = parse(z.object({ id: z.uuid(), listingId: z.uuid() }), req.params);
    const { l, mine } = await load(id, listingId, a.userId);
    if (mine) throw badRequest('This is your own listing.');
    if (l.status !== 'active') throw badRequest('This listing isn’t taking interest right now.');
    await assertNotTimedOut(db, id, a.userId);
    const { note } = parse(z.object({ note: z.string().trim().max(R.note).default('') }), req.body);
    await check([note]);
    const [row] = await db.insert(s.listingInterests).values({ listingId, userId: a.userId, note }).onConflictDoNothing().returning();
    if (row) {
      const me = (await displayNames(db, [a.userId])).get(a.userId)?.displayName ?? 'A member';
      await notify(ctx, db, { userId: l.sellerId, category: 'circles', title: `${me} is interested in “${l.title}”`, body: note, link: `/circles/${id}/market/${listingId}`, dedupeKey: `listing-interest:${listingId}:${a.userId}` });
    }
    return { ok: true };
  });

  app.delete('/api/v1/circles/:id/listings/:listingId/interest', async (req) => {
    const a = requireAuth(req);
    const { id, listingId } = parse(z.object({ id: z.uuid(), listingId: z.uuid() }), req.params);
    await load(id, listingId, a.userId);
    await db.delete(s.listingInterests).where(and(eq(s.listingInterests.listingId, listingId), eq(s.listingInterests.userId, a.userId), eq(s.listingInterests.status, 'pending')));
    return { ok: true };
  });

  /** Seller accepts one member (the listing becomes reserved and a private thread opens) or declines. */
  app.post('/api/v1/circles/:id/listings/:listingId/interests/:userId', async (req) => {
    const a = requireAuth(req);
    const { id, listingId, userId } = parse(z.object({ id: z.uuid(), listingId: z.uuid(), userId: z.uuid() }), req.params);
    const { l, mine } = await load(id, listingId, a.userId);
    if (!mine) throw forbidden('Only the person who listed it can decide.');
    const { decision } = parse(z.object({ decision: z.enum(['accept', 'decline']) }), req.body);
    const [i] = await db.select().from(s.listingInterests).where(and(eq(s.listingInterests.listingId, listingId), eq(s.listingInterests.userId, userId)));
    if (!i) throw notFound('Interest');
    if (decision === 'accept') {
      const [other] = await db.select().from(s.listingInterests).where(and(eq(s.listingInterests.listingId, listingId), eq(s.listingInterests.status, 'accepted'), ne(s.listingInterests.userId, userId)));
      if (other) throw conflict('You’ve already accepted someone. Decline them first to choose someone else.');
      await db.update(s.listingInterests).set({ status: 'accepted' }).where(and(eq(s.listingInterests.listingId, listingId), eq(s.listingInterests.userId, userId)));
      await db.update(s.circleListings).set({ status: 'reserved', updatedAt: new Date() }).where(and(eq(s.circleListings.id, listingId), eq(s.circleListings.status, 'active')));
      await notify(ctx, db, { userId, category: 'circles', title: `Your interest in “${l.title}” was accepted`, body: 'Message the seller on the listing to arrange things. Meet somewhere public.', link: `/circles/${id}/market/${listingId}`, dedupeKey: `listing-accept:${listingId}:${userId}` });
    } else {
      await db.update(s.listingInterests).set({ status: 'declined' }).where(and(eq(s.listingInterests.listingId, listingId), eq(s.listingInterests.userId, userId)));
      if (i.status === 'accepted') await db.update(s.circleListings).set({ status: 'active', updatedAt: new Date() }).where(and(eq(s.circleListings.id, listingId), eq(s.circleListings.status, 'reserved')));
    }
    return { ok: true };
  });

  app.post('/api/v1/circles/:id/listings/:listingId/messages', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    const { id, listingId } = parse(z.object({ id: z.uuid(), listingId: z.uuid() }), req.params);
    const { l, mine } = await load(id, listingId, a.userId);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(R.message) }), req.body);
    const [accepted] = await db.select().from(s.listingInterests).where(and(eq(s.listingInterests.listingId, listingId), eq(s.listingInterests.status, 'accepted')));
    if (!accepted || (!mine && accepted.userId !== a.userId)) throw forbidden('Messages open once the seller accepts your interest.');
    if (l.status === 'removed') throw badRequest('This listing was removed.');
    const sc = screenText(body, await blockedPhrases(db));
    if (!sc.ok) throw badRequest(sc.reason!);
    const [m] = await db.insert(s.listingMessages).values({ listingId, buyerId: accepted.userId, senderId: a.userId, body }).returning();
    const to = mine ? accepted.userId : l.sellerId;
    await notify(ctx, db, { userId: to, category: 'circles', title: `New message about “${l.title}”`, body: body.slice(0, 120), link: `/circles/${id}/market/${listingId}` });
    return { message: { id: m.id } };
  });
}
