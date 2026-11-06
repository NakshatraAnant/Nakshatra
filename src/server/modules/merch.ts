import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth, requireCapability } from '../lib/auth';
import { randomToken } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { notify } from '../lib/notify';
import {
  COD_LABEL, COD_RULES, COD_STATUSES, INDIAN_STATES, OPEN_COD_STATUSES, PIN_RE, canTransition, codPaymentStatus, inventoryEffect,
  normalisePhone, shippingFor, type CodStatus,
} from '../../shared/merch';

const Address = z.object({
  name: z.string().trim().min(2, 'Enter the recipient’s name.').max(80),
  phone: z.string().trim().max(20).transform((p, c) => {
    const n = normalisePhone(p);
    if (!n) { c.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian mobile number.' }); return z.NEVER; }
    return n;
  }),
  line1: z.string().trim().min(3, 'Enter the house / street.').max(120),
  line2: z.string().trim().max(120).default(''),
  city: z.string().trim().min(2, 'Enter the city.').max(60),
  state: z.enum(INDIAN_STATES, { message: 'Choose a state or union territory.' }),
  pincode: z.string().trim().regex(PIN_RE, 'Enter a valid 6-digit PIN code.'),
});

type Order = typeof s.codOrders.$inferSelect;

async function itemsFor(db: Executor, orderIds: string[]) {
  return orderIds.length ? db.select().from(s.codOrderItems).where(inArray(s.codOrderItems.orderId, orderIds)) : [];
}

/**
 * Applies a status change with its inventory effect in one transaction. Reservation uses a conditional
 * update, so two orders can never reserve the same last unit. Throws on an invalid transition.
 */
export async function transitionCod(ctx: Ctx, orderId: string, to: CodStatus, actor: { kind: 'customer' | 'staff' | 'system'; id: string | null }, extra: { note?: string; courierName?: string; trackingRef?: string; reason?: string } = {}) {
  return ctx.db.transaction(async (tx) => {
    const [o] = await tx.select().from(s.codOrders).where(eq(s.codOrders.id, orderId)).for('update');
    if (!o) throw notFound('Order');
    const from = o.status as CodStatus;
    if (from === to) return o; // idempotent repeat (double click, retried request)
    if (!canTransition(from, to, actor.kind)) throw conflict(`An order that is “${COD_LABEL[from]}” can’t move to “${COD_LABEL[to]}”.`);
    if (to === 'dispatched' && !extra.courierName?.trim()) throw badRequest('Enter the courier that collected the parcel.');
    if (to === 'return_requested') {
      if (!o.deliveredAt || Date.now() - o.deliveredAt.getTime() > COD_RULES.returnWindowDays * 864e5) throw conflict(`Returns can be requested within ${COD_RULES.returnWindowDays} days of delivery.`);
      if (!extra.reason?.trim()) throw badRequest('Tell us why you are returning it.');
    }
    if (to === 'pending_confirmation') {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.codOrders).where(and(eq(s.codOrders.userId, o.userId), inArray(s.codOrders.status, OPEN_COD_STATUSES)));
      if (n >= COD_RULES.maxOpenOrders) throw conflict(`You already have ${n} cash-on-delivery orders on the way. Please wait for one to arrive first.`);
    }
    const items = await tx.select().from(s.codOrderItems).where(eq(s.codOrderItems.orderId, o.id));
    const effect = inventoryEffect(from, to);
    for (const it of items) {
      if (effect === 'reserve') {
        const ok = await tx.update(s.merchVariants).set({ reserved: sql`${s.merchVariants.reserved} + ${it.quantity}` })
          .where(and(eq(s.merchVariants.id, it.variantId), eq(s.merchVariants.active, true), sql`${s.merchVariants.stockOnHand} - ${s.merchVariants.reserved} >= ${it.quantity}`)).returning({ id: s.merchVariants.id });
        if (!ok.length) throw conflict(`Sorry — “${it.title} (${it.variantName})” just sold out or doesn’t have ${it.quantity} left.`);
      } else if (effect === 'release') {
        await tx.update(s.merchVariants).set({ reserved: sql`greatest(0, ${s.merchVariants.reserved} - ${it.quantity})` }).where(eq(s.merchVariants.id, it.variantId));
      } else if (effect === 'deduct') {
        await tx.update(s.merchVariants).set({ reserved: sql`greatest(0, ${s.merchVariants.reserved} - ${it.quantity})`, stockOnHand: sql`${s.merchVariants.stockOnHand} - ${it.quantity}` }).where(eq(s.merchVariants.id, it.variantId));
      } else if (effect === 'restock') {
        await tx.update(s.merchVariants).set({ stockOnHand: sql`${s.merchVariants.stockOnHand} + ${it.quantity}` }).where(eq(s.merchVariants.id, it.variantId));
      }
      if (effect) await tx.insert(s.merchInventoryMovements).values({ variantId: it.variantId, kind: effect, quantity: it.quantity, orderId: o.id, actorId: actor.id, note: COD_LABEL[to] });
    }
    const now = new Date();
    const set: Partial<Order> = { status: to, updatedAt: now };
    if (to === 'pending_confirmation') set.placedAt = now;
    if (to === 'dispatched') { set.courierName = extra.courierName!.trim().slice(0, 60); set.trackingRef = extra.trackingRef?.trim().slice(0, 60) || null; }
    if (to === 'delivered' && from !== 'return_requested') { set.deliveredAt = now; set.cashCollectedAt = now; }
    if (to === 'cancelled') set.cancelReason = (extra.reason ?? extra.note ?? '').slice(0, 300) || null;
    if (to === 'return_requested') set.returnReason = extra.reason!.trim().slice(0, 300);
    if (to === 'refunded') { set.refundedAt = now; set.refundNote = (extra.note ?? '').slice(0, 300) || null; }
    const [updated] = await tx.update(s.codOrders).set(set).where(eq(s.codOrders.id, o.id)).returning();
    await tx.insert(s.codOrderEvents).values({ orderId: o.id, fromStatus: from, toStatus: to, actorId: actor.id, actorKind: actor.kind, note: (extra.note ?? extra.reason ?? '').slice(0, 300) });
    if (actor.kind === 'staff') await audit(tx, { actorId: actor.id, action: 'cod.transition', targetType: 'cod_order', targetId: o.id, meta: { from, to } });
    if (actor.kind !== 'customer' || to === 'return_requested') {
      await notify(ctx, tx, { userId: o.userId, category: 'orders', title: `Order ${o.number}: ${COD_LABEL[to]}`, body: to === 'dispatched' ? `Sent with ${set.courierName}${set.trackingRef ? ` (reference ${set.trackingRef})` : ''}. Pay in cash when it arrives.` : to === 'delivered' ? 'Delivered and paid on delivery. Thank you!' : undefined, link: `/merch/orders/${o.id}` });
    }
    if (to === 'pending_confirmation') await track(tx, o.userId, 'cod_order_placed', { items: items.length });
    if (to === 'delivered') await track(tx, o.userId, 'cod_order_delivered', {});
    return updated;
  });
}

