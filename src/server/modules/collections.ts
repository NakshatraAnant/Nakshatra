import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { badRequest, conflict, notFound, parse } from '../lib/http';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames, isBlockedEitherWay, relationOf } from '../services/identity';
import { canViewPost, hydratePosts } from './social';

export const CLOSE_FRIENDS_MAX = 150;
export const COLLECTION_LIMITS = { collections: 50, items: 500, name: 40, description: 200, note: 140 } as const;

/** Close friends lists and saved-post collections. */
export async function collectionRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;

  /* ---------------- Close friends ---------------- */

  /** People you're connected with (an accepted follow either way), marked if they're on your list. */
  app.get('/api/v1/close-friends', async (req) => {
    const a = requireAuth(req);
    const links = await db.select({ a: s.follows.followerId, b: s.follows.followeeId }).from(s.follows)
      .where(and(eq(s.follows.status, 'accepted'), or(eq(s.follows.followerId, a.userId), eq(s.follows.followeeId, a.userId)))).limit(1000);
    const listed = (await db.select({ f: s.closeFriends.friendId }).from(s.closeFriends).where(eq(s.closeFriends.ownerId, a.userId))).map((r) => r.f);
    const ids = [...new Set([...links.map((r) => (r.a === a.userId ? r.b : r.a)), ...listed])];
    const names = await displayNames(db, ids);
    const people = ids.map((id) => ({ userId: id, name: names.get(id)?.displayName ?? 'Member', handle: names.get(id)?.handle ?? null, avatarUrl: names.get(id)?.avatarUrl ?? null, onList: listed.includes(id) }))
      .sort((x, y) => Number(y.onList) - Number(x.onList) || x.name.localeCompare(y.name));
    return { people, count: listed.length, max: CLOSE_FRIENDS_MAX };
  });

  /** Add or remove someone. They are not told either way. */
  app.put('/api/v1/close-friends/:userId', { config: { rateLimit: { max: 120, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    const { on } = parse(z.object({ on: z.boolean() }), req.body);
    if (!on) {
      await db.delete(s.closeFriends).where(and(eq(s.closeFriends.ownerId, a.userId), eq(s.closeFriends.friendId, userId)));
      return { onList: false };
    }
    if (userId === a.userId) throw badRequest('You’re always on your own list.');
    if (await isBlockedEitherWay(db, a.userId, userId)) throw notFound('Member');
    const [link] = await db.select().from(s.follows).where(and(eq(s.follows.status, 'accepted'), or(and(eq(s.follows.followerId, a.userId), eq(s.follows.followeeId, userId)), and(eq(s.follows.followerId, userId), eq(s.follows.followeeId, a.userId)))));
    if (!link) throw badRequest('Add people you follow or who follow you.');
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.closeFriends).where(eq(s.closeFriends.ownerId, a.userId));
    if (n >= CLOSE_FRIENDS_MAX) throw conflict(`Close friends is limited to ${CLOSE_FRIENDS_MAX} people.`);
    await db.insert(s.closeFriends).values({ ownerId: a.userId, friendId: userId }).onConflictDoNothing();
    return { onList: true };
  });

  /* ---------------- Collections ---------------- */

  async function screen(texts: string[]) {
    const phrases = await blockedPhrases(db);
    for (const t of texts.filter(Boolean)) { const r = screenText(t, phrases); if (!r.ok) throw badRequest(r.reason!); }
  }
  async function ownCollection(userId: string, id: string) {
    const [c] = await db.select().from(s.postCollections).where(and(eq(s.postCollections.id, id), eq(s.postCollections.ownerId, userId)));
    if (!c) throw notFound('Collection');
    return c;
  }
  /** Public collections follow the owner's profile privacy: a private profile shows them only to approved followers. */
  async function profileOpenTo(viewerId: string, ownerId: string) {
    if (viewerId === ownerId) return true;
    if (await isBlockedEitherWay(db, viewerId, ownerId)) return false;
    const [p] = await db.select({ v: s.profiles.visibility }).from(s.profiles).where(eq(s.profiles.userId, ownerId));
    return p?.v !== 'private' || (await relationOf(db, viewerId, ownerId)) !== 'public';
  }
  async function summaries(ownerId: string, viewerId: string, publicOnly: boolean) {
    const rows = await db.select().from(s.postCollections).where(and(eq(s.postCollections.ownerId, ownerId), publicOnly ? eq(s.postCollections.visibility, 'public') : undefined)).orderBy(desc(s.postCollections.updatedAt));
    const ids = rows.map((r) => r.id);
    const counts = ids.length ? await db.select({ c: s.collectionItems.collectionId, n: sql<number>`count(*)::int` }).from(s.collectionItems).where(inArray(s.collectionItems.collectionId, ids)).groupBy(s.collectionItems.collectionId) : [];
    return rows.map((c) => ({ id: c.id, name: c.name, description: c.description, visibility: c.visibility, items: counts.find((x) => x.c === c.id)?.n ?? 0, isMine: ownerId === viewerId, updatedAt: c.updatedAt }));
  }

  const Body = z.object({ name: z.string().trim().min(1).max(COLLECTION_LIMITS.name), description: z.string().trim().max(COLLECTION_LIMITS.description).default(''), visibility: z.enum(['private', 'public']).default('private') });

  app.get('/api/v1/collections', async (req) => {
    const a = requireAuth(req);
    const [{ saved }] = await db.select({ saved: sql<number>`count(*)::int` }).from(s.savedPosts).where(eq(s.savedPosts.userId, a.userId));
    return { collections: await summaries(a.userId, a.userId, false), saved, max: COLLECTION_LIMITS.collections };
  });

  app.post('/api/v1/collections', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const body = parse(Body, req.body);
    await screen([body.name, body.description]);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.postCollections).where(eq(s.postCollections.ownerId, a.userId));
    if (n >= COLLECTION_LIMITS.collections) throw conflict(`You can have up to ${COLLECTION_LIMITS.collections} collections.`);
    const [c] = await db.insert(s.postCollections).values({ ownerId: a.userId, ...body }).returning();
    await track(db, a.userId, 'collection_created', { visibility: body.visibility });
    return reply.code(201).send({ collection: { id: c.id, name: c.name } });
  });

  app.patch('/api/v1/collections/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ownCollection(a.userId, id);
    const body = parse(Body.partial(), req.body);
    await screen([body.name ?? '', body.description ?? '']);
    await db.update(s.postCollections).set({ ...body, updatedAt: new Date() }).where(eq(s.postCollections.id, id));
    return { ok: true };
  });

  app.delete('/api/v1/collections/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ownCollection(a.userId, id);
    await db.delete(s.postCollections).where(eq(s.postCollections.id, id));
    return { ok: true };
  });

  /**
   * A collection with the posts this viewer may see. Every post is checked with the normal visibility rules, so a
   * public collection never shows anyone a post they couldn't open themselves. The owner's own pen-name posts are
   * left out for other viewers: listing them would tie the pen name to the owner.
   */
  app.get('/api/v1/collections/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [c] = await db.select().from(s.postCollections).where(eq(s.postCollections.id, id));
    const isMine = c?.ownerId === a.userId;
    if (!c || (!isMine && (c.visibility !== 'public' || !(await profileOpenTo(a.userId, c.ownerId))))) throw notFound('Collection');
    const items = await db.select({ i: s.collectionItems, p: s.posts }).from(s.collectionItems).innerJoin(s.posts, eq(s.posts.id, s.collectionItems.postId))
      .where(eq(s.collectionItems.collectionId, id)).orderBy(desc(s.collectionItems.createdAt)).limit(COLLECTION_LIMITS.items);
    const visible: typeof items = [];
    for (const r of items) {
      if (!isMine && r.p.pseudonymous && r.p.authorId === c.ownerId) continue;
      if (await canViewPost(db, a.userId, r.p)) visible.push(r);
    }
    const hydrated = await hydratePosts(db, a.userId, visible.map((v) => v.p));
    const owner = (await displayNames(db, [c.ownerId])).get(c.ownerId);
    return {
      collection: { id: c.id, name: c.name, description: c.description, visibility: c.visibility, isMine, owner: { name: owner?.displayName ?? 'Member', handle: owner?.handle ?? null } },
      posts: hydrated.map((p) => ({ ...p, note: visible.find((v) => v.p.id === p.id)?.i.note ?? '' })),
      hidden: items.length - visible.length,
    };
  });

  /** Add a post you can see. Adding also saves it, so it shows under Saved too. */
  app.post('/api/v1/collections/:id/items', { config: { rateLimit: { max: 120, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ownCollection(a.userId, id);
    const { postId, note } = parse(z.object({ postId: z.uuid(), note: z.string().trim().max(COLLECTION_LIMITS.note).default('') }), req.body);
    await screen([note]);
    const [p] = await db.select().from(s.posts).where(eq(s.posts.id, postId));
    if (!p || !(await canViewPost(db, a.userId, p))) throw notFound('Post');
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.collectionItems).where(eq(s.collectionItems.collectionId, id));
    if (n >= COLLECTION_LIMITS.items) throw conflict(`A collection holds up to ${COLLECTION_LIMITS.items} posts.`);
    await db.insert(s.collectionItems).values({ collectionId: id, postId, note }).onConflictDoUpdate({ target: [s.collectionItems.collectionId, s.collectionItems.postId], set: { note } });
    await db.insert(s.savedPosts).values({ userId: a.userId, postId }).onConflictDoNothing();
    await db.update(s.postCollections).set({ updatedAt: new Date() }).where(eq(s.postCollections.id, id));
    return { ok: true };
  });

  app.delete('/api/v1/collections/:id/items/:postId', async (req) => {
    const a = requireAuth(req);
    const { id, postId } = parse(z.object({ id: z.uuid(), postId: z.uuid() }), req.params);
    await ownCollection(a.userId, id);
    await db.delete(s.collectionItems).where(and(eq(s.collectionItems.collectionId, id), eq(s.collectionItems.postId, postId)));
    return { ok: true };
  });

  /** Which of your collections hold this post (for the "Save to…" picker). */
  app.get('/api/v1/posts/:id/collections', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const mine = await db.select({ id: s.postCollections.id, name: s.postCollections.name }).from(s.postCollections).where(eq(s.postCollections.ownerId, a.userId)).orderBy(desc(s.postCollections.updatedAt));
    const has = mine.length ? (await db.select({ c: s.collectionItems.collectionId }).from(s.collectionItems).where(and(eq(s.collectionItems.postId, id), inArray(s.collectionItems.collectionId, mine.map((m) => m.id))))).map((r) => r.c) : [];
    return { collections: mine.map((m) => ({ ...m, contains: has.includes(m.id) })) };
  });

  /** Someone's public collections (for their profile). */
  app.get('/api/v1/users/:userId/collections', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    if (!(await profileOpenTo(a.userId, userId))) return { collections: [] };
    return { collections: await summaries(userId, a.userId, userId !== a.userId) };
  });
}
