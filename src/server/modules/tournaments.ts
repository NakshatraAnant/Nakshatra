import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth, requireCapability } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { notify } from '../lib/notify';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames } from '../services/identity';
import { seasonPointsFor, todaySeason } from '../services/progression';
import { QUIZ_LIMITS as L, QuizError, publicQuestions, scoreQuiz, validateQuiz, type QuizDefinition } from '../../shared/quiz';
import { SEASON_BY_KEY } from '../../shared/progression';
import { TOURNAMENT_RULES as R, judgeEntry, rankByPoints, rankEntries, timeLimitMs, tournamentStatus } from '../../shared/tournament';

const Question = z.object({ text: z.string().trim().max(L.text), options: z.array(z.object({ text: z.string().trim().max(L.option), correct: z.boolean().optional() })).max(L.maxOptions) });

type T = typeof s.tournaments.$inferSelect;
type E = typeof s.tournamentEntries.$inferSelect;
const ENTERED = ['joined', 'playing', 'finished'];

export async function tournamentRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;

  async function blockedBetween(a: string, b: string) {
    const [row] = await db.select().from(s.blocks).where(or(and(eq(s.blocks.blockerId, a), eq(s.blocks.blockedId, b)), and(eq(s.blocks.blockerId, b), eq(s.blocks.blockedId, a))));
    return !!row;
  }
  async function activeMember(groupId: string, userId: string) {
    const [m] = await db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, groupId), eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active')));
    return !!m;
  }

  /** Who may see a tournament: host, anyone with an entry row, and (circle access) active circle members. Blocks hide it. */
  async function load(userId: string, id: string): Promise<{ t: T; entry: E | null }> {
    const [t] = await db.select().from(s.tournaments).where(eq(s.tournaments.id, id));
    if (!t) throw notFound('Tournament');
    const [entry] = await db.select().from(s.tournamentEntries).where(and(eq(s.tournamentEntries.tournamentId, id), eq(s.tournamentEntries.userId, userId)));
    if (t.hostId === userId) return { t, entry: entry ?? null };
    if (await blockedBetween(userId, t.hostId)) throw notFound('Tournament');
    if (entry) return { t, entry };
    if (t.access === 'circle' && t.groupId && (await activeMember(t.groupId, userId))) return { t, entry: null };
    throw notFound('Tournament');
  }

  async function standings(t: T) {
    const rows = await db.select().from(s.tournamentEntries).where(and(eq(s.tournamentEntries.tournamentId, t.id), eq(s.tournamentEntries.state, 'finished')));
    const ranked = rankEntries(rows.filter((r) => !r.flag || r.flag === 'cleared').map((r) => ({ userId: r.userId, score: r.score ?? 0, durationMs: r.durationMs ?? 0, finishedAt: r.finishedAt! })));
    return { ranked, held: rows.filter((r) => r.flag && r.flag !== 'cleared') };
  }

  /* ---------------- Hosting ---------------- */

  app.post('/api/v1/play/tournaments', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before hosting a tournament.');
    const body = parse(z.object({
      title: z.string().trim().min(1).max(L.title),
      questions: z.array(Question).max(L.maxQuestions),
      access: z.enum(['circle', 'invite']),
      circleId: z.uuid().optional(),
      inviteeIds: z.array(z.uuid()).max(R.maxInvitees).default([]),
      opensAt: z.coerce.date().optional(),
      closesAt: z.coerce.date(),
      secondsPerQuestion: z.number().int().min(R.secondsPerQuestion.min).max(R.secondsPerQuestion.max).default(R.secondsPerQuestion.default),
    }), req.body);
    const def: QuizDefinition = { kind: 'trivia', title: body.title, description: '', outcomes: [], questions: body.questions };
    try { validateQuiz(def); } catch (e) { if (e instanceof QuizError) throw badRequest(e.message); throw e; }
    const phrases = await blockedPhrases(db);
    for (const text of [def.title, ...def.questions.flatMap((q) => [q.text, ...q.options.map((o) => o.text)])]) { const r = screenText(text, phrases); if (!r.ok) throw badRequest(r.reason!); }

    const now = new Date();
    const opensAt = body.opensAt && body.opensAt > now ? body.opensAt : now;
    const minutes = (body.closesAt.getTime() - opensAt.getTime()) / 60000;
    if (minutes < R.minWindowMinutes) throw badRequest(`Leave at least ${R.minWindowMinutes} minutes for people to play.`);
    if (minutes > R.maxWindowDays * 1440) throw badRequest(`A tournament can run for at most ${R.maxWindowDays} days.`);
    const [{ open }] = await db.select({ open: sql<number>`count(*)::int` }).from(s.tournaments).where(and(eq(s.tournaments.hostId, a.userId), isNull(s.tournaments.cancelledAt), gt(s.tournaments.closesAt, now)));
    if (open >= R.maxOpenHosted) throw conflict(`You can host ${R.maxOpenHosted} tournaments at a time.`);

    let invitees: string[] = [];
    if (body.access === 'circle') {
      if (!body.circleId) throw badRequest('Choose a circle.');
      if (!(await activeMember(body.circleId, a.userId))) throw forbidden('Join the circle to host a tournament there.');
    } else {
      invitees = [...new Set(body.inviteeIds)].filter((id) => id !== a.userId);
      if (!invitees.length) throw badRequest('Invite at least one person.');
      // Only people you're connected with (an accepted follow either way), and never someone either of you blocked.
      const linked = await db.select({ a: s.follows.followerId, b: s.follows.followeeId }).from(s.follows).where(and(eq(s.follows.status, 'accepted'),
        or(and(eq(s.follows.followerId, a.userId), inArray(s.follows.followeeId, invitees)), and(eq(s.follows.followeeId, a.userId), inArray(s.follows.followerId, invitees)))));
      const ok = new Set(linked.map((r) => (r.a === a.userId ? r.b : r.a)));
      const blocks = await db.select({ a: s.blocks.blockerId, b: s.blocks.blockedId }).from(s.blocks).where(or(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, a.userId)));
      for (const r of blocks) ok.delete(r.a === a.userId ? r.b : r.a);
      if (invitees.some((id) => !ok.has(id))) throw badRequest('You can only invite people you follow or who follow you.');
    }

    const t = await db.transaction(async (tx) => {
      const [row] = await tx.insert(s.tournaments).values({ hostId: a.userId, title: def.title, definition: def as unknown as Record<string, unknown>, access: body.access, groupId: body.access === 'circle' ? body.circleId! : null, secondsPerQuestion: body.secondsPerQuestion, maxEntrants: R.maxEntrants, opensAt, closesAt: body.closesAt }).returning();
      if (invitees.length) await tx.insert(s.tournamentEntries).values(invitees.map((userId) => ({ tournamentId: row.id, userId, state: 'invited', invitedBy: a.userId })));
      return row;
    });
    const host = (await displayNames(db, [a.userId])).get(a.userId)?.displayName ?? 'A member';
    const recipients = body.access === 'circle'
      ? (await db.select({ u: s.groupMembers.userId }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, body.circleId!), eq(s.groupMembers.status, 'active'))).limit(200)).map((r) => r.u).filter((u) => u !== a.userId)
      : invitees;
    for (const userId of recipients) await notify(ctx, db, { userId, category: 'games', title: `${host} started a tournament`, body: `“${def.title}” — ${def.questions.length} questions, play any time before it closes.`, link: `/play/tournaments/${t.id}`, dedupeKey: `tournament:${t.id}` });
    await track(db, a.userId, 'tournament_created', { access: body.access, questions: def.questions.length });
    return reply.code(201).send({ tournament: { id: t.id } });
  });

  /** Host (or a moderator, audited) calls it off before it closes. Entrants are told. */
  app.post('/api/v1/play/tournaments/:id/cancel', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [t] = await db.select().from(s.tournaments).where(eq(s.tournaments.id, id));
    const staff = a.roles.includes('admin') || a.roles.includes('moderator');
    if (!t || (t.hostId !== a.userId && !staff)) throw notFound('Tournament');
    if (tournamentStatus(t) === 'closed' && !staff) throw badRequest('This tournament has already closed.');
    if (t.cancelledAt) return { ok: true };
    await db.update(s.tournaments).set({ cancelledAt: new Date() }).where(eq(s.tournaments.id, id));
    if (t.hostId !== a.userId) await audit(db, { actorId: a.userId, action: 'moderation.tournament_cancelled', targetType: 'tournament', targetId: id });
    const entrants = await db.select({ u: s.tournamentEntries.userId }).from(s.tournamentEntries).where(and(eq(s.tournamentEntries.tournamentId, id), inArray(s.tournamentEntries.state, ['invited', ...ENTERED])));
    for (const { u } of entrants) await notify(ctx, db, { userId: u, category: 'games', title: 'Tournament called off', body: `“${t.title}” was cancelled.`, link: '/play/tournaments', dedupeKey: `tournament-cancel:${id}` });
    return { ok: true };
  });

  /** People you can invite: an accepted follow in either direction, minus blocks. */
  app.get('/api/v1/play/tournaments/invitable', async (req) => {
    const a = requireAuth(req);
    const rows = await db.select({ a: s.follows.followerId, b: s.follows.followeeId }).from(s.follows)
      .where(and(eq(s.follows.status, 'accepted'), or(eq(s.follows.followerId, a.userId), eq(s.follows.followeeId, a.userId)))).limit(500);
    const ids = new Set(rows.map((r) => (r.a === a.userId ? r.b : r.a)));
    const blocks = await db.select({ a: s.blocks.blockerId, b: s.blocks.blockedId }).from(s.blocks).where(or(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, a.userId)));
    for (const r of blocks) ids.delete(r.a === a.userId ? r.b : r.a);
    const names = await displayNames(db, [...ids]);
    return { people: [...names.entries()].map(([userId, n]) => ({ userId, name: n.displayName, handle: n.handle })).sort((x, y) => x.name.localeCompare(y.name)) };
  });

  /* ---------------- Browsing ---------------- */

  app.get('/api/v1/play/tournaments', async (req) => {
    const a = requireAuth(req);
    const since = new Date(Date.now() - 30 * 864e5);
    const circles = (await db.select({ g: s.groupMembers.groupId }).from(s.groupMembers).where(and(eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active')))).map((r) => r.g);
    const mine = await db.select().from(s.tournamentEntries).where(eq(s.tournamentEntries.userId, a.userId));
    const entryIds = mine.map((e) => e.tournamentId);
    const blocks = await db.select({ a: s.blocks.blockerId, b: s.blocks.blockedId }).from(s.blocks).where(or(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, a.userId)));
    const hidden = new Set(blocks.map((r) => (r.a === a.userId ? r.b : r.a)));
    const rows = (await db.select().from(s.tournaments).where(and(gt(s.tournaments.closesAt, since), or(
      eq(s.tournaments.hostId, a.userId),
      entryIds.length ? inArray(s.tournaments.id, entryIds) : sql`false`,
      circles.length ? and(eq(s.tournaments.access, 'circle'), inArray(s.tournaments.groupId, circles)) : sql`false`,
    ))).orderBy(desc(s.tournaments.closesAt)).limit(60)).filter((t) => t.hostId === a.userId || !hidden.has(t.hostId));
    const ids = rows.map((t) => t.id);
    const counts = ids.length ? await db.select({ id: s.tournamentEntries.tournamentId, n: sql<number>`count(*)::int` }).from(s.tournamentEntries).where(and(inArray(s.tournamentEntries.tournamentId, ids), inArray(s.tournamentEntries.state, ENTERED))).groupBy(s.tournamentEntries.tournamentId) : [];
    const names = await displayNames(db, rows.map((t) => t.hostId));
    return {
      tournaments: rows.map((t) => {
        const e = mine.find((m) => m.tournamentId === t.id);
        return { id: t.id, title: t.title, status: tournamentStatus(t), host: names.get(t.hostId)?.displayName ?? 'Member', isHost: t.hostId === a.userId, access: t.access, questions: (t.definition as unknown as QuizDefinition).questions.length, entrants: counts.find((c) => c.id === t.id)?.n ?? 0, myState: e?.state ?? null, opensAt: t.opensAt, closesAt: t.closesAt };
      }),
    };
  });

  app.get('/api/v1/play/tournaments/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { t, entry } = await load(a.userId, id);
    const def = t.definition as unknown as QuizDefinition;
    const status = tournamentStatus(t);
    const { ranked, held } = await standings(t);
    const [{ entrants }] = await db.select({ entrants: sql<number>`count(*)::int` }).from(s.tournamentEntries).where(and(eq(s.tournamentEntries.tournamentId, id), inArray(s.tournamentEntries.state, ENTERED)));
    const staff = a.roles.includes('admin') || a.roles.includes('moderator');
    const names = await displayNames(db, [t.hostId, ...ranked.map((r) => r.userId), ...(staff ? held.map((h) => h.userId) : [])]);
    const name = (u: string) => names.get(u)?.displayName ?? 'Member';
    const mine = ranked.find((r) => r.userId === a.userId);
    // The answer key is shown to entrants only after close, and only alongside their own answers.
    const review = status === 'closed' && entry?.state === 'finished' && Array.isArray(entry.answers)
      ? def.questions.map((q, i) => { const chosen = (entry.answers as number[])[i]; return { question: q.text, chosen: q.options[chosen]?.text ?? '—', correct: q.options.find((o) => o.correct)!.text, right: !!q.options[chosen]?.correct }; })
      : null;
    return {
      tournament: { id: t.id, title: t.title, status, host: name(t.hostId), isHost: t.hostId === a.userId, access: t.access, questions: def.questions.length, secondsPerQuestion: t.secondsPerQuestion, timeLimitSeconds: timeLimitMs(def.questions.length, t.secondsPerQuestion) / 1000, opensAt: t.opensAt, closesAt: t.closesAt, entrants, maxEntrants: t.maxEntrants },
      me: { state: entry?.state ?? null, score: entry?.state === 'finished' ? entry.score : null, durationMs: entry?.state === 'finished' ? entry.durationMs : null, flag: entry?.flag && entry.flag !== 'cleared' ? entry.flag : null, rank: mine?.rank ?? null, canJoin: t.hostId !== a.userId && (status === 'open' || status === 'upcoming') && (!entry || entry.state === 'invited' || entry.state === 'declined') && entrants < t.maxEntrants },
      standings: ranked.slice(0, 50).map((r) => ({ rank: r.rank, name: name(r.userId), you: r.userId === a.userId, score: r.score, durationMs: r.durationMs })),
      heldForReview: staff ? held.map((h) => ({ userId: h.userId, name: name(h.userId), flag: h.flag, score: h.score, durationMs: h.durationMs })) : held.length,
      review,
    };
  });

  /** Your finished tournaments with final (or current) placing. */
  app.get('/api/v1/play/tournaments/history', async (req) => {
    const a = requireAuth(req);
    const rows = await db.select({ e: s.tournamentEntries, t: s.tournaments }).from(s.tournamentEntries).innerJoin(s.tournaments, eq(s.tournaments.id, s.tournamentEntries.tournamentId))
      .where(and(eq(s.tournamentEntries.userId, a.userId), eq(s.tournamentEntries.state, 'finished'))).orderBy(desc(s.tournamentEntries.finishedAt)).limit(50);
    const out = [];
    for (const { e, t } of rows) {
      const { ranked } = await standings(t);
      out.push({ id: t.id, title: t.title, status: tournamentStatus(t), score: e.score, total: (t.definition as unknown as QuizDefinition).questions.length, rank: ranked.find((r) => r.userId === a.userId)?.rank ?? null, ranked: ranked.length, held: !!e.flag && e.flag !== 'cleared', finishedAt: e.finishedAt });
    }
    return { history: out };
  });

  /* ---------------- Playing ---------------- */

  app.post('/api/v1/play/tournaments/:id/join', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { t, entry } = await load(a.userId, id);
    if (t.hostId === a.userId) throw badRequest('You wrote the questions — host it, and watch the standings.');
    const status = tournamentStatus(t);
    if (status !== 'open' && status !== 'upcoming') throw badRequest(status === 'cancelled' ? 'This tournament was called off.' : 'This tournament has closed.');
    if (entry && ENTERED.includes(entry.state)) return { ok: true };
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.tournamentEntries).where(and(eq(s.tournamentEntries.tournamentId, id), inArray(s.tournamentEntries.state, ENTERED)));
    if (n >= t.maxEntrants) throw conflict('This tournament is full.');
    if (entry) await db.update(s.tournamentEntries).set({ state: 'joined' }).where(and(eq(s.tournamentEntries.tournamentId, id), eq(s.tournamentEntries.userId, a.userId)));
    else await db.insert(s.tournamentEntries).values({ tournamentId: id, userId: a.userId, state: 'joined' }).onConflictDoNothing();
    await track(db, a.userId, 'tournament_joined', { access: t.access });
    return { ok: true };
  });

  app.post('/api/v1/play/tournaments/:id/decline', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await load(a.userId, id);
    await db.update(s.tournamentEntries).set({ state: 'declined' }).where(and(eq(s.tournamentEntries.tournamentId, id), eq(s.tournamentEntries.userId, a.userId), inArray(s.tournamentEntries.state, ['invited', 'joined'])));
    return { ok: true };
  });

  /**
   * Starts your one run. The server clock starts now and does not restart: opening it again returns the same
   * questions with the same deadline. Questions go out without correct flags.
   */
  app.post('/api/v1/play/tournaments/:id/start', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { t, entry } = await load(a.userId, id);
    if (tournamentStatus(t) !== 'open') throw badRequest('This tournament isn’t open for play right now.');
    if (!entry || !['joined', 'playing'].includes(entry.state)) throw badRequest(entry?.state === 'finished' ? 'You’ve already played this one.' : 'Join the tournament first.');
    let startedAt = entry.startedAt;
    if (entry.state === 'joined') {
      const [row] = await db.update(s.tournamentEntries).set({ state: 'playing', startedAt: new Date() })
        .where(and(eq(s.tournamentEntries.tournamentId, id), eq(s.tournamentEntries.userId, a.userId), eq(s.tournamentEntries.state, 'joined'))).returning();
      startedAt = row?.startedAt ?? (await load(a.userId, id)).entry!.startedAt;
    }
    const def = t.definition as unknown as QuizDefinition;
    return { questions: publicQuestions(def), startedAt, deadline: new Date(startedAt!.getTime() + timeLimitMs(def.questions.length, t.secondsPerQuestion)), secondsPerQuestion: t.secondsPerQuestion };
  });

  app.post('/api/v1/play/tournaments/:id/submit', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { answers } = parse(z.object({ answers: z.array(z.number().int().min(0).max(L.maxOptions - 1)).max(L.maxQuestions) }), req.body);
    const { t, entry } = await load(a.userId, id);
    if (!entry || entry.state !== 'playing' || !entry.startedAt) throw badRequest(entry?.state === 'finished' ? 'You’ve already played this one.' : 'Start the tournament first.');
    if (t.cancelledAt) throw badRequest('This tournament was called off.');
    const def = t.definition as unknown as QuizDefinition;
    let r;
    try { r = scoreQuiz(def, answers); } catch (e) { if (e instanceof QuizError) throw badRequest(e.message); throw e; }
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - entry.startedAt.getTime();
    // Past the closing time (plus grace) counts as over time even if the personal timer had room left.
    const flag = finishedAt.getTime() > t.closesAt.getTime() + R.graceSeconds * 1000 ? 'over_time' : judgeEntry(durationMs, def.questions.length, t.secondsPerQuestion);
    const [row] = await db.update(s.tournamentEntries).set({ state: 'finished', answers, score: r.score, durationMs, finishedAt, flag })
      .where(and(eq(s.tournamentEntries.tournamentId, id), eq(s.tournamentEntries.userId, a.userId), eq(s.tournamentEntries.state, 'playing'))).returning();
    if (!row) throw conflict('You’ve already played this one.');
    if (flag) await audit(db, { actorId: a.userId, action: `tournament.entry_${flag}`, targetType: 'tournament', targetId: id, meta: { durationMs } });
    await track(db, a.userId, 'tournament_finished', { questions: def.questions.length });
    const { ranked } = await standings(t);
    return { score: r.score, total: r.total, durationMs, flag, rank: ranked.find((x) => x.userId === a.userId)?.rank ?? null };
  });

  /** Moderators can release an entry held for review back into the ranking (audited). */
  app.post('/api/v1/admin/tournaments/:id/entries/:userId/clear', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const [row] = await db.update(s.tournamentEntries).set({ flag: 'cleared', flagClearedBy: a.userId })
      .where(and(eq(s.tournamentEntries.tournamentId, id), eq(s.tournamentEntries.userId, userId), inArray(s.tournamentEntries.flag, ['too_fast', 'over_time']))).returning();
    if (!row) throw notFound('Held entry');
    await audit(db, { actorId: a.userId, action: 'moderation.tournament_entry_cleared', targetType: 'tournament', targetId: id, meta: { userId } });
    return { ok: true };
  });

  /* ---------------- Seasonal leaderboards ---------------- */

  /**
   * Season points (XP earned this season) among people you already share a space with: a circle you're in, or the
   * people you follow. There is no global board. Members who hid themselves are left out for everyone but themselves.
   */
  app.get('/api/v1/play/leaderboards/season', async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ scope: z.enum(['following', 'circle']).default('following'), circleId: z.uuid().optional(), season: z.string().max(60).optional() }), req.query);
    const seasonKey = q.season ?? todaySeason();
    if (!seasonKey || !SEASON_BY_KEY[seasonKey]) return { season: null, scope: q.scope, rows: [], me: null };
    let ids: string[];
    if (q.scope === 'circle') {
      if (!q.circleId || !(await activeMember(q.circleId, a.userId))) throw notFound('Circle');
      ids = (await db.select({ u: s.groupMembers.userId }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, q.circleId), eq(s.groupMembers.status, 'active'))).limit(500)).map((r) => r.u);
    } else {
      ids = (await db.select({ u: s.follows.followeeId }).from(s.follows).where(and(eq(s.follows.followerId, a.userId), eq(s.follows.status, 'accepted'))).limit(500)).map((r) => r.u);
    }
    const blocks = await db.select({ a: s.blocks.blockerId, b: s.blocks.blockedId }).from(s.blocks).where(or(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, a.userId)));
    const hidden = new Set(blocks.map((r) => (r.a === a.userId ? r.b : r.a)));
    const visible = ids.length ? new Set((await db.select({ u: s.profiles.userId }).from(s.profiles).where(and(inArray(s.profiles.userId, ids), eq(s.profiles.leaderboardVisible, true)))).map((r) => r.u)) : new Set<string>();
    const members = [...new Set([a.userId, ...ids.filter((u) => visible.has(u) && !hidden.has(u))])];
    const [points, names] = await Promise.all([seasonPointsFor(db, members, seasonKey), displayNames(db, members)]);
    const ranked = rankByPoints(members.map((u) => ({ userId: u, name: names.get(u)?.displayName ?? 'Member', handle: names.get(u)?.handle ?? null, points: points.get(u) ?? 0 })));
    const me = ranked.find((r) => r.userId === a.userId)!;
    const [profile] = await db.select({ v: s.profiles.leaderboardVisible }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const def = SEASON_BY_KEY[seasonKey];
    return {
      season: { key: def.key, name: def.name, endsOn: def.endsOn },
      scope: q.scope,
      rows: ranked.slice(0, 50).map((r) => ({ rank: r.rank, name: r.name, handle: r.handle, points: r.points, you: r.userId === a.userId })),
      me: { rank: me.rank, points: me.points, of: ranked.length, visible: profile?.v ?? true },
    };
  });

  app.put('/api/v1/play/leaderboards/settings', async (req) => {
    const a = requireAuth(req);
    const { visible } = parse(z.object({ visible: z.boolean() }), req.body);
    await db.update(s.profiles).set({ leaderboardVisible: visible }).where(eq(s.profiles.userId, a.userId));
    return { visible };
  });
}
