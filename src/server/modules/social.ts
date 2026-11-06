import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql, ne } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { hmac } from '../lib/crypto';
import { notify } from '../lib/notify';
import { awardXp, evaluateAchievements } from '../lib/rewards';
import { AUDIO_TYPES, createStorage, IMAGE_TYPES, VOICE_MAX_BYTES } from '../lib/storage';
import { rankFeed, type FeedCandidate } from '../services/ranking';
import { bigThreeFor, displayNames, isBlockedEitherWay } from '../services/identity';
import { DateTime } from 'luxon';
import { blockedPhrases, screenText } from '../services/moderation';
import { evaluateReferral } from '../services/referrals';
import { recordFirstAction } from '../services/activation';
import { checkCircleActivation } from '../services/circles';
import { eventVisibleSql } from '../services/events';

export const TOPICS = ['vedic', 'western', 'tarot', 'numerology', 'panchang', 'festivals', 'rituals', 'relationships', 'learning', 'meditation', 'mythology', 'nakshatras', 'transits', 'wellbeing',
  'life', 'friendship', 'work', 'study', 'music', 'film', 'food', 'travel', 'tech', 'sport', 'fun', 'dilemmas', 'questions', 'confessions'];

/** Thought Drop formats: short text-first posts with their own purpose. */
export const THOUGHT_KINDS = ['thought', 'question', 'dilemma', 'confession', 'prompt'] as const;
const TEXT_KINDS = ['text', 'poll', ...THOUGHT_KINDS];
/** Authors may edit text for this long after posting; edits are marked. */
export const EDIT_WINDOW_MS = 15 * 60000;

/** Simple conventional abuse rules: link limits and repeated-content detection. */
export function spamCheck(body: string, recentBodies: string[]): string | null {
  const links = (body.match(/https?:\/\//g) ?? []).length;
  if (links > 3) return 'Posts can include at most three links.';
  if (recentBodies.filter((b) => b === body).length >= 2) return 'You have already posted this text recently.';
  if (/(.)\1{14,}/.test(body)) return 'Please avoid long repeated characters.';
  return null;
}

/** Opaque, per-muter handle for a pen-name mute (cannot be reversed or compared across users). */
export function penMuteRef(secret: string, muterId: string, authorId: string): string {
  return hmac(secret, `pen-mute:${muterId}:${authorId}`).slice(0, 32);
}

/** Feed filters: real-name mutes hide only real-name posts; pen-name mutes hide only pen-name posts. */
export async function muteFilters(db: Executor, userId: string) {
  const muted = new Set((await db.select({ id: s.mutes.mutedId }).from(s.mutes).where(eq(s.mutes.muterId, userId))).map((r) => r.id));
  const penMuted = new Set((await db.select({ id: s.penMutes.authorId }).from(s.penMutes).where(eq(s.penMutes.muterId, userId))).map((r) => r.id));
  return (p: { authorId: string; pseudonymous: boolean }) => (p.pseudonymous ? penMuted.has(p.authorId) : muted.has(p.authorId));
}

async function blockedSet(db: Executor, userId: string): Promise<Set<string>> {
  const rows = await db.select().from(s.blocks).where(or(eq(s.blocks.blockerId, userId), eq(s.blocks.blockedId, userId)));
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

/**
 * Visibility policy (posts-v2). The post's own visibility decides who can read it:
 *  - public: every signed-in member (profile privacy controls the profile page, not explicitly public posts);
 *  - followers: accepted followers only (never allowed for pen-name posts);
 *  - group: active members of that circle/group, or anyone for a public community group.
 * Blocks in either direction always hide a post. Mutes are a feed preference, applied by callers.
 */
export async function canViewPost(db: Executor, viewerId: string, post: typeof s.posts.$inferSelect): Promise<boolean> {
  if (post.deletedAt || (post.hiddenByModeration && post.authorId !== viewerId)) return false;
  if (post.expiresAt && post.expiresAt < new Date() && post.authorId !== viewerId) return false;
  if (post.authorId === viewerId) return true;
  if (await isBlockedEitherWay(db, viewerId, post.authorId)) return false;
  if (post.visibility === 'public') return true;
  if (post.visibility === 'group' && post.groupId) {
    const [m] = await db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, post.groupId), eq(s.groupMembers.userId, viewerId), eq(s.groupMembers.status, 'active')));
    const [g] = await db.select().from(s.groups).where(eq(s.groups.id, post.groupId));
    return Boolean(m) || g?.visibility === 'public';
  }
  const [f] = await db.select().from(s.follows).where(and(eq(s.follows.followerId, viewerId), eq(s.follows.followeeId, post.authorId), eq(s.follows.status, 'accepted')));
  return Boolean(f);
}

/**
 * Comment serializer. A comment written by the post's pen-name author in their own pen-name thread is shown
 * under the pen name to everyone else — no user id, handle or display name is included.
 */
export async function serializeComments(db: Executor, viewerId: string, post: typeof s.posts.$inferSelect, rows: (typeof s.comments.$inferSelect)[]) {
  const hidden = (c: typeof s.comments.$inferSelect) => c.asPseudonym && c.authorId !== viewerId;
  const names = await displayNames(db, rows.filter((c) => !hidden(c)).map((c) => c.authorId));
  let pen = post.penName;
  if (!pen && rows.some(hidden)) pen = (await db.select({ p: s.profiles.pseudonym }).from(s.profiles).where(eq(s.profiles.userId, post.authorId)))[0]?.p ?? null;
  return rows.map((c) => ({
    id: c.id, parentId: c.parentId, body: c.body, createdAt: c.createdAt,
    author: hidden(c) ? { pseudonym: pen ?? 'Anonymous member', isPostAuthor: true } : { userId: c.authorId, ...names.get(c.authorId), ...(c.asPseudonym ? { pseudonym: pen ?? undefined, isPostAuthor: true } : {}) },
    isMine: c.authorId === viewerId,
  }));
}