function view(o: Order, items: (typeof s.codOrderItems.$inferSelect)[], events?: (typeof s.codOrderEvents.$inferSelect)[]) {
  const status = o.status as CodStatus;
  return {
    id: o.id, number: o.number, status, statusLabel: COD_LABEL[status],
    payment: { method: 'cash_on_delivery', status: codPaymentStatus(status, !!o.cashCollectedAt), collectedAt: o.cashCollectedAt, refundedAt: o.refundedAt },
    subtotalPaise: o.subtotalPaise, shippingPaise: o.shippingPaise, totalPaise: o.totalPaise,
    address: o.address, courierName: o.courierName, trackingRef: o.trackingRef,
    returnReason: o.returnReason, cancelReason: o.cancelReason, placedAt: o.placedAt, deliveredAt: o.deliveredAt, createdAt: o.createdAt,
    items: items.filter((i) => i.orderId === o.id).map((i) => ({ id: i.id, variantId: i.variantId, title: i.title, variantName: i.variantName, unitPricePaise: i.unitPricePaise, quantity: i.quantity })),
    timeline: events?.filter((e) => e.orderId === o.id).map((e) => ({ status: e.toStatus, label: COD_LABEL[e.toStatus as CodStatus] ?? e.toStatus, by: e.actorKind, note: e.actorKind === 'staff' ? e.note : '', at: e.createdAt })),
    canCancel: canTransition(status, 'cancelled', 'customer'),
    canReturn: status === 'delivered' && !!o.deliveredAt && Date.now() - o.deliveredAt.getTime() <= COD_RULES.returnWindowDays * 864e5,
  };
}

