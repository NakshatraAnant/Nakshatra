import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DateTime } from 'luxon';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { notify } from '../lib/notify';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames } from '../services/identity';
import { circleMembership, isAdmin, requireCircle } from '../services/circles';
import { materialiseSeries } from '../services/circleSpaces';
import { FREQUENCIES, RECURRENCE_RULES as RR } from '../../shared/recurrence';

/** Circle channels, circle events (one-off and recurring) and the circle moderator dashboard. */
export async function circleSpaceRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;

  async function requireCircleAdmin(circleId: string, userId: string) {
    const r = await requireCircle(db, circleId, userId);
    if (!isAdmin(r.member)) throw forbidden('Only circle owners and moderators can do that.');
    return r;
  }
  async function screen(texts: string[]) {
    const phrases = await blockedPhrases(db);
    for (const t of texts.filter(Boolean)) { const r = screenText(t, phrases); if (!r.ok) throw badRequest(r.reason!); }
  }

  /* ---------------- Channels ---------------- */

  app.get('/api/v1/circles/:id/channels', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(db, id, a.userId);
    const rows = await db.select().from(s.circleChannels).where(and(eq(s.circleChannels.circleId, id), isNull(s.circleChannels.archivedAt))).orderBy(asc(s.circleChannels.position), asc(s.circleChannels.createdAt));
    const since = new Date(Date.now() - 7 * 864e5);
    const activity = await db.select({ c: s.posts.channelId, n: sql<number>`count(*)::int` }).from(s.posts).where(and(eq(s.posts.groupId, id), isNull(s.posts.deletedAt), gte(s.posts.createdAt, since))).groupBy(s.posts.channelId);
    const canPost = (kind: string) => kind !== 'announcements' || isAdmin(member);
    return {
      channels: [
        { id: null, name: 'General', description: 'Everything else.', kind: 'discussion', canPost: true, postsThisWeek: activity.find((x) => x.c === null)?.n ?? 0 },
        ...rows.map((c) => ({ id: c.id, name: c.name, description: c.description, kind: c.kind, canPost: canPost(c.kind), postsThisWeek: activity.find((x) => x.c === c.id)?.n ?? 0 })),
      ],
      canManage: isAdmin(member),
      max: RR.maxChannels,
    };
  });

  const ChannelBody = z.object({ name: z.string().trim().min(2).max(30).regex(/^[\p{L}\p{N} _-]+$/u, 'Use letters, numbers, spaces, - or _.'), description: z.string().trim().max(140).default(''), kind: z.enum(['discussion', 'announcements']).default('discussion') });

  app.post('/api/v1/circles/:id/channels', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const body = parse(ChannelBody, req.body);
    await screen([body.name, body.description]);
    if (body.name.toLowerCase() === 'general') throw badRequest('Every circle already has General.');
    const existing = await db.select().from(s.circleChannels).where(and(eq(s.circleChannels.circleId, id), isNull(s.circleChannels.archivedAt)));
    if (existing.length >= RR.maxChannels) throw conflict(`A circle can have up to ${RR.maxChannels} channels.`);
    if (existing.some((c) => c.name.toLowerCase() === body.name.toLowerCase())) throw conflict('There is already a channel with that name.');
    const [c] = await db.insert(s.circleChannels).values({ circleId: id, ...body, position: existing.length + 1, createdBy: a.userId }).returning();
    await audit(db, { actorId: a.userId, action: 'circle.channel_created', targetType: 'group', targetId: id, meta: { name: c.name } });
    return reply.code(201).send({ channel: { id: c.id, name: c.name } });
  });

  app.patch('/api/v1/circles/:id/channels/:channelId', async (req) => {
    const a = requireAuth(req);
    const { id, channelId } = parse(z.object({ id: z.uuid(), channelId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const body = parse(ChannelBody.partial().extend({ archived: z.boolean().optional() }), req.body);
    await screen([body.name ?? '', body.description ?? '']);
    const { archived, ...rest } = body;
    const [c] = await db.update(s.circleChannels).set({ ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
      .where(and(eq(s.circleChannels.id, channelId), eq(s.circleChannels.circleId, id))).returning();
    if (!c) throw notFound('Channel');
    // Archiving keeps the posts; they show up in General again.
    if (archived) await db.update(s.posts).set({ channelId: null }).where(and(eq(s.posts.groupId, id), eq(s.posts.channelId, channelId)));
    await audit(db, { actorId: a.userId, action: archived ? 'circle.channel_archived' : 'circle.channel_updated', targetType: 'group', targetId: id, meta: { name: c.name } });
    return { ok: true };
  });

  /* ---------------- Events ---------------- */

  app.get('/api/v1/circles/:id/events', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircle(db, id, a.userId);
    const rows = await db.select().from(s.events).where(and(eq(s.events.groupId, id), gt(s.events.endsAt, new Date()))).orderBy(asc(s.events.startsAt)).limit(40);
    const ids = rows.map((r) => r.id);
    const mine = ids.length ? await db.select().from(s.eventRsvps).where(and(eq(s.eventRsvps.userId, a.userId), inArray(s.eventRsvps.eventId, ids))) : [];
    const counts = ids.length ? await db.select({ e: s.eventRsvps.eventId, n: sql<number>`count(*)::int` }).from(s.eventRsvps).where(and(inArray(s.eventRsvps.eventId, ids), eq(s.eventRsvps.status, 'going'))).groupBy(s.eventRsvps.eventId) : [];
    const series = await db.select().from(s.eventSeries).where(and(eq(s.eventSeries.circleId, id), isNull(s.eventSeries.endedAt)));
    const names = await displayNames(db, rows.map((r) => r.hostId));
    return {
      canManage: isAdmin(member),
      events: rows.map((e) => {
        const r = mine.find((x) => x.eventId === e.id);
        const sr = series.find((x) => x.id === e.seriesId);
        return { id: e.id, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt, mode: e.mode, location: e.location, liveUrl: r?.status === 'going' ? e.liveUrl : null, capacity: e.capacity, status: e.status, host: names.get(e.hostId)?.displayName ?? 'Member', going: counts.find((c) => c.e === e.id)?.n ?? 0, myRsvp: r?.status ?? null, seriesId: e.seriesId, repeats: sr?.frequency ?? null };
      }),
      series: series.map((x) => ({ id: x.id, title: x.title, frequency: x.frequency, until: x.until })),
    };
  });

  app.post('/api/v1/circles/:id/events', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { circle } = await requireCircleAdmin(id, a.userId);
    const body = parse(z.object({
      title: z.string().trim().min(3).max(100), description: z.string().trim().max(1000).default(''),
      startsAt: z.iso.datetime(), durationMinutes: z.number().int().min(15).max(12 * 60).default(60),
      mode: z.enum(['online', 'in_person']), location: z.string().trim().max(200).optional(), liveUrl: z.url().startsWith('https://').optional(),
      capacity: z.number().int().min(2).max(500).optional(),
      repeat: z.enum(['none', ...FREQUENCIES]).default('none'), until: z.iso.datetime().optional(), timezone: z.string().max(60).default('Asia/Kolkata'),
    }), req.body);
    await screen([body.title, body.description, body.location ?? '']);
    const startsAt = new Date(body.startsAt);
    if (startsAt.getTime() < Date.now() + 5 * 60000) throw badRequest('Pick a start time in the future.');
    if (startsAt.getTime() > Date.now() + 365 * 864e5) throw badRequest('Pick a date within the next year.');
    if (!DateTime.local().setZone(body.timezone).isValid) throw badRequest('Unknown time zone.');
    const common = { title: body.title, description: body.description, mode: body.mode, location: body.location ?? null, liveUrl: body.liveUrl ?? null, capacity: body.capacity ?? null };
    let eventId: string | null = null;
    let seriesId: string | null = null;
    if (body.repeat === 'none') {
      const [e] = await db.insert(s.events).values({ ...common, hostId: a.userId, groupId: id, startsAt, endsAt: new Date(startsAt.getTime() + body.durationMinutes * 60000), kind: 'community' }).returning();
      eventId = e.id;
    } else {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.eventSeries).where(and(eq(s.eventSeries.circleId, id), isNull(s.eventSeries.endedAt)));
      if (n >= RR.maxSeriesPerCircle) throw conflict(`A circle can run up to ${RR.maxSeriesPerCircle} repeating events.`);
      const until = body.until ? new Date(body.until) : null;
      if (until && until <= startsAt) throw badRequest('The end date must be after the first event.');
      const [sr] = await db.insert(s.eventSeries).values({ ...common, circleId: id, hostId: a.userId, frequency: body.repeat, firstStartsAt: startsAt, durationMinutes: body.durationMinutes, timezone: body.timezone, until }).returning();
      seriesId = sr.id;
      await materialiseSeries(db, sr);
    }
    const members = (await db.select({ u: s.groupMembers.userId }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active'))).limit(200)).map((r) => r.u).filter((u) => u !== a.userId);
    for (const u of members) await notify(ctx, db, { userId: u, category: 'circles', title: `New event in ${circle.name}`, body: `${body.title}${body.repeat !== 'none' ? ' (repeats)' : ''}`, link: `/circles/${id}?tab=events`, dedupeKey: `circle-event:${eventId ?? seriesId}` });
    await track(db, a.userId, 'circle_event_created', { repeat: body.repeat, mode: body.mode });
    return reply.code(201).send({ eventId, seriesId });
  });

  /** Cancel one occurrence (or a one-off event). People who said they're going are told. */
  app.post('/api/v1/circles/:id/events/:eventId/cancel', async (req) => {
    const a = requireAuth(req);
    const { id, eventId } = parse(z.object({ id: z.uuid(), eventId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const [e] = await db.update(s.events).set({ status: 'cancelled' }).where(and(eq(s.events.id, eventId), eq(s.events.groupId, id), ne(s.events.status, 'cancelled'))).returning();
    if (!e) throw notFound('Event');
    const going = await db.select({ u: s.eventRsvps.userId }).from(s.eventRsvps).where(and(eq(s.eventRsvps.eventId, eventId), eq(s.eventRsvps.status, 'going')));
    for (const { u } of going) await notify(ctx, db, { userId: u, category: 'circles', title: `Cancelled: ${e.title}`, body: e.startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }), link: `/circles/${id}?tab=events`, dedupeKey: `event-cancel:${eventId}` });
    await db.update(s.scheduledReminders).set({ cancelledAt: new Date() }).where(and(eq(s.scheduledReminders.sourceKey, `event:${eventId}`), isNull(s.scheduledReminders.sentAt)));
    await audit(db, { actorId: a.userId, action: 'circle.event_cancelled', targetType: 'group', targetId: id, meta: { title: e.title } });
    return { ok: true };
  });

  /** Stop a repeating event: no new occurrences, and upcoming ones are cancelled. */
  app.post('/api/v1/circles/:id/series/:seriesId/end', async (req) => {
    const a = requireAuth(req);
    const { id, seriesId } = parse(z.object({ id: z.uuid(), seriesId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const [sr] = await db.update(s.eventSeries).set({ endedAt: new Date() }).where(and(eq(s.eventSeries.id, seriesId), eq(s.eventSeries.circleId, id), isNull(s.eventSeries.endedAt))).returning();
    if (!sr) throw notFound('Repeating event');
    const future = await db.update(s.events).set({ status: 'cancelled' }).where(and(eq(s.events.seriesId, seriesId), gt(s.events.startsAt, new Date()), ne(s.events.status, 'cancelled'))).returning({ id: s.events.id });
    if (future.length) await db.update(s.scheduledReminders).set({ cancelledAt: new Date() }).where(and(inArray(s.scheduledReminders.sourceKey, future.map((f) => `event:${f.id}`)), isNull(s.scheduledReminders.sentAt)));
    await audit(db, { actorId: a.userId, action: 'circle.series_ended', targetType: 'group', targetId: id, meta: { title: sr.title, cancelled: future.length } });
    return { ok: true, cancelled: future.length };
  });

  /* ---------------- Moderator dashboard ---------------- */

  app.get('/api/v1/circles/:id/moderation', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircleAdmin(id, a.userId);
    // Reports about posts and comments in this circle that no circle moderator has reviewed yet. Reporters stay anonymous.
    const reported = await db.execute(sql`
      select r.id, r.reason, r.target_type, r.target_id, r.created_at, coalesce(p.body, c.body) as body, coalesce(p.author_id, c.author_id) as author_id, coalesce(p.id, c.post_id) as post_id
      from reports r
      left join posts p on r.target_type = 'post' and p.id = r.target_id and p.group_id = ${id} and p.deleted_at is null
      left join comments c on r.target_type = 'comment' and c.id = r.target_id and c.deleted_at is null
        and exists (select 1 from posts pp where pp.id = c.post_id and pp.group_id = ${id})
      where (p.id is not null or c.id is not null)
        and not exists (select 1 from circle_report_reviews v where v.report_id = r.id)
      order by r.created_at desc limit 50`) as unknown as { rows: { id: string; reason: string; target_type: string; target_id: string; created_at: string; body: string; author_id: string; post_id: string }[] };
    const timeouts = await db.select().from(s.circleTimeouts).where(and(eq(s.circleTimeouts.circleId, id), gt(s.circleTimeouts.until, new Date())));
    const banned = await db.select({ u: s.groupMembers.userId }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'banned')));
    const log = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.targetType, 'group'), eq(s.auditLogs.targetId, id))).orderBy(desc(s.auditLogs.createdAt)).limit(30);
    const since = new Date(Date.now() - 7 * 864e5);
    const n = sql<number>`count(*)::int`;
    const [posts] = await db.select({ n }).from(s.posts).where(and(eq(s.posts.groupId, id), isNull(s.posts.deletedAt), gte(s.posts.createdAt, since)));
    const [joined] = await db.select({ n }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active'), gte(s.groupMembers.createdAt, since)));
    const [members] = await db.select({ n }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.status, 'active')));
    const ids = [...reported.rows.map((r) => r.author_id), ...timeouts.map((t) => t.userId), ...banned.map((b) => b.u), ...log.map((l) => l.actorId).filter(Boolean) as string[], ...log.map((l) => (l.meta as { userId?: string })?.userId).filter(Boolean) as string[]];
    const names = await displayNames(db, ids);
    const name = (u: string | null | undefined) => (u ? names.get(u)?.displayName ?? 'Member' : 'System');
    return {
      role: member.role,
      stats: { members: members.n, newMembers: joined.n, postsThisWeek: posts.n, openReports: reported.rows.length, activeTimeouts: timeouts.length },
      reports: reported.rows.map((r) => ({ id: r.id, reason: r.reason, targetType: r.target_type, postId: r.post_id, preview: (r.body ?? '').slice(0, 200), author: name(r.author_id), authorId: r.author_id, createdAt: r.created_at })),
      timeouts: timeouts.map((t) => ({ userId: t.userId, name: name(t.userId), until: t.until, reason: t.reason })),
      banned: banned.map((b) => ({ userId: b.u, name: name(b.u) })),
      log: log.map((l) => ({ action: l.action.replace(/^circle\./, '').replace(/_/g, ' '), by: name(l.actorId), about: (l.meta as { userId?: string })?.userId ? name((l.meta as { userId: string }).userId) : null, at: l.createdAt })),
    };
  });

  async function removeContent(circleId: string, actorId: string, targetType: string, targetId: string) {
    if (targetType === 'comment') {
      const [c] = await db.select({ c: s.comments, g: s.posts.groupId }).from(s.comments).innerJoin(s.posts, eq(s.posts.id, s.comments.postId)).where(eq(s.comments.id, targetId));
      if (!c || c.g !== circleId) throw notFound('Comment');
      await db.update(s.comments).set({ deletedAt: new Date() }).where(eq(s.comments.id, targetId));
      await audit(db, { actorId, action: 'circle.comment_removed', targetType: 'group', targetId: circleId, meta: { userId: c.c.authorId, commentId: targetId } });
      return;
    }
    const [p] = await db.select().from(s.posts).where(and(eq(s.posts.id, targetId), eq(s.posts.groupId, circleId)));
    if (!p) throw notFound('Post');
    await db.update(s.posts).set({ deletedAt: new Date() }).where(eq(s.posts.id, targetId));
    await audit(db, { actorId, action: 'circle.post_removed', targetType: 'group', targetId: circleId, meta: { userId: p.authorId, postId: targetId } });
  }

  /** Circle moderators decide for their circle. The platform report stays open for Nakshatra's own review. */
  app.post('/api/v1/circles/:id/moderation/reports/:reportId', async (req) => {
    const a = requireAuth(req);
    const { id, reportId } = parse(z.object({ id: z.uuid(), reportId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    const { decision, note } = parse(z.object({ decision: z.enum(['remove', 'keep']), note: z.string().trim().max(300).default('') }), req.body);
    const [r] = await db.select().from(s.reports).where(eq(s.reports.id, reportId));
    if (!r || !['post', 'comment'].includes(r.targetType)) throw notFound('Report');
    // Confirms the reported content is in this circle (throws otherwise) before recording anything.
    if (decision === 'remove') await removeContent(id, a.userId, r.targetType, r.targetId);
    else {
      const inCircle = r.targetType === 'post'
        ? (await db.select({ g: s.posts.groupId }).from(s.posts).where(eq(s.posts.id, r.targetId)))[0]?.g === id
        : (await db.select({ g: s.posts.groupId }).from(s.comments).innerJoin(s.posts, eq(s.posts.id, s.comments.postId)).where(eq(s.comments.id, r.targetId)))[0]?.g === id;
      if (!inCircle) throw notFound('Report');
    }
    await db.insert(s.circleReportReviews).values({ reportId, circleId: id, decision: decision === 'remove' ? 'removed' : 'kept', reviewerId: a.userId, note }).onConflictDoNothing();
    await audit(db, { actorId: a.userId, action: decision === 'remove' ? 'circle.report_actioned' : 'circle.report_kept', targetType: 'group', targetId: id, meta: { reportId } });
    return { ok: true };
  });

  app.post('/api/v1/circles/:id/posts/:postId/remove', async (req) => {
    const a = requireAuth(req);
    const { id, postId } = parse(z.object({ id: z.uuid(), postId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    await removeContent(id, a.userId, 'post', postId);
    return { ok: true };
  });

  /** Pause a member's posting and commenting in this circle. Owners can pause moderators; moderators can't. */
  app.post('/api/v1/circles/:id/timeouts', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member, circle } = await requireCircleAdmin(id, a.userId);
    const { userId, hours, reason } = parse(z.object({ userId: z.uuid(), hours: z.union([z.literal(1), z.literal(24), z.literal(72), z.literal(168)]), reason: z.string().trim().min(3).max(200) }), req.body);
    if (userId === a.userId) throw badRequest('You can’t pause yourself.');
    const target = await circleMembership(db, id, userId);
    if (!target) throw notFound('Member');
    if (target.member.role === 'owner' || (target.member.role === 'moderator' && member.role !== 'owner')) throw forbidden('You can’t pause this member.');
    const until = new Date(Date.now() + hours * 3600e3);
    await db.insert(s.circleTimeouts).values({ circleId: id, userId, until, reason, byUserId: a.userId }).onConflictDoUpdate({ target: [s.circleTimeouts.circleId, s.circleTimeouts.userId], set: { until, reason, byUserId: a.userId, createdAt: new Date() } });
    await audit(db, { actorId: a.userId, action: 'circle.member_paused', targetType: 'group', targetId: id, meta: { userId, hours } });
    await notify(ctx, db, { userId, category: 'circles', title: `Posting paused in ${circle.name}`, body: `For ${hours === 1 ? '1 hour' : hours === 24 ? '1 day' : hours === 72 ? '3 days' : '1 week'}. Reason: ${reason}`, link: `/circles/${id}` });
    return { ok: true, until };
  });

  app.delete('/api/v1/circles/:id/timeouts/:userId', async (req) => {
    const a = requireAuth(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    await requireCircleAdmin(id, a.userId);
    await db.delete(s.circleTimeouts).where(and(eq(s.circleTimeouts.circleId, id), eq(s.circleTimeouts.userId, userId)));
    await audit(db, { actorId: a.userId, action: 'circle.member_unpaused', targetType: 'group', targetId: id, meta: { userId } });
    return { ok: true };
  });

  /** Ban: removes the member and stops them rejoining through invite links. Unban lets them be invited again. */
  app.post('/api/v1/circles/:id/bans', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { member } = await requireCircleAdmin(id, a.userId);
    const { userId, ban } = parse(z.object({ userId: z.uuid(), ban: z.boolean() }), req.body);
    if (userId === a.userId) throw badRequest('You can’t ban yourself.');
    const [target] = await db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
    if (ban) {
      if (!target) throw notFound('Member');
      if (target.role === 'owner' || (target.role === 'moderator' && member.role !== 'owner')) throw forbidden('You can’t ban this member.');
      await db.update(s.groupMembers).set({ status: 'banned', role: 'member' }).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
      await db.delete(s.circleTimeouts).where(and(eq(s.circleTimeouts.circleId, id), eq(s.circleTimeouts.userId, userId)));
    } else {
      await db.delete(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'banned')));
    }
    await audit(db, { actorId: a.userId, action: ban ? 'circle.member_banned' : 'circle.member_unbanned', targetType: 'group', targetId: id, meta: { userId } });
    return { ok: true };
  });

}
