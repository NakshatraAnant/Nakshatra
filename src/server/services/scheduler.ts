import { DateTime } from 'luxon';
import { and, eq, isNull, lt, lte, inArray, ne, or } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { deliverOutbox, notify, type NotificationCategory } from '../lib/notify';
import { expireGifts } from './gifts';
import { materialiseAllSeries } from './circleSpaces';

/**
 * In-process scheduler for time-based state transitions. Each job is idempotent,
 * so running it twice (or on several instances) is safe.
 */
export async function runScheduledJobs(ctx: Ctx, now = new Date()) {
  const results: Record<string, number> = {};

  // 0. Deliver queued email and retry failed SMTP sends (no-op for the dev mailbox).
  results.emailsSent = (await deliverOutbox(ctx)).sent;

  // 1. Due reminders → notifications (respecting preferences inside notify()).
  const due = await ctx.db.select().from(s.scheduledReminders).where(and(lte(s.scheduledReminders.dueAt, now), isNull(s.scheduledReminders.sentAt), isNull(s.scheduledReminders.cancelledAt))).limit(200);
  for (const r of due) {
    await notify(ctx, ctx.db, { userId: r.userId, category: r.category as NotificationCategory, title: r.title, body: r.body, link: r.link ?? undefined, dedupeKey: `reminder:${r.id}` });
    await ctx.db.update(s.scheduledReminders).set({ sentAt: now }).where(eq(s.scheduledReminders.id, r.id));
  }
  results.reminders = due.length;

  // 2. Expire unpaid booking holds after 15 minutes.
  const holdCutoff = new Date(now.getTime() - 15 * 60000);
  const expired = await ctx.db.update(s.bookings).set({ status: 'expired', updatedAt: now }).where(and(eq(s.bookings.status, 'pending_payment'), lt(s.bookings.createdAt, holdCutoff))).returning({ id: s.bookings.id, paymentId: s.bookings.paymentId });
  if (expired.length) {
    await ctx.db.insert(s.bookingStatusHistory).values(expired.map((b) => ({ bookingId: b.id, fromStatus: 'pending_payment', toStatus: 'expired', note: 'Payment not completed within 15 minutes' })));
    const ids = expired.map((b) => b.paymentId).filter(Boolean) as string[];
    if (ids.length) await ctx.db.update(s.payments).set({ status: 'cancelled', updatedAt: now }).where(and(inArray(s.payments.id, ids), eq(s.payments.status, 'created')));
  }
  results.expiredBookings = expired.length;

  // 3. Cancel unpaid orders after 1 hour and restock.
  const orderCutoff = new Date(now.getTime() - 3600000);
  const stale = await ctx.db.select().from(s.orders).where(and(eq(s.orders.status, 'pending_payment'), lt(s.orders.createdAt, orderCutoff))).limit(100);
  for (const o of stale) {
    await ctx.db.transaction(async (tx) => {
      const [upd] = await tx.update(s.orders).set({ status: 'cancelled', updatedAt: now }).where(and(eq(s.orders.id, o.id), eq(s.orders.status, 'pending_payment'))).returning();
      if (!upd) return;
      if (o.paymentId) await tx.update(s.payments).set({ status: 'cancelled', updatedAt: now }).where(and(eq(s.payments.id, o.paymentId), eq(s.payments.status, 'created')));
      const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, o.id));
      for (const it of items) {
        const [v] = await tx.select().from(s.productVariants).where(eq(s.productVariants.id, it.variantId));
        if (v.stock !== null) {
          await tx.update(s.productVariants).set({ stock: v.stock + it.quantity }).where(eq(s.productVariants.id, v.id));
          await tx.insert(s.inventoryMovements).values({ variantId: v.id, delta: it.quantity, reason: 'adjustment', refId: o.id });
        }
      }
    });
  }
  results.cancelledOrders = stale.length;

  // 4. Subscriptions reaching period end: cancel (if requested) or mark past_due awaiting renewal payment.
  const ending = await ctx.db.select().from(s.subscriptions).where(and(eq(s.subscriptions.status, 'active'), lte(s.subscriptions.currentPeriodEnd, now)));
  for (const sub of ending) {
    const status = sub.cancelAtPeriodEnd ? 'cancelled' : 'past_due';
    await ctx.db.update(s.subscriptions).set({ status, updatedAt: now }).where(eq(s.subscriptions.id, sub.id));
    await notify(ctx, ctx.db, { userId: sub.userId, category: 'orders', title: status === 'cancelled' ? 'Your Nakshatra+ membership has ended' : 'Renew your Nakshatra+ membership', body: status === 'past_due' ? 'Confirm the renewal payment to keep your benefits.' : '', link: '/settings/subscription', dedupeKey: `sub-end:${sub.id}:${sub.currentPeriodEnd?.toISOString()}` });
  }
  // Past-due for more than 7 days → expired.
  const graceCutoff = new Date(now.getTime() - 7 * 86400000);
  const lapsed = await ctx.db.update(s.subscriptions).set({ status: 'expired', updatedAt: now }).where(and(eq(s.subscriptions.status, 'past_due'), lt(s.subscriptions.currentPeriodEnd, graceCutoff))).returning();
  results.subscriptionsEnded = ending.length + lapsed.length;

  // 5. Expire stale bond invitations.
  const inv = await ctx.db.update(s.bondInvitations).set({ status: 'expired' }).where(and(eq(s.bondInvitations.status, 'pending'), lt(s.bondInvitations.expiresAt, now))).returning();
  results.expiredInvitations = inv.length;

  // 6. Gifts not claimed in time.
  results.expiredGifts = await expireGifts(ctx, now);

  // 6b. Keep repeating circle events stocked a few weeks ahead.
  results.eventOccurrences = await materialiseAllSeries(ctx.db, now);

  // 7. Retention: sign-in links and sessions are security material; keep them only as long as needed.
  results.retention = await runRetention(ctx, now);
  return results;
}

