import { and, eq, inArray } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { approveRefund, requestRefund } from '../lib/payments';

/**
 * Automatic refunds for paid circle event tickets. A ticket becomes "refund_due" when its event is cancelled, or
 * when its payment arrives after the event was cancelled, started or filled up. This refunds every due ticket in
 * full through the payment boundary; the ticket becomes "refunded" when the provider confirms. Runs right after a
 * cancellation and on every scheduler pass, so a refund that failed at the provider is retried.
 */
export async function refundDueTickets(ctx: Ctx, limit = 50): Promise<number> {
  const due = await ctx.db.select({ t: s.eventTickets, hostId: s.events.hostId }).from(s.eventTickets).innerJoin(s.events, eq(s.events.id, s.eventTickets.eventId))
    .where(eq(s.eventTickets.status, 'refund_due')).limit(limit);
  let done = 0;
  for (const { t, hostId } of due) {
    if (!t.paymentId) continue;
    try {
      // A failed provider attempt is closed; each retry is a new refund request.
      const failed = await ctx.db.select({ id: s.refunds.id }).from(s.refunds).where(and(eq(s.refunds.paymentId, t.paymentId), inArray(s.refunds.status, ['failed'])));
      const r = await requestRefund(ctx, ctx.db, { paymentId: t.paymentId, amountPaise: t.amountPaise, reason: 'Event cancelled — automatic ticket refund', requestedBy: hostId, idempotencyKey: `ticket-refund:${t.id}:${failed.length}` });
      if (r.status === 'requested') await approveRefund(ctx, r.id, hostId);
      done++;
    } catch (e) {
      ctx.log.warn({ ticketId: t.id, err: (e as Error).message }, 'automatic ticket refund failed; will retry');
    }
  }
  return done;
}
