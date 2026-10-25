import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor, Tx } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { randomToken } from '../lib/crypto';
import { notify, sendEmail } from '../lib/notify';
import { createPayment, registerPaymentHandlers, requestRefund } from '../lib/payments';
import { textRelevance } from '../services/ranking';
import { displayNames, currentChart } from '../services/identity';
import { grantCourseEnrollment } from './learning';
import { generateReport, REPORT_TEMPLATES } from '../services/reports';
import { LocalStorage, IMAGE_TYPES } from '../lib/storage';

export const SHIPPING_RULE = { flatPaise: 9900, freeAbovePaise: 99900, description: 'Flat ₹99 shipping on physical orders below ₹999; free above.' };

export function computeTotals(lines: { unitPricePaise: number; quantity: number; fulfilment: string }[], discount: { kind: string; value: number; minOrderPaise: number } | null) {
  const subtotal = lines.reduce((a, l) => a + l.unitPricePaise * l.quantity, 0);
  let discountPaise = 0;
  if (discount && subtotal >= discount.minOrderPaise) {
    discountPaise = discount.kind === 'percent' ? Math.floor((subtotal * Math.min(100, discount.value)) / 100) : Math.min(subtotal, discount.value);
  }
  const hasPhysical = lines.some((l) => l.fulfilment === 'physical');
  const afterDiscount = subtotal - discountPaise;
  const shipping = hasPhysical && afterDiscount < SHIPPING_RULE.freeAbovePaise ? SHIPPING_RULE.flatPaise : 0;
  return { subtotalPaise: subtotal, discountPaise, shippingPaise: shipping, taxPaise: 0, totalPaise: afterDiscount + shipping };
}

async function loadDiscount(db: Executor, code?: string | null) {
  if (!code) return null;
  const [d] = await db.select().from(s.discounts).where(sql`upper(${s.discounts.code}) = ${code.toUpperCase()}`);
  const now = new Date();
  if (!d || !d.active || (d.startsAt && d.startsAt > now) || (d.endsAt && d.endsAt < now) || (d.maxUses !== null && d.usedCount >= d.maxUses)) return null;
  return d;
}

async function cartLines(db: Executor, userId: string) {
  return db.select({ item: s.cartItems, v: s.productVariants, p: s.products }).from(s.cartItems)
    .innerJoin(s.productVariants, eq(s.productVariants.id, s.cartItems.variantId)).innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
    .where(eq(s.cartItems.userId, userId)).orderBy(asc(s.cartItems.createdAt));
}