export async function hydratePosts(db: Executor, viewerId: string, rows: (typeof s.posts.$inferSelect)[], reasons?: Map<string, string[]>) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  // Real names are loaded only for posts the viewer may see attributed (never for other people's pen-name posts).
  const names = await displayNames(db, rows.filter((r) => !r.pseudonymous || r.authorId === viewerId).map((r) => r.authorId));
  // Older pen-name posts have no snapshot; fall back to the author's current pen name.
  const pseudoAuthors = rows.filter((r) => r.pseudonymous && !r.penName && r.authorId !== viewerId).map((r) => r.authorId);
  const pens = pseudoAuthors.length ? new Map((await db.select({ u: s.profiles.userId, p: s.profiles.pseudonym }).from(s.profiles).where(inArray(s.profiles.userId, pseudoAuthors))).map((x) => [x.u, x.p])) : new Map<string, string | null>();
  const reactions = await db.select({ postId: s.reactions.postId, kind: s.reactions.kind, n: sql<number>`count(*)::int` }).from(s.reactions).where(inArray(s.reactions.postId, ids)).groupBy(s.reactions.postId, s.reactions.kind);
  const mine = await db.select().from(s.reactions).where(and(inArray(s.reactions.postId, ids), eq(s.reactions.userId, viewerId)));
  const commentCounts = await db.select({ postId: s.comments.postId, n: sql<number>`count(*)::int` }).from(s.comments).where(and(inArray(s.comments.postId, ids), isNull(s.comments.deletedAt), eq(s.comments.hiddenByModeration, false))).groupBy(s.comments.postId);
  const saved = await db.select().from(s.savedPosts).where(and(eq(s.savedPosts.userId, viewerId), inArray(s.savedPosts.postId, ids)));
  const pollIds = rows.filter((r) => r.kind === 'poll').map((r) => r.id);
  const options = pollIds.length ? await db.select().from(s.pollOptions).where(inArray(s.pollOptions.postId, pollIds)) : [];
  const votes = pollIds.length ? await db.select({ optionId: s.pollVotes.optionId, n: sql<number>`count(*)::int` }).from(s.pollVotes).where(inArray(s.pollVotes.postId, pollIds)).groupBy(s.pollVotes.optionId) : [];
  const myVotes = pollIds.length ? await db.select().from(s.pollVotes).where(and(inArray(s.pollVotes.postId, pollIds), eq(s.pollVotes.userId, viewerId))) : [];
  return rows.map((r) => ({
    id: r.id, kind: r.kind, body: r.body, imageUrl: r.imageUrl, imageUrls: r.imageUrls?.length ? r.imageUrls : null, audioUrl: r.audioUrl, audioSeconds: r.audioSeconds, card: r.card, topics: r.topics, visibility: r.visibility, groupId: r.groupId,
    createdAt: r.createdAt, expiresAt: r.expiresAt, editedAt: r.editedAt, pseudonymous: r.pseudonymous,
    author: r.pseudonymous && r.authorId !== viewerId ? { pseudonym: r.penName ?? pens.get(r.authorId) ?? 'Anonymous member' } : { userId: r.authorId, ...names.get(r.authorId), ...(r.pseudonymous ? { pseudonym: r.penName ?? undefined } : {}) },
    reactions: Object.fromEntries(reactions.filter((x) => x.postId === r.id).map((x) => [x.kind, x.n])),
    myReaction: mine.find((m) => m.postId === r.id)?.kind ?? null,
    commentCount: commentCounts.find((c) => c.postId === r.id)?.n ?? 0,
    saved: saved.some((x) => x.postId === r.id),
    poll: r.kind === 'poll' ? options.filter((o) => o.postId === r.id).sort((a, b) => a.position - b.position).map((o) => ({ id: o.id, label: o.label, votes: votes.find((v) => v.optionId === o.id)?.n ?? 0 })) : null,
    myVote: myVotes.find((v) => v.postId === r.id)?.optionId ?? null,
    isMine: r.authorId === viewerId,
    reasons: reasons?.get(r.id) ?? [],
  }));
}

