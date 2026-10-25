import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql, ne } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor, Tx } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse, unavailable } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { notify } from '../lib/notify';
import { approveRefund, createPayment, registerPaymentHandlers, requestRefund } from '../lib/payments';
import { createStorage, DOC_TYPES } from '../lib/storage';
import { randomToken } from '../lib/crypto';
import { rankExperts } from '../services/ranking';
import { displayNames } from '../services/identity';
import { createConversation, postSystemMessage } from './messaging';
import { getSetting } from '../services/settings';

const SPECIALIZATIONS = ['vedic', 'western', 'kp', 'tarot', 'numerology', 'vastu', 'pandit', 'palmistry'] as const;
const HOLD_MINUTES = 15;

export interface Slot { start: string; end: string }

/** Computes bookable slots from weekly rules, exceptions and existing bookings (in the expert's time zone). */
export async function availableSlots(db: Executor, expertId: string, service: typeof s.expertServices.$inferSelect, fromDate: DateTime, days: number): Promise<Slot[]> {
  const [expert] = await db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, expertId));
  const rules = await db.select().from(s.availabilityRules).where(eq(s.availabilityRules.expertId, expertId));
  const exceptions = await db.select().from(s.availabilityExceptions).where(eq(s.availabilityExceptions.expertId, expertId));
  const end = fromDate.plus({ days });
  const busy = await db.select().from(s.bookings).where(and(eq(s.bookings.expertId, expertId), lt(s.bookings.startsAt, end.toJSDate()), gt(s.bookings.endsAt, fromDate.toJSDate()),
    or(inArray(s.bookings.status, ['confirmed', 'in_progress']), and(eq(s.bookings.status, 'pending_payment'), gt(s.bookings.createdAt, new Date(Date.now() - HOLD_MINUTES * 60000))))));
  const tz = expert?.timezone ?? 'Asia/Kolkata';
  const slots: Slot[] = [];
  const now = DateTime.now().plus({ hours: 2 });
  for (let d = fromDate.setZone(tz).startOf('day'); d < end; d = d.plus({ days: 1 })) {
    const iso = d.toISODate()!;
    const ex = exceptions.filter((e) => e.date === iso);
    if (ex.some((e) => !e.startTime)) continue;
    for (const r of rules.filter((x) => x.weekday === d.weekday % 7)) {
      const [sh, sm] = r.startTime.split(':').map(Number);
      const [eh, em] = r.endTime.split(':').map(Number);
      let t = d.set({ hour: sh, minute: sm });
      const stop = d.set({ hour: eh, minute: em });
      while (t.plus({ minutes: service.durationMinutes }) <= stop) {
        const st = t;
        const en = t.plus({ minutes: service.durationMinutes });
        const blockedByException = ex.some((e) => e.startTime && e.endTime && st.toFormat('HH:mm') < e.endTime && en.toFormat('HH:mm') > e.startTime);
        const overlapping = busy.filter((b) => b.startsAt < en.toJSDate() && b.endsAt > st.toJSDate());
        const sameServiceGroup = overlapping.every((b) => b.serviceId === service.id) && overlapping.length < service.capacity;
        if (st > now && !blockedByException && (overlapping.length === 0 || (service.capacity > 1 && sameServiceGroup))) {
          slots.push({ start: st.toUTC().toISO()!, end: en.toUTC().toISO()! });
        }
        t = t.plus({ minutes: Math.max(30, service.durationMinutes) });
      }
    }
  }
  return slots;
}

async function setBookingStatus(db: Executor, bookingId: string, to: string, actorId: string | null, note = '') {
  const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, bookingId));
  await db.update(s.bookings).set({ status: to, updatedAt: new Date() }).where(eq(s.bookings.id, bookingId));
  await db.insert(s.bookingStatusHistory).values({ bookingId, fromStatus: b.status, toStatus: to, actorId, note });
}