async function restock(tx: Executor, orderId: string, reason: 'refund' | 'adjustment') {
  const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId));
  for (const it of items) {
    const [v] = await tx.select().from(s.productVariants).where(eq(s.productVariants.id, it.variantId));
    if (v.stock !== null) {
      await tx.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} + ${it.quantity}` }).where(eq(s.productVariants.id, it.variantId));
      await tx.insert(s.inventoryMovements).values({ variantId: it.variantId, delta: it.quantity, reason, refId: orderId });
    }
  }
}

export async function commerceRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = new LocalStorage(ctx.config.UPLOAD_DIR);

  registerPaymentHandlers('order', {
    onSucceeded: async (c, tx: Tx, payment) => {
      const [o] = await tx.select().from(s.orders).where(eq(s.orders.id, payment.purposeId));
      if (!o || o.status !== 'pending_payment') return;
      const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, o.id));
      const hasPhysical = items.some((i) => i.fulfilment === 'physical');
      await tx.update(s.orders).set({ status: hasPhysical ? 'fulfilling' : 'completed', paymentId: payment.id, updatedAt: new Date() }).where(eq(s.orders.id, o.id));
      if (hasPhysical) await tx.insert(s.shipments).values({ orderId: o.id, status: 'preparing' });
      if (o.discountCode) await tx.update(s.discounts).set({ usedCount: sql`${s.discounts.usedCount} + 1` }).where(sql`upper(${s.discounts.code}) = ${o.discountCode.toUpperCase()}`);
      for (const it of items.filter((i) => i.fulfilment === 'digital')) {
        const [p] = await tx.select().from(s.products).where(eq(s.products.id, it.productId));
        const asset = (p.digitalAsset ?? {}) as { courseId?: string; reportTemplate?: string };
        const beneficiary = o.isGift && o.giftRecipientEmail ? (await tx.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${o.giftRecipientEmail.toLowerCase()}`))[0]?.id ?? o.userId : o.userId;
        const [ent] = await tx.insert(s.entitlements).values({ userId: beneficiary, kind: asset.courseId ? 'course' : 'product', refId: asset.courseId ?? p.id, sourceType: 'order_item', sourceId: it.id }).onConflictDoNothing().returning();
        if (asset.courseId) await grantCourseEnrollment(tx, beneficiary, asset.courseId, 'purchase', o.id);
        if (asset.reportTemplate && ent) {
          const content = await generateReport(tx, beneficiary, asset.reportTemplate);
          await tx.insert(s.reportDocuments).values({ userId: beneficiary, entitlementId: ent.id, templateKey: asset.reportTemplate, engineVersion: content.engineVersion, content: content as unknown as Record<string, unknown> });
        }
      }
      await notify(c, tx, { userId: o.userId, category: 'orders', title: `Order ${o.number} confirmed`, body: hasPhysical ? 'We’ll update you when it ships.' : 'Your digital items are ready.', link: `/shop/orders/${o.id}` });
      if (o.isGift && o.giftRecipientEmail) await sendEmail(c, tx, o.giftRecipientEmail, 'You received a gift on Nakshatra', `${o.giftMessage ?? ''}\n\nSign in or create an account with this email to access it: ${c.config.APP_ORIGIN}/shop/library`);
      await track(tx, o.userId, 'product_ordered', { items: items.length, digital: !hasPhysical });
    },
    onFailed: async (c, tx, payment) => {
      const [o] = await tx.select().from(s.orders).where(eq(s.orders.id, payment.purposeId));
      if (o?.status === 'pending_payment') {
        await tx.update(s.orders).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(s.orders.id, o.id));
        await restock(tx, o.id, 'adjustment');
        await notify(c, tx, { userId: o.userId, category: 'orders', title: `Payment for order ${o.number} did not go through`, link: `/shop/orders/${o.id}` });
      }
    },
    onRefunded: async (c, tx, payment, amount) => {
      const [o] = await tx.select().from(s.orders).where(eq(s.orders.id, payment.purposeId));
      if (!o) return;
      const full = payment.status === 'refunded';
      await tx.update(s.orders).set({ status: full ? 'refunded' : 'partially_refunded', updatedAt: new Date() }).where(eq(s.orders.id, o.id));
      if (full) {
        const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, o.id));
        await tx.update(s.entitlements).set({ revokedAt: new Date() }).where(and(eq(s.entitlements.sourceType, 'order_item'), inArray(s.entitlements.sourceId, items.map((i) => i.id))));
        await tx.update(s.enrollments).set({ status: 'revoked' }).where(and(eq(s.enrollments.orderId, o.id), eq(s.enrollments.source, 'purchase')));
      }
      await notify(c, tx, { userId: o.userId, category: 'orders', title: `Refund of ₹${(amount / 100).toFixed(2)} processed`, body: `Order ${o.number}`, link: `/shop/orders/${o.id}` });
    },
  });

  registerPaymentHandlers('subscription', {
    onSucceeded: async (c, tx, payment) => {
      const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, payment.purposeId));
      if (!sub) return;
      const [plan] = await tx.select().from(s.subscriptionPlans).where(eq(s.subscriptionPlans.key, sub.planKey));
      const start = sub.status === 'past_due' && sub.currentPeriodEnd ? sub.currentPeriodEnd : new Date();
      const end = DateTime.fromJSDate(start).plus({ months: plan.intervalMonths }).toJSDate();
      const renewing = sub.status === 'past_due' || sub.status === 'active';
      await tx.update(s.subscriptions).set({ status: 'active', currentPeriodStart: start, currentPeriodEnd: end, updatedAt: new Date() }).where(eq(s.subscriptions.id, sub.id));
      await tx.insert(s.entitlements).values({ userId: sub.userId, kind: 'subscription', refId: sub.planKey, sourceType: 'payment', sourceId: payment.id, expiresAt: end }).onConflictDoNothing();
      await notify(c, tx, { userId: sub.userId, category: 'orders', title: renewing ? 'Nakshatra+ renewed' : 'Welcome to Nakshatra+', body: `Active until ${DateTime.fromJSDate(end).toFormat('d LLL yyyy')}.`, link: '/settings/subscription' });
      await track(tx, sub.userId, renewing ? 'subscription_renewed' : 'subscription_started', { plan: sub.planKey });
    },
    onFailed: async (_c, tx, payment) => {
      const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, payment.purposeId));
      if (sub?.status === 'pending_payment') await tx.update(s.subscriptions).set({ status: 'cancelled' }).where(eq(s.subscriptions.id, sub.id));
    },
  });

  /* ---------- Catalogue ---------- */
  app.get('/api/v1/products', async (req) => {
    const q = parse(z.object({ q: z.string().max(80).optional(), category: z.string().optional(), seller: z.uuid().optional(), minPaise: z.coerce.number().int().optional(), maxPaise: z.coerce.number().int().optional(), sort: z.enum(['relevance', 'newest', 'price_asc', 'price_desc']).default('relevance'), page: z.coerce.number().int().min(1).default(1) }), req.query);
    const rows = await ctx.db.select().from(s.products).where(and(eq(s.products.status, 'active'), q.category ? eq(s.products.category, q.category) : undefined, q.seller ? eq(s.products.sellerId, q.seller) : undefined));
    const variants = rows.length ? await ctx.db.select().from(s.productVariants).where(and(inArray(s.productVariants.productId, rows.map((r) => r.id)), eq(s.productVariants.active, true))) : [];
    const ratings = rows.length ? await ctx.db.select({ id: s.reviews.subjectId, avg: sql<number>`avg(${s.reviews.rating})::float`, n: sql<number>`count(*)::int` }).from(s.reviews).where(and(eq(s.reviews.subjectType, 'product'), inArray(s.reviews.subjectId, rows.map((r) => r.id)))).groupBy(s.reviews.subjectId) : [];
    let list = rows.map((p) => {
      const vs = variants.filter((v) => v.productId === p.id);
      const price = vs.length ? Math.min(...vs.map((v) => v.pricePaise)) : 0;
      return { ...p, fromPricePaise: price, inStock: vs.some((v) => v.stock === null || v.stock > 0), rating: ratings.find((r) => r.id === p.id) ?? null, relevance: q.q ? textRelevance(q.q, p.title, `${p.description} ${p.tags.join(' ')}`) : 0 };
    }).filter((p) => (q.minPaise === undefined || p.fromPricePaise >= q.minPaise) && (q.maxPaise === undefined || p.fromPricePaise <= q.maxPaise) && (!q.q || p.relevance > 0));
    list = list.sort((a, b) => q.sort === 'price_asc' ? a.fromPricePaise - b.fromPricePaise : q.sort === 'price_desc' ? b.fromPricePaise - a.fromPricePaise : q.sort === 'newest' || !q.q ? b.createdAt.getTime() - a.createdAt.getTime() : b.relevance - a.relevance);
    const pageSize = 24;
    return { products: list.slice((q.page - 1) * pageSize, q.page * pageSize), total: list.length, page: q.page, pageSize, shipping: SHIPPING_RULE.description };
  });

  app.get('/api/v1/products/:slug', async (req) => {
    const { slug } = parse(z.object({ slug: z.string() }), req.params);
    const [p] = await ctx.db.select().from(s.products).where(eq(s.products.slug, slug));
    const isSeller = req.auth && (p?.sellerId === req.auth.userId || req.auth.roles.includes('admin'));
    if (!p || (p.status !== 'active' && !isSeller)) throw notFound('Product');
    const variants = await ctx.db.select().from(s.productVariants).where(and(eq(s.productVariants.productId, p.id), eq(s.productVariants.active, true)));
    const reviews = await ctx.db.select().from(s.reviews).where(and(eq(s.reviews.subjectType, 'product'), eq(s.reviews.subjectId, p.id), eq(s.reviews.status, 'published'))).orderBy(desc(s.reviews.createdAt)).limit(20);
    const names = await displayNames(ctx.db, [...reviews.map((r) => r.authorId), ...(p.sellerId ? [p.sellerId] : [])]);
    const saved = req.auth ? (await ctx.db.select().from(s.savedProducts).where(and(eq(s.savedProducts.userId, req.auth.userId), eq(s.savedProducts.productId, p.id)))).length > 0 : false;
    const owned = req.auth ? (await ctx.db.select().from(s.entitlements).where(and(eq(s.entitlements.userId, req.auth.userId), eq(s.entitlements.kind, 'product'), eq(s.entitlements.refId, p.id), isNull(s.entitlements.revokedAt)))).length > 0 : false;
    return {
      product: { ...p, seller: p.sellerId ? names.get(p.sellerId) : { displayName: 'Nakshatra' } },
      variants: variants.map((v) => ({ ...v, available: v.stock === null || v.stock > 0, lowStock: v.stock !== null && v.stock > 0 && v.stock <= 3 })),
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, author: names.get(r.authorId)?.displayName, verifiedPurchase: true, createdAt: r.createdAt })),
      saved, owned,
      reportTemplate: (p.digitalAsset as { reportTemplate?: string } | null)?.reportTemplate ? REPORT_TEMPLATES[(p.digitalAsset as { reportTemplate: string }).reportTemplate] : null,
      disclaimer: ['gemstone', 'rudraksha', 'ritual_supplies'].includes(p.category) ? 'Traditional and spiritual products are sold for cultural and personal use. Nakshatra makes no claim that any product causes particular outcomes.' : null,
    };
  });

  app.post('/api/v1/products/:id/save', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { saved } = parse(z.object({ saved: z.boolean() }), req.body);
    if (saved) await ctx.db.insert(s.savedProducts).values({ userId: a.userId, productId: id }).onConflictDoNothing();
    else await ctx.db.delete(s.savedProducts).where(and(eq(s.savedProducts.userId, a.userId), eq(s.savedProducts.productId, id)));
    return { ok: true };
  });

  app.get('/api/v1/saved-products', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select({ p: s.products }).from(s.savedProducts).innerJoin(s.products, eq(s.products.id, s.savedProducts.productId)).where(eq(s.savedProducts.userId, a.userId));
    return { products: rows.map((r) => r.p) };
  });

  /* ---------- Cart & checkout ---------- */
  app.get('/api/v1/cart', async (req) => {
    const a = requireAuth(req);
    const { code } = parse(z.object({ code: z.string().max(40).optional() }), req.query);
    const lines = await cartLines(ctx.db, a.userId);
    const discount = await loadDiscount(ctx.db, code);
    const totals = computeTotals(lines.map((l) => ({ unitPricePaise: l.v.pricePaise, quantity: l.item.quantity, fulfilment: l.p.fulfilment })), discount);
    return {
      items: lines.map((l) => ({ variantId: l.v.id, productId: l.p.id, slug: l.p.slug, title: l.p.title, variantName: l.v.name, unitPricePaise: l.v.pricePaise, quantity: l.item.quantity, fulfilment: l.p.fulfilment, image: l.p.images[0] ?? null, stock: l.v.stock, isSample: l.p.isSample, available: l.p.status === 'active' && l.v.active && (l.v.stock === null || l.v.stock >= l.item.quantity) })),
      totals, discount: code ? (discount ? { code: discount.code, kind: discount.kind, value: discount.value } : { invalid: true }) : null,
      shippingRule: SHIPPING_RULE.description, taxNote: 'Tax calculation is not configured in this build; displayed prices are final.',
    };
  });

  app.put('/api/v1/cart/items', async (req) => {
    const a = requireAuth(req);
    const { variantId, quantity } = parse(z.object({ variantId: z.uuid(), quantity: z.number().int().min(0).max(20) }), req.body);
    if (quantity === 0) {
      await ctx.db.delete(s.cartItems).where(and(eq(s.cartItems.userId, a.userId), eq(s.cartItems.variantId, variantId)));
      return { ok: true };
    }
    const [v] = await ctx.db.select({ v: s.productVariants, p: s.products }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(eq(s.productVariants.id, variantId));
    if (!v || v.p.status !== 'active' || !v.v.active) throw notFound('Product');
    if (v.v.stock !== null && v.v.stock < quantity) throw conflict(`Only ${v.v.stock} left in stock.`);
    if (v.p.fulfilment !== 'physical' && quantity > 1) throw badRequest('Digital items can be bought once per order.');
    await ctx.db.insert(s.cartItems).values({ userId: a.userId, variantId, quantity }).onConflictDoUpdate({ target: [s.cartItems.userId, s.cartItems.variantId], set: { quantity } });
    return { ok: true };
  });

  const Address = z.object({ name: z.string().trim().min(2).max(80), line1: z.string().trim().min(3).max(200), line2: z.string().max(200).optional(), city: z.string().trim().min(2).max(80), state: z.string().trim().min(2).max(80), postalCode: z.string().trim().regex(/^[A-Za-z0-9 -]{3,10}$/), country: z.string().length(2).default('IN'), phone: z.string().trim().regex(/^[+0-9 -]{7,20}$/) });

  app.post('/api/v1/checkout', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ shippingAddress: Address.optional(), discountCode: z.string().max(40).optional(), gift: z.object({ message: z.string().max(300).default(''), recipientEmail: z.email() }).optional(), idempotencyKey: z.string().min(8).max(80) }), req.body);
    const [existing] = await ctx.db.select().from(s.orders).where(and(eq(s.orders.userId, a.userId), eq(s.orders.idempotencyKey, body.idempotencyKey)));
    if (existing) {
      const [p] = existing.paymentId ? await ctx.db.select().from(s.payments).where(eq(s.payments.id, existing.paymentId)) : [];
      return { order: existing, checkout: p ? { paymentId: p.id, checkoutPath: `/pay/dev/${p.id}`, isSimulated: true, amountPaise: p.amountPaise, status: p.status, provider: p.provider } : null };
    }
    const lines = await cartLines(ctx.db, a.userId);
    if (!lines.length) throw badRequest('Your cart is empty.');
    if (lines.some((l) => l.p.fulfilment === 'physical') && !body.shippingAddress) throw badRequest('Add a shipping address for physical items.');
    // Reports are generated at payment time from your own data, so check it exists before taking payment.
    // (Gifts are generated for the recipient, so the buyer's data is not required.)
    if (!body.gift) {
      const templates = lines.map((l) => (l.p.digitalAsset as { reportTemplate?: string } | null)?.reportTemplate).filter((x): x is string => Boolean(x));
      if (templates.includes('identity_expanded')) {
        const [done] = await ctx.db.select({ id: s.assessmentResults.id }).from(s.assessmentResults).where(eq(s.assessmentResults.userId, a.userId)).limit(1);
        if (!done) throw badRequest('Take the personality assessment in Identity Studio first — this report is built from your answers.');
      }
      if (templates.some((t) => t !== 'identity_expanded')) {
        const [bp] = await ctx.db.select({ id: s.birthProfiles.id }).from(s.birthProfiles).where(eq(s.birthProfiles.userId, a.userId)).limit(1);
        if (!bp) throw badRequest('Add your birth details first — astrology reports are calculated from them.');
      }
    }
    const discount = await loadDiscount(ctx.db, body.discountCode);
    if (body.discountCode && !discount) throw badRequest('That discount code is not valid.');
    const totals = computeTotals(lines.map((l) => ({ unitPricePaise: l.v.pricePaise, quantity: l.item.quantity, fulfilment: l.p.fulfilment })), discount);
    if (totals.totalPaise <= 0) throw badRequest('Order total must be greater than zero.');
    const result = await ctx.db.transaction(async (tx) => {
      for (const l of lines) {
        if (l.p.status !== 'active' || !l.v.active) throw conflict(`${l.p.title} is no longer available.`);
        if (l.v.stock !== null) {
          const upd = await tx.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} - ${l.item.quantity}` }).where(and(eq(s.productVariants.id, l.v.id), gte(s.productVariants.stock, l.item.quantity))).returning();
          if (!upd.length) throw conflict(`Not enough stock for ${l.p.title}.`);
          await tx.insert(s.inventoryMovements).values({ variantId: l.v.id, delta: -l.item.quantity, reason: 'order' });
        }
        if (l.p.fulfilment === 'digital' && !body.gift) {
          const owned = await tx.select().from(s.entitlements).where(and(eq(s.entitlements.userId, a.userId), eq(s.entitlements.refId, ((l.p.digitalAsset as { courseId?: string } | null)?.courseId ?? l.p.id)), isNull(s.entitlements.revokedAt)));
          if (owned.length) throw conflict(`You already own ${l.p.title}.`);
        }
      }
      const number = `NK${DateTime.now().toFormat('yyMMdd')}-${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, '8')}`;
      const [o] = await tx.insert(s.orders).values({
        number, userId: a.userId, status: 'pending_payment', ...totals, discountCode: discount?.code ?? null,
        shippingAddress: body.shippingAddress ?? null, isGift: Boolean(body.gift), giftMessage: body.gift?.message ?? null, giftRecipientEmail: body.gift?.recipientEmail ?? null,
        idempotencyKey: body.idempotencyKey,
      }).returning();
      await tx.insert(s.orderItems).values(lines.map((l) => ({ orderId: o.id, productId: l.p.id, variantId: l.v.id, sellerId: l.p.sellerId, title: l.p.title, variantName: l.v.name, unitPricePaise: l.v.pricePaise, quantity: l.item.quantity, fulfilment: l.p.fulfilment })));
      const checkout = await createPayment(ctx, tx, { userId: a.userId, purpose: 'order', purposeId: o.id, amountPaise: totals.totalPaise, idempotencyKey: `order:${o.id}` });
      await tx.update(s.orders).set({ paymentId: checkout.paymentId }).where(eq(s.orders.id, o.id));
      await tx.delete(s.cartItems).where(eq(s.cartItems.userId, a.userId));
      return { order: o, checkout };
    });
    await track(ctx.db, a.userId, 'checkout_started', { purpose: 'order' });
    return result;
  });

  app.get('/api/v1/orders', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.orders).where(eq(s.orders.userId, a.userId)).orderBy(desc(s.orders.createdAt)).limit(100);
    return { orders: rows };
  });

  app.get('/api/v1/orders/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [o] = await ctx.db.select().from(s.orders).where(and(eq(s.orders.id, id), eq(s.orders.userId, a.userId)));
    if (!o) throw notFound('Order');
    const items = await ctx.db.select().from(s.orderItems).where(eq(s.orderItems.orderId, id));
    const [payment] = o.paymentId ? await ctx.db.select().from(s.payments).where(eq(s.payments.id, o.paymentId)) : [];
    const shipments = await ctx.db.select().from(s.shipments).where(eq(s.shipments.orderId, id));
    const refunds = payment ? await ctx.db.select().from(s.refunds).where(eq(s.refunds.paymentId, payment.id)) : [];
    const returns = await ctx.db.select().from(s.returnRequests).where(eq(s.returnRequests.orderId, id));
    const reports = await ctx.db.select({ id: s.reportDocuments.id, templateKey: s.reportDocuments.templateKey }).from(s.reportDocuments).innerJoin(s.entitlements, eq(s.entitlements.id, s.reportDocuments.entitlementId)).where(and(eq(s.entitlements.sourceType, 'order_item'), inArray(s.entitlements.sourceId, items.map((i) => i.id).concat(['00000000-0000-0000-0000-000000000000']))));
    return { order: o, items, shipments, refunds, returns, reports, payment: payment ? { id: payment.id, status: payment.status, provider: payment.provider, isSimulated: payment.provider === 'dev_simulator', amountPaise: payment.amountPaise, refundedPaise: payment.refundedPaise, createdAt: payment.createdAt } : null };
  });

  app.post('/api/v1/orders/:id/cancel', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [o] = await ctx.db.select().from(s.orders).where(and(eq(s.orders.id, id), eq(s.orders.userId, a.userId)));
    if (!o) throw notFound('Order');
    if (o.status !== 'pending_payment') throw conflict('Only unpaid orders can be cancelled here. For paid orders, request a refund.');
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.orders).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(s.orders.id, id));
      if (o.paymentId) await tx.update(s.payments).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(s.payments.id, o.paymentId), eq(s.payments.status, 'created')));
      await restock(tx, id, 'adjustment');
    });
    return { ok: true };
  });

  app.post('/api/v1/orders/:id/refund-request', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason, amountPaise } = parse(z.object({ reason: z.string().min(5).max(500), amountPaise: z.number().int().positive().optional() }), req.body);
    const [o] = await ctx.db.select().from(s.orders).where(and(eq(s.orders.id, id), eq(s.orders.userId, a.userId)));
    if (!o?.paymentId) throw notFound('Order');
    if (DateTime.fromJSDate(o.createdAt).plus({ days: 14 }) < DateTime.now()) throw badRequest('Refund requests must be made within 14 days of purchase. Please contact support.');
    const r = await requestRefund(ctx, ctx.db, { paymentId: o.paymentId, amountPaise: amountPaise ?? o.totalPaise, reason, requestedBy: a.userId, idempotencyKey: `order-refund:${id}:${amountPaise ?? 'full'}` });
    return { refund: r, message: 'Your refund request has been sent for review.' };
  });

  app.post('/api/v1/orders/:id/returns', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ orderItemId: z.uuid(), quantity: z.number().int().min(1), reason: z.string().min(5).max(500) }), req.body);
    const [o] = await ctx.db.select().from(s.orders).where(and(eq(s.orders.id, id), eq(s.orders.userId, a.userId)));
    if (!o || !['shipped', 'delivered', 'completed'].includes(o.status)) throw badRequest('Returns are available for shipped or delivered physical items.');
    const [it] = await ctx.db.select().from(s.orderItems).where(and(eq(s.orderItems.id, body.orderItemId), eq(s.orderItems.orderId, id), eq(s.orderItems.fulfilment, 'physical')));
    if (!it || body.quantity > it.quantity - it.refundedQuantity) throw badRequest('Invalid item or quantity.');
    const [r] = await ctx.db.insert(s.returnRequests).values({ orderId: id, orderItemId: it.id, userId: a.userId, quantity: body.quantity, reason: body.reason }).returning();
    return { return: r };
  });

  app.post('/api/v1/products/:id/review', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ rating: z.number().int().min(1).max(5), body: z.string().max(1500).default('') }), req.body);
    const [it] = await ctx.db.select({ it: s.orderItems }).from(s.orderItems).innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
      .where(and(eq(s.orderItems.productId, id), eq(s.orders.userId, a.userId), inArray(s.orders.status, ['completed', 'delivered', 'fulfilling', 'shipped']))).limit(1);
    if (!it) throw forbidden('Only verified purchasers can review this product.');
    const res = await ctx.db.insert(s.reviews).values({ subjectType: 'product', subjectId: id, sourceId: it.it.id, authorId: a.userId, ...body }).onConflictDoNothing().returning();
    if (!res.length) throw conflict('You have already reviewed this purchase.');
    return { review: res[0] };
  });

  /* ---------- Digital library & reports ---------- */
  app.get('/api/v1/library', async (req) => {
    const a = requireAuth(req);
    const ents = await ctx.db.select().from(s.entitlements).where(and(eq(s.entitlements.userId, a.userId), isNull(s.entitlements.revokedAt)));
    const productIds = ents.filter((e) => e.kind === 'product').map((e) => e.refId);
    const products = productIds.length ? await ctx.db.select().from(s.products).where(inArray(s.products.id, productIds)) : [];
    const reports = await ctx.db.select({ id: s.reportDocuments.id, templateKey: s.reportDocuments.templateKey, createdAt: s.reportDocuments.createdAt }).from(s.reportDocuments).where(eq(s.reportDocuments.userId, a.userId)).orderBy(desc(s.reportDocuments.createdAt));
    return { products, reports: reports.map((r) => ({ ...r, title: REPORT_TEMPLATES[r.templateKey]?.title ?? r.templateKey })), subscription: ents.find((e) => e.kind === 'subscription' && (!e.expiresAt || e.expiresAt > new Date())) ?? null };
  });

  app.get('/api/v1/reports/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [r] = await ctx.db.select({ r: s.reportDocuments, e: s.entitlements }).from(s.reportDocuments).innerJoin(s.entitlements, eq(s.entitlements.id, s.reportDocuments.entitlementId)).where(and(eq(s.reportDocuments.id, id), eq(s.reportDocuments.userId, a.userId)));
    if (!r || r.e.revokedAt) throw notFound('Report');
    return { report: r.r };
  });

  /** Nakshatra+ members may generate included reports without a separate purchase. */
  app.post('/api/v1/reports/generate', async (req) => {
    const a = requireAuth(req);
    const { templateKey } = parse(z.object({ templateKey: z.string() }), req.body);
    const tpl = REPORT_TEMPLATES[templateKey];
    if (!tpl) throw notFound('Report template');
    const [ent] = await ctx.db.select().from(s.entitlements).where(and(eq(s.entitlements.userId, a.userId), eq(s.entitlements.kind, 'subscription'), isNull(s.entitlements.revokedAt), or(isNull(s.entitlements.expiresAt), gte(s.entitlements.expiresAt, new Date()))));
    if (!ent || !tpl.includedInPlus) throw forbidden('This report is available to purchase in the shop or included with Nakshatra+.');
    if (!(await currentChart(ctx.db, a.userId, 'vedic_default'))) throw badRequest('Complete your Cosmic ID first.');
    const content = await generateReport(ctx.db, a.userId, templateKey);
    const [doc] = await ctx.db.insert(s.reportDocuments).values({ userId: a.userId, entitlementId: ent.id, templateKey, engineVersion: content.engineVersion, content: content as unknown as Record<string, unknown> }).returning();
    return { report: doc };
  });

  /* ---------- Subscriptions ---------- */
  app.get('/api/v1/subscriptions', async (req) => {
    const plans = await ctx.db.select().from(s.subscriptionPlans).where(eq(s.subscriptionPlans.active, true));
    const mine = req.auth ? await ctx.db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, req.auth.userId)).orderBy(desc(s.subscriptions.createdAt)) : [];
    return { plans, subscriptions: mine, renewalNote: ctx.config.PAYMENT_PROVIDER === 'dev_simulator' ? 'In development, renewals create a payment you confirm in the simulator; nothing is charged automatically.' : undefined };
  });

  app.post('/api/v1/subscriptions', async (req) => {
    const a = requireAuth(req);
    const { planKey, idempotencyKey } = parse(z.object({ planKey: z.string(), idempotencyKey: z.string().min(8).max(80) }), req.body);
    const [plan] = await ctx.db.select().from(s.subscriptionPlans).where(and(eq(s.subscriptionPlans.key, planKey), eq(s.subscriptionPlans.active, true)));
    if (!plan) throw notFound('Plan');
    const active = await ctx.db.select().from(s.subscriptions).where(and(eq(s.subscriptions.userId, a.userId), inArray(s.subscriptions.status, ['active', 'past_due'])));
    if (active.length) throw conflict('You already have an active subscription.');
    return ctx.db.transaction(async (tx) => {
      const [sub] = await tx.insert(s.subscriptions).values({ userId: a.userId, planKey, status: 'pending_payment', provider: ctx.config.PAYMENT_PROVIDER }).returning();
      const checkout = await createPayment(ctx, tx, { userId: a.userId, purpose: 'subscription', purposeId: sub.id, amountPaise: plan.pricePaise, idempotencyKey: `sub:${a.userId}:${idempotencyKey}` });
      return { subscription: sub, checkout };
    });
  });

  app.post('/api/v1/subscriptions/:id/cancel', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [sub] = await ctx.db.update(s.subscriptions).set({ cancelAtPeriodEnd: true, updatedAt: new Date() }).where(and(eq(s.subscriptions.id, id), eq(s.subscriptions.userId, a.userId), eq(s.subscriptions.status, 'active'))).returning();
    if (!sub) throw notFound('Subscription');
    return { subscription: sub, message: 'Your benefits continue until the end of the current period.' };
  });

  app.post('/api/v1/subscriptions/:id/resume', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [sub] = await ctx.db.update(s.subscriptions).set({ cancelAtPeriodEnd: false, updatedAt: new Date() }).where(and(eq(s.subscriptions.id, id), eq(s.subscriptions.userId, a.userId), eq(s.subscriptions.status, 'active'))).returning();
    if (!sub) throw notFound('Subscription');
    return { subscription: sub };
  });

  app.post('/api/v1/subscriptions/:id/renew', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [sub] = await ctx.db.select().from(s.subscriptions).where(and(eq(s.subscriptions.id, id), eq(s.subscriptions.userId, a.userId), eq(s.subscriptions.status, 'past_due')));
    if (!sub) throw notFound('Subscription');
    const [plan] = await ctx.db.select().from(s.subscriptionPlans).where(eq(s.subscriptionPlans.key, sub.planKey));
    const checkout = await createPayment(ctx, ctx.db, { userId: a.userId, purpose: 'subscription', purposeId: sub.id, amountPaise: plan.pricePaise, idempotencyKey: `sub-renew:${sub.id}:${sub.currentPeriodEnd?.toISOString()}` });
    return { checkout };
  });

  /* ---------- Payments (user-facing) ---------- */
  app.get('/api/v1/payments/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [p] = await ctx.db.select().from(s.payments).where(and(eq(s.payments.id, id), eq(s.payments.userId, a.userId)));
    if (!p) throw notFound('Payment');
    const events = await ctx.db.select({ type: s.paymentEvents.type, toStatus: s.paymentEvents.toStatus, createdAt: s.paymentEvents.createdAt, signatureValid: s.paymentEvents.signatureValid }).from(s.paymentEvents).where(eq(s.paymentEvents.paymentId, id)).orderBy(asc(s.paymentEvents.createdAt));
    // Where the payer returns afterwards (wedding milestones go back to their project).
    let returnPath = p.purpose === 'order' ? '/shop/orders/' + p.purposeId : p.purpose === 'booking' ? '/experts/bookings/' + p.purposeId : p.purpose === 'subscription' ? '/settings/subscription' : '/weddings';
    if (p.purpose === 'vendor_milestone') {
      const [m] = await ctx.db.select({ projectId: s.vendorBookings.projectId }).from(s.vendorPaymentMilestones).innerJoin(s.vendorBookings, eq(s.vendorBookings.id, s.vendorPaymentMilestones.vendorBookingId)).where(eq(s.vendorPaymentMilestones.id, p.purposeId));
      if (m) returnPath = '/weddings/' + m.projectId;
    }
    return { payment: { id: p.id, purpose: p.purpose, purposeId: p.purposeId, amountPaise: p.amountPaise, status: p.status, provider: p.provider, isSimulated: p.provider === 'dev_simulator', refundedPaise: p.refundedPaise, createdAt: p.createdAt, failureReason: p.failureReason, returnPath }, events };
  });

  /* ---------- Seller storefronts ---------- */
  app.get('/api/v1/storefronts/:handle', async (req) => {
    const { handle } = parse(z.object({ handle: z.string() }), req.params);
    const [p] = await ctx.db.select().from(s.profiles).where(sql`lower(${s.profiles.handle}) = ${handle.toLowerCase()}`);
    if (!p) throw notFound('Storefront');
    const products = await ctx.db.select().from(s.products).where(and(eq(s.products.sellerId, p.userId), eq(s.products.status, 'active')));
    if (!products.length) throw notFound('Storefront');
    return { seller: { handle: p.handle, displayName: p.displayName, avatarUrl: p.avatarUrl, bio: p.bio }, products };
  });

  const requireSeller = (req: Parameters<typeof requireAuth>[0]) => {
    const a = requireAuth(req);
    if (!a.roles.some((r) => ['seller', 'creator', 'vendor', 'admin'].includes(r))) throw forbidden('Seller tools are available to approved sellers and creators.');
    return a;
  };

  app.get('/api/v1/seller/products', async (req) => {
    const a = requireSeller(req);
    const rows = await ctx.db.select().from(s.products).where(eq(s.products.sellerId, a.userId)).orderBy(desc(s.products.createdAt));
    const variants = rows.length ? await ctx.db.select().from(s.productVariants).where(inArray(s.productVariants.productId, rows.map((r) => r.id))) : [];
    return { products: rows.map((p) => ({ ...p, variants: variants.filter((v) => v.productId === p.id) })) };
  });

  app.post('/api/v1/seller/products', async (req) => {
    const a = requireSeller(req);
    const body = parse(z.object({
      title: z.string().trim().min(3).max(120), description: z.string().max(5000).default(''),
      category: z.enum(['book', 'resource', 'audio', 'ritual_supplies', 'lifestyle', 'gemstone', 'rudraksha', 'creator_product', 'digital_course']),
      fulfilment: z.enum(['physical', 'digital']), certification: z.string().max(500).optional(), materials: z.string().max(300).optional(), dimensions: z.string().max(200).optional(),
      courseId: z.uuid().optional(), tags: z.array(z.string().max(24)).max(8).default([]),
      variants: z.array(z.object({ name: z.string().min(1).max(60), pricePaise: z.number().int().min(100).max(50_000_000), stock: z.number().int().min(0).nullable() })).min(1).max(10),
    }), req.body);
    if (body.category === 'digital_course') {
      if (!body.courseId) throw badRequest('Link the course this product sells.');
      const [c] = await ctx.db.select().from(s.courses).where(and(eq(s.courses.id, body.courseId), eq(s.courses.creatorId, a.userId)));
      if (!c) throw notFound('Course');
    }
    const slug = `${body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'q')}`;
    const product = await ctx.db.transaction(async (tx) => {
      const [p] = await tx.insert(s.products).values({
        sellerId: a.userId, slug, title: body.title, description: body.description, category: body.category, fulfilment: body.fulfilment,
        certification: body.certification, materials: body.materials, dimensions: body.dimensions, tags: body.tags, status: 'draft',
        digitalAsset: body.courseId ? { courseId: body.courseId } : null,
      }).returning();
      await tx.insert(s.productVariants).values(body.variants.map((v, i) => ({ productId: p.id, sku: `${slug.slice(0, 20)}-${i}-${randomToken(3)}`, name: v.name, pricePaise: v.pricePaise, stock: body.fulfilment === 'digital' ? null : v.stock })));
      return p;
    });
    return { product, note: 'New listings are reviewed by the Nakshatra team before they go live.' };
  });

  app.post('/api/v1/seller/products/:id/images', async (req) => {
    const a = requireSeller(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [p] = await ctx.db.select().from(s.products).where(and(eq(s.products.id, id), eq(s.products.sellerId, a.userId)));
    if (!p) throw notFound('Product');
    const file = await req.file();
    if (!file) throw badRequest('No file');
    const saved = await storage.save(await file.toBuffer(), { allowed: IMAGE_TYPES, isPrivate: false, maxBytes: ctx.config.MAX_UPLOAD_MB * 1048576 });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'product_image', path: saved.path, mime: saved.mime, bytes: saved.bytes });
    await ctx.db.update(s.products).set({ images: [...p.images, `/uploads/${saved.path}`] }).where(eq(s.products.id, id));
    return { ok: true };
  });

  app.get('/api/v1/seller/orders', async (req) => {
    const a = requireSeller(req);
    const rows = await ctx.db.select({ it: s.orderItems, o: s.orders }).from(s.orderItems).innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId)).where(and(eq(s.orderItems.sellerId, a.userId), sql`${s.orders.status} <> 'pending_payment'`)).orderBy(desc(s.orders.createdAt)).limit(200);
    return { items: rows.map((r) => ({ ...r.it, orderNumber: r.o.number, orderStatus: r.o.status, createdAt: r.o.createdAt, shipTo: r.it.fulfilment === 'physical' ? { city: (r.o.shippingAddress as { city?: string } | null)?.city } : null })) };
  });

  void lte; void audit;
}
