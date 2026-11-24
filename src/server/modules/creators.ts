import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth, requireCapability } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { notify } from '../lib/notify';
import { createPayment, registerPaymentHandlers } from '../lib/payments';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames } from '../services/identity';
import { CREATOR_CATEGORIES, CREATOR_RULES as R, OFFERING_KINDS, rupees, safeLink, tipSplit } from '../../shared/creator';
import { PAID_RULES as PR, UNLOCK_FEE, paidSplit } from '../../shared/paidAccess';

type Link = { label: string; url: string };

export async function creatorRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;
  const tipsAvailable = () => ctx.config.PAYMENT_PROVIDER !== 'none';

  /* ---------------- Payments → ledger ---------------- */

  registerPaymentHandlers('creator_tip', {
    onSucceeded: async (c, tx, payment) => {
      const [tip] = await tx.update(s.creatorTips).set({ status: 'paid' }).where(and(eq(s.creatorTips.id, payment.purposeId), ne(s.creatorTips.status, 'paid'))).returning();
      if (!tip) return;
      const split = tipSplit(tip.amountPaise);
      await tx.insert(s.creatorLedger).values({ creatorId: tip.creatorId, kind: 'tip', sourceId: tip.id, ...split, status: 'held', simulated: payment.provider === 'dev_simulator' }).onConflictDoNothing();
      const from = tip.anonymous ? 'Someone' : ((await displayNames(tx, [tip.fromUserId])).get(tip.fromUserId)?.displayName ?? 'A member');
      await notify(c, tx, { userId: tip.creatorId, category: 'social', title: `${from} sent you a tip`, body: `${rupees(tip.amountPaise)}${tip.message ? ` — “${tip.message}”` : ''}`, link: '/creator-studio', dedupeKey: `tip:${tip.id}` });
      await track(tx, tip.fromUserId, 'creator_tip_paid', { simulated: payment.provider === 'dev_simulator' });
    },
    onFailed: async (_c, tx, payment) => {
      await tx.update(s.creatorTips).set({ status: 'failed' }).where(and(eq(s.creatorTips.id, payment.purposeId), eq(s.creatorTips.status, 'pending')));
    },
    onRefunded: async (_c, tx, payment, amountPaise) => {
      const [tip] = await tx.select().from(s.creatorTips).where(eq(s.creatorTips.id, payment.purposeId));
      if (!tip) return;
      const [orig] = await tx.select().from(s.creatorLedger).where(and(eq(s.creatorLedger.kind, 'tip'), eq(s.creatorLedger.sourceId, tip.id)));
      if (!orig) return;
      // Reverse proportionally to what was refunded; one reversal line per refund event is enough for tips (full refunds).
      const fee = Math.round((orig.feePaise * amountPaise) / orig.grossPaise);
      await tx.insert(s.creatorLedger).values({ creatorId: tip.creatorId, kind: 'tip_refund', sourceId: tip.id, grossPaise: -amountPaise, feePaise: -fee, netPaise: -(amountPaise - fee), status: 'held', simulated: orig.simulated }).onConflictDoNothing();
      if (payment.refundedPaise >= payment.amountPaise) await tx.update(s.creatorTips).set({ status: 'refunded' }).where(eq(s.creatorTips.id, tip.id));
    },
  });

  registerPaymentHandlers('creator_unlock', {
    onSucceeded: async (c, tx, payment) => {
      const [p] = await tx.update(s.creatorPurchases).set({ status: 'paid' }).where(and(eq(s.creatorPurchases.id, payment.purposeId), ne(s.creatorPurchases.status, 'paid'))).returning();
      if (!p) return;
      const simulated = payment.provider === 'dev_simulator';
      await tx.insert(s.creatorLedger).values({ creatorId: p.creatorId, kind: 'unlock', sourceId: p.id, ...paidSplit(p.amountPaise, UNLOCK_FEE), status: 'held', simulated }).onConflictDoNothing();
      const [o] = await tx.select({ title: s.creatorOfferings.title }).from(s.creatorOfferings).where(eq(s.creatorOfferings.id, p.offeringId));
      await notify(c, tx, { userId: p.buyerId, category: 'social', title: `Unlocked: ${o.title}`, body: 'Open it any time from Your unlocks.', link: '/unlocks', dedupeKey: `unlock:${p.id}` });
      await notify(c, tx, { userId: p.creatorId, category: 'social', title: `Someone unlocked “${o.title}”`, body: rupees(p.amountPaise), link: '/creator-studio', dedupeKey: `unlock-sale:${p.id}` });
      await track(tx, p.buyerId, 'creator_unlock_purchased', { simulated });
    },
    onFailed: async (_c, tx, payment) => {
      await tx.update(s.creatorPurchases).set({ status: 'failed' }).where(and(eq(s.creatorPurchases.id, payment.purposeId), eq(s.creatorPurchases.status, 'pending')));
    },
    onRefunded: async (_c, tx, payment, amountPaise) => {
      const [p] = await tx.select().from(s.creatorPurchases).where(eq(s.creatorPurchases.id, payment.purposeId));
      if (!p) return;
      const [orig] = await tx.select().from(s.creatorLedger).where(and(eq(s.creatorLedger.kind, 'unlock'), eq(s.creatorLedger.sourceId, p.id)));
      if (orig) {
        const fee = Math.round((orig.feePaise * amountPaise) / orig.grossPaise);
        await tx.insert(s.creatorLedger).values({ creatorId: p.creatorId, kind: 'unlock_refund', sourceId: p.id, grossPaise: -amountPaise, feePaise: -fee, netPaise: -(amountPaise - fee), status: 'held', simulated: orig.simulated }).onConflictDoNothing();
      }
      // A refund takes the unlock away.
      if (payment.refundedPaise >= payment.amountPaise) await tx.update(s.creatorPurchases).set({ status: 'refunded' }).where(eq(s.creatorPurchases.id, p.id));
    },
  });

  /** Offerings this member has paid to unlock (kept even if the creator archives the offering later). */
  async function unlockedIds(userId: string, offeringIds: string[]) {
    if (!offeringIds.length) return new Set<string>();
    return new Set((await db.select({ id: s.creatorPurchases.offeringId }).from(s.creatorPurchases).where(and(eq(s.creatorPurchases.buyerId, userId), eq(s.creatorPurchases.status, 'paid'), inArray(s.creatorPurchases.offeringId, offeringIds)))).map((r) => r.id));
  }
  const buyable = (o: typeof s.creatorOfferings.$inferSelect) => o.kind === 'digital' && Boolean(o.pricePaise) && Boolean(o.unlockContent || o.unlockLink);

  /* ---------------- Helpers ---------------- */

  async function blockedBetween(a: string, b: string) {
    const [row] = await db.select().from(s.blocks).where(or(and(eq(s.blocks.blockerId, a), eq(s.blocks.blockedId, b)), and(eq(s.blocks.blockerId, b), eq(s.blocks.blockedId, a))));
    return !!row;
  }
  async function screen(texts: string[]) {
    const phrases = await blockedPhrases(db);
    for (const t of texts.filter(Boolean)) { const r = screenText(t, phrases); if (!r.ok) throw badRequest(r.reason!); }
  }
  async function earnings(creatorId: string) {
    const rows = await db.select({ simulated: s.creatorLedger.simulated, gross: sql<number>`coalesce(sum(${s.creatorLedger.grossPaise}),0)::int`, fee: sql<number>`coalesce(sum(${s.creatorLedger.feePaise}),0)::int`, net: sql<number>`coalesce(sum(${s.creatorLedger.netPaise}),0)::int`, n: sql<number>`count(*) filter (where ${s.creatorLedger.kind} = 'tip')::int` })
      .from(s.creatorLedger).where(eq(s.creatorLedger.creatorId, creatorId)).groupBy(s.creatorLedger.simulated);
    const real = rows.find((r) => !r.simulated);
    const sim = rows.find((r) => r.simulated);
    return {
      heldNetPaise: real?.net ?? 0, grossPaise: real?.gross ?? 0, feePaise: real?.fee ?? 0, tips: real?.n ?? 0,
      simulatedNetPaise: sim?.net ?? 0, simulatedTips: sim?.n ?? 0,
      payoutsAvailable: R.payoutsAvailable,
      payoutNote: 'Payouts aren’t available yet. They need identity verification, a payout provider and tax handling. Your earnings are recorded and held.',
    };
  }
  async function featuredPosts(authorId: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await db.select({ id: s.posts.id, kind: s.posts.kind, body: s.posts.body, imageUrl: s.posts.imageUrl, createdAt: s.posts.createdAt }).from(s.posts)
      .where(and(inArray(s.posts.id, ids), eq(s.posts.authorId, authorId), eq(s.posts.visibility, 'public'), eq(s.posts.pseudonymous, false), isNull(s.posts.deletedAt), eq(s.posts.hiddenByModeration, false), isNull(s.posts.groupId)));
    return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
  }

  /* ---------------- Creator studio ---------------- */

  app.get('/api/v1/creators/me', async (req) => {
    const a = requireAuth(req);
    const [p] = await db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, a.userId));
    const [me] = await db.select({ handle: s.profiles.handle }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    if (!p) return { profile: null, handle: me?.handle ?? null, tipsAvailable: tipsAvailable() };
    const offerings = await db.select().from(s.creatorOfferings).where(and(eq(s.creatorOfferings.creatorId, a.userId), ne(s.creatorOfferings.status, 'archived'))).orderBy(desc(s.creatorOfferings.createdAt));
    const interest = offerings.length ? await db.select({ id: s.creatorOfferingInterests.offeringId, n: sql<number>`count(*)::int` }).from(s.creatorOfferingInterests).where(inArray(s.creatorOfferingInterests.offeringId, offerings.map((o) => o.id))).groupBy(s.creatorOfferingInterests.offeringId) : [];
    const tips = await db.select().from(s.creatorTips).where(and(eq(s.creatorTips.creatorId, a.userId), eq(s.creatorTips.status, 'paid'))).orderBy(desc(s.creatorTips.createdAt)).limit(30);
    const names = await displayNames(db, tips.filter((t) => !t.anonymous).map((t) => t.fromUserId));
    const posts = await db.select({ id: s.posts.id, body: s.posts.body, kind: s.posts.kind }).from(s.posts)
      .where(and(eq(s.posts.authorId, a.userId), eq(s.posts.visibility, 'public'), eq(s.posts.pseudonymous, false), isNull(s.posts.deletedAt), isNull(s.posts.groupId))).orderBy(desc(s.posts.createdAt)).limit(30);
    const simulatedIds = new Set((await db.select({ id: s.creatorLedger.sourceId }).from(s.creatorLedger).where(and(eq(s.creatorLedger.creatorId, a.userId), eq(s.creatorLedger.simulated, true)))).map((r) => r.id));
    return {
      profile: { headline: p.headline, about: p.about, categories: p.categories, links: p.links as Link[], featuredPostIds: p.featuredPostIds, tipsEnabled: p.tipsEnabled, status: p.status },
      handle: me?.handle ?? null,
      tipsAvailable: tipsAvailable(),
      offerings: await Promise.all(offerings.map(async (o) => ({ ...o, interested: interest.find((i) => i.id === o.id)?.n ?? 0, buyable: buyable(o), unlocks: (await db.select({ n: sql<number>`count(*)::int` }).from(s.creatorPurchases).where(and(eq(s.creatorPurchases.offeringId, o.id), eq(s.creatorPurchases.status, 'paid'))))[0].n }))),
      earnings: await earnings(a.userId),
      tips: tips.map((t) => ({ id: t.id, from: t.anonymous ? 'Someone' : (names.get(t.fromUserId)?.displayName ?? 'Member'), amountPaise: t.amountPaise, message: t.message, simulated: simulatedIds.has(t.id), createdAt: t.createdAt })),
      myPublicPosts: posts.map((x) => ({ id: x.id, kind: x.kind, preview: x.body.slice(0, 90) })),
    };
  });

  app.put('/api/v1/creators/me', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before setting up a creator page.');
    const body = parse(z.object({
      headline: z.string().trim().max(R.headlineMax).default(''),
      about: z.string().trim().max(R.aboutMax).default(''),
      categories: z.array(z.enum(CREATOR_CATEGORIES)).max(R.maxCategories).default([]),
      links: z.array(z.object({ label: z.string().trim().min(1).max(40), url: z.string().trim().max(300) })).max(R.maxLinks).default([]),
      featuredPostIds: z.array(z.uuid()).max(R.maxFeatured).default([]),
      tipsEnabled: z.boolean().default(false),
      paused: z.boolean().default(false),
    }), req.body);
    const links = body.links.map((l) => { const url = safeLink(l.url); if (!url) throw badRequest(`“${l.label}” needs a full https:// link.`); return { label: l.label, url }; });
    await screen([body.headline, body.about, ...links.map((l) => l.label)]);
    const featured = await featuredPosts(a.userId, [...new Set(body.featuredPostIds)]);
    if (featured.length !== new Set(body.featuredPostIds).size) throw badRequest('You can feature only your own public, non-pen-name posts.');
    const [existing] = await db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, a.userId));
    if (existing?.status === 'suspended') throw forbidden('Your creator page is suspended. You can appeal from Settings → Appeals.');
    const values = { headline: body.headline, about: body.about, categories: body.categories, links, featuredPostIds: [...new Set(body.featuredPostIds)], tipsEnabled: body.tipsEnabled, status: body.paused ? 'paused' : 'active', updatedAt: new Date() };
    await db.insert(s.creatorProfiles).values({ userId: a.userId, ...values }).onConflictDoUpdate({ target: s.creatorProfiles.userId, set: values });
    if (!existing) await track(db, a.userId, 'creator_profile_created', {});
    return { ok: true };
  });

  const Offering = z.object({
    kind: z.enum(OFFERING_KINDS), title: z.string().trim().min(3).max(80), description: z.string().trim().max(600).default(''),
    pricePaise: z.number().int().min(100).max(10_000_00).nullable().default(null), status: z.enum(['draft', 'listed', 'archived']).default('draft'),
    unlockContent: z.string().trim().max(PR.unlockContentMax).nullable().optional(), unlockLink: z.string().trim().max(500).nullable().optional(),
  });

  /** Edits change only the fields sent (no defaults, so archiving never resets price or description). */
  const OfferingPatch = z.object({
    kind: z.enum(OFFERING_KINDS), title: z.string().trim().min(3).max(80), description: z.string().trim().max(600),
    pricePaise: z.number().int().min(100).max(10_000_00).nullable(), status: z.enum(['draft', 'listed', 'archived']),
    unlockContent: z.string().trim().max(PR.unlockContentMax).nullable(), unlockLink: z.string().trim().max(500).nullable(),
  }).partial();

  /** Paid unlocks are digital offerings with content or a link, priced within the unlock range. */
  function checkUnlock(o: { kind?: string; pricePaise?: number | null; unlockContent?: string | null; unlockLink?: string | null }) {
    if (o.unlockLink) { const safe = safeLink(o.unlockLink); if (!safe) throw badRequest('The unlock link must be a plain https link.'); o.unlockLink = safe; }
    if (!o.unlockContent && !o.unlockLink) return;
    if (o.kind !== 'digital') throw badRequest('Only digital offerings can be unlocked.');
    if (!o.pricePaise || o.pricePaise < PR.unlockMinPaise || o.pricePaise > PR.unlockMaxPaise) throw badRequest(`Paid unlocks are priced from ${rupees(PR.unlockMinPaise)} to ${rupees(PR.unlockMaxPaise)}.`);
  }

  async function requireCreator(userId: string) {
    const [p] = await db.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, userId));
    if (!p) throw badRequest('Set up your creator page first.');
    if (p.status === 'suspended') throw forbidden('Your creator page is suspended.');
    return p;
  }
  async function checkListedCap(userId: string, exceptId?: string) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.creatorOfferings).where(and(eq(s.creatorOfferings.creatorId, userId), eq(s.creatorOfferings.status, 'listed'), exceptId ? ne(s.creatorOfferings.id, exceptId) : undefined));
    if (n >= R.maxListedOfferings) throw conflict(`You can list up to ${R.maxListedOfferings} offerings.`);
  }

  app.post('/api/v1/creators/me/offerings', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    await requireCreator(a.userId);
    const body = parse(Offering, req.body);
    await screen([body.title, body.description, body.unlockContent ?? '']);
    checkUnlock(body);
    if (body.status === 'listed') await checkListedCap(a.userId);
    const [o] = await db.insert(s.creatorOfferings).values({ creatorId: a.userId, ...body }).returning();
    return reply.code(201).send({ offering: o });
  });

  app.patch('/api/v1/creators/me/offerings/:id', async (req) => {
    const a = requireAuth(req);
    await requireCreator(a.userId);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(OfferingPatch, req.body);
    await screen([body.title ?? '', body.description ?? '', body.unlockContent ?? '']);
    const [prev] = await db.select().from(s.creatorOfferings).where(and(eq(s.creatorOfferings.id, id), eq(s.creatorOfferings.creatorId, a.userId)));
    if (!prev) throw notFound('Offering');
    const merged = { ...prev, ...body };
    checkUnlock(merged);
    if (body.unlockLink !== undefined) body.unlockLink = merged.unlockLink;
    if (body.status === 'listed') await checkListedCap(a.userId, id);
    const [o] = await db.update(s.creatorOfferings).set(body).where(and(eq(s.creatorOfferings.id, id), eq(s.creatorOfferings.creatorId, a.userId))).returning();
    if (!o) throw notFound('Offering');
    return { offering: o };
  });

  /* ---------------- Public creator pages ---------------- */

  app.get('/api/v1/creators', async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ category: z.enum(CREATOR_CATEGORIES).optional() }), req.query);
    const rows = await db.select({ c: s.creatorProfiles, handle: s.profiles.handle, name: s.profiles.displayName, avatarUrl: s.profiles.avatarUrl }).from(s.creatorProfiles).innerJoin(s.profiles, eq(s.profiles.userId, s.creatorProfiles.userId))
      .where(and(eq(s.creatorProfiles.status, 'active'), q.category ? sql`${q.category} = any(${s.creatorProfiles.categories})` : undefined)).orderBy(desc(s.creatorProfiles.updatedAt)).limit(60);
    const blocks = await db.select({ a: s.blocks.blockerId, b: s.blocks.blockedId }).from(s.blocks).where(or(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, a.userId)));
    const hidden = new Set(blocks.map((r) => (r.a === a.userId ? r.b : r.a)));
    return { creators: rows.filter((r) => !hidden.has(r.c.userId)).map((r) => ({ handle: r.handle, name: r.name, avatarUrl: r.avatarUrl, headline: r.c.headline, categories: r.c.categories, isMe: r.c.userId === a.userId })) };
  });

  async function creatorByHandle(viewerId: string, handle: string) {
    const [row] = await db.select({ c: s.creatorProfiles, p: s.profiles }).from(s.creatorProfiles).innerJoin(s.profiles, eq(s.profiles.userId, s.creatorProfiles.userId)).where(sql`lower(${s.profiles.handle}) = ${handle.toLowerCase()}`);
    if (!row) throw notFound('Creator');
    const own = row.c.userId === viewerId;
    if (!own && (row.c.status !== 'active' || (await blockedBetween(viewerId, row.c.userId)))) throw notFound('Creator');
    return { ...row, own };
  }

  app.get('/api/v1/creators/:handle', async (req) => {
    const a = requireAuth(req);
    const { handle } = parse(z.object({ handle: z.string().min(1).max(60) }), req.params);
    const { c, p, own } = await creatorByHandle(a.userId, handle);
    const offerings = await db.select().from(s.creatorOfferings).where(and(eq(s.creatorOfferings.creatorId, c.userId), eq(s.creatorOfferings.status, 'listed'))).orderBy(desc(s.creatorOfferings.createdAt));
    const mine = offerings.length ? (await db.select({ id: s.creatorOfferingInterests.offeringId }).from(s.creatorOfferingInterests).where(and(eq(s.creatorOfferingInterests.userId, a.userId), inArray(s.creatorOfferingInterests.offeringId, offerings.map((o) => o.id))))).map((r) => r.id) : [];
    const owned = await unlockedIds(a.userId, offerings.map((o) => o.id));
    const wall = await db.select().from(s.creatorTips).where(and(eq(s.creatorTips.creatorId, c.userId), eq(s.creatorTips.status, 'paid'), eq(s.creatorTips.showOnWall, true), eq(s.creatorTips.anonymous, false))).orderBy(desc(s.creatorTips.createdAt)).limit(20);
    const names = await displayNames(db, wall.map((w) => w.fromUserId));
    return {
      creator: { id: c.userId, handle: p.handle, name: p.displayName, avatarUrl: p.avatarUrl, headline: c.headline, about: c.about, categories: c.categories, links: c.links as Link[], status: c.status, isMe: own },
      featured: await featuredPosts(c.userId, c.featuredPostIds),
      offerings: offerings.map((o) => {
        const open = own || owned.has(o.id);
        // Unlock content is only ever sent to the creator and to members who paid for it.
        return { id: o.id, kind: o.kind, title: o.title, description: o.description, pricePaise: o.pricePaise, interested: mine.includes(o.id), buyable: buyable(o) && tipsAvailable(), paidUnlock: buyable(o), owned: owned.has(o.id), unlock: open && buyable(o) ? { content: o.unlockContent, link: o.unlockLink } : null };
      }),
      tips: { enabled: c.tipsEnabled && c.status === 'active', available: tipsAvailable(), presetsPaise: R.tipPresetsPaise, minPaise: R.tipMinPaise, maxPaise: R.tipMaxPaise, testMode: ctx.config.PAYMENT_PROVIDER === 'dev_simulator' },
      // Supporters who chose to be listed. Amounts are never shown publicly.
      supporters: wall.map((w) => ({ name: names.get(w.fromUserId)?.displayName ?? 'Member', message: w.message, createdAt: w.createdAt })),
    };
  });

  app.post('/api/v1/creators/:handle/offerings/:id/interest', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    const { handle, id } = parse(z.object({ handle: z.string().min(1).max(60), id: z.uuid() }), req.params);
    const { c, own } = await creatorByHandle(a.userId, handle);
    if (own) throw badRequest('This is your own offering.');
    const [o] = await db.select().from(s.creatorOfferings).where(and(eq(s.creatorOfferings.id, id), eq(s.creatorOfferings.creatorId, c.userId), eq(s.creatorOfferings.status, 'listed')));
    if (!o) throw notFound('Offering');
    const { on } = parse(z.object({ on: z.boolean() }), req.body);
    if (on) await db.insert(s.creatorOfferingInterests).values({ offeringId: id, userId: a.userId }).onConflictDoNothing();
    else await db.delete(s.creatorOfferingInterests).where(and(eq(s.creatorOfferingInterests.offeringId, id), eq(s.creatorOfferingInterests.userId, a.userId)));
    return { interested: on };
  });

  /** Starts a paid unlock. Access is given only when a verified payment event arrives. */
  app.post('/api/v1/creators/:handle/offerings/:id/purchase', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before buying.');
    const { handle, id } = parse(z.object({ handle: z.string().min(1).max(60), id: z.uuid() }), req.params);
    const { idempotencyKey } = parse(z.object({ idempotencyKey: z.string().min(8).max(80) }), req.body);
    const { c, own } = await creatorByHandle(a.userId, handle);
    if (own) throw badRequest('This is your own offering.');
    const [o] = await db.select().from(s.creatorOfferings).where(and(eq(s.creatorOfferings.id, id), eq(s.creatorOfferings.creatorId, c.userId), eq(s.creatorOfferings.status, 'listed')));
    if (!o || !buyable(o)) throw notFound('Offering');
    if (!tipsAvailable()) throw badRequest('Unlocks can be bought once payments are switched on.');
    if ((await unlockedIds(a.userId, [o.id])).size) throw conflict('You’ve already unlocked this.');
    return db.transaction(async (tx) => {
      const [p] = await tx.insert(s.creatorPurchases).values({ offeringId: o.id, creatorId: c.userId, buyerId: a.userId, amountPaise: o.pricePaise! }).returning();
      const checkout = await createPayment(ctx, tx, { userId: a.userId, purpose: 'creator_unlock', purposeId: p.id, amountPaise: o.pricePaise!, idempotencyKey: `unlock:${a.userId}:${idempotencyKey}` });
      await tx.update(s.creatorPurchases).set({ paymentId: checkout.paymentId }).where(eq(s.creatorPurchases.id, p.id));
      return { purchase: { id: p.id }, checkout };
    });
  });

  /** Everything you've unlocked, with its content. */
  app.get('/api/v1/creators/unlocks/mine', async (req) => {
    const a = requireAuth(req);
    const rows = await db.select({ p: s.creatorPurchases, o: s.creatorOfferings, handle: s.profiles.handle, name: s.profiles.displayName }).from(s.creatorPurchases)
      .innerJoin(s.creatorOfferings, eq(s.creatorOfferings.id, s.creatorPurchases.offeringId)).innerJoin(s.profiles, eq(s.profiles.userId, s.creatorPurchases.creatorId))
      .where(and(eq(s.creatorPurchases.buyerId, a.userId), eq(s.creatorPurchases.status, 'paid'))).orderBy(desc(s.creatorPurchases.createdAt));
    const simulated = new Set(rows.length ? (await db.select({ id: s.creatorLedger.sourceId }).from(s.creatorLedger).where(and(eq(s.creatorLedger.kind, 'unlock'), eq(s.creatorLedger.simulated, true), inArray(s.creatorLedger.sourceId, rows.map((r) => r.p.id))))).map((r) => r.id) : []);
    return { unlocks: rows.map((r) => ({ id: r.p.id, title: r.o.title, description: r.o.description, creator: { handle: r.handle, name: r.name }, amountPaise: r.p.amountPaise, simulated: simulated.has(r.p.id), content: r.o.unlockContent, link: r.o.unlockLink, unlockedAt: r.p.createdAt })) };
  });

  /** Starts a tip. It is only recorded as paid when a verified payment event arrives. */
  app.post('/api/v1/creators/:handle/tips', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before sending a tip.');
    const { handle } = parse(z.object({ handle: z.string().min(1).max(60) }), req.params);
    const body = parse(z.object({ amountPaise: z.number().int().min(R.tipMinPaise).max(R.tipMaxPaise), message: z.string().trim().max(R.messageMax).default(''), anonymous: z.boolean().default(false), showOnWall: z.boolean().default(false), idempotencyKey: z.string().min(8).max(80) }), req.body);
    const { c, own } = await creatorByHandle(a.userId, handle);
    if (own) throw badRequest('You can’t tip yourself.');
    if (!c.tipsEnabled || c.status !== 'active') throw badRequest('This creator isn’t accepting tips.');
    if (!tipsAvailable()) throw badRequest('Tips open when payments are switched on.');
    await screen([body.message]);
    const [{ today }] = await db.select({ today: sql<number>`coalesce(sum(${s.creatorTips.amountPaise}),0)::int` }).from(s.creatorTips)
      .where(and(eq(s.creatorTips.fromUserId, a.userId), inArray(s.creatorTips.status, ['pending', 'paid']), gte(s.creatorTips.createdAt, new Date(Date.now() - 864e5))));
    if (today + body.amountPaise > R.dailyTipCapPaise) throw badRequest(`You can tip up to ${rupees(R.dailyTipCapPaise)} a day in total.`);
    return db.transaction(async (tx) => {
      const [tip] = await tx.insert(s.creatorTips).values({ creatorId: c.userId, fromUserId: a.userId, amountPaise: body.amountPaise, message: body.message, anonymous: body.anonymous, showOnWall: body.showOnWall && !body.anonymous }).returning();
      const checkout = await createPayment(ctx, tx, { userId: a.userId, purpose: 'creator_tip', purposeId: tip.id, amountPaise: body.amountPaise, idempotencyKey: `tip:${a.userId}:${body.idempotencyKey}` });
      await tx.update(s.creatorTips).set({ paymentId: checkout.paymentId }).where(eq(s.creatorTips.id, tip.id));
      return { tip: { id: tip.id }, checkout, split: tipSplit(body.amountPaise) };
    });
  });

  /* ---------------- Moderation ---------------- */

  app.get('/api/v1/admin/creators', async (req) => {
    requireCapability(req, 'moderation');
    const rows = await db.select({ c: s.creatorProfiles, handle: s.profiles.handle, name: s.profiles.displayName }).from(s.creatorProfiles).innerJoin(s.profiles, eq(s.profiles.userId, s.creatorProfiles.userId)).orderBy(desc(s.creatorProfiles.updatedAt)).limit(200);
    const ids = rows.map((r) => r.c.userId);
    const ledger = ids.length ? await db.select({ id: s.creatorLedger.creatorId, simulated: s.creatorLedger.simulated, net: sql<number>`sum(${s.creatorLedger.netPaise})::int`, fee: sql<number>`sum(${s.creatorLedger.feePaise})::int` }).from(s.creatorLedger).where(inArray(s.creatorLedger.creatorId, ids)).groupBy(s.creatorLedger.creatorId, s.creatorLedger.simulated) : [];
    const pick = (id: string, sim: boolean) => ledger.find((l) => l.id === id && l.simulated === sim);
    return {
      payoutsAvailable: R.payoutsAvailable,
      creators: rows.map((r) => ({ userId: r.c.userId, handle: r.handle, name: r.name, status: r.c.status, tipsEnabled: r.c.tipsEnabled, heldNetPaise: pick(r.c.userId, false)?.net ?? 0, platformFeePaise: pick(r.c.userId, false)?.fee ?? 0, simulatedNetPaise: pick(r.c.userId, true)?.net ?? 0 })),
    };
  });

  app.post('/api/v1/admin/creators/:userId/status', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    const { status, reason } = parse(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().min(3).max(300) }), req.body);
    const [row] = await db.update(s.creatorProfiles).set({ status, ...(status === 'suspended' ? { tipsEnabled: false } : {}), updatedAt: new Date() }).where(eq(s.creatorProfiles.userId, userId)).returning();
    if (!row) throw notFound('Creator');
    await audit(db, { actorId: a.userId, action: `moderation.creator_${status}`, targetType: 'user', targetId: userId, meta: { reason } });
    await notify(ctx, db, { userId, category: 'system', title: status === 'suspended' ? 'Your creator page was suspended' : 'Your creator page is back', body: reason, link: '/creator-studio' });
    return { ok: true };
  });
}