export async function socialRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = createStorage(ctx);

  /* ---------- Follows ---------- */
  app.post('/api/v1/follows/:userId', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    if (userId === a.userId) throw badRequest('You cannot follow yourself.');
    if (await isBlockedEitherWay(ctx.db, a.userId, userId)) throw notFound('User');
    const [target] = await ctx.db.select().from(s.profiles).innerJoin(s.users, eq(s.users.id, s.profiles.userId)).where(and(eq(s.profiles.userId, userId), eq(s.users.status, 'active')));
    if (!target) throw notFound('User');
    const status = target.profiles.visibility === 'public' ? 'accepted' : 'pending';
    const added = await ctx.db.insert(s.follows).values({ followerId: a.userId, followeeId: userId, status }).onConflictDoNothing().returning({ f: s.follows.followerId });
    if (added.length) await track(ctx.db, a.userId, 'connection_made', { kind: status === 'pending' ? 'follow_request' : 'follow' });
    const names = await displayNames(ctx.db, [a.userId]);
    await notify(ctx, ctx.db, { userId, category: 'social', title: status === 'pending' ? `${names.get(a.userId)?.displayName} asked to follow you` : `${names.get(a.userId)?.displayName} followed you`, link: status === 'pending' ? '/social/requests' : `/u/${names.get(a.userId)?.handle}`, dedupeKey: `follow:${a.userId}` });
    return { status };
  });

  app.delete('/api/v1/follows/:userId', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    await ctx.db.delete(s.follows).where(and(eq(s.follows.followerId, a.userId), eq(s.follows.followeeId, userId)));
    return { ok: true };
  });

  app.get('/api/v1/follows/requests', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.follows).where(and(eq(s.follows.followeeId, a.userId), eq(s.follows.status, 'pending')));
    const names = await displayNames(ctx.db, rows.map((r) => r.followerId));
    return { requests: rows.map((r) => ({ userId: r.followerId, ...names.get(r.followerId), createdAt: r.createdAt })) };
  });

  app.post('/api/v1/follows/requests/:userId', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body);
    if (accept) await ctx.db.update(s.follows).set({ status: 'accepted' }).where(and(eq(s.follows.followerId, userId), eq(s.follows.followeeId, a.userId)));
    else await ctx.db.delete(s.follows).where(and(eq(s.follows.followerId, userId), eq(s.follows.followeeId, a.userId)));
    return { ok: true };
  });

  app.get('/api/v1/users/:userId/connections', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    if (userId !== a.userId) throw forbidden('Connection lists are private.');
    const followers = await ctx.db.select().from(s.follows).where(and(eq(s.follows.followeeId, userId), eq(s.follows.status, 'accepted')));
    const following = await ctx.db.select().from(s.follows).where(and(eq(s.follows.followerId, userId), eq(s.follows.status, 'accepted')));
    const names = await displayNames(ctx.db, [...followers.map((f) => f.followerId), ...following.map((f) => f.followeeId)]);
    return { followers: followers.map((f) => ({ userId: f.followerId, ...names.get(f.followerId) })), following: following.map((f) => ({ userId: f.followeeId, ...names.get(f.followeeId) })) };
  });

  /* ---------- Blocks & mutes ---------- */
  app.post('/api/v1/blocks/:userId', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    if (userId === a.userId) throw badRequest('You cannot block yourself.');
    await ctx.db.transaction(async (tx) => {
      await tx.insert(s.blocks).values({ blockerId: a.userId, blockedId: userId }).onConflictDoNothing();
      await tx.delete(s.follows).where(or(and(eq(s.follows.followerId, a.userId), eq(s.follows.followeeId, userId)), and(eq(s.follows.followerId, userId), eq(s.follows.followeeId, a.userId))));
      // Blocking revokes any chart sharing in both directions.
      await tx.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(and(isNull(s.chartShareGrants.revokedAt), or(and(eq(s.chartShareGrants.grantorId, a.userId), eq(s.chartShareGrants.granteeId, userId)), and(eq(s.chartShareGrants.grantorId, userId), eq(s.chartShareGrants.granteeId, a.userId)))));
      await tx.update(s.bonds).set({ status: 'revoked' }).where(and(eq(s.bonds.status, 'active'), or(and(eq(s.bonds.ownerId, a.userId), eq(s.bonds.partnerUserId, userId)), and(eq(s.bonds.ownerId, userId), eq(s.bonds.partnerUserId, a.userId)))));
      await tx.update(s.datingMatches).set({ unmatchedAt: new Date(), unmatchedBy: a.userId }).where(and(isNull(s.datingMatches.unmatchedAt), or(and(eq(s.datingMatches.userA, a.userId), eq(s.datingMatches.userB, userId)), and(eq(s.datingMatches.userA, userId), eq(s.datingMatches.userB, a.userId)))));
    });
    return { ok: true };
  });

  app.delete('/api/v1/blocks/:userId', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    await ctx.db.delete(s.blocks).where(and(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, userId)));
    return { ok: true };
  });

  app.get('/api/v1/blocks', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.blocks).where(eq(s.blocks.blockerId, a.userId));
    const mutesRows = await ctx.db.select().from(s.mutes).where(eq(s.mutes.muterId, a.userId));
    const penRows = await ctx.db.select().from(s.penMutes).where(eq(s.penMutes.muterId, a.userId));
    const names = await displayNames(ctx.db, [...rows.map((r) => r.blockedId), ...mutesRows.map((m) => m.mutedId)]);
    return {
      blocked: rows.map((r) => ({ userId: r.blockedId, ...names.get(r.blockedId) })),
      muted: mutesRows.map((m) => ({ userId: m.mutedId, ...names.get(m.mutedId) })),
      // Pen-name mutes: only the pen name and an opaque handle — never the author's account.
      mutedPenNames: penRows.map((m) => ({ ref: penMuteRef(ctx.config.appSecret, a.userId, m.authorId), penName: m.penName, createdAt: m.createdAt })),
    };
  });

  app.delete('/api/v1/pen-mutes/:ref', async (req) => {
    const a = requireAuth(req);
    const { ref } = parse(z.object({ ref: z.string().regex(/^[a-f0-9]{32}$/) }), req.params);
    const rows = await ctx.db.select({ authorId: s.penMutes.authorId }).from(s.penMutes).where(eq(s.penMutes.muterId, a.userId));
    const hit = rows.find((r) => penMuteRef(ctx.config.appSecret, a.userId, r.authorId) === ref);
    if (!hit) throw notFound('Mute');
    await ctx.db.delete(s.penMutes).where(and(eq(s.penMutes.muterId, a.userId), eq(s.penMutes.authorId, hit.authorId)));
    return { ok: true };
  });

  app.post('/api/v1/mutes/:userId', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    await ctx.db.insert(s.mutes).values({ muterId: a.userId, mutedId: userId }).onConflictDoNothing();
    return { ok: true };
  });
  app.delete('/api/v1/mutes/:userId', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    await ctx.db.delete(s.mutes).where(and(eq(s.mutes.muterId, a.userId), eq(s.mutes.mutedId, userId)));
    return { ok: true };
  });

  /* ---------- Posts ---------- */
  const PostBody = z.object({
    kind: z.enum(['text', 'image', 'cosmic_card', 'poll', 'story', 'voice', ...THOUGHT_KINDS]),
    pseudonymous: z.boolean().default(false),
    body: z.string().trim().max(2000).default(''),
    imageUrl: z.string().startsWith('/uploads/public/').optional(),
    /** Photo carousel: 2–4 of your own uploads. */
    imageUrls: z.array(z.string().startsWith('/uploads/public/')).min(2).max(4).optional(),
    audioUrl: z.string().startsWith('/uploads/public/').optional(),
    audioSeconds: z.number().int().min(1).max(60).optional(),
    topics: z.array(z.enum(TOPICS as [string, ...string[]])).max(4).default([]),
    visibility: z.enum(['public', 'followers', 'group']).default('followers'),
    groupId: z.uuid().optional(),
    pollOptions: z.array(z.string().trim().min(1).max(80)).min(2).max(4).optional(),
    temporaryHours: z.number().int().min(1).max(168).optional(),
    cardType: z.enum(['big_three', 'nakshatra', 'achievement']).optional(),
  });

  app.post('/api/v1/posts/image', async (req) => {
    const a = requireAuth(req);
    const file = await req.file();
    if (!file) throw badRequest('No file uploaded');
    const saved = await storage.save(await file.toBuffer(), { allowed: IMAGE_TYPES, isPrivate: false, maxBytes: ctx.config.MAX_UPLOAD_MB * 1048576 });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'post', path: saved.path, mime: saved.mime, bytes: saved.bytes });
    return { url: `/uploads/${saved.path}` };
  });

  /** Voice note upload (≤ 60 s, ≤ 1.5 MB). Type is detected from the bytes, not the browser's claim. */
  app.post('/api/v1/posts/audio', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email to post.');
    const file = await req.file();
    if (!file) throw badRequest('No recording uploaded');
    const saved = await storage.save(await file.toBuffer(), { allowed: AUDIO_TYPES, isPrivate: false, maxBytes: VOICE_MAX_BYTES });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'post_audio', path: saved.path, mime: saved.mime, bytes: saved.bytes });
    return { url: `/uploads/${saved.path}`, mime: saved.mime };
  });

  app.post('/api/v1/posts', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email to post publicly.');
    const body = parse(PostBody, req.body);
    if (body.kind === 'poll' && !body.pollOptions) throw badRequest('Polls need 2–4 options.');
    if (body.imageUrls && !body.imageUrl) body.imageUrl = body.imageUrls[0];
    if (body.kind === 'image' && !body.imageUrl) throw badRequest('Attach an image.');
    if (body.kind === 'voice' && (!body.audioUrl || !body.audioSeconds)) throw badRequest('Record a voice note first.');
    if (body.audioUrl && body.kind !== 'voice') throw badRequest('Voice notes are posted as a voice Thought Drop.');
    // Every attached file must be the author's own upload of the right kind.
    const attached = [...new Set([...(body.imageUrl ? [body.imageUrl] : []), ...(body.imageUrls ?? [])])].map((u) => ({ path: u.slice('/uploads/'.length), purpose: 'post' }));
    if (body.audioUrl) attached.push({ path: body.audioUrl.slice('/uploads/'.length), purpose: 'post_audio' });
    if (attached.length) {
      const own = await ctx.db.select({ path: s.uploads.path, purpose: s.uploads.purpose }).from(s.uploads).where(and(eq(s.uploads.ownerId, a.userId), inArray(s.uploads.path, attached.map((x) => x.path))));
      if (attached.some((x) => !own.some((o) => o.path === x.path && o.purpose === x.purpose))) throw badRequest(body.audioUrl ? 'Upload the recording first.' : 'Upload the image first.');
    }
    if (TEXT_KINDS.includes(body.kind) && !body.body) throw badRequest('Write something first.');
    if ((THOUGHT_KINDS as readonly string[]).includes(body.kind) && body.body.length > 500) throw badRequest('Thought Drops are up to 500 characters.');
    let penName: string | null = null;
    if (body.pseudonymous) {
      if (body.visibility === 'followers') throw badRequest('Pseudonymous posts can be public or shared in a circle, not followers-only.');
      const [pen] = await ctx.db.select({ p: s.profiles.pseudonym }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
      if (!pen?.p) throw badRequest('Choose a pen name in Identity Studio before posting pseudonymously.');
      penName = pen.p;
    }
    const screened = screenText(body.body, await blockedPhrases(ctx.db), { protectIdentity: body.pseudonymous || body.kind === 'confession' });
    if (!screened.ok) throw badRequest(screened.reason!);
    if (body.visibility === 'group') {
      if (!body.groupId) throw badRequest('Choose a group.');
      const [m] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, body.groupId), eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active')));
      if (!m) throw forbidden('Join the group to post in it.');
      const [g] = await ctx.db.select({ archivedAt: s.groups.archivedAt }).from(s.groups).where(eq(s.groups.id, body.groupId));
      if (!g || g.archivedAt) throw forbidden('This group is no longer active.');
    }
    const recent = await ctx.db.select({ body: s.posts.body }).from(s.posts).where(and(eq(s.posts.authorId, a.userId), gt(s.posts.createdAt, new Date(Date.now() - 86400000))));
    const spam = spamCheck(body.body, recent.map((r) => r.body));
    if (spam) throw badRequest(spam);
    let card: Record<string, unknown> | null = null;
    if (body.kind === 'cosmic_card') {
      const b3 = await bigThreeFor(ctx.db, a.userId);
      if (!b3) throw badRequest('Complete your Cosmic ID to share a card.');
      card = body.cardType === 'nakshatra' ? { type: 'nakshatra', nakshatra: b3.vedic.nakshatra, pada: b3.vedic.pada, rashi: b3.vedic.rashi }
        : { type: 'big_three', sun: b3.western.sun, moon: b3.western.moon, rising: b3.western.rising, rashi: b3.vedic.rashi, nakshatra: b3.vedic.nakshatra };
    }
    const expiresAt = body.kind === 'story' ? new Date(Date.now() + 24 * 3600000) : body.temporaryHours ? new Date(Date.now() + body.temporaryHours * 3600000) : null;
    const post = await ctx.db.transaction(async (tx) => {
      const [p] = await tx.insert(s.posts).values({
        authorId: a.userId, groupId: body.groupId ?? null, kind: body.kind, body: body.body, imageUrl: body.imageUrl ?? null, card,
        imageUrls: body.imageUrls ?? [], audioUrl: body.audioUrl ?? null, audioSeconds: body.audioUrl ? body.audioSeconds! : null,
        topics: body.topics, visibility: body.visibility, expiresAt, pseudonymous: body.pseudonymous, penName,
      }).returning();
      if (body.kind === 'poll') await tx.insert(s.pollOptions).values(body.pollOptions!.map((label, position) => ({ postId: p.id, label, position })));
      const [loc] = await tx.select().from(s.userLocations).where(eq(s.userLocations.userId, a.userId));
      await awardXp(ctx, tx, a.userId, 'post_created', { localDate: DateTime.now().setZone(loc?.timezone ?? 'Asia/Kolkata').toISODate()! });
      await evaluateAchievements(ctx, tx, a.userId, ['posts', 'card_posts', 'poll_posts']);
      await track(tx, a.userId, 'post_created', { kind: body.kind, visibility: body.visibility, pseudonymous: body.pseudonymous });
      await recordFirstAction(tx, a.userId, 'thought');
      return p;
    });
    await evaluateReferral(ctx, ctx.db, a.userId);
    if (post.groupId) await checkCircleActivation(ctx, ctx.db, post.groupId);
    return { post: { ...post, authorId: post.pseudonymous ? undefined : post.authorId } };
  });

  /** Edit text within the edit window; edits are re-screened and marked as edited. */
  app.patch('/api/v1/posts/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
    const [p] = await ctx.db.select().from(s.posts).where(and(eq(s.posts.id, id), eq(s.posts.authorId, a.userId), isNull(s.posts.deletedAt)));
    if (!p) throw notFound('Post');
    if (!TEXT_KINDS.includes(p.kind) || p.kind === 'poll') throw badRequest('Only text posts can be edited.');
    if (Date.now() - p.createdAt.getTime() > EDIT_WINDOW_MS) throw badRequest('Posts can be edited for 15 minutes after publishing.');
    if ((THOUGHT_KINDS as readonly string[]).includes(p.kind) && body.length > 500) throw badRequest('Thought Drops are up to 500 characters.');
    const screened = screenText(body, await blockedPhrases(ctx.db), { protectIdentity: p.pseudonymous || p.kind === 'confession' });
    if (!screened.ok) throw badRequest(screened.reason!);
    await ctx.db.update(s.posts).set({ body, editedAt: new Date() }).where(eq(s.posts.id, id));
    return { ok: true };
  });

  /** Mute the author of a post without revealing who they are (works for pseudonymous posts). */
  app.post('/api/v1/posts/:id/mute-author', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [p] = await ctx.db.select().from(s.posts).where(eq(s.posts.id, id));
    if (!p || !(await canViewPost(ctx.db, a.userId, p))) throw notFound('Post');
    if (p.authorId === a.userId) throw badRequest('You cannot mute yourself.');
    if (p.pseudonymous) {
      // A pen-name mute hides only this author's pen-name posts and is listed by pen name, never by account.
      const [pen] = p.penName ? [{ p: p.penName }] : await ctx.db.select({ p: s.profiles.pseudonym }).from(s.profiles).where(eq(s.profiles.userId, p.authorId));
      await ctx.db.insert(s.penMutes).values({ muterId: a.userId, authorId: p.authorId, penName: pen?.p ?? 'Anonymous member' }).onConflictDoNothing();
    } else {
      await ctx.db.insert(s.mutes).values({ muterId: a.userId, mutedId: p.authorId }).onConflictDoNothing();
    }
    await track(ctx.db, a.userId, 'block_applied', { kind: p.pseudonymous ? 'mute_pen_name' : 'mute_author' });
    return { ok: true };
  });

  app.get('/api/v1/feed', async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ mode: z.enum(['ranked', 'chronological', 'following']).default('ranked'), topic: z.string().optional(), kind: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).max(500).default(0) }), req.query);
    const since = new Date(Date.now() - 14 * 86400000);
    const following = (await ctx.db.select({ id: s.follows.followeeId }).from(s.follows).where(and(eq(s.follows.followerId, a.userId), eq(s.follows.status, 'accepted')))).map((r) => r.id);
    const groupsIn = (await ctx.db.select({ id: s.groupMembers.groupId }).from(s.groupMembers).where(and(eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active')))).map((r) => r.id);
    const excluded = await blockedSet(ctx.db, a.userId);
    const isMuted = await muteFilters(ctx.db, a.userId);
    // Following mode never includes other people's pen-name posts: it would narrow their author to people you follow.
    const visibility = q.mode === 'following'
      ? and(inArray(s.posts.authorId, [a.userId, ...following]), ne(s.posts.visibility, 'group'), or(eq(s.posts.pseudonymous, false), eq(s.posts.authorId, a.userId)))
      : or(
        eq(s.posts.authorId, a.userId),
        eq(s.posts.visibility, 'public'),
        following.length ? and(eq(s.posts.visibility, 'followers'), inArray(s.posts.authorId, following)) : sql`false`,
        groupsIn.length ? and(eq(s.posts.visibility, 'group'), inArray(s.posts.groupId, groupsIn)) : sql`false`,
      );
    const rows = await ctx.db.select().from(s.posts).where(and(
      isNull(s.posts.deletedAt), eq(s.posts.hiddenByModeration, false), gte(s.posts.createdAt, since), ne(s.posts.kind, 'story'),
      or(isNull(s.posts.expiresAt), gt(s.posts.expiresAt, new Date())), visibility,
      q.topic ? sql`${q.topic} = any(${s.posts.topics})` : undefined, q.kind ? eq(s.posts.kind, q.kind) : undefined,
    )).orderBy(desc(s.posts.createdAt)).limit(400);
    const visible = rows.filter((r) => !excluded.has(r.authorId) && !isMuted(r));
    const ids = visible.map((r) => r.id);
    const rc = ids.length ? await ctx.db.select({ postId: s.reactions.postId, n: sql<number>`count(*)::int` }).from(s.reactions).where(inArray(s.reactions.postId, ids)).groupBy(s.reactions.postId) : [];
    const cc = ids.length ? await ctx.db.select({ postId: s.comments.postId, n: sql<number>`count(*)::int` }).from(s.comments).where(and(inArray(s.comments.postId, ids), isNull(s.comments.deletedAt), eq(s.comments.hiddenByModeration, false))).groupBy(s.comments.postId) : [];
    const reportsOpen = ids.length ? await ctx.db.select({ id: s.reports.targetId, n: sql<number>`count(*)::int` }).from(s.reports).where(and(eq(s.reports.targetType, 'post'), eq(s.reports.status, 'open'), inArray(s.reports.targetId, ids))).groupBy(s.reports.targetId) : [];
    const [me] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const feedback = await ctx.db.select({ signal: s.feedFeedback.signal, authorId: s.posts.authorId }).from(s.feedFeedback).innerJoin(s.posts, eq(s.posts.id, s.feedFeedback.postId)).where(eq(s.feedFeedback.userId, a.userId));
    const cands: FeedCandidate[] = visible.map((r) => ({
      id: r.id, authorId: r.authorId, kind: r.kind, topics: r.topics, createdAt: r.createdAt, groupId: r.groupId, pseudonymous: r.pseudonymous,
      reactionCount: rc.find((x) => x.postId === r.id)?.n ?? 0, commentCount: cc.find((x) => x.postId === r.id)?.n ?? 0,
      openReports: reportsOpen.find((x) => x.id === r.id)?.n ?? 0,
    }));
    const ranked = rankFeed(cands, {
      userId: a.userId, following: new Set(following), interests: me.interests.map((i) => i.toLowerCase()), preferredKinds: [],
      moreLikeAuthors: new Set(feedback.filter((f) => f.signal === 'more_like_this').map((f) => f.authorId)),
      lessLikeAuthors: new Set(feedback.filter((f) => f.signal === 'less_like_this').map((f) => f.authorId)),
    }, new Date(), q.mode === 'ranked' ? 'ranked' : 'chronological');
    const pageItems = ranked.slice(q.offset, q.offset + q.limit);
    const byId = new Map(visible.map((r) => [r.id, r]));
    const posts = await hydratePosts(ctx.db, a.userId, pageItems.map((r) => byId.get(r.id)!), new Map(pageItems.map((r) => [r.id, r.reasons])));
    return { posts, mode: q.mode, nextOffset: q.offset + q.limit < ranked.length ? q.offset + q.limit : null, rankingExplanation: 'Ranked by follows, your interests, recency, explicit engagement and your feedback. Switch to chronological any time.' };
  });

  app.get('/api/v1/stories', async (req) => {
    const a = requireAuth(req);
    const following = (await ctx.db.select({ id: s.follows.followeeId }).from(s.follows).where(and(eq(s.follows.followerId, a.userId), eq(s.follows.status, 'accepted')))).map((r) => r.id);
    const excluded = await blockedSet(ctx.db, a.userId);
    const rows = await ctx.db.select().from(s.posts).where(and(eq(s.posts.kind, 'story'), isNull(s.posts.deletedAt), eq(s.posts.hiddenByModeration, false), gt(s.posts.expiresAt, new Date()), inArray(s.posts.authorId, [a.userId, ...following]))).orderBy(desc(s.posts.createdAt)).limit(100);
    return { stories: await hydratePosts(ctx.db, a.userId, rows.filter((r) => !excluded.has(r.authorId))) };
  });

  app.get('/api/v1/users/:userId/posts', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.params);
    const rows = await ctx.db.select().from(s.posts).where(and(eq(s.posts.authorId, userId), isNull(s.posts.deletedAt), ne(s.posts.kind, 'story'), userId === a.userId ? undefined : eq(s.posts.pseudonymous, false))).orderBy(desc(s.posts.createdAt)).limit(50);
    const visible = [];
    for (const r of rows) if (await canViewPost(ctx.db, a.userId, r)) visible.push(r);
    return { posts: await hydratePosts(ctx.db, a.userId, visible) };
  });

  app.get('/api/v1/posts/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [p] = await ctx.db.select().from(s.posts).where(eq(s.posts.id, id));
    if (!p || !(await canViewPost(ctx.db, a.userId, p))) throw notFound('Post');
    const excluded = await blockedSet(ctx.db, a.userId);
    const cs = await ctx.db.select().from(s.comments).where(and(eq(s.comments.postId, id), isNull(s.comments.deletedAt), eq(s.comments.hiddenByModeration, false))).orderBy(s.comments.createdAt);
    const visibleComments = cs.filter((c) => !excluded.has(c.authorId));
    const post = (await hydratePosts(ctx.db, a.userId, [p]))[0];
    return { post, comments: await serializeComments(ctx.db, a.userId, p, visibleComments) };
  });

  app.delete('/api/v1/posts/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const res = await ctx.db.update(s.posts).set({ deletedAt: new Date() }).where(and(eq(s.posts.id, id), eq(s.posts.authorId, a.userId))).returning();
    if (!res.length) throw notFound('Post');
    return { ok: true };
  });

  app.post('/api/v1/posts/:id/react', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { kind } = parse(z.object({ kind: z.enum(['star', 'moon', 'sun', 'heart']).nullable() }), req.body);
    const [p] = await ctx.db.select().from(s.posts).where(eq(s.posts.id, id));
    if (!p || !(await canViewPost(ctx.db, a.userId, p))) throw notFound('Post');
    await ctx.db.delete(s.reactions).where(and(eq(s.reactions.postId, id), eq(s.reactions.userId, a.userId)));
    if (kind) {
      await ctx.db.insert(s.reactions).values({ postId: id, userId: a.userId, kind });
      if (p.authorId !== a.userId) {
        const names = await displayNames(ctx.db, [a.userId]);
        await notify(ctx, ctx.db, { userId: p.authorId, category: 'social', title: `${names.get(a.userId)?.displayName} reacted to your post`, link: `/social/post/${id}`, dedupeKey: `react:${id}:${a.userId}` });
      }
    }
    return { ok: true };
  });

  app.post('/api/v1/posts/:id/vote', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { optionId } = parse(z.object({ optionId: z.uuid() }), req.body);
    const [p] = await ctx.db.select().from(s.posts).where(and(eq(s.posts.id, id), eq(s.posts.kind, 'poll')));
    if (!p || !(await canViewPost(ctx.db, a.userId, p))) throw notFound('Poll');
    const [opt] = await ctx.db.select().from(s.pollOptions).where(and(eq(s.pollOptions.id, optionId), eq(s.pollOptions.postId, id)));
    if (!opt) throw badRequest('Invalid option');
    const res = await ctx.db.insert(s.pollVotes).values({ postId: id, userId: a.userId, optionId }).onConflictDoNothing().returning();
    if (!res.length) throw conflict('You have already voted in this poll.');
    return { ok: true };
  });

  app.post('/api/v1/posts/:id/comments', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ body: z.string().trim().min(1).max(1000), parentId: z.uuid().optional() }), req.body);
    const [p] = await ctx.db.select().from(s.posts).where(eq(s.posts.id, id));
    if (!p || !(await canViewPost(ctx.db, a.userId, p))) throw notFound('Post');
    const spam = spamCheck(body.body, []);
    if (spam) throw badRequest(spam);
    const screened = screenText(body.body, await blockedPhrases(ctx.db));
    if (!screened.ok) throw badRequest(screened.reason!);
    if (body.parentId) {
      const [parent] = await ctx.db.select().from(s.comments).where(and(eq(s.comments.id, body.parentId), eq(s.comments.postId, id), isNull(s.comments.deletedAt)));
      if (!parent) throw badRequest('That reply no longer exists.');
      if (parent.parentId) {
        const [grand] = await ctx.db.select({ p: s.comments.parentId }).from(s.comments).where(eq(s.comments.id, parent.parentId));
        if (grand?.p) throw badRequest('Threads go three levels deep; reply to an earlier message instead.');
      }
    }
    const c = await ctx.db.transaction(async (tx) => {
      // The pen-name author replying in their own thread keeps the pen name (never their real identity).
      const asPseudonym = p.pseudonymous && p.authorId === a.userId;
      const [row] = await tx.insert(s.comments).values({ postId: id, authorId: a.userId, parentId: body.parentId ?? null, body: body.body, asPseudonym }).returning();
      await awardXp(ctx, tx, a.userId, 'comment_created', { localDate: DateTime.utc().toISODate()! });
      await evaluateAchievements(ctx, tx, a.userId, ['comments']);
      await track(tx, a.userId, 'comment_created', {});
      // One reply point per (post, replier); never for replying to yourself.
      if (p.authorId !== a.userId) await awardXp(ctx, tx, p.authorId, 'reply_received', { sourceId: `${id}:${a.userId}` });
      return row;
    });
    if (p.authorId !== a.userId) {
      const names = await displayNames(ctx.db, [a.userId]);
      await notify(ctx, ctx.db, { userId: p.authorId, category: 'social', title: `${names.get(a.userId)?.displayName} commented on your post`, body: body.body.slice(0, 80), link: `/social/post/${id}` });
    }
    return { comment: (await serializeComments(ctx.db, a.userId, p, [c]))[0] };
  });

  app.delete('/api/v1/comments/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const res = await ctx.db.update(s.comments).set({ deletedAt: new Date() }).where(and(eq(s.comments.id, id), eq(s.comments.authorId, a.userId))).returning();
    if (!res.length) throw notFound('Comment');
    return { ok: true };
  });

  app.post('/api/v1/posts/:id/save', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { saved } = parse(z.object({ saved: z.boolean() }), req.body);
    const [p] = await ctx.db.select().from(s.posts).where(eq(s.posts.id, id));
    if (!p || !(await canViewPost(ctx.db, a.userId, p))) throw notFound('Post');
    if (saved) await ctx.db.insert(s.savedPosts).values({ userId: a.userId, postId: id }).onConflictDoNothing();
    else await ctx.db.delete(s.savedPosts).where(and(eq(s.savedPosts.userId, a.userId), eq(s.savedPosts.postId, id)));
    return { ok: true };
  });

  app.get('/api/v1/saved-posts', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select({ p: s.posts }).from(s.savedPosts).innerJoin(s.posts, eq(s.posts.id, s.savedPosts.postId)).where(eq(s.savedPosts.userId, a.userId)).orderBy(desc(s.savedPosts.createdAt));
    const visible = [];
    for (const r of rows) if (await canViewPost(ctx.db, a.userId, r.p)) visible.push(r.p);
    return { posts: await hydratePosts(ctx.db, a.userId, visible) };
  });

  app.post('/api/v1/posts/:id/feedback', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { signal } = parse(z.object({ signal: z.enum(['more_like_this', 'less_like_this']) }), req.body);
    const [fp] = await ctx.db.select().from(s.posts).where(eq(s.posts.id, id));
    if (!fp || !(await canViewPost(ctx.db, a.userId, fp))) throw notFound('Post');
    await ctx.db.insert(s.feedFeedback).values({ userId: a.userId, postId: id, signal }).onConflictDoUpdate({ target: [s.feedFeedback.userId, s.feedFeedback.postId], set: { signal } });
    return { ok: true };
  });

  /* ---------- Groups & creator channels ---------- */
  app.get('/api/v1/groups', async (req) => {
    const a = requireAuth(req);
    const { q, mine } = parse(z.object({ q: z.string().max(60).optional(), mine: z.coerce.boolean().optional() }), req.query);
    const memberships = await ctx.db.select().from(s.groupMembers).where(eq(s.groupMembers.userId, a.userId));
    const rows = await ctx.db.select().from(s.groups).where(and(isNull(s.groups.archivedAt), ne(s.groups.kind, 'circle'),
      mine ? inArray(s.groups.id, memberships.length ? memberships.map((m) => m.groupId) : ['00000000-0000-0000-0000-000000000000']) : undefined,
      q ? sql`(${s.groups.name} ilike ${'%' + q + '%'} or ${s.groups.description} ilike ${'%' + q + '%'})` : undefined)).orderBy(desc(s.groups.createdAt)).limit(50);
    const counts = rows.length ? await ctx.db.select({ g: s.groupMembers.groupId, n: sql<number>`count(*)::int` }).from(s.groupMembers).where(and(inArray(s.groupMembers.groupId, rows.map((r) => r.id)), eq(s.groupMembers.status, 'active'))).groupBy(s.groupMembers.groupId) : [];
    return { groups: rows.map((g) => ({ ...g, memberCount: counts.find((c) => c.g === g.id)?.n ?? 0, membership: memberships.find((m) => m.groupId === g.id) ?? null })) };
  });

  app.post('/api/v1/groups', async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email to create a group.');
    const body = parse(z.object({ name: z.string().trim().min(3).max(60), description: z.string().max(500).default(''), visibility: z.enum(['public', 'private']), kind: z.enum(['community', 'creator_channel']).default('community'), tags: z.array(z.string().max(24)).max(5).default([]) }), req.body);
    if (body.kind === 'creator_channel' && !a.roles.includes('creator') && !a.roles.includes('admin')) throw forbidden('Creator channels are available to approved creators.');
    const slug = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
    const g = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.insert(s.groups).values({ ...body, slug, ownerId: a.userId }).returning();
      await tx.insert(s.groupMembers).values({ groupId: row.id, userId: a.userId, role: 'owner', status: 'active' });
      return row;
    });
    return { group: g };
  });

  app.get('/api/v1/groups/:slug', async (req) => {
    const a = requireAuth(req);
    const { slug } = parse(z.object({ slug: z.string() }), req.params);
    const [g] = await ctx.db.select().from(s.groups).where(and(eq(s.groups.slug, slug), isNull(s.groups.archivedAt)));
    if (!g) throw notFound('Group');
    const [m] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.userId, a.userId)));
    if (g.kind === 'circle' && m?.status !== 'active') throw notFound('Group');
    const canSee = g.visibility === 'public' || m?.status === 'active';
    const posts = canSee ? await ctx.db.select().from(s.posts).where(and(eq(s.posts.groupId, g.id), isNull(s.posts.deletedAt), eq(s.posts.hiddenByModeration, false))).orderBy(desc(s.posts.createdAt)).limit(50) : [];
    const members = canSee ? await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.status, 'active'))).limit(100) : [];
    const pending = m?.role === 'owner' || m?.role === 'moderator' ? await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.status, 'pending'))) : [];
    const names = await displayNames(ctx.db, [...members.map((x) => x.userId), ...pending.map((x) => x.userId)]);
    const events = await ctx.db.select().from(s.events).where(and(eq(s.events.groupId, g.id), gt(s.events.endsAt, new Date()))).orderBy(s.events.startsAt).limit(10);
    return {
      group: g, membership: m ?? null, canSee,
      posts: await hydratePosts(ctx.db, a.userId, posts),
      members: members.map((x) => ({ userId: x.userId, role: x.role, ...names.get(x.userId) })),
      pending: pending.map((x) => ({ userId: x.userId, ...names.get(x.userId) })),
      events,
    };
  });

  app.post('/api/v1/groups/:id/join', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [g] = await ctx.db.select().from(s.groups).where(eq(s.groups.id, id));
    if (!g || g.kind === 'circle') throw notFound('Group');
    const [existing] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, a.userId)));
    if (existing?.status === 'banned') throw forbidden('You cannot join this group.');
    const status = g.visibility === 'public' ? 'active' : 'pending';
    await ctx.db.insert(s.groupMembers).values({ groupId: id, userId: a.userId, role: 'member', status }).onConflictDoNothing();
    if (status === 'active') {
      await awardXp(ctx, ctx.db, a.userId, 'group_joined', { sourceId: id });
      await evaluateAchievements(ctx, ctx.db, a.userId, ['groups']);
    } else {
      await notify(ctx, ctx.db, { userId: g.ownerId, category: 'social', title: `Someone asked to join ${g.name}`, link: `/social/groups/${g.slug}` });
    }
    return { status };
  });

  app.post('/api/v1/groups/:id/leave', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [m] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, a.userId)));
    if (m?.role === 'owner') throw badRequest('Owners cannot leave their own group.');
    await ctx.db.delete(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, a.userId), ne(s.groupMembers.status, 'banned')));
    return { ok: true };
  });

  app.post('/api/v1/groups/:id/members/:userId', async (req) => {
    const a = requireAuth(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const { action } = parse(z.object({ action: z.enum(['approve', 'remove', 'ban', 'make_moderator']) }), req.body);
    const [me] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active')));
    if (!me || !['owner', 'moderator'].includes(me.role)) throw forbidden('Only group owners and moderators can do this.');
    if (action === 'make_moderator' && me.role !== 'owner') throw forbidden('Only the owner can appoint moderators.');
    const [target] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
    if (!target) throw notFound('Member');
    if (target.role === 'owner') throw forbidden('The owner cannot be moderated.');
    if (target.role === 'moderator' && me.role !== 'owner') throw forbidden('Only the owner can act on moderators.');
    if (action === 'approve') await ctx.db.update(s.groupMembers).set({ status: 'active' }).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
    if (action === 'remove') await ctx.db.delete(s.groupMembers).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
    if (action === 'ban') await ctx.db.update(s.groupMembers).set({ status: 'banned' }).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
    if (action === 'make_moderator') await ctx.db.update(s.groupMembers).set({ role: 'moderator' }).where(and(eq(s.groupMembers.groupId, id), eq(s.groupMembers.userId, userId)));
    await audit(ctx.db, { actorId: a.userId, action: `group.member_${action}`, targetType: 'group', targetId: id, meta: { userId } });
    return { ok: true };
  });

  /* ---------- Events ---------- */
  app.get('/api/v1/events', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.events).where(and(gt(s.events.endsAt, new Date()), ne(s.events.status, 'cancelled'), eventVisibleSql(a.userId))).orderBy(s.events.startsAt).limit(50);
    const rsvps = rows.length ? await ctx.db.select().from(s.eventRsvps).where(and(eq(s.eventRsvps.userId, a.userId), inArray(s.eventRsvps.eventId, rows.map((r) => r.id)))) : [];
    const counts = rows.length ? await ctx.db.select({ e: s.eventRsvps.eventId, n: sql<number>`count(*)::int` }).from(s.eventRsvps).where(and(inArray(s.eventRsvps.eventId, rows.map((r) => r.id)), inArray(s.eventRsvps.status, ['going', 'attended']))).groupBy(s.eventRsvps.eventId) : [];
    const names = await displayNames(ctx.db, rows.map((r) => r.hostId));
    return { events: rows.map((e) => { const r = rsvps.find((x) => x.eventId === e.id); return { ...e, liveUrl: r && r.status !== 'cancelled' ? e.liveUrl : null, host: names.get(e.hostId), myRsvp: r?.status ?? null, going: counts.find((c) => c.e === e.id)?.n ?? 0 }; }) };
  });

  app.post('/api/v1/events', async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email to host events.');
    const body = parse(z.object({
      title: z.string().trim().min(3).max(100), description: z.string().max(2000).default(''), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(),
      mode: z.enum(['online', 'in_person']), location: z.string().max(200).optional(), liveUrl: z.url().optional(), capacity: z.number().int().min(1).max(10000).optional(),
      groupId: z.uuid().optional(), kind: z.enum(['community', 'workshop', 'live_class', 'challenge']).default('community'),
    }), req.body);
    if (new Date(body.endsAt) <= new Date(body.startsAt)) throw badRequest('End time must be after start time.');
    if (body.groupId) {
      const [m] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, body.groupId), eq(s.groupMembers.userId, a.userId), inArray(s.groupMembers.role, ['owner', 'moderator'])));
      if (!m) throw forbidden('Only group owners and moderators can schedule group events.');
    }
    const [e] = await ctx.db.insert(s.events).values({ ...body, hostId: a.userId, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) }).returning();
    return { event: e };
  });

  app.post('/api/v1/events/:id/rsvp', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status } = parse(z.object({ status: z.enum(['going', 'interested', 'cancelled']) }), req.body);
    const [e] = await ctx.db.select().from(s.events).where(and(eq(s.events.id, id), eventVisibleSql(a.userId)));
    if (!e || e.status === 'cancelled') throw notFound('Event');
    if (e.pricePaise > 0) throw badRequest('Paid events are booked through the marketplace.');
    if (status === 'going' && e.capacity) {
      const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.eventRsvps).where(and(eq(s.eventRsvps.eventId, id), eq(s.eventRsvps.status, 'going')));
      if (n >= e.capacity) throw conflict('This event is full.');
    }
    await ctx.db.insert(s.eventRsvps).values({ eventId: id, userId: a.userId, status }).onConflictDoUpdate({ target: [s.eventRsvps.eventId, s.eventRsvps.userId], set: { status } });
    if (status === 'going') {
      await ctx.db.insert(s.scheduledReminders).values({ userId: a.userId, category: 'social', title: `Starting soon: ${e.title}`, link: '/social/events', dueAt: new Date(e.startsAt.getTime() - 3600000), sourceKey: `event:${id}` }).onConflictDoNothing();
    }
    return { ok: true };
  });

  /** Host marks attendance; attendance drives the events achievement (server-verified). */
  app.post('/api/v1/events/:id/attendance', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { userIds } = parse(z.object({ userIds: z.array(z.uuid()).max(500) }), req.body);
    const [e] = await ctx.db.select().from(s.events).where(and(eq(s.events.id, id), eq(s.events.hostId, a.userId)));
    if (!e) throw notFound('Event');
    if (e.startsAt > new Date()) throw badRequest('Attendance can be recorded once the event has started.');
    for (const uid of userIds) {
      const res = await ctx.db.update(s.eventRsvps).set({ status: 'attended' }).where(and(eq(s.eventRsvps.eventId, id), eq(s.eventRsvps.userId, uid), eq(s.eventRsvps.status, 'going'))).returning();
      if (res.length) {
        await awardXp(ctx, ctx.db, uid, 'event_attended', { sourceId: id });
        await evaluateAchievements(ctx, ctx.db, uid, ['events_attended']);
      }
    }
    return { ok: true };
  });

  app.get('/api/v1/events/:id/attendees', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [e] = await ctx.db.select().from(s.events).where(and(eq(s.events.id, id), eq(s.events.hostId, a.userId)));
    if (!e) throw notFound('Event');
    const rows = await ctx.db.select().from(s.eventRsvps).where(eq(s.eventRsvps.eventId, id));
    const names = await displayNames(ctx.db, rows.map((r) => r.userId));
    return { attendees: rows.map((r) => ({ userId: r.userId, status: r.status, ...names.get(r.userId) })) };
  });

  /* ---------- Reports ---------- */
  app.post('/api/v1/reports', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req, { allowSuspended: false });
    const body = parse(z.object({
      targetType: z.enum(['user', 'post', 'comment', 'message', 'dating_profile', 'expert', 'review', 'product', 'vendor', 'group', 'matchmaking_profile', 'game_submission', 'quiz', 'tournament']),
      targetId: z.uuid(), reason: z.enum(['spam', 'harassment', 'scam', 'impersonation', 'underage', 'inappropriate', 'hate', 'self_harm', 'other']),
      details: z.string().max(2000).default(''),
    }), req.body);
    let targetUserId: string | null = null;
    if (body.targetType === 'user' || body.targetType === 'dating_profile' || body.targetType === 'expert' || body.targetType === 'matchmaking_profile') targetUserId = body.targetId;
    if (body.targetType === 'post') targetUserId = (await ctx.db.select({ u: s.posts.authorId }).from(s.posts).where(eq(s.posts.id, body.targetId)))[0]?.u ?? null;
    if (body.targetType === 'quiz') targetUserId = (await ctx.db.select({ u: s.memberQuizzes.authorId }).from(s.memberQuizzes).where(eq(s.memberQuizzes.id, body.targetId)))[0]?.u ?? null;
    if (body.targetType === 'tournament') targetUserId = (await ctx.db.select({ u: s.tournaments.hostId }).from(s.tournaments).where(eq(s.tournaments.id, body.targetId)))[0]?.u ?? null;
    if (body.targetType === 'comment') targetUserId = (await ctx.db.select({ u: s.comments.authorId }).from(s.comments).where(eq(s.comments.id, body.targetId)))[0]?.u ?? null;
    if (body.targetType === 'message') {
      const [m] = await ctx.db.select().from(s.messages).where(eq(s.messages.id, body.targetId));
      const [member] = m ? await ctx.db.select().from(s.conversationMembers).where(and(eq(s.conversationMembers.conversationId, m.conversationId), eq(s.conversationMembers.userId, a.userId))) : [];
      if (!m || !member) throw notFound('Message');
      targetUserId = m.senderId;
    }
    if (body.targetType === 'game_submission') {
      const [sub] = await ctx.db.select().from(s.gameSubmissions).where(eq(s.gameSubmissions.id, body.targetId));
      const [member] = sub ? await ctx.db.select().from(s.gameParticipants).where(and(eq(s.gameParticipants.sessionId, sub.sessionId), eq(s.gameParticipants.userId, a.userId))) : [];
      if (!sub || !member) throw notFound('Submission');
      targetUserId = sub.userId;
    }
    const queue = ['dating_profile', 'matchmaking_profile'].includes(body.targetType) || body.reason === 'underage' || body.reason === 'scam' ? 'dating_safety' : ['product', 'vendor', 'expert', 'review'].includes(body.targetType) ? 'marketplace' : 'general';
    const priority = ['underage', 'self_harm', 'scam'].includes(body.reason) ? 1 : 2;
    const [r] = await ctx.db.insert(s.reports).values({ reporterId: a.userId, ...body, targetUserId, queue, priority }).returning();
    await track(ctx.db, a.userId, 'report_submitted', { targetType: body.targetType, reason: body.reason });
    return { report: { id: r.id, status: r.status }, message: 'Thanks — our moderation team will review this. You can also block this person at any time.' };
  });

  app.get('/api/v1/reports/mine', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select({ id: s.reports.id, targetType: s.reports.targetType, reason: s.reports.reason, status: s.reports.status, createdAt: s.reports.createdAt }).from(s.reports).where(eq(s.reports.reporterId, a.userId)).orderBy(desc(s.reports.createdAt)).limit(50);
    return { reports: rows };
  });

  void lt;
}
