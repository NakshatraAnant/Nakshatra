import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../lib/context';
import { AppError, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { processWebhook, simulateOutcome } from '../lib/payments';
import { verifyRazorpayCheckout } from '../lib/razorpay';
import { and, eq } from 'drizzle-orm';
import * as s from '../db/schema';
import { authRoutes } from './auth';
import { profileRoutes } from './profile';
import { astroRoutes } from './astro';
import { bondRoutes } from './bonds';
import { socialRoutes } from './social';
import { messagingRoutes } from './messaging';
import { datingRoutes } from './dating';
import { matchmakingRoutes } from './matchmaking';
import { expertRoutes } from './experts';
import { learningRoutes } from './learning';
import { commerceRoutes } from './commerce';
import { weddingRoutes } from './weddings';
import { journeyRoutes } from './journey';
import { accountRoutes } from './account';
import { adminRoutes } from './admin';
import { discoverRoutes } from './discover';
import { studioRoutes } from './studio';
import { circleRoutes } from './circles';
import { playRoutes } from './play';
import { ritualRoutes } from './rituals';
import { referralRoutes } from './referrals';
import { giftRoutes } from './gifts';
import { progressionRoutes } from './progression';
import { insightRoutes } from './insights';
import { peopleRoutes } from './people';

async function paymentRoutes(app: FastifyInstance, ctx: Ctx) {
  /** Provider webhooks: signature-verified and idempotent (see lib/payments.ts). */
  app.post('/api/v1/payments/webhook/:provider', async (req) => {
    const { provider } = parse(z.object({ provider: z.string().max(30) }), req.params);
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? '';
    const signature = (provider === 'razorpay' ? req.headers['x-razorpay-signature'] : req.headers['x-nakshatra-signature']) as string | undefined;
    return processWebhook(ctx, provider, raw, signature, req.headers['x-razorpay-event-id'] as string | undefined);
  });

  if (ctx.config.PAYMENT_PROVIDER === 'razorpay') {
    /** Public checkout parameters for Razorpay Checkout (key id is public; the secret never leaves the server). */
    app.get('/api/v1/payments/:id/razorpay', async (req) => {
      const a = requireAuth(req);
      const { id } = parse(z.object({ id: z.uuid() }), req.params);
      const [p] = await ctx.db.select().from(s.payments).where(and(eq(s.payments.id, id), eq(s.payments.userId, a.userId), eq(s.payments.provider, 'razorpay')));
      if (!p || !p.providerRef) throw notFound('Payment');
      const [u] = await ctx.db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, a.userId));
      return { keyId: ctx.config.RAZORPAY_KEY_ID, orderId: p.providerRef, amountPaise: p.amountPaise, currency: p.currency, status: p.status, purpose: p.purpose, prefill: { email: u.email } };
    });
    /** Confirms the Checkout signature. Payment state still changes only via the signed webhook. */
    app.post('/api/v1/payments/:id/razorpay/verify', async (req) => {
      const a = requireAuth(req);
      const { id } = parse(z.object({ id: z.uuid() }), req.params);
      const body = parse(z.object({ razorpay_order_id: z.string().max(64), razorpay_payment_id: z.string().max(64), razorpay_signature: z.string().max(128) }), req.body);
      const [p] = await ctx.db.select().from(s.payments).where(and(eq(s.payments.id, id), eq(s.payments.userId, a.userId)));
      if (!p || p.providerRef !== body.razorpay_order_id) throw notFound('Payment');
      const verified = verifyRazorpayCheckout(ctx.config.RAZORPAY_KEY_SECRET!, body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature);
      if (!verified) throw new AppError(400, 'invalid_signature', 'Payment confirmation could not be verified.');
      return { verified: true, status: p.status, note: 'Waiting for the provider’s confirmation (webhook).' };
    });
  }

  /** Development simulator — only registered when the dev adapter is active outside production. */
  if (ctx.config.PAYMENT_PROVIDER === 'dev_simulator' && !ctx.config.isProd) {
    app.post('/api/v1/payments/dev/:id/simulate', async (req) => {
      const a = requireAuth(req);
      const { id } = parse(z.object({ id: z.uuid() }), req.params);
      const { outcome } = parse(z.object({ outcome: z.enum(['succeeded', 'failed']) }), req.body);
      const result = await simulateOutcome(ctx, id, a.userId, outcome);
      return { ...result, simulated: true, notice: 'Development payment simulator: no real money moved.' };
    });
  }
}

export async function registerModules(app: FastifyInstance, ctx: Ctx) {
  await authRoutes(app, ctx);
  await profileRoutes(app, ctx);
  await astroRoutes(app, ctx);
  await bondRoutes(app, ctx);
  await socialRoutes(app, ctx);
  await messagingRoutes(app, ctx);
  await datingRoutes(app, ctx);
  await matchmakingRoutes(app, ctx);
  await expertRoutes(app, ctx);
  await learningRoutes(app, ctx);
  await commerceRoutes(app, ctx);
  await weddingRoutes(app, ctx);
  await journeyRoutes(app, ctx);
  await accountRoutes(app, ctx);
  await adminRoutes(app, ctx);
  await discoverRoutes(app, ctx);
  await studioRoutes(app, ctx);
  await circleRoutes(app, ctx);
  await playRoutes(app, ctx);
  await ritualRoutes(app, ctx);
  await referralRoutes(app, ctx);
  await giftRoutes(app, ctx);
  await progressionRoutes(app, ctx);
  await insightRoutes(app, ctx);
  await peopleRoutes(app, ctx);
  await paymentRoutes(app, ctx);
}
