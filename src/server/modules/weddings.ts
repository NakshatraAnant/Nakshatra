import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor, Tx } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { notify, sendEmail } from '../lib/notify';
import { createPayment, registerPaymentHandlers, requestRefund } from '../lib/payments';
import { placeById } from '../lib/geo';
import { createStorage, IMAGE_TYPES } from '../lib/storage';
import { bigThreeFor, displayNames } from '../services/identity';
import { createConversation, postSystemMessage } from './messaging';

export const WEDDING_PERMISSIONS = ['view_budget', 'edit_budget', 'manage_guests', 'manage_tasks', 'manage_vendors'] as const;
type Perm = (typeof WEDDING_PERMISSIONS)[number];
const VENDOR_CATEGORIES = ['pandit', 'venue', 'photographer', 'caterer', 'decorator', 'planner', 'makeup', 'mehendi', 'music', 'invitations', 'other'] as const;

export const RITUAL_LIBRARY = [
  { key: 'roka', title: 'Roka / Sagai', description: 'Formal acceptance between families; often the first ceremony.' },
  { key: 'haldi', title: 'Haldi', description: 'Turmeric paste applied to the couple for blessing and glow.' },
  { key: 'mehendi', title: 'Mehendi', description: 'Henna designs and celebration, usually a day or two before the wedding.' },
  { key: 'sangeet', title: 'Sangeet', description: 'Music and dance evening bringing both families together.' },
  { key: 'baraat', title: 'Baraat', description: 'The groom’s procession to the venue.' },
  { key: 'kanyadaan', title: 'Kanyadaan', description: 'A parent’s ritual blessing of the union (practised differently across communities).' },
  { key: 'saptapadi', title: 'Saptapadi (Seven Steps)', description: 'Seven vows taken around the sacred fire — the heart of a Vedic wedding.' },
  { key: 'vidaai', title: 'Vidaai', description: 'Farewell ceremony for the bride from her family home.' },
];

async function projectAccess(db: Executor, projectId: string, userId: string, need?: Perm) {
  const [p] = await db.select().from(s.weddingProjects).where(eq(s.weddingProjects.id, projectId));
  if (!p) throw notFound('Wedding project');
  if (p.ownerId === userId) return { project: p, role: 'owner' as const, perms: [...WEDDING_PERMISSIONS] as Perm[] };
  const [m] = await db.select().from(s.weddingMembers).where(and(eq(s.weddingMembers.projectId, projectId), eq(s.weddingMembers.userId, userId), eq(s.weddingMembers.status, 'active')));
  if (!m) throw notFound('Wedding project');
  const perms = m.permissions as Perm[];
  if (need && !perms.includes(need)) throw forbidden(`You need the “${need.replace('_', ' ')}” permission for this.`);
  return { project: p, role: m.role, perms };
}

async function vendorOwned(db: Executor, vendorId: string, userId: string) {
  const [v] = await db.select().from(s.vendors).where(and(eq(s.vendors.id, vendorId), eq(s.vendors.ownerId, userId)));
  if (!v) throw notFound('Vendor');
  return v;
}