/**
 * Data retention (retention-v1). Bodies of delivered emails are blanked (they contain one-time links),
 * old development-mailbox mail, expired/used auth tokens and long-expired or revoked sessions are deleted.
 */
export async function runRetention(ctx: Ctx, now = new Date()): Promise<number> {
  const day = 86400000;
  let n = 0;
  n += (await ctx.db.update(s.emailOutbox).set({ textBody: '[delivered — content removed by retention policy]' })
    .where(and(eq(s.emailOutbox.transport, 'smtp'), eq(s.emailOutbox.status, 'sent'), lt(s.emailOutbox.createdAt, new Date(now.getTime() - day)), ne(s.emailOutbox.textBody, '[delivered — content removed by retention policy]'))).returning({ id: s.emailOutbox.id })).length;
  n += (await ctx.db.delete(s.emailOutbox).where(and(eq(s.emailOutbox.transport, 'dev_mailbox'), lt(s.emailOutbox.createdAt, new Date(now.getTime() - 7 * day)))).returning({ id: s.emailOutbox.id })).length;
  n += (await ctx.db.delete(s.adDelivery).where(lt(s.adDelivery.day, DateTime.fromJSDate(now).minus({ days: 30 }).toISODate()!)).returning({ c: s.adDelivery.campaignId })).length;
  n += (await ctx.db.delete(s.authTokens).where(lt(s.authTokens.expiresAt, new Date(now.getTime() - 7 * day))).returning({ id: s.authTokens.id })).length;
  n += (await ctx.db.delete(s.sessions).where(or(lt(s.sessions.expiresAt, new Date(now.getTime() - 30 * day)), lt(s.sessions.revokedAt, new Date(now.getTime() - 30 * day)))).returning({ id: s.sessions.id })).length;
  return n;
}

export function startScheduler(ctx: Ctx, intervalMs = 60000): () => void {
  const tick = () => runScheduledJobs(ctx).catch((err) => ctx.log.error({ err }, 'scheduled job failed'));
  const handle = setInterval(tick, intervalMs);
  setTimeout(tick, 5000);
  return () => clearInterval(handle);
}