export async function expertRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = createStorage(ctx);

  registerPaymentHandlers('booking', {
    onSucceeded: async (c, tx: Tx, payment) => {
      const [b] = await tx.select().from(s.bookings).where(eq(s.bookings.id, payment.purposeId));
      if (!b || b.status !== 'pending_payment') return;
      await setBookingStatus(tx, b.id, 'confirmed', null, 'Payment succeeded');
      const [svc] = await tx.select().from(s.expertServices).where(eq(s.expertServices.id, b.serviceId));
      const conv = await createConversation(tx, 'consultation', b.customerId, [b.customerId, b.expertId], b.id);
      await postSystemMessage(tx, conv, `Booking confirmed: ${svc.title}, ${DateTime.fromJSDate(b.startsAt).setZone('Asia/Kolkata').toFormat('d LLL yyyy, h:mm a')} IST. Use this chat for your ${svc.mode} consultation.`);
      await tx.update(s.bookings).set({ conversationId: conv, paymentId: payment.id }).where(eq(s.bookings.id, b.id));
      await notify(c, tx, { userId: b.customerId, category: 'bookings', title: 'Your consultation is confirmed', body: svc.title, link: `/experts/bookings/${b.id}` });
      await notify(c, tx, { userId: b.expertId, category: 'bookings', title: 'New confirmed booking', body: svc.title, link: '/expert/dashboard' });
      for (const uid of [b.customerId, b.expertId]) {
        await tx.insert(s.scheduledReminders).values({ userId: uid, category: 'bookings', title: 'Consultation in one hour', body: svc.title, link: `/messages/${conv}`, dueAt: new Date(b.startsAt.getTime() - 3600000), sourceKey: `booking:${b.id}` }).onConflictDoNothing();
      }
      await track(tx, b.customerId, 'booking_created', { mode: svc.mode });
    },
    onFailed: async (_c, tx, payment) => {
      const [b] = await tx.select().from(s.bookings).where(eq(s.bookings.id, payment.purposeId));
      if (b?.status === 'pending_payment') await setBookingStatus(tx, b.id, 'cancelled', null, 'Payment failed');
    },
    onRefunded: async (c, tx, payment) => {
      const [b] = await tx.select().from(s.bookings).where(eq(s.bookings.id, payment.purposeId));
      if (b && payment.status === 'refunded') {
        await setBookingStatus(tx, b.id, 'refunded', null, 'Refund completed');
        await notify(c, tx, { userId: b.customerId, category: 'bookings', title: 'Your refund has been processed', link: `/experts/bookings/${b.id}` });
      }
    },
  });

  /* ---------- Discovery ---------- */
  app.get('/api/v1/experts', async (req) => {
    const q = parse(z.object({ q: z.string().max(60).optional(), language: z.string().max(30).optional(), specialization: z.enum(SPECIALIZATIONS).optional(), mode: z.enum(['chat', 'voice', 'video', 'workshop', 'group_session']).optional() }), req.query);
    const rows = await ctx.db.select().from(s.expertProfiles).innerJoin(s.users, and(eq(s.users.id, s.expertProfiles.userId), eq(s.users.status, 'active')))
      .where(and(inArray(s.expertProfiles.verificationStatus, ['verified']), q.q ? sql`(${s.expertProfiles.displayName} ilike ${'%' + q.q + '%'} or ${s.expertProfiles.headline} ilike ${'%' + q.q + '%'})` : undefined,
        q.specialization ? sql`${q.specialization} = any(${s.expertProfiles.specializations})` : undefined, q.language ? sql`${q.language} = any(${s.expertProfiles.languages})` : undefined));
    const ids = rows.map((r) => r.expert_profiles.userId);
    const ratings = ids.length ? await ctx.db.select({ id: s.reviews.subjectId, avg: sql<number>`avg(${s.reviews.rating})::float`, n: sql<number>`count(*)::int` }).from(s.reviews).where(and(eq(s.reviews.subjectType, 'expert'), eq(s.reviews.status, 'published'), inArray(s.reviews.subjectId, ids))).groupBy(s.reviews.subjectId) : [];
    const services = ids.length ? await ctx.db.select().from(s.expertServices).where(and(inArray(s.expertServices.expertId, ids), eq(s.expertServices.active, true))) : [];
    const list: { e: typeof s.expertProfiles.$inferSelect; svc: (typeof s.expertServices.$inferSelect)[]; rt: (typeof ratings)[number] | undefined; nextSlotHours: number | null; next: Slot | undefined }[] = [];
    for (const r of rows) {
      const e = r.expert_profiles;
      const svc = services.filter((x) => x.expertId === e.userId && (!q.mode || x.mode === q.mode));
      if (q.mode && !svc.length) continue;
      const chat = svc.find((x) => x.mode === 'chat') ?? svc[0];
      const next = chat ? (await availableSlots(ctx.db, e.userId, chat, DateTime.now(), 7))[0] : undefined;
      const rt = ratings.find((x) => x.id === e.userId);
      list.push({ e, svc, rt, nextSlotHours: next ? (Date.parse(next.start) - Date.now()) / 3600000 : null, next });
    }
    const ranked = rankExperts(list.map((x) => ({ userId: x.e.userId, verified: x.e.verificationStatus === 'verified', languages: x.e.languages, specializations: x.e.specializations, ratingAvg: x.rt?.avg ?? null, ratingCount: x.rt?.n ?? 0, nextSlotHours: x.nextSlotHours })), { language: q.language, specialization: q.specialization });
    return {
      experts: ranked.map((r) => {
        const x = list.find((l) => l.e.userId === r.userId)!;
        return {
          userId: r.userId, displayName: x.e.displayName, headline: x.e.headline, specializations: x.e.specializations, languages: x.e.languages, yearsExperience: x.e.yearsExperience,
          verified: x.e.verificationStatus === 'verified', isSample: x.e.isSample, rating: x.rt ? { avg: Number(x.rt.avg.toFixed(2)), count: x.rt.n } : null,
          fromPricePaise: x.svc.length ? Math.min(...x.svc.map((v) => v.pricePaise)) : null, modes: [...new Set(x.svc.map((v) => v.mode))], nextAvailable: x.next?.start ?? null, reasons: r.reasons,
        };
      }),
      rankingExplanation: 'Ordered by your filters, verified credentials, review-weighted rating (with a neutral prior so a few reviews do not dominate) and availability. No paid placement.',
    };
  });

  app.get('/api/v1/experts/:id', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [e] = await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, id));
    const viewerIsSelf = req.auth?.userId === id;
    if (!e || (e.verificationStatus !== 'verified' && !viewerIsSelf)) throw notFound('Expert');
    const services = await ctx.db.select().from(s.expertServices).where(and(eq(s.expertServices.expertId, id), eq(s.expertServices.active, true)));
    const creds = await ctx.db.select({ title: s.expertCredentials.title, issuer: s.expertCredentials.issuer, year: s.expertCredentials.year, status: s.expertCredentials.status }).from(s.expertCredentials).where(and(eq(s.expertCredentials.expertId, id), eq(s.expertCredentials.status, 'verified')));
    const reviews = await ctx.db.select().from(s.reviews).where(and(eq(s.reviews.subjectType, 'expert'), eq(s.reviews.subjectId, id), eq(s.reviews.status, 'published'))).orderBy(desc(s.reviews.createdAt)).limit(20);
    const names = await displayNames(ctx.db, reviews.map((r) => r.authorId));
    const courses = await ctx.db.select({ id: s.courses.id, slug: s.courses.slug, title: s.courses.title }).from(s.courses).where(and(eq(s.courses.creatorId, id), eq(s.courses.status, 'published')));
    const workshops = await ctx.db.select().from(s.events).where(and(eq(s.events.hostId, id), gt(s.events.endsAt, new Date()))).limit(5);
    return {
      expert: { ...e, verified: e.verificationStatus === 'verified' },
      services: services.map((x) => ({ ...x, available: x.mode === 'chat' || x.mode === 'report' || x.mode === 'workshop' || x.mode === 'group_session' ? true : false, unavailableReason: ['voice', 'video'].includes(x.mode) ? `${x.mode === 'video' ? 'Video' : 'Voice'} consultations are unavailable: no ${x.mode} provider is configured for this installation.` : null })),
      credentials: creds,
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, response: r.response, createdAt: r.createdAt, author: names.get(r.authorId)?.displayName ?? 'Member', verifiedBooking: true })),
      courses, workshops,
    };
  });

  app.get('/api/v1/experts/:id/availability', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { serviceId, from, days } = parse(z.object({ serviceId: z.uuid(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), days: z.coerce.number().int().min(1).max(28).default(7) }), req.query);
    const [svc] = await ctx.db.select().from(s.expertServices).where(and(eq(s.expertServices.id, serviceId), eq(s.expertServices.expertId, id), eq(s.expertServices.active, true)));
    if (!svc) throw notFound('Service');
    const start = from ? DateTime.fromISO(from) : DateTime.now();
    return { slots: await availableSlots(ctx.db, id, svc, start, days), timezoneNote: 'Times are shown in your local time zone.' };
  });

  /* ---------- Booking ---------- */
  app.post('/api/v1/bookings', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ serviceId: z.uuid(), start: z.iso.datetime({ offset: true }), note: z.string().max(1000).default(''), shareChart: z.boolean().default(false), followUpOf: z.uuid().optional(), idempotencyKey: z.string().min(8).max(80) }), req.body);
    const [svc] = await ctx.db.select().from(s.expertServices).where(and(eq(s.expertServices.id, body.serviceId), eq(s.expertServices.active, true)));
    if (!svc) throw notFound('Service');
    if (svc.mode === 'video' || svc.mode === 'voice') throw unavailable(`${svc.mode === 'video' ? 'Video' : 'Voice'} consultations are unavailable: no ${svc.mode} provider is configured.`);
    if (svc.expertId === a.userId) throw badRequest('You cannot book your own service.');
    const [expert] = await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, svc.expertId));
    if (!expert || expert.verificationStatus !== 'verified' || !expert.acceptsBookings) throw notFound('Expert');
    const existing = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.customerId, a.userId), eq(s.bookings.serviceId, svc.id), eq(s.bookings.startsAt, new Date(body.start)), ne(s.bookings.status, 'cancelled'), ne(s.bookings.status, 'expired')));
    if (existing[0]?.status === 'pending_payment' && existing[0].paymentId) {
      const [p] = await ctx.db.select().from(s.payments).where(eq(s.payments.id, existing[0].paymentId));
      return { booking: existing[0], checkout: { paymentId: p.id, checkoutPath: `/pay/dev/${p.id}`, isSimulated: p.provider === 'dev_simulator', amountPaise: p.amountPaise, status: p.status, provider: p.provider } };
    }
    const commissionPct = Number(await getSetting(ctx.db, 'expert_commission_percent', 20));
    const result = await ctx.db.transaction(async (tx) => {
      // Serialise bookings per expert so two concurrent requests cannot both pass the availability check.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'booking:' + svc.expertId}))`);
      const slots = await availableSlots(tx, svc.expertId, svc, DateTime.fromISO(body.start).minus({ days: 1 }), 3);
      if (!slots.some((x) => Date.parse(x.start) === Date.parse(body.start))) throw conflict('That time is no longer available. Please choose another slot.');
      const commission = Math.round((svc.pricePaise * commissionPct) / 100);
      const [b] = await tx.insert(s.bookings).values({
        customerId: a.userId, expertId: svc.expertId, serviceId: svc.id, startsAt: new Date(body.start), endsAt: new Date(Date.parse(body.start) + svc.durationMinutes * 60000),
        status: 'pending_payment', pricePaise: svc.pricePaise, commissionPaise: commission, expertEarningsPaise: svc.pricePaise - commission,
        customerNote: body.note, sharedChart: body.shareChart, followUpOf: body.followUpOf ?? null,
      }).returning();
      await tx.insert(s.bookingStatusHistory).values({ bookingId: b.id, fromStatus: null, toStatus: 'pending_payment', actorId: a.userId });
      if (body.shareChart) await tx.insert(s.chartShareGrants).values({ grantorId: a.userId, granteeId: svc.expertId, scope: 'chart', context: 'booking', contextId: b.id });
      const checkout = await createPayment(ctx, tx, { userId: a.userId, purpose: 'booking', purposeId: b.id, amountPaise: svc.pricePaise, idempotencyKey: `booking:${a.userId}:${body.idempotencyKey}` });
      await tx.update(s.bookings).set({ paymentId: checkout.paymentId }).where(eq(s.bookings.id, b.id));
      return { booking: b, checkout };
    });
    await track(ctx.db, a.userId, 'checkout_started', { purpose: 'booking' });
    return result;
  });

  app.get('/api/v1/bookings', async (req) => {
    const a = requireAuth(req);
    const { as } = parse(z.object({ as: z.enum(['customer', 'expert']).default('customer') }), req.query);
    const rows = await ctx.db.select().from(s.bookings).where(as === 'customer' ? eq(s.bookings.customerId, a.userId) : eq(s.bookings.expertId, a.userId)).orderBy(desc(s.bookings.startsAt)).limit(100);
    const services = rows.length ? await ctx.db.select().from(s.expertServices).where(inArray(s.expertServices.id, rows.map((r) => r.serviceId))) : [];
    const names = await displayNames(ctx.db, rows.flatMap((r) => [r.customerId, r.expertId]));
    const experts = rows.length ? await ctx.db.select().from(s.expertProfiles).where(inArray(s.expertProfiles.userId, rows.map((r) => r.expertId))) : [];
    return { bookings: rows.map((b) => ({ ...b, service: services.find((x) => x.id === b.serviceId), expert: { userId: b.expertId, displayName: experts.find((x) => x.userId === b.expertId)?.displayName }, customer: as === 'expert' ? { userId: b.customerId, displayName: names.get(b.customerId)?.displayName } : undefined })) };
  });

  app.get('/api/v1/bookings/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), or(eq(s.bookings.customerId, a.userId), eq(s.bookings.expertId, a.userId))));
    if (!b) throw notFound('Booking');
    const [svc] = await ctx.db.select().from(s.expertServices).where(eq(s.expertServices.id, b.serviceId));
    const [expert] = await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, b.expertId));
    const history = await ctx.db.select().from(s.bookingStatusHistory).where(eq(s.bookingStatusHistory.bookingId, id)).orderBy(asc(s.bookingStatusHistory.createdAt));
    const [payment] = b.paymentId ? await ctx.db.select().from(s.payments).where(eq(s.payments.id, b.paymentId)) : [];
    const [review] = await ctx.db.select().from(s.reviews).where(and(eq(s.reviews.sourceId, id), eq(s.reviews.authorId, b.customerId)));
    const notes = await ctx.db.select().from(s.consultationNotes).where(and(eq(s.consultationNotes.bookingId, id), a.userId === b.expertId ? undefined : eq(s.consultationNotes.sharedWithCustomer, true)));
    const [dispute] = await ctx.db.select().from(s.disputes).where(and(eq(s.disputes.subjectType, 'booking'), eq(s.disputes.subjectId, id)));
    const refundRows = payment ? await ctx.db.select().from(s.refunds).where(eq(s.refunds.paymentId, payment.id)) : [];
    // The expert sees who booked (display name only; no contact details or birth data).
    const customer = (await displayNames(ctx.db, [b.customerId])).get(b.customerId);
    return {
      booking: { ...b, customer: customer ? { userId: b.customerId, displayName: customer.displayName } : null }, service: svc, expert: { userId: expert.userId, displayName: expert.displayName }, history, notes, review: review ?? null, dispute: dispute ?? null, refunds: refundRows,
      payment: payment ? { id: payment.id, status: payment.status, amountPaise: payment.amountPaise, refundedPaise: payment.refundedPaise, provider: payment.provider, isSimulated: payment.provider === 'dev_simulator', createdAt: payment.createdAt } : null,
      role: a.userId === b.expertId ? 'expert' : 'customer',
      cancellationPolicy: 'Cancel at least 24 hours before the start for a full refund. Later cancellations can be raised with support.',
    };
  });

  app.post('/api/v1/bookings/:id/cancel', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason } = parse(z.object({ reason: z.string().max(500).default('') }), req.body);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), or(eq(s.bookings.customerId, a.userId), eq(s.bookings.expertId, a.userId))));
    if (!b) throw notFound('Booking');
    if (!['pending_payment', 'confirmed'].includes(b.status)) throw conflict(`A ${b.status.replace('_', ' ')} booking cannot be cancelled.`);
    const byExpert = a.userId === b.expertId;
    const hoursBefore = (b.startsAt.getTime() - Date.now()) / 3600000;
    await ctx.db.update(s.bookings).set({ cancelledBy: a.userId, cancelReason: reason }).where(eq(s.bookings.id, id));
    await setBookingStatus(ctx.db, id, 'cancelled', a.userId, reason);
    let refund = null;
    if (b.status === 'confirmed' && b.paymentId && (byExpert || hoursBefore >= 24)) {
      // Policy-eligible refund: requested and executed under the documented cancellation policy (audited as system).
      const r = await requestRefund(ctx, ctx.db, { paymentId: b.paymentId, amountPaise: b.pricePaise, reason: byExpert ? 'Expert cancelled' : 'Customer cancelled ≥24h before start', requestedBy: a.userId, idempotencyKey: `booking-cancel:${id}` });
      refund = await approveRefund(ctx, r.id, a.userId);
    }
    const other = byExpert ? b.customerId : b.expertId;
    await notify(ctx, ctx.db, { userId: other, category: 'bookings', title: 'A booking was cancelled', body: reason, link: byExpert ? `/experts/bookings/${id}` : '/expert/dashboard' });
    if (b.conversationId) await postSystemMessage(ctx.db, b.conversationId, 'This booking was cancelled.');
    return { ok: true, refund, refundEligible: Boolean(refund), note: refund ? 'A full refund was issued.' : b.status === 'confirmed' ? 'Cancelled within 24 hours of the start: not automatically refundable. You can contact support or raise a dispute.' : undefined };
  });

  app.post('/api/v1/bookings/:id/start', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), eq(s.bookings.expertId, a.userId), eq(s.bookings.status, 'confirmed')));
    if (!b) throw notFound('Booking');
    if (Date.now() < b.startsAt.getTime() - 15 * 60000) throw badRequest('You can start the session up to 15 minutes before the scheduled time.');
    await setBookingStatus(ctx.db, id, 'in_progress', a.userId);
    if (b.conversationId) await postSystemMessage(ctx.db, b.conversationId, 'The expert has started the session.');
    return { ok: true };
  });

  app.post('/api/v1/bookings/:id/complete', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), eq(s.bookings.expertId, a.userId), inArray(s.bookings.status, ['confirmed', 'in_progress'])));
    if (!b) throw notFound('Booking');
    if (Date.now() < b.startsAt.getTime()) throw badRequest('A session can be completed only after it has started.');
    await ctx.db.update(s.bookings).set({ completedAt: new Date() }).where(eq(s.bookings.id, id));
    await setBookingStatus(ctx.db, id, 'completed', a.userId);
    await ctx.db.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(and(eq(s.chartShareGrants.context, 'booking'), eq(s.chartShareGrants.contextId, id)));
    await notify(ctx, ctx.db, { userId: b.customerId, category: 'bookings', title: 'How was your consultation?', body: 'You can leave a review for this verified booking.', link: `/experts/bookings/${id}` });
    await track(ctx.db, b.customerId, 'consultation_completed', {});
    return { ok: true };
  });

  app.post('/api/v1/bookings/:id/review', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ rating: z.number().int().min(1).max(5), body: z.string().max(1500).default('') }), req.body);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), eq(s.bookings.customerId, a.userId), eq(s.bookings.status, 'completed')));
    if (!b) throw forbidden('Only completed bookings can be reviewed.');
    const res = await ctx.db.insert(s.reviews).values({ subjectType: 'expert', subjectId: b.expertId, sourceId: b.id, authorId: a.userId, rating: body.rating, body: body.body }).onConflictDoNothing().returning();
    if (!res.length) throw conflict('You have already reviewed this booking.');
    return { review: res[0] };
  });

  app.post('/api/v1/bookings/:id/dispute', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ reason: z.enum(['no_show', 'quality', 'technical', 'billing', 'conduct', 'other']), details: z.string().max(2000).default('') }), req.body);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), eq(s.bookings.customerId, a.userId), inArray(s.bookings.status, ['confirmed', 'in_progress', 'completed', 'cancelled'])));
    if (!b) throw notFound('Booking');
    const existing = await ctx.db.select().from(s.disputes).where(and(eq(s.disputes.subjectType, 'booking'), eq(s.disputes.subjectId, id)));
    if (existing.length) throw conflict('A dispute is already open for this booking.');
    const [d] = await ctx.db.insert(s.disputes).values({ subjectType: 'booking', subjectId: id, raisedBy: a.userId, reason: body.reason, details: body.details }).returning();
    if (b.status !== 'cancelled') await setBookingStatus(ctx.db, id, 'disputed', a.userId, body.reason);
    await notify(ctx, ctx.db, { userId: b.expertId, category: 'bookings', title: 'A customer opened a dispute', body: 'Our support team will review it.', link: '/expert/dashboard' });
    return { dispute: d };
  });

  app.post('/api/v1/bookings/:id/refund-request', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason } = parse(z.object({ reason: z.string().min(5).max(500) }), req.body);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), eq(s.bookings.customerId, a.userId)));
    if (!b?.paymentId) throw notFound('Booking');
    const r = await requestRefund(ctx, ctx.db, { paymentId: b.paymentId, amountPaise: b.pricePaise, reason, requestedBy: a.userId, idempotencyKey: `booking-refund-request:${id}` });
    return { refund: r, message: 'Your refund request was sent to our support team for review.' };
  });

  app.post('/api/v1/bookings/:id/notes', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ body: z.string().trim().min(1).max(4000), sharedWithCustomer: z.boolean().default(false) }), req.body);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), eq(s.bookings.expertId, a.userId)));
    if (!b) throw notFound('Booking');
    const [n] = await ctx.db.insert(s.consultationNotes).values({ bookingId: id, expertId: a.userId, ...body }).returning();
    return { note: n };
  });

  /** The customer's shared chart, visible to the expert only while the booking grant is active. */
  app.get('/api/v1/bookings/:id/customer-chart', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [b] = await ctx.db.select().from(s.bookings).where(and(eq(s.bookings.id, id), eq(s.bookings.expertId, a.userId)));
    if (!b) throw notFound('Booking');
    const [g] = await ctx.db.select().from(s.chartShareGrants).where(and(eq(s.chartShareGrants.context, 'booking'), eq(s.chartShareGrants.contextId, id), sql`${s.chartShareGrants.revokedAt} is null`));
    if (!g) throw forbidden('The customer has not shared their chart for this booking.');
    const { currentChart } = await import('../services/identity');
    const [v, w] = await Promise.all([currentChart(ctx.db, b.customerId, 'vedic_default'), currentChart(ctx.db, b.customerId, 'western_default')]);
    const strip = (c: typeof v) => (c ? { ...c.result, input: { ...c.result.input, latitude: null, longitude: null, placeName: undefined } } : null);
    return { vedic: strip(v), western: strip(w), note: 'Shared for this consultation only; access ends when the booking completes.' };
  });

  /* ---------- Expert side ---------- */
  const ExpertBody = z.object({
    displayName: z.string().trim().min(2).max(80), headline: z.string().trim().min(5).max(140), bio: z.string().max(3000).default(''),
    specializations: z.array(z.enum(SPECIALIZATIONS)).min(1), languages: z.array(z.string().min(2).max(30)).min(1).max(8),
    yearsExperience: z.number().int().min(0).max(70), timezone: z.string().default('Asia/Kolkata'), acceptsBookings: z.boolean().default(true),
  });

  app.get('/api/v1/expert/me', async (req) => {
    const a = requireAuth(req);
    const [e] = await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, a.userId));
    if (!e) return { expert: null };
    const services = await ctx.db.select().from(s.expertServices).where(eq(s.expertServices.expertId, a.userId));
    const rules = await ctx.db.select().from(s.availabilityRules).where(eq(s.availabilityRules.expertId, a.userId));
    const exceptions = await ctx.db.select().from(s.availabilityExceptions).where(and(eq(s.availabilityExceptions.expertId, a.userId), gte(s.availabilityExceptions.date, DateTime.now().toISODate()!)));
    const creds = await ctx.db.select().from(s.expertCredentials).where(eq(s.expertCredentials.expertId, a.userId));
    return { expert: e, services, rules, exceptions, credentials: creds };
  });

  app.put('/api/v1/expert/me', async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before applying as an expert.');
    const body = parse(ExpertBody, req.body);
    const [existing] = await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, a.userId));
    if (existing?.verificationStatus === 'suspended') throw forbidden('Your expert profile is suspended.');
    await ctx.db.insert(s.expertProfiles).values({ ...body, userId: a.userId }).onConflictDoUpdate({ target: s.expertProfiles.userId, set: { ...body, updatedAt: new Date() } });
    return { ok: true };
  });

  app.post('/api/v1/expert/credentials', async (req) => {
    const a = requireAuth(req);
    const file = await req.file();
    if (!file) throw badRequest('Attach a credential document.');
    const f = file.fields as Record<string, { value?: string }>;
    const meta = parse(z.object({ title: z.string().min(2).max(120), issuer: z.string().min(2).max(120), year: z.coerce.number().int().min(1950).max(2100).optional() }), { title: f.title?.value, issuer: f.issuer?.value, year: f.year?.value || undefined });
    const saved = await storage.save(await file.toBuffer(), { allowed: DOC_TYPES, isPrivate: true, maxBytes: ctx.config.MAX_UPLOAD_MB * 1048576 });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'credential', path: saved.path, mime: saved.mime, bytes: saved.bytes, isPrivate: true });
    const [c] = await ctx.db.insert(s.expertCredentials).values({ expertId: a.userId, ...meta, documentUrl: saved.path }).returning();
    return { credential: c };
  });

  app.post('/api/v1/expert/submit-verification', async (req) => {
    const a = requireAuth(req);
    const [e] = await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, a.userId));
    if (!e) throw badRequest('Create your expert profile first.');
    const creds = await ctx.db.select().from(s.expertCredentials).where(eq(s.expertCredentials.expertId, a.userId));
    if (!creds.length) throw badRequest('Add at least one credential before submitting.');
    if (!['draft', 'rejected'].includes(e.verificationStatus)) throw conflict(`Your profile is already ${e.verificationStatus}.`);
    await ctx.db.update(s.expertProfiles).set({ verificationStatus: 'pending' }).where(eq(s.expertProfiles.userId, a.userId));
    await ctx.db.insert(s.verificationRequests).values({ userId: a.userId, kind: 'expert', evidence: creds.map((c) => c.documentUrl), note: `${creds.length} credential(s)` });
    return { status: 'pending' };
  });

  app.post('/api/v1/expert/services', async (req) => {
    const a = requireAuth(req);
    const [e] = await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, a.userId));
    if (!e) throw badRequest('Create your expert profile first.');
    const body = parse(z.object({ mode: z.enum(['chat', 'voice', 'video', 'report', 'workshop', 'group_session']), title: z.string().trim().min(3).max(100), description: z.string().max(1000).default(''), durationMinutes: z.number().int().min(15).max(240), pricePaise: z.number().int().min(0).max(10_000_000), capacity: z.number().int().min(1).max(200).default(1) }), req.body);
    if (body.capacity > 1 && !['workshop', 'group_session'].includes(body.mode)) throw badRequest('Only workshops and group sessions can have more than one seat.');
    const [svc] = await ctx.db.insert(s.expertServices).values({ ...body, expertId: a.userId }).returning();
    return { service: svc };
  });

  app.patch('/api/v1/expert/services/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ title: z.string().min(3).max(100).optional(), description: z.string().max(1000).optional(), pricePaise: z.number().int().min(0).optional(), active: z.boolean().optional() }), req.body);
    const [svc] = await ctx.db.update(s.expertServices).set(body).where(and(eq(s.expertServices.id, id), eq(s.expertServices.expertId, a.userId))).returning();
    if (!svc) throw notFound('Service');
    return { service: svc };
  });

  app.put('/api/v1/expert/availability', async (req) => {
    const a = requireAuth(req);
    const { rules } = parse(z.object({ rules: z.array(z.object({ weekday: z.number().int().min(0).max(6), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/) })).max(50) }), req.body);
    if (rules.some((r) => r.startTime >= r.endTime)) throw badRequest('Each availability window must end after it starts.');
    await ctx.db.transaction(async (tx) => {
      await tx.delete(s.availabilityRules).where(eq(s.availabilityRules.expertId, a.userId));
      if (rules.length) await tx.insert(s.availabilityRules).values(rules.map((r) => ({ ...r, expertId: a.userId })));
    });
    return { ok: true };
  });

  app.post('/api/v1/expert/exceptions', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), reason: z.string().max(200).default('') }), req.body);
    const [e] = await ctx.db.insert(s.availabilityExceptions).values({ ...body, expertId: a.userId }).returning();
    return { exception: e };
  });

  app.delete('/api/v1/expert/exceptions/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ctx.db.delete(s.availabilityExceptions).where(and(eq(s.availabilityExceptions.id, id), eq(s.availabilityExceptions.expertId, a.userId)));
    return { ok: true };
  });

  app.get('/api/v1/expert/analytics', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select({ status: s.bookings.status, n: sql<number>`count(*)::int`, earnings: sql<number>`coalesce(sum(${s.bookings.expertEarningsPaise}),0)::int` }).from(s.bookings).where(eq(s.bookings.expertId, a.userId)).groupBy(s.bookings.status);
    const [rating] = await ctx.db.select({ avg: sql<number>`avg(${s.reviews.rating})::float`, n: sql<number>`count(*)::int` }).from(s.reviews).where(and(eq(s.reviews.subjectType, 'expert'), eq(s.reviews.subjectId, a.userId), eq(s.reviews.status, 'published')));
    const completed = rows.find((r) => r.status === 'completed');
    const cancelled = rows.find((r) => r.status === 'cancelled')?.n ?? 0;
    const total = rows.reduce((x, r) => x + r.n, 0);
    const payoutRows = await ctx.db.select().from(s.payouts).where(eq(s.payouts.payeeId, a.userId)).orderBy(desc(s.payouts.createdAt));
    const paid = payoutRows.filter((p) => p.status === 'paid').reduce((x, p) => x + p.amountPaise, 0);
    return {
      bookingsByStatus: rows, completionRate: total ? (completed?.n ?? 0) / total : null, cancellations: cancelled,
      rating: rating?.n ? { avg: rating.avg, count: rating.n } : null,
      earnings: { completedPaise: completed?.earnings ?? 0, paidOutPaise: paid, pendingPaise: (completed?.earnings ?? 0) - paid },
      payouts: payoutRows, commissionPercent: Number(await getSetting(ctx.db, 'expert_commission_percent', 20)),
      payoutNote: ctx.config.PAYMENT_PROVIDER === 'dev_simulator' ? 'Payout records are generated by administrators; no real bank transfer is made in development.' : undefined,
    };
  });

  app.post('/api/v1/expert/reviews/:id/respond', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { response } = parse(z.object({ response: z.string().trim().min(1).max(1000) }), req.body);
    const [r] = await ctx.db.update(s.reviews).set({ response }).where(and(eq(s.reviews.id, id), eq(s.reviews.subjectType, 'expert'), eq(s.reviews.subjectId, a.userId))).returning();
    if (!r) throw notFound('Review');
    return { review: r };
  });

  void lte; void randomToken; void audit;
}