export async function weddingRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = createStorage(ctx);

  registerPaymentHandlers('vendor_milestone', {
    onSucceeded: async (c, tx: Tx, payment) => {
      const [m] = await tx.select().from(s.vendorPaymentMilestones).where(eq(s.vendorPaymentMilestones.id, payment.purposeId));
      if (!m || m.status !== 'due') return;
      await tx.update(s.vendorPaymentMilestones).set({ status: 'paid', paymentId: payment.id }).where(eq(s.vendorPaymentMilestones.id, m.id));
      const [vb] = await tx.select().from(s.vendorBookings).where(eq(s.vendorBookings.id, m.vendorBookingId));
      const [v] = await tx.select().from(s.vendors).where(eq(s.vendors.id, vb.vendorId));
      if (vb.status === 'pending_deposit') {
        await tx.update(s.vendorBookings).set({ status: 'confirmed' }).where(eq(s.vendorBookings.id, vb.id));
        const [q] = await tx.select().from(s.vendorQuotes).where(eq(s.vendorQuotes.id, vb.quoteId));
        const [inq] = await tx.select().from(s.vendorInquiries).where(eq(s.vendorInquiries.id, q.inquiryId));
        await tx.update(s.vendorInquiries).set({ status: 'booked' }).where(eq(s.vendorInquiries.id, inq.id));
        if (inq.eventDate) await tx.insert(s.vendorUnavailability).values({ vendorId: v.id, date: inq.eventDate, reason: 'booked' }).onConflictDoNothing();
        if (inq.conversationId) await postSystemMessage(tx, inq.conversationId, 'Deposit received — this booking is confirmed.');
      }
      // Keep the couple's budget in step: one line per booked vendor (committed = accepted quote, paid = milestones paid).
      const [quote] = await tx.select({ amountPaise: s.vendorQuotes.amountPaise }).from(s.vendorQuotes).where(eq(s.vendorQuotes.id, vb.quoteId));
      await tx.insert(s.weddingBudgetItems).values({ projectId: vb.projectId, category: v.category, label: v.name, estimatedPaise: quote?.amountPaise ?? m.amountPaise, actualPaise: quote?.amountPaise ?? m.amountPaise, paidPaise: m.amountPaise, vendorBookingId: vb.id })
        .onConflictDoUpdate({ target: s.weddingBudgetItems.vendorBookingId, set: { paidPaise: sql`${s.weddingBudgetItems.paidPaise} + ${m.amountPaise}` } });
      await notify(c, tx, { userId: v.ownerId, category: 'weddings', title: `Payment received: ${m.label}`, link: '/vendor/dashboard' });
      await notify(c, tx, { userId: payment.userId, category: 'orders', title: `Payment confirmed: ${m.label} for ${v.name}`, link: `/weddings/${vb.projectId}` });
    },
    onRefunded: async (_c, tx, payment, amountPaise) => {
      const [m] = await tx.update(s.vendorPaymentMilestones).set({ status: 'refunded' }).where(eq(s.vendorPaymentMilestones.paymentId, payment.id)).returning();
      if (m) await tx.update(s.weddingBudgetItems).set({ paidPaise: sql`greatest(0, ${s.weddingBudgetItems.paidPaise} - ${amountPaise})` }).where(eq(s.weddingBudgetItems.vendorBookingId, m.vendorBookingId));
    },
  });

  /* ---------- Projects ---------- */
  app.get('/api/v1/weddings', async (req) => {
    const a = requireAuth(req);
    const own = await ctx.db.select().from(s.weddingProjects).where(eq(s.weddingProjects.ownerId, a.userId));
    const memberOf = await ctx.db.select({ p: s.weddingProjects, m: s.weddingMembers }).from(s.weddingMembers).innerJoin(s.weddingProjects, eq(s.weddingProjects.id, s.weddingMembers.projectId)).where(and(eq(s.weddingMembers.userId, a.userId), eq(s.weddingMembers.status, 'active')));
    return { projects: [...own.map((p) => ({ ...p, role: 'owner' })), ...memberOf.map((x) => ({ ...x.p, role: x.m.role }))] };
  });

  app.post('/api/v1/weddings', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ title: z.string().trim().min(3).max(100), weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), placeId: z.string().optional(), budgetPaise: z.number().int().min(0).max(10_000_000_000).default(0), coupleBondId: z.uuid().optional() }), req.body);
    const place = body.placeId ? placeById(body.placeId) : null;
    if (body.coupleBondId) {
      const [b] = await ctx.db.select().from(s.bonds).where(and(eq(s.bonds.id, body.coupleBondId), eq(s.bonds.status, 'active'), or(eq(s.bonds.ownerId, a.userId), eq(s.bonds.partnerUserId, a.userId))));
      if (!b) throw badRequest('Choose an active Bond with your partner.');
    }
    const [p] = await ctx.db.insert(s.weddingProjects).values({
      ownerId: a.userId, title: body.title, weddingDate: body.weddingDate, city: place?.label ?? '', latitude: place ? Math.round(place.latitude * 1e4) : null, longitude: place ? Math.round(place.longitude * 1e4) : null,
      timezone: place?.timezone ?? 'Asia/Kolkata', budgetPaise: body.budgetPaise, coupleBondId: body.coupleBondId,
    }).returning();
    const defaults = ['Fix the wedding date and muhurat', 'Draft the guest list', 'Shortlist venues', 'Book a pandit / officiant', 'Book a photographer', 'Plan the mehendi and sangeet', 'Send invitations'];
    await ctx.db.insert(s.weddingTasks).values(defaults.map((title) => ({ projectId: p.id, title, createdBy: a.userId })));
    await track(ctx.db, a.userId, 'wedding_project_created', {});
    return { project: p };
  });

  app.get('/api/v1/weddings/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { project, role, perms } = await projectAccess(ctx.db, id, a.userId);
    const members = await ctx.db.select().from(s.weddingMembers).where(eq(s.weddingMembers.projectId, id));
    const names = await displayNames(ctx.db, [project.ownerId, ...members.map((m) => m.userId).filter(Boolean) as string[]]);
    const tasks = await ctx.db.select().from(s.weddingTasks).where(eq(s.weddingTasks.projectId, id)).orderBy(asc(s.weddingTasks.createdAt));
    const events = await ctx.db.select().from(s.weddingEvents).where(eq(s.weddingEvents.projectId, id)).orderBy(asc(s.weddingEvents.startsAt));
    const budget = perms.includes('view_budget') || perms.includes('edit_budget') ? await ctx.db.select().from(s.weddingBudgetItems).where(eq(s.weddingBudgetItems.projectId, id)) : null;
    const guests = perms.includes('manage_guests') ? await ctx.db.select().from(s.weddingGuests).where(eq(s.weddingGuests.projectId, id)).orderBy(asc(s.weddingGuests.name)) : null;
    const inquiries = perms.includes('manage_vendors') ? await ctx.db.select({ i: s.vendorInquiries, v: s.vendors }).from(s.vendorInquiries).innerJoin(s.vendors, eq(s.vendors.id, s.vendorInquiries.vendorId)).where(eq(s.vendorInquiries.projectId, id)) : null;
    const quotes = inquiries?.length ? await ctx.db.select().from(s.vendorQuotes).where(inArray(s.vendorQuotes.inquiryId, inquiries.map((x) => x.i.id))) : [];
    const bookings = perms.includes('manage_vendors') ? await ctx.db.select().from(s.vendorBookings).where(eq(s.vendorBookings.projectId, id)) : [];
    const milestones = bookings.length ? await ctx.db.select().from(s.vendorPaymentMilestones).where(inArray(s.vendorPaymentMilestones.vendorBookingId, bookings.map((b) => b.id))).orderBy(asc(s.vendorPaymentMilestones.position)) : [];
    let couple = null;
    if (project.coupleBondId) {
      const [b] = await ctx.db.select().from(s.bonds).where(and(eq(s.bonds.id, project.coupleBondId), eq(s.bonds.status, 'active')));
      if (b && (b.ownerId === a.userId || b.partnerUserId === a.userId)) {
        const [x, y] = await Promise.all([bigThreeFor(ctx.db, b.ownerId), bigThreeFor(ctx.db, b.partnerUserId!)]);
        const n2 = await displayNames(ctx.db, [b.ownerId, b.partnerUserId!]);
        couple = { bondId: b.id, partners: [{ name: n2.get(b.ownerId)?.displayName, identity: x }, { name: n2.get(b.partnerUserId!)?.displayName, identity: y }] };
      }
    }
    const spent = budget?.reduce((acc, b) => acc + b.actualPaise, 0) ?? null;
    return {
      project, role, permissions: perms, couple,
      members: [{ userId: project.ownerId, role: 'owner', status: 'active', ...names.get(project.ownerId) }, ...members.map((m) => ({ id: m.id, userId: m.userId, role: m.role, permissions: m.permissions, status: m.status, inviteEmail: role === 'owner' ? m.inviteEmail : undefined, ...(m.userId ? names.get(m.userId) : {}) }))],
      tasks, events, budget, budgetSummary: budget ? { total: project.budgetPaise, spent, remaining: project.budgetPaise - (spent ?? 0) } : null,
      guests, guestSummary: guests ? { invited: guests.reduce((a2, g) => a2 + g.partySize, 0), attending: guests.filter((g) => g.rsvp === 'attending').reduce((a2, g) => a2 + g.partySize, 0), declined: guests.filter((g) => g.rsvp === 'declined').length, pending: guests.filter((g) => g.rsvp === 'pending').length } : null,
      vendors: inquiries?.map((x) => ({ inquiry: x.i, vendor: { id: x.v.id, name: x.v.name, category: x.v.category, verificationStatus: x.v.verificationStatus, isSample: x.v.isSample }, quotes: quotes.filter((q) => q.inquiryId === x.i.id), booking: bookings.find((b) => quotes.some((q) => q.id === b.quoteId && q.inquiryId === x.i.id)) ?? null })) ?? null,
      milestones, rituals: RITUAL_LIBRARY,
    };
  });

  app.patch('/api/v1/weddings/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { role } = await projectAccess(ctx.db, id, a.userId);
    if (role !== 'owner') throw forbidden('Only the project owner can change these details.');
    const body = parse(z.object({ title: z.string().min(3).max(100).optional(), weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), budgetPaise: z.number().int().min(0).optional(), status: z.enum(['planning', 'booked', 'completed', 'archived']).optional() }), req.body);
    const [p] = await ctx.db.update(s.weddingProjects).set(body).where(eq(s.weddingProjects.id, id)).returning();
    if (p.weddingDate && (body.status === 'completed' || body.weddingDate)) {
      for (let y = 1; y <= 3; y++) {
        const ann = DateTime.fromISO(p.weddingDate, { zone: p.timezone }).plus({ years: y }).set({ hour: 9 });
        const members = await ctx.db.select().from(s.weddingMembers).where(and(eq(s.weddingMembers.projectId, id), eq(s.weddingMembers.role, 'partner'), eq(s.weddingMembers.status, 'active')));
        for (const uid of [p.ownerId, ...members.map((m) => m.userId!).filter(Boolean)]) {
          await ctx.db.insert(s.scheduledReminders).values({ userId: uid, category: 'weddings', title: `Happy ${y === 1 ? '1st' : y === 2 ? '2nd' : '3rd'} anniversary ✦`, body: p.title, link: `/weddings/${id}`, dueAt: ann.toJSDate(), sourceKey: `anniversary:${id}:${y}` }).onConflictDoUpdate({ target: [s.scheduledReminders.userId, s.scheduledReminders.sourceKey], set: { dueAt: ann.toJSDate() } });
        }
      }
    }
    return { project: p };
  });

  app.post('/api/v1/weddings/:id/members', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { role } = await projectAccess(ctx.db, id, a.userId);
    if (role !== 'owner') throw forbidden('Only the project owner can invite people.');
    const body = parse(z.object({ email: z.email(), role: z.enum(['partner', 'family', 'planner']), permissions: z.array(z.enum(WEDDING_PERMISSIONS)) }), req.body);
    const token = randomToken(18);
    const [m] = await ctx.db.insert(s.weddingMembers).values({ projectId: id, inviteEmail: body.email.toLowerCase(), tokenHash: sha256(token), role: body.role, permissions: body.permissions, status: 'invited' }).returning();
    await sendEmail(ctx, ctx.db, body.email, 'You’re invited to help plan a wedding on Nakshatra', `Join as ${body.role}: ${ctx.config.APP_ORIGIN}/weddings/join/${token}`);
    await audit(ctx.db, { actorId: a.userId, action: 'wedding.member_invite', targetType: 'wedding_project', targetId: id, meta: { role: body.role, permissions: body.permissions } });
    return { member: { id: m.id }, joinUrl: `${ctx.config.APP_ORIGIN}/weddings/join/${token}` };
  });

  app.post('/api/v1/weddings/join', async (req) => {
    const a = requireAuth(req);
    const { token } = parse(z.object({ token: z.string().min(10) }), req.body);
    const [m] = await ctx.db.select().from(s.weddingMembers).where(and(eq(s.weddingMembers.tokenHash, sha256(token)), eq(s.weddingMembers.status, 'invited')));
    if (!m) throw notFound('Invitation');
    if (m.inviteEmail !== a.email.toLowerCase()) throw forbidden('This invitation was sent to a different email address.');
    await ctx.db.update(s.weddingMembers).set({ status: 'active', userId: a.userId, tokenHash: null }).where(eq(s.weddingMembers.id, m.id));
    const [p] = await ctx.db.select().from(s.weddingProjects).where(eq(s.weddingProjects.id, m.projectId));
    await notify(ctx, ctx.db, { userId: p.ownerId, category: 'weddings', title: `A ${m.role} joined ${p.title}`, link: `/weddings/${p.id}` });
    return { projectId: m.projectId };
  });

  app.patch('/api/v1/weddings/:id/members/:memberId', async (req) => {
    const a = requireAuth(req);
    const { id, memberId } = parse(z.object({ id: z.uuid(), memberId: z.uuid() }), req.params);
    const { role } = await projectAccess(ctx.db, id, a.userId);
    if (role !== 'owner') throw forbidden('Only the project owner can change permissions.');
    const body = parse(z.object({ permissions: z.array(z.enum(WEDDING_PERMISSIONS)).optional(), revoke: z.boolean().optional() }), req.body);
    const [m] = await ctx.db.update(s.weddingMembers).set({ ...(body.permissions ? { permissions: body.permissions } : {}), ...(body.revoke ? { status: 'revoked' } : {}) }).where(and(eq(s.weddingMembers.id, memberId), eq(s.weddingMembers.projectId, id))).returning();
    if (!m) throw notFound('Member');
    await audit(ctx.db, { actorId: a.userId, action: body.revoke ? 'wedding.member_revoke' : 'wedding.member_permissions', targetType: 'wedding_project', targetId: id, meta: { memberId, permissions: body.permissions } });
    return { ok: true };
  });

  /* ---------- Tasks, budget, events ---------- */
  app.post('/api/v1/weddings/:id/tasks', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_tasks');
    const body = parse(z.object({ title: z.string().trim().min(1).max(160), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), assigneeId: z.uuid().optional() }), req.body);
    const [t] = await ctx.db.insert(s.weddingTasks).values({ ...body, projectId: id, createdBy: a.userId }).returning();
    if (body.assigneeId && body.assigneeId !== a.userId) await notify(ctx, ctx.db, { userId: body.assigneeId, category: 'weddings', title: `New wedding task: ${body.title}`, link: `/weddings/${id}` });
    if (body.dueDate && body.assigneeId) await ctx.db.insert(s.scheduledReminders).values({ userId: body.assigneeId, category: 'weddings', title: `Task due: ${body.title}`, link: `/weddings/${id}`, dueAt: DateTime.fromISO(body.dueDate).set({ hour: 9 }).toJSDate(), sourceKey: `wtask:${t.id}` }).onConflictDoNothing();
    return { task: t };
  });

  app.patch('/api/v1/weddings/:id/tasks/:taskId', async (req) => {
    const a = requireAuth(req);
    const { id, taskId } = parse(z.object({ id: z.uuid(), taskId: z.uuid() }), req.params);
    const { perms } = await projectAccess(ctx.db, id, a.userId);
    const body = parse(z.object({ status: z.enum(['todo', 'doing', 'done']).optional(), title: z.string().max(160).optional(), dueDate: z.string().nullable().optional(), assigneeId: z.uuid().nullable().optional() }), req.body);
    const [t0] = await ctx.db.select().from(s.weddingTasks).where(and(eq(s.weddingTasks.id, taskId), eq(s.weddingTasks.projectId, id)));
    if (!t0) throw notFound('Task');
    const onlyStatus = Object.keys(body).every((k) => k === 'status');
    if (!perms.includes('manage_tasks') && !(onlyStatus && t0.assigneeId === a.userId)) throw forbidden('You can only update tasks assigned to you.');
    const [t] = await ctx.db.update(s.weddingTasks).set(body).where(eq(s.weddingTasks.id, taskId)).returning();
    return { task: t };
  });

  app.delete('/api/v1/weddings/:id/tasks/:taskId', async (req) => {
    const a = requireAuth(req);
    const { id, taskId } = parse(z.object({ id: z.uuid(), taskId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_tasks');
    await ctx.db.delete(s.weddingTasks).where(and(eq(s.weddingTasks.id, taskId), eq(s.weddingTasks.projectId, id)));
    return { ok: true };
  });

  app.post('/api/v1/weddings/:id/budget', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'edit_budget');
    const body = parse(z.object({ itemId: z.uuid().optional(), category: z.string().min(2).max(40), label: z.string().min(1).max(100), estimatedPaise: z.number().int().min(0), actualPaise: z.number().int().min(0).default(0), paidPaise: z.number().int().min(0).default(0) }), req.body);
    if (body.itemId) {
      const { itemId, ...rest } = body;
      const [b] = await ctx.db.update(s.weddingBudgetItems).set(rest).where(and(eq(s.weddingBudgetItems.id, itemId), eq(s.weddingBudgetItems.projectId, id))).returning();
      if (!b) throw notFound('Budget item');
      return { item: b };
    }
    const [b] = await ctx.db.insert(s.weddingBudgetItems).values({ ...body, projectId: id }).returning();
    return { item: b };
  });

  app.delete('/api/v1/weddings/:id/budget/:itemId', async (req) => {
    const a = requireAuth(req);
    const { id, itemId } = parse(z.object({ id: z.uuid(), itemId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'edit_budget');
    await ctx.db.delete(s.weddingBudgetItems).where(and(eq(s.weddingBudgetItems.id, itemId), eq(s.weddingBudgetItems.projectId, id)));
    return { ok: true };
  });

  app.post('/api/v1/weddings/:id/events', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_tasks');
    const body = parse(z.object({ title: z.string().min(2).max(100), startsAt: z.iso.datetime({ offset: true }), location: z.string().max(200).default(''), muhuratNote: z.string().max(300).optional() }), req.body);
    const [e] = await ctx.db.insert(s.weddingEvents).values({ ...body, projectId: id, startsAt: new Date(body.startsAt) }).returning();
    return { event: e };
  });

  app.delete('/api/v1/weddings/:id/events/:eventId', async (req) => {
    const a = requireAuth(req);
    const { id, eventId } = parse(z.object({ id: z.uuid(), eventId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_tasks');
    await ctx.db.delete(s.weddingEvents).where(and(eq(s.weddingEvents.id, eventId), eq(s.weddingEvents.projectId, id)));
    return { ok: true };
  });

  /* ---------- Guests & RSVP ---------- */
  app.post('/api/v1/weddings/:id/guests', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_guests');
    const body = parse(z.object({ name: z.string().trim().min(1).max(100), email: z.email().optional(), phone: z.string().max(20).optional(), side: z.enum(['bride', 'groom', 'both', 'partner_a', 'partner_b']).default('both'), partySize: z.number().int().min(1).max(20).default(1) }), req.body);
    const [g] = await ctx.db.insert(s.weddingGuests).values({ ...body, projectId: id, rsvpTokenHash: sha256(randomToken(18)) }).returning();
    return { guest: g };
  });

  app.delete('/api/v1/weddings/:id/guests/:guestId', async (req) => {
    const a = requireAuth(req);
    const { id, guestId } = parse(z.object({ id: z.uuid(), guestId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_guests');
    await ctx.db.delete(s.weddingGuests).where(and(eq(s.weddingGuests.id, guestId), eq(s.weddingGuests.projectId, id)));
    return { ok: true };
  });

  app.post('/api/v1/weddings/:id/guests/:guestId/invite', async (req) => {
    const a = requireAuth(req);
    const { id, guestId } = parse(z.object({ id: z.uuid(), guestId: z.uuid() }), req.params);
    const { project } = await projectAccess(ctx.db, id, a.userId, 'manage_guests');
    const [g] = await ctx.db.select().from(s.weddingGuests).where(and(eq(s.weddingGuests.id, guestId), eq(s.weddingGuests.projectId, id)));
    if (!g) throw notFound('Guest');
    const token = randomToken(18);
    await ctx.db.update(s.weddingGuests).set({ rsvpTokenHash: sha256(token), invitedAt: new Date() }).where(eq(s.weddingGuests.id, guestId));
    const url = `${ctx.config.APP_ORIGIN}/rsvp/${token}`;
    if (g.email) await sendEmail(ctx, ctx.db, g.email, `You’re invited: ${project.title}`, `Dear ${g.name},\n\nYou are warmly invited${project.weddingDate ? ` on ${DateTime.fromISO(project.weddingDate).toFormat('d LLLL yyyy')}` : ''}${project.city ? ` in ${project.city}` : ''}.\n\nPlease RSVP: ${url}`);
    return { rsvpUrl: url, emailed: Boolean(g.email) };
  });

  app.get('/api/v1/rsvp/:token', async (req) => {
    const { token } = parse(z.object({ token: z.string().min(10) }), req.params);
    const [g] = await ctx.db.select().from(s.weddingGuests).where(eq(s.weddingGuests.rsvpTokenHash, sha256(token)));
    if (!g) throw notFound('Invitation');
    const [p] = await ctx.db.select().from(s.weddingProjects).where(eq(s.weddingProjects.id, g.projectId));
    const events = await ctx.db.select({ title: s.weddingEvents.title, startsAt: s.weddingEvents.startsAt, location: s.weddingEvents.location }).from(s.weddingEvents).where(eq(s.weddingEvents.projectId, p.id)).orderBy(asc(s.weddingEvents.startsAt));
    return { guest: { name: g.name, partySize: g.partySize, rsvp: g.rsvp, dietary: g.dietary }, wedding: { title: p.title, date: p.weddingDate, city: p.city }, events };
  });

  app.post('/api/v1/rsvp/:token', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const { token } = parse(z.object({ token: z.string().min(10) }), req.params);
    const body = parse(z.object({ rsvp: z.enum(['attending', 'declined', 'maybe']), partySize: z.number().int().min(1).max(20).optional(), dietary: z.string().max(200).optional() }), req.body);
    const [g] = await ctx.db.select().from(s.weddingGuests).where(eq(s.weddingGuests.rsvpTokenHash, sha256(token)));
    if (!g) throw notFound('Invitation');
    if (body.partySize && body.partySize > g.partySize) throw badRequest(`This invitation is for up to ${g.partySize} guest(s).`);
    await ctx.db.update(s.weddingGuests).set({ rsvp: body.rsvp, partySize: body.partySize ?? g.partySize, dietary: body.dietary ?? g.dietary, respondedAt: new Date() }).where(eq(s.weddingGuests.id, g.id));
    const [p] = await ctx.db.select().from(s.weddingProjects).where(eq(s.weddingProjects.id, g.projectId));
    await notify(ctx, ctx.db, { userId: p.ownerId, category: 'weddings', title: `RSVP: ${g.name} — ${body.rsvp}`, link: `/weddings/${p.id}` });
    return { ok: true };
  });

  /* ---------- Vendors ---------- */
  app.get('/api/v1/vendors', async (req) => {
    const q = parse(z.object({ category: z.enum(VENDOR_CATEGORIES).optional(), city: z.string().max(80).optional(), q: z.string().max(80).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query);
    const rows = await ctx.db.select().from(s.vendors).where(and(eq(s.vendors.verificationStatus, 'verified'), q.category ? eq(s.vendors.category, q.category) : undefined,
      q.city ? sql`${s.vendors.city} ilike ${'%' + q.city + '%'}` : undefined, q.q ? sql`(${s.vendors.name} ilike ${'%' + q.q + '%'} or ${s.vendors.description} ilike ${'%' + q.q + '%'})` : undefined));
    const busy = q.date && rows.length ? await ctx.db.select().from(s.vendorUnavailability).where(and(eq(s.vendorUnavailability.date, q.date), inArray(s.vendorUnavailability.vendorId, rows.map((r) => r.id)))) : [];
    const ratings = rows.length ? await ctx.db.select({ id: s.reviews.subjectId, avg: sql<number>`avg(${s.reviews.rating})::float`, n: sql<number>`count(*)::int` }).from(s.reviews).where(and(eq(s.reviews.subjectType, 'vendor'), inArray(s.reviews.subjectId, rows.map((r) => r.id)))).groupBy(s.reviews.subjectId) : [];
    return { vendors: rows.map((v) => ({ ...v, availableOnDate: q.date ? !busy.some((b) => b.vendorId === v.id) : null, rating: ratings.find((r) => r.id === v.id) ?? null })).sort((x, y) => Number(y.availableOnDate ?? 1) - Number(x.availableOnDate ?? 1) || (y.rating?.avg ?? 0) - (x.rating?.avg ?? 0) || x.name.localeCompare(y.name)), categories: VENDOR_CATEGORIES };
  });

  app.get('/api/v1/vendors/:id', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [v] = await ctx.db.select().from(s.vendors).where(eq(s.vendors.id, id));
    if (!v || (v.verificationStatus !== 'verified' && v.ownerId !== req.auth?.userId)) throw notFound('Vendor');
    const reviews = await ctx.db.select().from(s.reviews).where(and(eq(s.reviews.subjectType, 'vendor'), eq(s.reviews.subjectId, id), eq(s.reviews.status, 'published'))).limit(20);
    const busy = await ctx.db.select({ date: s.vendorUnavailability.date }).from(s.vendorUnavailability).where(and(eq(s.vendorUnavailability.vendorId, id), sql`${s.vendorUnavailability.date} >= current_date`));
    return { vendor: v, reviews, unavailableDates: busy.map((b) => b.date) };
  });

  app.post('/api/v1/weddings/:id/inquiries', { config: { rateLimit: { max: 30, timeWindow: '1 day' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { project } = await projectAccess(ctx.db, id, a.userId, 'manage_vendors');
    const body = parse(z.object({ vendorId: z.uuid(), message: z.string().trim().min(10).max(2000), eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), guestCount: z.number().int().min(1).max(10000).optional() }), req.body);
    const [v] = await ctx.db.select().from(s.vendors).where(and(eq(s.vendors.id, body.vendorId), eq(s.vendors.verificationStatus, 'verified')));
    if (!v) throw notFound('Vendor');
    const inq = await ctx.db.transaction(async (tx) => {
      const [i] = await tx.insert(s.vendorInquiries).values({ projectId: id, vendorId: v.id, createdBy: a.userId, message: body.message, eventDate: body.eventDate ?? project.weddingDate, guestCount: body.guestCount }).returning();
      const conv = await createConversation(tx, 'vendor', a.userId, [a.userId, v.ownerId], i.id);
      await tx.insert(s.messages).values({ conversationId: conv, senderId: a.userId, body: body.message });
      await tx.update(s.vendorInquiries).set({ conversationId: conv }).where(eq(s.vendorInquiries.id, i.id));
      return { ...i, conversationId: conv };
    });
    await notify(ctx, ctx.db, { userId: v.ownerId, category: 'weddings', title: `New inquiry for ${v.name}`, body: body.message.slice(0, 80), link: '/vendor/dashboard' });
    await track(ctx.db, a.userId, 'wedding_inquiry_created', { category: v.category });
    return { inquiry: inq };
  });

  app.post('/api/v1/weddings/:id/quotes/:quoteId/respond', async (req) => {
    const a = requireAuth(req);
    const { id, quoteId } = parse(z.object({ id: z.uuid(), quoteId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_vendors');
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body);
    const [q] = await ctx.db.select({ q: s.vendorQuotes, i: s.vendorInquiries }).from(s.vendorQuotes).innerJoin(s.vendorInquiries, eq(s.vendorInquiries.id, s.vendorQuotes.inquiryId)).where(and(eq(s.vendorQuotes.id, quoteId), eq(s.vendorInquiries.projectId, id)));
    if (!q || q.q.status !== 'sent') throw notFound('Quotation');
    if (q.q.validUntil && q.q.validUntil < DateTime.now().toISODate()!) {
      await ctx.db.update(s.vendorQuotes).set({ status: 'expired' }).where(eq(s.vendorQuotes.id, quoteId));
      throw badRequest('This quotation has expired. Ask the vendor for a new one.');
    }
    if (!accept) {
      await ctx.db.update(s.vendorQuotes).set({ status: 'declined' }).where(eq(s.vendorQuotes.id, quoteId));
      return { ok: true };
    }
    if (q.i.eventDate) {
      const busy = await ctx.db.select().from(s.vendorUnavailability).where(and(eq(s.vendorUnavailability.vendorId, q.i.vendorId), eq(s.vendorUnavailability.date, q.i.eventDate)));
      if (busy.length) throw conflict('The vendor is no longer available on this date.');
    }
    const booking = await ctx.db.transaction(async (tx) => {
      await tx.update(s.vendorQuotes).set({ status: 'accepted' }).where(eq(s.vendorQuotes.id, quoteId));
      const [vb] = await tx.insert(s.vendorBookings).values({ quoteId, projectId: id, vendorId: q.i.vendorId, status: 'pending_deposit', totalPaise: q.q.amountPaise }).returning();
      const ms = q.q.milestones as { label: string; percent: number }[];
      let allocated = 0;
      await tx.insert(s.vendorPaymentMilestones).values(ms.map((m, i) => {
        const amt = i === ms.length - 1 ? q.q.amountPaise - allocated : Math.round((q.q.amountPaise * m.percent) / 100);
        allocated += amt;
        return { vendorBookingId: vb.id, label: m.label, amountPaise: amt, position: i };
      }));
      if (q.i.conversationId) await postSystemMessage(tx, q.i.conversationId, 'Quotation accepted. The booking is confirmed once the first payment milestone is paid.');
      return vb;
    });
    const [v] = await ctx.db.select().from(s.vendors).where(eq(s.vendors.id, q.i.vendorId));
    await notify(ctx, ctx.db, { userId: v.ownerId, category: 'weddings', title: 'Your quotation was accepted', link: '/vendor/dashboard' });
    return { booking };
  });

  app.post('/api/v1/weddings/:id/milestones/:milestoneId/pay', async (req) => {
    const a = requireAuth(req);
    const { id, milestoneId } = parse(z.object({ id: z.uuid(), milestoneId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_vendors');
    const [m] = await ctx.db.select({ m: s.vendorPaymentMilestones, b: s.vendorBookings }).from(s.vendorPaymentMilestones).innerJoin(s.vendorBookings, eq(s.vendorBookings.id, s.vendorPaymentMilestones.vendorBookingId)).where(and(eq(s.vendorPaymentMilestones.id, milestoneId), eq(s.vendorBookings.projectId, id)));
    if (!m || m.m.status !== 'due') throw notFound('Payment milestone');
    if (['cancelled', 'disputed'].includes(m.b.status)) throw conflict('This booking is not payable.');
    const checkout = await createPayment(ctx, ctx.db, { userId: a.userId, purpose: 'vendor_milestone', purposeId: m.m.id, amountPaise: m.m.amountPaise, idempotencyKey: `vendor-milestone:${m.m.id}` });
    return { checkout };
  });

  app.post('/api/v1/weddings/:id/vendor-bookings/:bookingId/cancel', async (req) => {
    const a = requireAuth(req);
    const { id, bookingId } = parse(z.object({ id: z.uuid(), bookingId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_vendors');
    const { reason } = parse(z.object({ reason: z.string().min(5).max(500) }), req.body);
    const [vb] = await ctx.db.select().from(s.vendorBookings).where(and(eq(s.vendorBookings.id, bookingId), eq(s.vendorBookings.projectId, id)));
    if (!vb || ['cancelled', 'completed'].includes(vb.status)) throw notFound('Booking');
    await ctx.db.update(s.vendorBookings).set({ status: 'cancelled' }).where(eq(s.vendorBookings.id, bookingId));
    const paid = await ctx.db.select().from(s.vendorPaymentMilestones).where(and(eq(s.vendorPaymentMilestones.vendorBookingId, bookingId), eq(s.vendorPaymentMilestones.status, 'paid')));
    const refundRequests = [];
    for (const m of paid) if (m.paymentId) refundRequests.push(await requestRefund(ctx, ctx.db, { paymentId: m.paymentId, amountPaise: m.amountPaise, reason: `Vendor booking cancelled: ${reason}`, requestedBy: a.userId, idempotencyKey: `vendor-cancel:${m.id}` }));
    const [v] = await ctx.db.select().from(s.vendors).where(eq(s.vendors.id, vb.vendorId));
    await notify(ctx, ctx.db, { userId: v.ownerId, category: 'weddings', title: 'A booking was cancelled', body: reason, link: '/vendor/dashboard' });
    return { ok: true, refundRequests, note: refundRequests.length ? 'Refund requests for paid milestones were sent for review under the vendor’s cancellation terms.' : undefined };
  });

  app.post('/api/v1/weddings/:id/vendor-bookings/:bookingId/dispute', async (req) => {
    const a = requireAuth(req);
    const { id, bookingId } = parse(z.object({ id: z.uuid(), bookingId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_vendors');
    const body = parse(z.object({ reason: z.string().min(3).max(100), details: z.string().max(2000).default('') }), req.body);
    const [vb] = await ctx.db.select().from(s.vendorBookings).where(and(eq(s.vendorBookings.id, bookingId), eq(s.vendorBookings.projectId, id)));
    if (!vb) throw notFound('Booking');
    await ctx.db.update(s.vendorBookings).set({ status: 'disputed' }).where(eq(s.vendorBookings.id, bookingId));
    const [d] = await ctx.db.insert(s.disputes).values({ subjectType: 'vendor_booking', subjectId: bookingId, raisedBy: a.userId, ...body }).returning();
    return { dispute: d };
  });

  app.post('/api/v1/weddings/:id/vendor-bookings/:bookingId/review', async (req) => {
    const a = requireAuth(req);
    const { id, bookingId } = parse(z.object({ id: z.uuid(), bookingId: z.uuid() }), req.params);
    await projectAccess(ctx.db, id, a.userId, 'manage_vendors');
    const body = parse(z.object({ rating: z.number().int().min(1).max(5), body: z.string().max(1500).default('') }), req.body);
    const [vb] = await ctx.db.select().from(s.vendorBookings).where(and(eq(s.vendorBookings.id, bookingId), eq(s.vendorBookings.projectId, id), inArray(s.vendorBookings.status, ['confirmed', 'completed'])));
    if (!vb) throw forbidden('Only booked vendors can be reviewed.');
    const res = await ctx.db.insert(s.reviews).values({ subjectType: 'vendor', subjectId: vb.vendorId, sourceId: vb.id, authorId: a.userId, ...body }).onConflictDoNothing().returning();
    if (!res.length) throw conflict('Already reviewed.');
    return { review: res[0] };
  });

  /* ---------- Vendor side ---------- */
  app.get('/api/v1/vendor/me', async (req) => {
    const a = requireAuth(req);
    const vs = await ctx.db.select().from(s.vendors).where(eq(s.vendors.ownerId, a.userId));
    const inquiries = vs.length ? await ctx.db.select().from(s.vendorInquiries).where(inArray(s.vendorInquiries.vendorId, vs.map((v) => v.id))).orderBy(desc(s.vendorInquiries.createdAt)) : [];
    const quotes = inquiries.length ? await ctx.db.select().from(s.vendorQuotes).where(inArray(s.vendorQuotes.inquiryId, inquiries.map((i) => i.id))) : [];
    const bookings = vs.length ? await ctx.db.select().from(s.vendorBookings).where(inArray(s.vendorBookings.vendorId, vs.map((v) => v.id))) : [];
    const ms = bookings.length ? await ctx.db.select().from(s.vendorPaymentMilestones).where(inArray(s.vendorPaymentMilestones.vendorBookingId, bookings.map((b) => b.id))) : [];
    const projects = inquiries.length ? await ctx.db.select({ id: s.weddingProjects.id, title: s.weddingProjects.title, city: s.weddingProjects.city }).from(s.weddingProjects).where(inArray(s.weddingProjects.id, inquiries.map((i) => i.projectId))) : [];
    return { vendors: vs, inquiries: inquiries.map((i) => ({ ...i, project: projects.find((p) => p.id === i.projectId), quotes: quotes.filter((q) => q.inquiryId === i.id) })), bookings: bookings.map((b) => ({ ...b, milestones: ms.filter((m) => m.vendorBookingId === b.id) })) };
  });

  app.post('/api/v1/vendor/listings', async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email to list a business.');
    const body = parse(z.object({ name: z.string().trim().min(2).max(100), category: z.enum(VENDOR_CATEGORIES), placeId: z.string(), description: z.string().max(3000).default(''), priceFromPaise: z.number().int().min(0).optional(), priceToPaise: z.number().int().min(0).optional(), languages: z.array(z.string().max(30)).max(8).default([]) }), req.body);
    const place = placeById(body.placeId);
    if (!place) throw badRequest('Choose your city.');
    const { placeId: _p, ...rest } = body;
    const [v] = await ctx.db.insert(s.vendors).values({ ...rest, city: place.label, ownerId: a.userId, verificationStatus: 'pending' }).returning();
    await ctx.db.insert(s.verificationRequests).values({ userId: a.userId, kind: 'vendor', evidence: [], note: `Vendor listing ${v.name}` });
    return { vendor: v, note: 'Your listing will appear once our team has verified your business.' };
  });

  app.post('/api/v1/vendor/listings/:id/images', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const v = await vendorOwned(ctx.db, id, a.userId);
    const file = await req.file();
    if (!file) throw badRequest('No file');
    const saved = await storage.save(await file.toBuffer(), { allowed: IMAGE_TYPES, isPrivate: false, maxBytes: ctx.config.MAX_UPLOAD_MB * 1048576 });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'vendor_image', path: saved.path, mime: saved.mime, bytes: saved.bytes });
    await ctx.db.update(s.vendors).set({ images: [...v.images, `/uploads/${saved.path}`] }).where(eq(s.vendors.id, id));
    return { ok: true };
  });

  app.post('/api/v1/vendor/listings/:id/unavailability', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await vendorOwned(ctx.db, id, a.userId);
    const { date, remove } = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), remove: z.boolean().optional() }), req.body);
    if (remove) await ctx.db.delete(s.vendorUnavailability).where(and(eq(s.vendorUnavailability.vendorId, id), eq(s.vendorUnavailability.date, date), eq(s.vendorUnavailability.reason, 'blocked')));
    else await ctx.db.insert(s.vendorUnavailability).values({ vendorId: id, date, reason: 'blocked' }).onConflictDoNothing();
    return { ok: true };
  });

  app.post('/api/v1/vendor/inquiries/:id/quote', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ amountPaise: z.number().int().min(100), details: z.string().trim().min(10).max(3000), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), milestones: z.array(z.object({ label: z.string().min(2).max(60), percent: z.number().int().min(1).max(100) })).min(1).max(5) }), req.body);
    if (body.milestones.reduce((x, m) => x + m.percent, 0) !== 100) throw badRequest('Payment milestones must add up to 100%.');
    const [inq] = await ctx.db.select().from(s.vendorInquiries).where(eq(s.vendorInquiries.id, id));
    if (!inq) throw notFound('Inquiry');
    await vendorOwned(ctx.db, inq.vendorId, a.userId);
    if (['booked', 'closed', 'declined'].includes(inq.status)) throw conflict('This inquiry is closed.');
    const q = await ctx.db.transaction(async (tx) => {
      await tx.update(s.vendorQuotes).set({ status: 'superseded' }).where(and(eq(s.vendorQuotes.inquiryId, id), eq(s.vendorQuotes.status, 'sent')));
      const [row] = await tx.insert(s.vendorQuotes).values({ inquiryId: id, ...body }).returning();
      await tx.update(s.vendorInquiries).set({ status: 'quoted' }).where(eq(s.vendorInquiries.id, id));
      if (inq.conversationId) await postSystemMessage(tx, inq.conversationId, `Quotation sent: ₹${(body.amountPaise / 100).toLocaleString('en-IN')}.`);
      return row;
    });
    await notify(ctx, ctx.db, { userId: inq.createdBy, category: 'weddings', title: 'You received a quotation', link: `/weddings/${inq.projectId}` });
    return { quote: q };
  });

  app.post('/api/v1/vendor/inquiries/:id/decline', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [inq] = await ctx.db.select().from(s.vendorInquiries).where(eq(s.vendorInquiries.id, id));
    if (!inq) throw notFound('Inquiry');
    await vendorOwned(ctx.db, inq.vendorId, a.userId);
    await ctx.db.update(s.vendorInquiries).set({ status: 'declined' }).where(eq(s.vendorInquiries.id, id));
    await notify(ctx, ctx.db, { userId: inq.createdBy, category: 'weddings', title: 'A vendor declined your inquiry', link: `/weddings/${inq.projectId}` });
    return { ok: true };
  });

  app.post('/api/v1/vendor/bookings/:id/complete', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [vb] = await ctx.db.select().from(s.vendorBookings).where(eq(s.vendorBookings.id, id));
    if (!vb) throw notFound('Booking');
    await vendorOwned(ctx.db, vb.vendorId, a.userId);
    if (vb.status !== 'confirmed') throw conflict('Only confirmed bookings can be completed.');
    await ctx.db.update(s.vendorBookings).set({ status: 'completed' }).where(eq(s.vendorBookings.id, id));
    return { ok: true };
  });

  void isNull;
}
