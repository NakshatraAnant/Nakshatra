import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { badRequest, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { notify } from '../lib/notify';
import { createStorage, IMAGE_TYPES } from '../lib/storage';
import { displayNames, isBlockedEitherWay, relationOf } from '../services/identity';

export type ConversationKind = 'direct' | 'dating_match' | 'matchmaking' | 'consultation' | 'vendor' | 'wedding';

/** Creates a conversation whose members are already accepted (used by match, booking and vendor flows). */
export async function createConversation(db: Executor, kind: ConversationKind, createdBy: string, memberIds: string[], contextId?: string): Promise<string> {
  const [c] = await db.insert(s.conversations).values({ kind, createdBy, contextId }).returning({ id: s.conversations.id });
  await db.insert(s.conversationMembers).values([...new Set(memberIds)].map((userId) => ({ conversationId: c.id, userId, state: 'accepted' })));
  return c.id;
}

export async function postSystemMessage(db: Executor, conversationId: string, body: string) {
  await db.insert(s.messages).values({ conversationId, senderId: null, kind: 'system', body });
  await db.update(s.conversations).set({ lastMessageAt: new Date() }).where(eq(s.conversations.id, conversationId));
}

async function membership(db: Executor, conversationId: string, userId: string) {
  const [m] = await db.select().from(s.conversationMembers).where(and(eq(s.conversationMembers.conversationId, conversationId), eq(s.conversationMembers.userId, userId)));
  if (!m || m.state === 'left' || m.state === 'declined') throw notFound('Conversation');
  return m;
}

export async function messagingRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = createStorage(ctx);

  app.get('/api/v1/conversations', async (req) => {
    const a = requireAuth(req);
    const mine = await ctx.db.select().from(s.conversationMembers).where(and(eq(s.conversationMembers.userId, a.userId), inArray(s.conversationMembers.state, ['accepted', 'requested'])));
    if (!mine.length) return { conversations: [] };
    const convs = await ctx.db.select().from(s.conversations).where(inArray(s.conversations.id, mine.map((m) => m.conversationId))).orderBy(desc(sql`coalesce(${s.conversations.lastMessageAt}, ${s.conversations.createdAt})`));
    const members = await ctx.db.select().from(s.conversationMembers).where(inArray(s.conversationMembers.conversationId, convs.map((c) => c.id)));
    const names = await displayNames(ctx.db, members.map((m) => m.userId));
    const out = [];
    for (const c of convs) {
      const me = mine.find((m) => m.conversationId === c.id)!;
      const others = members.filter((m) => m.conversationId === c.id && m.userId !== a.userId);
      const [last] = await ctx.db.select().from(s.messages).where(and(eq(s.messages.conversationId, c.id), isNull(s.messages.deletedAt))).orderBy(desc(s.messages.createdAt)).limit(1);
      const [{ unread }] = await ctx.db.select({ unread: sql<number>`count(*)::int` }).from(s.messages).where(and(eq(s.messages.conversationId, c.id), isNull(s.messages.deletedAt), ne(s.messages.senderId, a.userId), me.lastReadAt ? gt(s.messages.createdAt, me.lastReadAt) : undefined));
      out.push({
        id: c.id, kind: c.kind, contextId: c.contextId, closed: Boolean(c.closedAt), myState: me.state,
        participants: others.map((o) => ({ userId: o.userId, state: o.state, ...names.get(o.userId) })),
        lastMessage: last ? { body: last.deletedAt ? '' : last.body.slice(0, 120), kind: last.kind, createdAt: last.createdAt, mine: last.senderId === a.userId } : null,
        unread,
      });
    }
    return { conversations: out };
  });

  /** Direct conversation: connections connect immediately; anyone else receives a message request. */
  app.post('/api/v1/conversations', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const { userId, message } = parse(z.object({ userId: z.uuid(), message: z.string().trim().min(1).max(2000) }), req.body);
    if (userId === a.userId) throw badRequest('You cannot message yourself.');
    if (await isBlockedEitherWay(ctx.db, a.userId, userId)) throw notFound('User');
    const [target] = await ctx.db.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.status, 'active')));
    if (!target) throw notFound('User');
    const existing = await ctx.db.execute(sql`select c.id from conversations c
      join conversation_members a on a.conversation_id = c.id and a.user_id = ${a.userId}
      join conversation_members b on b.conversation_id = c.id and b.user_id = ${userId}
      where c.kind = 'direct' limit 1`);
    const existingId = (existing as unknown as { rows: { id: string }[] }).rows?.[0]?.id;
    if (existingId) return { conversationId: existingId, existing: true };
    const relation = await relationOf(ctx.db, a.userId, userId);
    const conversationId = await ctx.db.transaction(async (tx) => {
      const [c] = await tx.insert(s.conversations).values({ kind: 'direct', createdBy: a.userId, lastMessageAt: new Date() }).returning();
      await tx.insert(s.conversationMembers).values([
        { conversationId: c.id, userId: a.userId, state: 'accepted', lastReadAt: new Date() },
        { conversationId: c.id, userId, state: relation === 'connection' ? 'accepted' : 'requested' },
      ]);
      await tx.insert(s.messages).values({ conversationId: c.id, senderId: a.userId, body: message });
      return c.id;
    });
    const names = await displayNames(ctx.db, [a.userId]);
    await notify(ctx, ctx.db, { userId, category: 'messages', title: relation === 'connection' ? `New message from ${names.get(a.userId)?.displayName}` : `${names.get(a.userId)?.displayName} sent you a message request`, link: `/messages/${conversationId}` });
    await track(ctx.db, a.userId, 'message_sent', { kind: 'direct', request: relation !== 'connection' });
    return { conversationId, request: relation !== 'connection' };
  });

  app.post('/api/v1/conversations/:id/respond', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body);
    const m = await membership(ctx.db, id, a.userId);
    if (m.state !== 'requested') throw badRequest('There is no pending request.');
    await ctx.db.update(s.conversationMembers).set({ state: accept ? 'accepted' : 'declined' }).where(and(eq(s.conversationMembers.conversationId, id), eq(s.conversationMembers.userId, a.userId)));
    return { ok: true };
  });

  app.get('/api/v1/conversations/:id/messages', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { before, limit } = parse(z.object({ before: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
    const me = await membership(ctx.db, id, a.userId);
    const [conv] = await ctx.db.select().from(s.conversations).where(eq(s.conversations.id, id));
    const rows = await ctx.db.select().from(s.messages).where(and(eq(s.messages.conversationId, id), before ? lt(s.messages.createdAt, new Date(before)) : undefined)).orderBy(desc(s.messages.createdAt)).limit(limit + 1);
    const members = await ctx.db.select().from(s.conversationMembers).where(eq(s.conversationMembers.conversationId, id));
    const names = await displayNames(ctx.db, members.map((x) => x.userId));
    const others = members.filter((x) => x.userId !== a.userId);
    await ctx.db.update(s.conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(s.conversationMembers.conversationId, id), eq(s.conversationMembers.userId, a.userId)));
    const otherRead = others.map((o) => o.lastReadAt).filter(Boolean).sort().at(-1) ?? null;
    return {
      conversation: { id: conv.id, kind: conv.kind, contextId: conv.contextId, closed: Boolean(conv.closedAt), myState: me.state, participants: others.map((o) => ({ userId: o.userId, state: o.state, ...names.get(o.userId) })) },
      messages: rows.slice(0, limit).reverse().map((m) => ({
        id: m.id, kind: m.kind, body: m.deletedAt ? '' : m.body, deleted: Boolean(m.deletedAt), attachment: m.deletedAt || !m.attachmentUrl ? null : `/api/v1/conversations/${id}/attachments/${m.id}`,
        createdAt: m.createdAt, sender: m.senderId ? { userId: m.senderId, ...names.get(m.senderId) } : null, mine: m.senderId === a.userId,
        readByOthers: Boolean(otherRead && m.senderId === a.userId && otherRead >= m.createdAt),
      })),
      hasMore: rows.length > limit,
    };
  });

  app.post('/api/v1/conversations/:id/messages', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const me = await membership(ctx.db, id, a.userId);
    const [conv] = await ctx.db.select().from(s.conversations).where(eq(s.conversations.id, id));
    if (conv.closedAt) throw forbidden('This conversation is closed.');
    if (me.state !== 'accepted') throw forbidden('Accept the message request to reply.');
    const others = await ctx.db.select().from(s.conversationMembers).where(and(eq(s.conversationMembers.conversationId, id), ne(s.conversationMembers.userId, a.userId)));
    for (const o of others) if (await isBlockedEitherWay(ctx.db, a.userId, o.userId)) throw forbidden('You can’t message this person.');
    let body = '';
    let attachmentPath: string | null = null;
    if (req.isMultipart()) {
      const file = await req.file();
      if (!file) throw badRequest('No file');
      const saved = await storage.save(await file.toBuffer(), { allowed: IMAGE_TYPES, isPrivate: true, maxBytes: ctx.config.MAX_UPLOAD_MB * 1048576 });
      await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'message_attachment', path: saved.path, mime: saved.mime, bytes: saved.bytes, isPrivate: true });
      attachmentPath = saved.path;
      body = String((file.fields.body as { value?: string } | undefined)?.value ?? '').slice(0, 2000);
    } else {
      body = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body).body;
    }
    // Pending requests: the requester may send at most 3 messages before the recipient accepts.
    if (others.some((o) => o.state === 'requested')) {
      const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.messages).where(and(eq(s.messages.conversationId, id), eq(s.messages.senderId, a.userId)));
      if (n >= 3) throw forbidden('Wait for your message request to be accepted before sending more.');
    }
    const [m] = await ctx.db.insert(s.messages).values({ conversationId: id, senderId: a.userId, body, attachmentUrl: attachmentPath }).returning();
    await ctx.db.update(s.conversations).set({ lastMessageAt: new Date() }).where(eq(s.conversations.id, id));
    const names = await displayNames(ctx.db, [a.userId]);
    for (const o of others) {
      if (o.state === 'accepted' && !o.mutedNotifications) await notify(ctx, ctx.db, { userId: o.userId, category: 'messages', title: `New message from ${names.get(a.userId)?.displayName}`, link: `/messages/${id}`, dedupeKey: `msg:${id}:${Math.floor(Date.now() / 600000)}` });
    }
    await track(ctx.db, a.userId, 'message_sent', { kind: conv.kind });
    return { message: { id: m.id, createdAt: m.createdAt } };
  });

  app.get('/api/v1/conversations/:id/attachments/:messageId', async (req, reply) => {
    const a = requireAuth(req);
    const { id, messageId } = parse(z.object({ id: z.uuid(), messageId: z.uuid() }), req.params);
    await membership(ctx.db, id, a.userId);
    const [m] = await ctx.db.select().from(s.messages).where(and(eq(s.messages.id, messageId), eq(s.messages.conversationId, id), isNull(s.messages.deletedAt)));
    if (!m?.attachmentUrl) throw notFound('Attachment');
    const [u] = await ctx.db.select().from(s.uploads).where(eq(s.uploads.path, m.attachmentUrl));
    reply.header('content-type', u?.mime ?? 'application/octet-stream').header('cache-control', 'private, max-age=300').header('x-content-type-options', 'nosniff');
    return reply.send(await storage.read(m.attachmentUrl));
  });

  app.delete('/api/v1/messages/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const res = await ctx.db.update(s.messages).set({ deletedAt: new Date() }).where(and(eq(s.messages.id, id), eq(s.messages.senderId, a.userId))).returning();
    if (!res.length) throw notFound('Message');
    return { ok: true };
  });

  app.post('/api/v1/conversations/:id/settings', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ muted: z.boolean().optional(), leave: z.boolean().optional() }), req.body);
    await membership(ctx.db, id, a.userId);
    await ctx.db.update(s.conversationMembers).set({ ...(body.muted !== undefined ? { mutedNotifications: body.muted } : {}), ...(body.leave ? { state: 'left' } : {}) })
      .where(and(eq(s.conversationMembers.conversationId, id), eq(s.conversationMembers.userId, a.userId)));
    return { ok: true };
  });

  app.get('/api/v1/conversations/unread-count', async (req) => {
    const a = requireAuth(req);
    const r = await ctx.db.execute(sql`select count(*)::int as n from messages m join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${a.userId}
      where cm.state = 'accepted' and m.deleted_at is null and (m.sender_id is null or m.sender_id <> ${a.userId}) and (cm.last_read_at is null or m.created_at > cm.last_read_at)`);
    return { unread: Number((r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0) };
  });
}