export async function merchRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/merch/products', async () => {
    const products = await ctx.db.select().from(s.merchProducts).where(eq(s.merchProducts.active, true)).orderBy(asc(s.merchProducts.createdAt));
    const variants = products.length ? await ctx.db.select().from(s.merchVariants).where(and(inArray(s.merchVariants.productId, products.map((p) => p.id)), eq(s.merchVariants.active, true))).orderBy(asc(s.merchVariants.pricePaise)) : [];
    return {
      payment: 'Cash on delivery only. You pay the courier when the parcel arrives; nothing is charged online.',
      rules: COD_RULES,
      products: products.map((p) => ({ id: p.id, slug: p.slug, title: p.title, description: p.description, imageUrl: p.imageUrl, isSample: p.isSample,
        variants: variants.filter((v) => v.productId === p.id).map((v) => ({ id: v.id, name: v.name, pricePaise: v.pricePaise, available: Math.max(0, v.stockOnHand - v.reserved) })) })),
    };
  });

  /** Step 1: a draft with server-calculated totals. Nothing is reserved yet. Same idempotency key → same draft. */
  app.post('/api/v1/merch/orders', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before ordering.');
    const body = parse(z.object({
      items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(COD_RULES.maxQuantityPerItem) })).min(1).max(10),
      address: Address,
      idempotencyKey: z.string().min(8).max(80),
    }), req.body);
    const [existing] = await ctx.db.select().from(s.codOrders).where(and(eq(s.codOrders.userId, a.userId), eq(s.codOrders.idempotencyKey, body.idempotencyKey)));
    if (existing) return reply.send({ order: view(existing, await itemsFor(ctx.db, [existing.id])) });
    const ids = [...new Set(body.items.map((i) => i.variantId))];
    if (ids.length !== body.items.length) throw badRequest('Each item can appear once; change its quantity instead.');
    const variants = await ctx.db.select({ v: s.merchVariants, p: s.merchProducts }).from(s.merchVariants).innerJoin(s.merchProducts, eq(s.merchProducts.id, s.merchVariants.productId))
      .where(and(inArray(s.merchVariants.id, ids), eq(s.merchVariants.active, true), eq(s.merchProducts.active, true)));
    if (variants.length !== ids.length) throw badRequest('One of these items is no longer available.');
    const lines = body.items.map((i) => { const r = variants.find((x) => x.v.id === i.variantId)!; return { ...i, r }; });
    for (const l of lines) if (l.r.v.stockOnHand - l.r.v.reserved < l.quantity) throw conflict(`Only ${Math.max(0, l.r.v.stockOnHand - l.r.v.reserved)} of “${l.r.p.title} (${l.r.v.name})” left.`);
    const subtotal = lines.reduce((t, l) => t + l.r.v.pricePaise * l.quantity, 0);
    const shipping = shippingFor(subtotal);
    if (subtotal + shipping > COD_RULES.maxOrderPaise) throw badRequest(`Cash-on-delivery orders are limited to ₹${COD_RULES.maxOrderPaise / 100}.`);
    const order = await ctx.db.transaction(async (tx) => {
      const number = `NKM-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 5)}`;
      const [o] = await tx.insert(s.codOrders).values({ number, userId: a.userId, status: 'draft', subtotalPaise: subtotal, shippingPaise: shipping, totalPaise: subtotal + shipping, address: body.address, idempotencyKey: body.idempotencyKey }).returning();
      await tx.insert(s.codOrderItems).values(lines.map((l) => ({ orderId: o.id, variantId: l.variantId, title: l.r.p.title, variantName: l.r.v.name, unitPricePaise: l.r.v.pricePaise, quantity: l.quantity })));
      await tx.insert(s.codOrderEvents).values({ orderId: o.id, fromStatus: null, toStatus: 'draft', actorId: a.userId, actorKind: 'customer' });
      return o;
    });
    return reply.code(201).send({ order: view(order, await itemsFor(ctx.db, [order.id])) });
  });

  const own = async (userId: string, id: string) => {
    const [o] = await ctx.db.select().from(s.codOrders).where(and(eq(s.codOrders.id, id), eq(s.codOrders.userId, userId)));
    if (!o) throw notFound('Order');
    return o;
  };
  const full = async (o: Order) => {
    const events = await ctx.db.select().from(s.codOrderEvents).where(eq(s.codOrderEvents.orderId, o.id)).orderBy(asc(s.codOrderEvents.createdAt));
    return view(o, await itemsFor(ctx.db, [o.id]), events);
  };

  /** Step 2: place it. Stock is reserved now; the order waits for our confirmation (usually a call or message). */
  app.post('/api/v1/merch/orders/:id/place', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await own(a.userId, id);
    return { order: await full(await transitionCod(ctx, id, 'pending_confirmation', { kind: 'customer', id: a.userId })) };
  });

  app.post('/api/v1/merch/orders/:id/cancel', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason } = parse(z.object({ reason: z.string().trim().max(300).default('') }), req.body ?? {});
    await own(a.userId, id);
    return { order: await full(await transitionCod(ctx, id, 'cancelled', { kind: 'customer', id: a.userId }, { reason })) };
  });

  app.post('/api/v1/merch/orders/:id/return', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    await own(a.userId, id);
    return { order: await full(await transitionCod(ctx, id, 'return_requested', { kind: 'customer', id: a.userId }, { reason })) };
  });

  app.get('/api/v1/merch/orders', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.codOrders).where(eq(s.codOrders.userId, a.userId)).orderBy(desc(s.codOrders.createdAt)).limit(50);
    const items = await itemsFor(ctx.db, rows.map((r) => r.id));
    return { orders: rows.map((o) => view(o, items)) };
  });

  app.get('/api/v1/merch/orders/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    return { order: await full(await own(a.userId, id)) };
  });

  /* ---------- Staff: fulfilment ---------- */
  app.get('/api/v1/admin/merch/orders', async (req) => {
    requireCapability(req, 'commerce');
    const q = parse(z.object({ status: z.enum(COD_STATUSES).optional() }), req.query);
    const rows = await ctx.db.select().from(s.codOrders).where(q.status ? eq(s.codOrders.status, q.status) : sql`${s.codOrders.status} <> 'draft'`).orderBy(desc(s.codOrders.updatedAt)).limit(200);
    const items = await itemsFor(ctx.db, rows.map((r) => r.id));
    const counts = await ctx.db.select({ status: s.codOrders.status, n: sql<number>`count(*)::int` }).from(s.codOrders).groupBy(s.codOrders.status);
    return { orders: rows.map((o) => view(o, items)), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
  });

  app.get('/api/v1/admin/merch/orders/:id', async (req) => {
    requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [o] = await ctx.db.select().from(s.codOrders).where(eq(s.codOrders.id, id));
    if (!o) throw notFound('Order');
    const events = await ctx.db.select().from(s.codOrderEvents).where(eq(s.codOrderEvents.orderId, id)).orderBy(asc(s.codOrderEvents.createdAt));
    const v = view(o, await itemsFor(ctx.db, [id]), events);
    return { order: { ...v, timeline: events.map((e) => ({ status: e.toStatus, label: COD_LABEL[e.toStatus as CodStatus], by: e.actorKind, note: e.note, at: e.createdAt })) } };
  });

  app.post('/api/v1/admin/merch/orders/:id/transition', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ to: z.enum(COD_STATUSES), note: z.string().trim().max(300).default(''), courierName: z.string().trim().max(60).optional(), trackingRef: z.string().trim().max(60).optional() }), req.body);
    const o = await transitionCod(ctx, id, body.to, { kind: 'staff', id: a.userId }, { note: body.note, reason: body.note, courierName: body.courierName, trackingRef: body.trackingRef });
    return { order: view(o, await itemsFor(ctx.db, [id])) };
  });

  app.get('/api/v1/admin/merch/products', async (req) => {
    requireCapability(req, 'commerce');
    const products = await ctx.db.select().from(s.merchProducts).orderBy(asc(s.merchProducts.createdAt));
    const variants = await ctx.db.select().from(s.merchVariants);
    return { products: products.map((p) => ({ ...p, variants: variants.filter((v) => v.productId === p.id) })) };
  });

  app.post('/api/v1/admin/merch/products', async (req, reply) => {
    const a = requireCapability(req, 'commerce');
    const body = parse(z.object({
      slug: z.string().trim().regex(/^[a-z0-9-]{3,60}$/), title: z.string().trim().min(2).max(100), description: z.string().trim().max(2000).default(''),
      variants: z.array(z.object({ sku: z.string().trim().regex(/^[A-Z0-9-]{3,40}$/), name: z.string().trim().min(1).max(60), pricePaise: z.number().int().min(100).max(COD_RULES.maxOrderPaise), stockOnHand: z.number().int().min(0).max(100000) })).min(1).max(20),
    }), req.body);
    const product = await ctx.db.transaction(async (tx) => {
      const [p] = await tx.insert(s.merchProducts).values({ slug: body.slug, title: body.title, description: body.description }).returning();
      const vs = await tx.insert(s.merchVariants).values(body.variants.map((v) => ({ ...v, productId: p.id }))).returning();
      for (const v of vs) if (v.stockOnHand) await tx.insert(s.merchInventoryMovements).values({ variantId: v.id, kind: 'adjust', quantity: v.stockOnHand, actorId: a.userId, note: 'Initial stock' });
      await audit(tx, { actorId: a.userId, action: 'merch.product_created', targetType: 'merch_product', targetId: p.id });
      return p;
    }).catch((e) => { if (String(e?.message ?? e).includes('unique')) throw conflict('That slug or SKU is already used.'); throw e; });
    return reply.code(201).send({ product });
  });

  /** Stock count correction or restock. Never below what is already reserved for placed orders. */
  app.post('/api/v1/admin/merch/variants/:id/stock', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { delta, note } = parse(z.object({ delta: z.number().int().min(-100000).max(100000).refine((d) => d !== 0), note: z.string().trim().min(3).max(200) }), req.body);
    const [v] = await ctx.db.update(s.merchVariants).set({ stockOnHand: sql`${s.merchVariants.stockOnHand} + ${delta}` })
      .where(and(eq(s.merchVariants.id, id), sql`${s.merchVariants.stockOnHand} + ${delta} >= ${s.merchVariants.reserved}`)).returning();
    if (!v) throw new AppError(409, 'conflict', 'That would leave less stock than is already reserved for placed orders.');
    await ctx.db.insert(s.merchInventoryMovements).values({ variantId: id, kind: 'adjust', quantity: delta, actorId: a.userId, note });
    await audit(ctx.db, { actorId: a.userId, action: 'merch.stock_adjusted', targetType: 'merch_variant', targetId: id, meta: { delta } });
    return { variant: v };
  });

}
