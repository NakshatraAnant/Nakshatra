import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { notify } from '../lib/notify';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames, isBlockedEitherWay, relationOf } from '../services/identity';
import { COLLAB_RULES as R, composeCollab } from '../../shared/collab';

/**
 * Collaborative Drops. Every rule is enforced here, not in the page:
 *  - only the owner invites, removes, edits the opening, cancels and publishes;
 *  - only people the owner is connected with (and not blocked either way) can be invited;
 *  - only an invited person can accept or decline, and only an accepted one can write their line;
 *  - a removed or declined person's line is never published, and nobody outside the draft can read it;
 *  - publishing goes through the ordinary POST /posts route (same validation, moderation, XP and limits).
 */
export async function collabRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;
  const id = (req: { params: unknown }) => parse(z.object({ id: z.uuid() }), req.params).id;
  const screen = async (text: string) => { const r = screenText(text, await blockedPhrases(db)); if (!r.ok) throw badRequest(r.reason!); };

  async function load(collabId: string, userId: string) {
    const [c] = await db.select().from(s.collabDrops).where(eq(s.collabDrops.id, collabId));
    if (!c) throw notFound('Collaborative Drop');
    const members = await db.select().from(s.collabMembers).where(eq(s.collabMembers.collabId, collabId)).orderBy(s.collabMembers.invitedAt);
    const mine = members.find((m) => m.userId === userId);
    const isOwner = c.ownerId === userId;
    // Removed and declined people lose access; to anyone else the draft does not exist.
    if (!isOwner && (!mine || mine.status === 'removed' || mine.status === 'declined')) throw notFound('Collaborative Drop');
    return { c, members, mine, isOwner };
  }

  async function view(collabId: string, userId: string) {
    const { c, members, mine, isOwner } = await load(collabId, userId);
    const names = await displayNames(db, [c.ownerId, ...members.map((m) => m.userId)]);
    const shown = members.filter((m) => isOwner || m.status === 'accepted' || m.userId === userId);
    const accepted = members.filter((m) => m.status === 'accepted');
    return {
      id: c.id, status: c.status, opening: c.opening, visibility: c.visibility, postId: c.postId, isOwner,
      owner: { userId: c.ownerId, name: names.get(c.ownerId)?.displayName ?? 'Member' },
      myStatus: isOwner ? 'owner' : mine!.status,
      members: shown.map((m) => ({ userId: m.userId, name: names.get(m.userId)?.displayName ?? 'Member', handle: names.get(m.userId)?.handle ?? null, status: m.status, line: m.status === 'accepted' ? m.line : '', you: m.userId === userId })),
      preview: composeCollab(c.opening, accepted.map((m) => ({ name: names.get(m.userId)?.displayName ?? 'Member', text: m.line }))),
      updatedAt: c.updatedAt,
    };
  }

  const draftOnly = (c: { status: string }) => { if (c.status !== 'draft') throw conflict(c.status === 'published' ? 'This drop is already published.' : 'This collaboration was cancelled.'); };

  app.get('/api/v1/collabs', async (req) => {
    const a = requireAuth(req);
    const memberOf = db.select({ id: s.collabMembers.collabId }).from(s.collabMembers).where(and(eq(s.collabMembers.userId, a.userId), inArray(s.collabMembers.status, ['invited', 'accepted'])));
    const rows = await db.select().from(s.collabDrops).where(or(eq(s.collabDrops.ownerId, a.userId), inArray(s.collabDrops.id, memberOf))).orderBy(desc(s.collabDrops.updatedAt)).limit(40);
    return { collabs: await Promise.all(rows.map((r) => view(r.id, a.userId))), rules: R };
  });

  /** People the owner may invite: accepted follows in either direction, minus blocks. */
  app.get('/api/v1/collabs/invitable', async (req) => {
    const a = requireAuth(req);
    const f = await db.select().from(s.follows).where(and(eq(s.follows.status, 'accepted'), or(eq(s.follows.followerId, a.userId), eq(s.follows.followeeId, a.userId))));
    const ids = [...new Set(f.map((x) => (x.followerId === a.userId ? x.followeeId : x.followerId)))].slice(0, 100);
    const names = await displayNames(db, ids);
    const people = [];
    for (const uid of ids) if (!(await isBlockedEitherWay(db, a.userId, uid)) && names.get(uid)) people.push({ userId: uid, name: names.get(uid)!.displayName, handle: names.get(uid)!.handle });
    return { people };
  });

  app.post('/api/v1/collabs', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email to start a Collaborative Drop.');
    const body = parse(z.object({ opening: z.string().trim().min(1).max(R.openingMax), visibility: z.enum(['public', 'followers']).default('public') }), req.body);
    await screen(body.opening);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.collabDrops).where(and(eq(s.collabDrops.ownerId, a.userId), eq(s.collabDrops.status, 'draft')));
    if (n >= R.maxOpenDrafts) throw conflict(`You can have ${R.maxOpenDrafts} collaborations in progress. Publish or cancel one first.`);
    const [c] = await db.insert(s.collabDrops).values({ ownerId: a.userId, opening: body.opening, visibility: body.visibility }).returning();
    return reply.code(201).send({ collab: await view(c.id, a.userId) });
  });

  app.get('/api/v1/collabs/:id', async (req) => ({ collab: await view(id(req), requireAuth(req).userId) }));

  app.patch('/api/v1/collabs/:id', async (req) => {
    const a = requireAuth(req);
    const { c, isOwner } = await load(id(req), a.userId);
    if (!isOwner) throw forbidden('Only the person who started it can change the opening.');
    draftOnly(c);
    const body = parse(z.object({ opening: z.string().trim().min(1).max(R.openingMax), visibility: z.enum(['public', 'followers']) }).partial(), req.body);
    if (body.opening) await screen(body.opening);
    await db.update(s.collabDrops).set({ ...body, updatedAt: new Date() }).where(eq(s.collabDrops.id, c.id));
    return { collab: await view(c.id, a.userId) };
  });

  app.post('/api/v1/collabs/:id/invite', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const { c, members, isOwner } = await load(id(req), a.userId);
    if (!isOwner) throw forbidden('Only the person who started it can invite people.');
    draftOnly(c);
    const { userId } = parse(z.object({ userId: z.uuid() }), req.body);
    if (userId === a.userId) throw badRequest('You are already in it.');
    if ((await relationOf(db, a.userId, userId)) !== 'connection' || (await isBlockedEitherWay(db, a.userId, userId))) throw forbidden('You can invite people you follow or who follow you.');
    const active = members.filter((m) => m.status === 'invited' || m.status === 'accepted');
    const existing = members.find((m) => m.userId === userId);
    if (existing && (existing.status === 'invited' || existing.status === 'accepted')) throw conflict('They are already invited.');
    if (active.length >= R.maxCollaborators) throw conflict(`A Collaborative Drop has up to ${R.maxCollaborators} collaborators.`);
    // Someone who declined or was removed can be invited again; their old line is cleared.
    if (existing) await db.update(s.collabMembers).set({ status: 'invited', line: '', invitedAt: new Date(), respondedAt: null }).where(and(eq(s.collabMembers.collabId, c.id), eq(s.collabMembers.userId, userId)));
    else await db.insert(s.collabMembers).values({ collabId: c.id, userId });
    const names = await displayNames(db, [a.userId]);
    await notify(ctx, db, { userId, category: 'social', title: `${names.get(a.userId)?.displayName ?? 'Someone'} invited you to write a drop together`, body: c.opening.slice(0, 80), link: `/create/together/${c.id}`, dedupeKey: `collab:${c.id}:${userId}:${Date.now()}` });
    return { collab: await view(c.id, a.userId) };
  });

  app.post('/api/v1/collabs/:id/respond', async (req) => {
    const a = requireAuth(req);
    const { c, mine } = await load(id(req), a.userId);
    draftOnly(c);
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body);
    if (!mine || mine.status !== 'invited') throw conflict('There is no open invitation to answer.');
    await db.update(s.collabMembers).set({ status: accept ? 'accepted' : 'declined', respondedAt: new Date() }).where(and(eq(s.collabMembers.collabId, c.id), eq(s.collabMembers.userId, a.userId)));
    if (!accept) return { collab: null };
    return { collab: await view(c.id, a.userId) };
  });

  /** An accepted collaborator writes (or rewrites) their one line. */
  app.put('/api/v1/collabs/:id/line', async (req) => {
    const a = requireAuth(req);
    const { c, mine } = await load(id(req), a.userId);
    draftOnly(c);
    if (!mine || mine.status !== 'accepted') throw forbidden('Accept the invitation to add your line.');
    const { line } = parse(z.object({ line: z.string().trim().max(R.lineMax) }), req.body);
    if (line) await screen(line);
    await db.update(s.collabMembers).set({ line }).where(and(eq(s.collabMembers.collabId, c.id), eq(s.collabMembers.userId, a.userId)));
    await db.update(s.collabDrops).set({ updatedAt: new Date() }).where(eq(s.collabDrops.id, c.id));
    return { collab: await view(c.id, a.userId) };
  });

  /** The owner removes someone, or a collaborator leaves. Either way their line is dropped. */
  app.delete('/api/v1/collabs/:id/members/:userId', async (req) => {
    const a = requireAuth(req);
    const { userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const { c, members, isOwner } = await load(id(req), a.userId);
    draftOnly(c);
    if (!isOwner && userId !== a.userId) throw forbidden('Only the person who started it can remove someone else.');
    const m = members.find((x) => x.userId === userId);
    if (!m || m.status === 'removed' || m.status === 'declined') throw notFound('Collaborator');
    await db.update(s.collabMembers).set({ status: isOwner && userId !== a.userId ? 'removed' : 'declined', line: '', respondedAt: new Date() }).where(and(eq(s.collabMembers.collabId, c.id), eq(s.collabMembers.userId, userId)));
    return { collab: isOwner ? await view(c.id, a.userId) : null };
  });

  app.post('/api/v1/collabs/:id/cancel', async (req) => {
    const a = requireAuth(req);
    const { c, isOwner } = await load(id(req), a.userId);
    if (!isOwner) throw forbidden('Only the person who started it can cancel it.');
    draftOnly(c);
    await db.update(s.collabDrops).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(s.collabDrops.id, c.id));
    return { ok: true };
  });

  app.post('/api/v1/collabs/:id/publish', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const { c, members, isOwner } = await load(id(req), a.userId);
    if (!isOwner) throw forbidden('Only the person who started it can publish it.');
    draftOnly(c);
    const accepted = members.filter((m) => m.status === 'accepted' && m.line.trim());
    if (!accepted.length) throw badRequest('Wait for at least one collaborator to add their line — otherwise it is just a Thought Drop.');
    const names = await displayNames(db, accepted.map((m) => m.userId));
    const body = composeCollab(c.opening, accepted.map((m) => ({ name: names.get(m.userId)?.displayName ?? 'Member', text: m.line })));
    // Claim the draft first so two quick presses cannot publish twice; release it if posting is refused.
    const claimed = await db.update(s.collabDrops).set({ status: 'published', updatedAt: new Date() }).where(and(eq(s.collabDrops.id, c.id), eq(s.collabDrops.status, 'draft'))).returning({ id: s.collabDrops.id });
    if (!claimed.length) throw conflict('This drop is already published.');
    // The one publishing path: the same route a normal Thought Drop uses, as the owner.
    const res = await app.inject({ method: 'POST', url: '/api/v1/posts', headers: { cookie: req.headers.cookie ?? '', 'x-csrf-token': String(req.headers['x-csrf-token'] ?? ''), 'content-type': 'application/json' }, payload: { kind: 'thought', body, visibility: c.visibility } });
    if (res.statusCode >= 300) {
      await db.update(s.collabDrops).set({ status: 'draft' }).where(eq(s.collabDrops.id, c.id));
      const err = (() => { try { return (res.json() as { error?: { message?: string } }).error?.message; } catch { return null; } })();
      throw badRequest(err ?? 'Could not publish this drop.');
    }
    const post = (res.json() as { post: { id: string } }).post;
    await db.update(s.collabDrops).set({ postId: post.id }).where(eq(s.collabDrops.id, c.id));
    for (const m of accepted) await notify(ctx, db, { userId: m.userId, category: 'social', title: 'The drop you wrote together is live', link: `/thoughts/${post.id}`, dedupeKey: `collab-live:${c.id}:${m.userId}` });
    return { postId: post.id, collab: await view(c.id, a.userId) };
  });
}
