import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth, requireCapability } from '../lib/auth';
import { decryptField, encryptField, hmac, randomToken, safeEqual } from '../lib/crypto';
import { AppError, badRequest, conflict, notFound, parse } from '../lib/http';
import { adViewerKey } from './ads';
import { adPolicyIssues } from '../../shared/ads';
import { PARTNER_RULES as R, PERK_CATEGORIES, PERK_DISCLOSURE, trackedUrl, validPostback, type Postback } from '../../shared/partners';

/** Partner perks (member offers), tracked outbound links and signed conversion postbacks. */
export async function partnerRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;
  const viewer = (userId: string) => adViewerKey(ctx.config.appSecret, userId);

  /* ---------------- Members ---------------- */

  app.get('/api/v1/perks', async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ category: z.enum(PERK_CATEGORIES).optional() }), req.query);
    const now = new Date();
    const rows = await db.select({ o: s.partnerOffers, partner: s.partners.name }).from(s.partnerOffers).innerJoin(s.partners, eq(s.partners.id, s.partnerOffers.partnerId))
      .where(and(eq(s.partnerOffers.status, 'live'), eq(s.partners.status, 'active'), lte(s.partnerOffers.startsAt, now), gt(s.partnerOffers.endsAt, now), q.category ? eq(s.partnerOffers.category, q.category) : undefined))
      .orderBy(desc(s.partnerOffers.createdAt)).limit(100);
    const ids = rows.map((r) => r.o.id);
    const mine = ids.length ? new Set((await db.select({ o: s.affiliateClicks.offerId }).from(s.affiliateClicks).where(and(eq(s.affiliateClicks.viewerKey, viewer(a.userId)), inArray(s.affiliateClicks.offerId, ids)))).map((r) => r.o)) : new Set<string>();
    return {
      disclosure: PERK_DISCLOSURE,
      perks: rows.map((r) => ({ id: r.o.id, partner: r.partner, title: r.o.title, description: r.o.description, category: r.o.category, endsAt: r.o.endsAt, hasCode: !!r.o.code, code: mine.has(r.o.id) ? r.o.code : null })),
    };
  });

  /** Follow a perk: records a click with an opaque reference and returns the partner link (and code, if any). */
  app.post('/api/v1/perks/:id/go', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const now = new Date();
    const [row] = await db.select({ o: s.partnerOffers, p: s.partners }).from(s.partnerOffers).innerJoin(s.partners, eq(s.partners.id, s.partnerOffers.partnerId))
      .where(and(eq(s.partnerOffers.id, id), eq(s.partnerOffers.status, 'live'), eq(s.partners.status, 'active'), lte(s.partnerOffers.startsAt, now), gt(s.partnerOffers.endsAt, now)));
    if (!row) throw notFound('Perk');
    const ref = randomToken(12).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
    await db.insert(s.affiliateClicks).values({ ref, offerId: id, viewerKey: viewer(a.userId) });
    await track(db, a.userId, 'perk_followed', { category: row.o.category });
    return { url: trackedUrl(row.o.url, ref, row.p.subIdParam), code: row.o.code };
  });

  /* ---------------- Partner postbacks (server to server) ---------------- */

  /**
   * Conversion postback. Signed with the partner's secret: header x-nakshatra-signature = HMAC-SHA256(secret, raw body).
   * Idempotent per (partner, externalId); a later postback can only move a conversion to "reversed".
   */
  app.post('/api/v1/partners/postback/:partnerId', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { partnerId } = parse(z.object({ partnerId: z.uuid() }), req.params);
    const [partner] = await db.select().from(s.partners).where(eq(s.partners.id, partnerId));
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? '';
    const sig = String(req.headers['x-nakshatra-signature'] ?? '');
    if (!partner || !sig || !safeEqual(sig, hmac(decryptField(ctx.config.appSecret, partner.postbackSecretEnc), raw))) throw new AppError(401, 'bad_signature', 'Signature check failed.');
    const body = parse(z.object({ externalId: z.string().min(1).max(100), clickRef: z.string().max(40).optional(), orderPaise: z.number().int(), commissionPaise: z.number().int(), status: z.enum(['pending', 'approved', 'reversed']).optional() }), req.body) as Postback;
    const problem = validPostback(body);
    if (problem) throw badRequest(problem);
    let click: typeof s.affiliateClicks.$inferSelect | undefined;
    if (body.clickRef) {
      [click] = await db.select().from(s.affiliateClicks).where(eq(s.affiliateClicks.ref, body.clickRef));
      // A click only attributes within the window and to this partner's own offers.
      if (click) {
        const [offer] = await db.select({ p: s.partnerOffers.partnerId }).from(s.partnerOffers).where(eq(s.partnerOffers.id, click.offerId));
        if (offer?.p !== partnerId || Date.now() - click.createdAt.getTime() > R.maxClickAgeDays * 864e5) click = undefined;
      }
    }
    const [existing] = await db.select().from(s.affiliateConversions).where(and(eq(s.affiliateConversions.partnerId, partnerId), eq(s.affiliateConversions.externalId, body.externalId)));
    if (existing) {
      if (body.status === 'reversed' && existing.status !== 'reversed') await db.update(s.affiliateConversions).set({ status: 'reversed', updatedAt: new Date() }).where(eq(s.affiliateConversions.id, existing.id));
      return { ok: true, duplicate: true };
    }
    // Partners can't self-approve: new conversions start pending unless reported reversed.
    await db.insert(s.affiliateConversions).values({ partnerId, externalId: body.externalId, clickId: click?.id ?? null, offerId: click?.offerId ?? null, orderPaise: body.orderPaise, commissionPaise: body.commissionPaise, status: body.status === 'reversed' ? 'reversed' : 'pending', payload: body as unknown as Record<string, unknown> });
    return { ok: true, attributed: !!click };
  });

  /* ---------------- Staff ---------------- */

  app.get('/api/v1/admin/partners', async (req) => {
    requireCapability(req, 'commerce');
    const list = await db.select().from(s.partners).orderBy(desc(s.partners.createdAt));
    const offers = await db.select().from(s.partnerOffers).orderBy(desc(s.partnerOffers.createdAt)).limit(200);
    const clicks = await db.select({ o: s.affiliateClicks.offerId, n: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${s.affiliateClicks.viewerKey})::int` }).from(s.affiliateClicks).groupBy(s.affiliateClicks.offerId);
    const conv = await db.select({ p: s.affiliateConversions.partnerId, status: s.affiliateConversions.status, n: sql<number>`count(*)::int`, commission: sql<number>`sum(${s.affiliateConversions.commissionPaise})::int` }).from(s.affiliateConversions).groupBy(s.affiliateConversions.partnerId, s.affiliateConversions.status);
    const pending = await db.select().from(s.affiliateConversions).where(eq(s.affiliateConversions.status, 'pending')).orderBy(desc(s.affiliateConversions.createdAt)).limit(100);
    return {
      partners: list.map(({ postbackSecretEnc: _secret, ...p }) => ({ ...p, postbackUrl: `/api/v1/partners/postback/${p.id}`, conversions: conv.filter((c) => c.p === p.id).map((c) => ({ status: c.status, n: c.n, commissionPaise: c.commission })) })),
      offers: offers.map((o) => ({ ...o, partner: list.find((p) => p.id === o.partnerId)?.name ?? '—', clicks: clicks.find((c) => c.o === o.id)?.n ?? 0, people: clicks.find((c) => c.o === o.id)?.people ?? 0 })),
      pending: pending.map((c) => ({ id: c.id, partner: list.find((p) => p.id === c.partnerId)?.name ?? '—', externalId: c.externalId, orderPaise: c.orderPaise, commissionPaise: c.commissionPaise, attributed: !!c.clickId, createdAt: c.createdAt })),
    };
  });

  app.post('/api/v1/admin/partners', async (req, reply) => {
    const a = requireCapability(req, 'commerce');
    const body = parse(z.object({ name: z.string().trim().min(2).max(80), website: z.url().startsWith('https://'), terms: z.string().trim().max(500).default(''), subIdParam: z.string().regex(/^[a-z_]{2,20}$/).default('subid') }), req.body);
    const secret = randomToken(24);
    const [p] = await db.insert(s.partners).values({ ...body, postbackSecretEnc: encryptField(ctx.config.appSecret, secret), createdBy: a.userId }).returning();
    await audit(db, { actorId: a.userId, action: 'partners.created', targetType: 'partner', targetId: p.id, meta: { name: p.name } });
    // The secret is shown once; staff pass it to the partner for signing postbacks.
    return reply.code(201).send({ partner: { id: p.id, name: p.name, postbackUrl: `/api/v1/partners/postback/${p.id}` }, postbackSecret: secret });
  });

  app.post('/api/v1/admin/partners/:id/status', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status } = parse(z.object({ status: z.enum(['active', 'paused']) }), req.body);
    const [p] = await db.update(s.partners).set({ status }).where(eq(s.partners.id, id)).returning();
    if (!p) throw notFound('Partner');
    await audit(db, { actorId: a.userId, action: `partners.${status}`, targetType: 'partner', targetId: id });
    return { ok: true };
  });

  app.post('/api/v1/admin/partners/offers', async (req, reply) => {
    const a = requireCapability(req, 'commerce');
    const body = parse(z.object({
      partnerId: z.uuid(), title: z.string().trim().min(3).max(R.title), description: z.string().trim().max(R.description).default(''), category: z.enum(PERK_CATEGORIES),
      url: z.string().trim().max(500), code: z.string().trim().max(R.code).optional(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(),
    }), req.body);
    const issues = adPolicyIssues({ headline: body.title, body: body.description, ctaLabel: 'Get offer', destinationUrl: body.url }, { topics: [], languages: [] });
    if (issues.length) throw badRequest(issues.join(' '));
    if (new Date(body.endsAt) <= new Date(body.startsAt)) throw badRequest('End must be after start.');
    const [partner] = await db.select().from(s.partners).where(eq(s.partners.id, body.partnerId));
    if (!partner) throw notFound('Partner');
    const [o] = await db.insert(s.partnerOffers).values({ ...body, code: body.code || null, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), createdBy: a.userId }).returning();
    await audit(db, { actorId: a.userId, action: 'partners.offer_created', targetType: 'partner_offer', targetId: o.id });
    return reply.code(201).send({ offer: o });
  });

  app.post('/api/v1/admin/partners/offers/:id/status', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status } = parse(z.object({ status: z.enum(['live', 'draft', 'ended']) }), req.body);
    const [o] = await db.select().from(s.partnerOffers).where(eq(s.partnerOffers.id, id));
    if (!o) throw notFound('Offer');
    if (o.status === 'ended') throw conflict('Ended offers stay ended.');
    await db.update(s.partnerOffers).set({ status }).where(eq(s.partnerOffers.id, id));
    await audit(db, { actorId: a.userId, action: `partners.offer_${status}`, targetType: 'partner_offer', targetId: id });
    return { ok: true };
  });

  app.post('/api/v1/admin/partners/conversions/:id', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { decision } = parse(z.object({ decision: z.enum(['approved', 'reversed']) }), req.body);
    const [c] = await db.update(s.affiliateConversions).set({ status: decision, reviewedBy: a.userId, updatedAt: new Date() }).where(and(eq(s.affiliateConversions.id, id), eq(s.affiliateConversions.status, 'pending'))).returning();
    if (!c) throw notFound('Pending conversion');
    await audit(db, { actorId: a.userId, action: `partners.conversion_${decision}`, targetType: 'affiliate_conversion', targetId: id, meta: { commissionPaise: c.commissionPaise } });
    return { ok: true };
  });
}
