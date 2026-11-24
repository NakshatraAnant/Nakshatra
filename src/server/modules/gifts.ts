import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { sha256 } from '../lib/crypto';
import { notFound, parse } from '../lib/http';
import { displayNames } from '../services/identity';
import { claimGift, claimPendingGiftsForUser, maskEmail } from '../services/gifts';

export async function giftRoutes(app: FastifyInstance, ctx: Ctx) {
  const Token = z.object({ token: z.string().min(16).max(64) });

  /** Public preview of a gift link: product, sender's display name, masked recipient email, status. */
  app.get('/api/v1/gifts/claim/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { token } = parse(Token, req.params);
    const [g] = await ctx.db.select().from(s.giftClaims).where(eq(s.giftClaims.tokenHash, sha256(token)));
    if (!g) throw notFound('Gift');
    const [p] = await ctx.db.select({ title: s.products.title, description: s.products.description }).from(s.products).where(eq(s.products.id, g.productId));
    const from = (await displayNames(ctx.db, [g.purchaserId])).get(g.purchaserId)?.displayName ?? 'A friend';
    const status = g.status === 'pending' && g.expiresAt < new Date() ? 'expired' : g.status;
    const mine = Boolean(req.auth && g.recipientUserId === req.auth.userId);
    return {
      gift: { product: p?.title, description: p?.description, from, message: g.message, status, expiresAt: g.expiresAt, sentTo: maskEmail(g.recipientEmail), claimedByYou: mine },
    };
  });

  /** Claim while signed in with the verified email the gift was sent to. */
  app.post('/api/v1/gifts/claim/:token', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { token } = parse(Token, req.params);
    const [g] = await ctx.db.select().from(s.giftClaims).where(eq(s.giftClaims.tokenHash, sha256(token)));
    if (!g) throw notFound('Gift');
    await ctx.db.transaction(async (tx) => { await claimGift(ctx, tx, g.id, a.userId); });
    return { ok: true, status: 'claimed' };
  });

  /** Gifts addressed to me: claims any that are ready (verified email) and lists the rest. */
  app.get('/api/v1/gifts/received', async (req) => {
    const a = requireAuth(req);
    await claimPendingGiftsForUser(ctx, a.userId);
    const rows = await ctx.db.select().from(s.giftClaims).where(eq(s.giftClaims.recipientEmail, a.email.toLowerCase())).orderBy(desc(s.giftClaims.createdAt)).limit(50);
    const titles = new Map((await ctx.db.select({ id: s.products.id, title: s.products.title }).from(s.products)).map((p) => [p.id, p.title]));
    const names = await displayNames(ctx.db, rows.map((r) => r.purchaserId));
    return { gifts: rows.map((r) => ({ id: r.id, product: titles.get(r.productId), from: names.get(r.purchaserId)?.displayName ?? 'A friend', message: r.message, status: r.status, claimedAt: r.claimedAt, expiresAt: r.expiresAt })), emailVerified: a.emailVerified };
  });

  /** Gifts I sent, with their claim status. */
  app.get('/api/v1/gifts/sent', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.giftClaims).where(and(eq(s.giftClaims.purchaserId, a.userId))).orderBy(desc(s.giftClaims.createdAt)).limit(50);
    const titles = new Map((await ctx.db.select({ id: s.products.id, title: s.products.title }).from(s.products)).map((p) => [p.id, p.title]));
    return { gifts: rows.map((r) => ({ id: r.id, orderId: r.orderId, product: titles.get(r.productId), to: r.recipientEmail, status: r.status === 'pending' && r.expiresAt < new Date() ? 'expired' : r.status, claimedAt: r.claimedAt, expiresAt: r.expiresAt })) };
  });
}
