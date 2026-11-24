import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { notify } from '../lib/notify';
import { awardXp, evaluateAchievements } from '../lib/rewards';
import { displayNames } from '../services/identity';
import { circleMembership, checkCircleActivation } from '../services/circles';
import { blockedPhrases, screenText } from '../services/moderation';
import { evaluateReferral } from '../services/referrals';
import { recordFirstAction } from '../services/activation';
import { requireFeature } from '../services/settings';
import {
  GAMES, GAME_BY_KEY, GameError, canAct, hidesAuthor, pendingActors, publicRound, settlePrediction,
  type Memory, type Participant, type PlayContext, type Reveal, type Round, type Submission, type Summary,
} from '../../shared/play/engine';
import type { Vector } from '../../shared/personality';

/**
 * Turn-based, database-backed game sessions (no realtime transport; clients poll).
 * Session state holds the generated rounds (with server-only secrets), a snapshot
 * of the players at start, the reveals of closed rounds and the final summary.
 * Rounds are closed inside a transaction that locks the session row, so concurrent
 * submissions cannot close a round twice or award scores twice.
 */
export const ABANDON_AFTER_DAYS = 7;
const MAX_LIVE_SESSIONS_PER_CIRCLE = 5;

interface SessionState { rounds: Round[]; players: Participant[]; reveals: Record<string, Reveal>; summary?: Summary; payouts?: Record<string, number> }
type SessionRow = typeof s.gameSessions.$inferSelect;

async function latestPersonas(db: Executor, ids: string[]) {
  if (!ids.length) return new Map<string, { key: string; scores: Vector }>();
  const res = await db.execute(sql`select distinct on (user_id) user_id, archetype_key, scores from assessment_results where user_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by user_id, created_at desc`) as unknown as { rows: { user_id: string; archetype_key: string; scores: Vector }[] };
  return new Map(res.rows.map((r) => [r.user_id, { key: r.archetype_key, scores: r.scores }]));
}

async function activeParticipants(db: Executor, sessionId: string) {
  return db.select().from(s.gameParticipants).where(and(eq(s.gameParticipants.sessionId, sessionId), isNull(s.gameParticipants.leftAt))).orderBy(s.gameParticipants.joinedAt);
}

/** Prompt ids used in this circle (or by this host when solo) in the last 30 days, so games feel fresh. */
async function recentPromptIds(db: Executor, sess: SessionRow): Promise<string[]> {
  const rows = await db.select({ state: s.gameSessions.state }).from(s.gameSessions).where(and(
    sess.circleId ? eq(s.gameSessions.circleId, sess.circleId) : and(isNull(s.gameSessions.circleId), eq(s.gameSessions.hostId, sess.hostId)),
    gte(s.gameSessions.createdAt, new Date(Date.now() - 30 * 86400000)),
  )).orderBy(desc(s.gameSessions.createdAt)).limit(30);
  return rows.flatMap((r) => ((r.state as Partial<SessionState>).rounds ?? []).map((x) => x.promptId).filter((x): x is string => Boolean(x)));
}

/** Reusable lines for Memory Lane: only from players who allowed reuse, not withdrawn, from completed games in this circle. */
async function circleMemories(db: Executor, circleId: string): Promise<Memory[]> {
  const rows = await db.select({ id: s.gameSubmissions.id, payload: s.gameSubmissions.payload, userId: s.gameSubmissions.userId, roundIndex: s.gameSubmissions.roundIndex, state: s.gameSessions.state })
    .from(s.gameSubmissions)
    .innerJoin(s.gameSessions, eq(s.gameSessions.id, s.gameSubmissions.sessionId))
    .innerJoin(s.gameParticipants, and(eq(s.gameParticipants.sessionId, s.gameSubmissions.sessionId), eq(s.gameParticipants.userId, s.gameSubmissions.userId)))
    .innerJoin(s.groupMembers, and(eq(s.groupMembers.groupId, circleId), eq(s.groupMembers.userId, s.gameSubmissions.userId), eq(s.groupMembers.status, 'active')))
    .where(and(eq(s.gameSessions.circleId, circleId), eq(s.gameSessions.status, 'completed'), inArray(s.gameSessions.gameKey, ['who_said_it', 'plot_twist']), eq(s.gameParticipants.allowReuse, true), isNull(s.gameSubmissions.withdrawnAt)))
    .limit(200);
  return rows.filter((r) => {
    const round = ((r.state as Partial<SessionState>).rounds ?? [])[r.roundIndex];
    return round && (round.kind === 'submit' || round.kind === 'turn') && typeof (r.payload as { text?: unknown }).text === 'string';
  }).map((r) => ({ id: r.id, text: String((r.payload as { text: string }).text), authorId: r.userId }));
}

function contextFor(sess: SessionRow, state: SessionState, memories: Memory[] = [], recent: string[] = []): PlayContext {
  return { sessionId: sess.id, participants: state.players, hostId: sess.hostId, recentPromptIds: recent, memories };
}

async function roundSubs(db: Executor, sessionId: string, roundIndex: number): Promise<(Submission & { id: string })[]> {
  const rows = await db.select().from(s.gameSubmissions).where(and(eq(s.gameSubmissions.sessionId, sessionId), eq(s.gameSubmissions.roundIndex, roundIndex), isNull(s.gameSubmissions.withdrawnAt))).orderBy(s.gameSubmissions.createdAt);
  return rows.map((r) => ({ id: r.id, userId: r.userId, payload: r.payload as Record<string, unknown> }));
}

/** Closes the current round: reveal, scores, follow-on rounds, completion. Must run inside a transaction. */
async function closeRound(ctx: Ctx, tx: Executor, sessionId: string): Promise<SessionRow> {
  const [sess] = await tx.select().from(s.gameSessions).where(eq(s.gameSessions.id, sessionId)).for('update');
  if (sess.status !== 'active') return sess;
  const def = GAME_BY_KEY[sess.gameKey];
  const state = sess.state as SessionState;
  const idx = sess.roundIndex;
  const round = state.rounds[idx];
  const subs = await roundSubs(tx, sessionId, idx);
  const pctx = contextFor(sess, state);
  state.reveals[String(idx)] = def.reveal(round, subs, pctx);
  for (const [userId, pts] of Object.entries(def.score(round, subs, pctx))) {
    if (pts) await tx.update(s.gameParticipants).set({ score: sql`${s.gameParticipants.score} + ${pts}` }).where(and(eq(s.gameParticipants.sessionId, sessionId), eq(s.gameParticipants.userId, userId)));
  }
  if (sess.gameKey === 'prediction_market' && round.kind === 'resolve' && subs[0]) {
    // Play points only: written to the in-game score, never to the points ledger.
    const payouts = settlePrediction(await roundSubs(tx, sessionId, 0), String(subs[0].payload.optionId));
    state.payouts = payouts;
    for (const [userId, pts] of Object.entries(payouts)) await tx.update(s.gameParticipants).set({ score: pts }).where(and(eq(s.gameParticipants.sessionId, sessionId), eq(s.gameParticipants.userId, userId)));
  }
  if (def.extend) state.rounds = def.extend(pctx, state.rounds, idx, subs);
  const next = idx + 1;
  if (next < state.rounds.length) {
    const [row] = await tx.update(s.gameSessions).set({ roundIndex: next, state, updatedAt: new Date() }).where(eq(s.gameSessions.id, sessionId)).returning();
    const nr = state.rounds[next];
    if (nr.actorId) await notify(ctx, tx, { userId: nr.actorId, category: 'games', title: `Your turn in ${def.name}`, link: `/play/${sessionId}`, dedupeKey: `turn:${sessionId}:${next}` });
    return row;
  }
  // Completed: build the summary from every round, then award participation points fairly.
  const allSubs: Submission[][] = [];
  for (let i = 0; i < state.rounds.length; i++) allSubs.push(await roundSubs(tx, sessionId, i));
  if (def.summary) state.summary = def.summary(state.rounds, allSubs, pctx);
  const [row] = await tx.update(s.gameSessions).set({ status: 'completed', completedAt: new Date(), state, updatedAt: new Date() }).where(eq(s.gameSessions.id, sessionId)).returning();
  for (const p of await activeParticipants(tx, sessionId)) {
    const open = state.rounds.filter((r) => canAct(r, p.userId)).length;
    const acted = allSubs.filter((subsI, i) => canAct(state.rounds[i], p.userId) && subsI.some((x) => x.userId === p.userId)).length;
    if (open && acted * 2 >= open) {
      await awardXp(ctx, tx, p.userId, 'game_completed', { sourceId: sessionId });
      await evaluateAchievements(ctx, tx, p.userId, ['games_completed']);
    }
  }
  await track(tx, sess.hostId, 'game_completed', { game: sess.gameKey, rounds: state.rounds.length });
  return row;
}

async function afterCompletion(ctx: Ctx, sess: SessionRow) {
  if (sess.status !== 'completed') return;
  if (sess.circleId) await checkCircleActivation(ctx, ctx.db, sess.circleId);
  for (const p of await activeParticipants(ctx.db, sess.id)) await evaluateReferral(ctx, ctx.db, p.userId);
}

async function loadSession(ctx: Ctx, id: string, userId: string) {
  const [sess] = await ctx.db.select().from(s.gameSessions).where(eq(s.gameSessions.id, id));
  if (!sess) throw notFound('Game');
  const [me] = await ctx.db.select().from(s.gameParticipants).where(and(eq(s.gameParticipants.sessionId, id), eq(s.gameParticipants.userId, userId)));
  const circleOk = sess.circleId ? Boolean(await circleMembership(ctx.db, sess.circleId, userId)) : sess.hostId === userId;
  if (!circleOk && !me) throw notFound('Game');
  // Idle sessions are abandoned rather than left hanging forever.
  if ((sess.status === 'lobby' || sess.status === 'active') && sess.updatedAt < new Date(Date.now() - ABANDON_AFTER_DAYS * 86400000)) {
    const [row] = await ctx.db.update(s.gameSessions).set({ status: 'abandoned', updatedAt: new Date() }).where(eq(s.gameSessions.id, id)).returning();
    return { sess: row, me, circleOk };
  }
  return { sess, me, circleOk };
}

export async function playRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/play/games', async () => ({
    games: GAMES.map((g) => ({ key: g.key, version: g.version, name: g.name, tagline: g.tagline, category: g.category, minPlayers: g.minPlayers, maxPlayers: g.maxPlayers, howToPlay: g.howToPlay, safety: g.safety, consents: g.consents ?? [], solo: g.minPlayers === 1 })),
    note: 'All games run on Nakshatra’s own rules and curated prompts. Play points in the Prediction Market have no cash value.',
  }));

  app.get('/api/v1/play/sessions', async (req) => {
    const a = requireAuth(req);
    const { circleId } = parse(z.object({ circleId: z.uuid().optional() }), req.query);
    let rows: SessionRow[];
    if (circleId) {
      if (!(await circleMembership(ctx.db, circleId, a.userId))) throw notFound('Circle');
      rows = await ctx.db.select().from(s.gameSessions).where(eq(s.gameSessions.circleId, circleId)).orderBy(desc(s.gameSessions.createdAt)).limit(30);
    } else {
      rows = (await ctx.db.select({ g: s.gameSessions }).from(s.gameParticipants).innerJoin(s.gameSessions, eq(s.gameSessions.id, s.gameParticipants.sessionId)).where(eq(s.gameParticipants.userId, a.userId)).orderBy(desc(s.gameSessions.createdAt)).limit(30)).map((r) => r.g);
    }
    const ids = rows.map((r) => r.id);
    const counts = ids.length ? await ctx.db.select({ id: s.gameParticipants.sessionId, n: sql<number>`count(*)::int` }).from(s.gameParticipants).where(and(inArray(s.gameParticipants.sessionId, ids), isNull(s.gameParticipants.leftAt))).groupBy(s.gameParticipants.sessionId) : [];
    const mine = ids.length ? await ctx.db.select({ id: s.gameParticipants.sessionId }).from(s.gameParticipants).where(and(inArray(s.gameParticipants.sessionId, ids), eq(s.gameParticipants.userId, a.userId))) : [];
    const circles = await ctx.db.select({ id: s.groups.id, name: s.groups.name }).from(s.groups).where(inArray(s.groups.id, [...new Set(rows.map((r) => r.circleId).filter((x): x is string => Boolean(x)))].concat(['00000000-0000-0000-0000-000000000000'])));
    return {
      sessions: rows.map((r) => ({
        id: r.id, gameKey: r.gameKey, name: GAME_BY_KEY[r.gameKey]?.name, status: r.status, circleId: r.circleId, circleName: circles.find((c) => c.id === r.circleId)?.name ?? null,
        players: counts.find((c) => c.id === r.id)?.n ?? 0, joined: mine.some((m) => m.id === r.id), round: r.roundIndex + 1, rounds: ((r.state as Partial<SessionState>).rounds ?? []).length, createdAt: r.createdAt, isHost: r.hostId === a.userId,
      })),
    };
  });

  const Consents = z.object({ allowReuse: z.boolean().default(false), shareIdentity: z.boolean().default(false) });

  app.post('/api/v1/play/sessions', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ gameKey: z.enum(GAMES.map((g) => g.key) as [string, ...string[]]), circleId: z.uuid().optional() }).merge(Consents), req.body);
    await requireFeature(ctx.db, 'play', a.userId);
    const def = GAME_BY_KEY[body.gameKey];
    if (body.circleId) {
      if (!(await circleMembership(ctx.db, body.circleId, a.userId))) throw notFound('Circle');
      const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.gameSessions).where(and(eq(s.gameSessions.circleId, body.circleId), inArray(s.gameSessions.status, ['lobby', 'active'])));
      if (n >= MAX_LIVE_SESSIONS_PER_CIRCLE) throw badRequest('This circle already has five games in progress. Finish one first.');
    } else if (def.minPlayers > 1) throw badRequest(`${def.name} is played with a circle.`);
    const sess = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.insert(s.gameSessions).values({ gameKey: def.key, gameVersion: def.version, circleId: body.circleId ?? null, hostId: a.userId, state: {} }).returning();
      await tx.insert(s.gameParticipants).values({ sessionId: row.id, userId: a.userId, allowReuse: body.allowReuse, shareIdentity: body.shareIdentity });
      return row;
    });
    if (body.circleId) {
      const members = await ctx.db.select({ u: s.groupMembers.userId }).from(s.groupMembers).where(and(eq(s.groupMembers.groupId, body.circleId), eq(s.groupMembers.status, 'active')));
      const host = (await displayNames(ctx.db, [a.userId])).get(a.userId);
      for (const m of members) if (m.u !== a.userId) await notify(ctx, ctx.db, { userId: m.u, category: 'games', title: `${host?.displayName ?? 'Someone'} opened ${def.name}`, body: 'Join the lobby to play.', link: `/play/${sess.id}`, dedupeKey: `game-open:${sess.id}` });
    }
    return { session: { id: sess.id } };
  });

  app.post('/api/v1/play/sessions/:id/join', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const consents = parse(Consents, req.body ?? {});
    const { sess, me, circleOk } = await loadSession(ctx, id, a.userId);
    if (!circleOk) throw notFound('Game');
    if (sess.status !== 'lobby') throw badRequest('This game has already started.');
    if (me && !me.leftAt) {
      await ctx.db.update(s.gameParticipants).set(consents).where(and(eq(s.gameParticipants.sessionId, id), eq(s.gameParticipants.userId, a.userId)));
      return { ok: true };
    }
    const def = GAME_BY_KEY[sess.gameKey];
    const players = await activeParticipants(ctx.db, id);
    if (players.length >= def.maxPlayers) throw badRequest(`${def.name} allows up to ${def.maxPlayers} players.`);
    await ctx.db.insert(s.gameParticipants).values({ sessionId: id, userId: a.userId, ...consents }).onConflictDoUpdate({ target: [s.gameParticipants.sessionId, s.gameParticipants.userId], set: { ...consents, leftAt: null } });
    await ctx.db.update(s.gameSessions).set({ updatedAt: new Date() }).where(eq(s.gameSessions.id, id));
    return { ok: true };
  });

  app.post('/api/v1/play/sessions/:id/leave', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { sess, me } = await loadSession(ctx, id, a.userId);
    if (!me || me.leftAt) throw badRequest('You are not in this game.');
    if (sess.status === 'lobby') {
      if (sess.hostId === a.userId) await ctx.db.update(s.gameSessions).set({ status: 'abandoned', updatedAt: new Date() }).where(eq(s.gameSessions.id, id));
      else await ctx.db.delete(s.gameParticipants).where(and(eq(s.gameParticipants.sessionId, id), eq(s.gameParticipants.userId, a.userId)));
    } else {
      const after = await ctx.db.transaction(async (tx) => {
        const [locked] = await tx.select().from(s.gameSessions).where(eq(s.gameSessions.id, id)).for('update');
        await tx.update(s.gameParticipants).set({ leftAt: new Date() }).where(and(eq(s.gameParticipants.sessionId, id), eq(s.gameParticipants.userId, a.userId)));
        if (locked.status !== 'active') return null;
        const left = await activeParticipants(tx, id);
        if (!left.length) {
          await tx.update(s.gameSessions).set({ status: 'abandoned', updatedAt: new Date() }).where(eq(s.gameSessions.id, id));
          return null;
        }
        // The game must not stall: someone else becomes host, and a round that waited only for this player closes.
        if (locked.hostId === a.userId) await tx.update(s.gameSessions).set({ hostId: left[0].userId, updatedAt: new Date() }).where(eq(s.gameSessions.id, id));
        const round = (locked.state as SessionState).rounds[locked.roundIndex];
        const subs = await roundSubs(tx, id, locked.roundIndex);
        if (round.kind !== 'resolve' && subs.length && !pendingActors(round, left.map((p) => p.userId), subs).length) return closeRound(ctx, tx, id);
        return null;
      });
      if (after) await afterCompletion(ctx, after);
    }
    return { ok: true };
  });

  app.post('/api/v1/play/sessions/:id/start', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { sess } = await loadSession(ctx, id, a.userId);
    if (sess.hostId !== a.userId) throw forbidden('Only the host can start the game.');
    if (sess.status !== 'lobby') throw badRequest('This game has already started.');
    const def = GAME_BY_KEY[sess.gameKey];
    const players = await activeParticipants(ctx.db, id);
    if (players.length < def.minPlayers) throw badRequest(`${def.name} needs at least ${def.minPlayers} players.`);
    const names = await displayNames(ctx.db, players.map((p) => p.userId));
    const personas = await latestPersonas(ctx.db, players.filter((p) => p.shareIdentity).map((p) => p.userId));
    const snapshot: Participant[] = players.map((p) => ({ userId: p.userId, name: names.get(p.userId)?.displayName ?? 'Player', shareIdentity: p.shareIdentity, archetype: p.shareIdentity ? personas.get(p.userId)?.key ?? null : null, scores: p.shareIdentity ? personas.get(p.userId)?.scores ?? null : null }));
    const memories = sess.gameKey === 'memory_lane' && sess.circleId ? await circleMemories(ctx.db, sess.circleId) : [];
    const state: SessionState = { rounds: [], players: snapshot, reveals: {} };
    try {
      state.rounds = def.plan(contextFor(sess, state, memories, await recentPromptIds(ctx.db, sess)));
    } catch (e) {
      if (e instanceof GameError) throw badRequest(e.message);
      throw e;
    }
    const started = await ctx.db.update(s.gameSessions).set({ status: 'active', roundIndex: 0, state, updatedAt: new Date() }).where(and(eq(s.gameSessions.id, id), eq(s.gameSessions.status, 'lobby'))).returning({ id: s.gameSessions.id });
    if (!started.length) throw badRequest('This game has already started.');
    await track(ctx.db, a.userId, 'game_started', { game: sess.gameKey, players: players.length });
    for (const p of players) if (p.userId !== a.userId) await notify(ctx, ctx.db, { userId: p.userId, category: 'games', title: `${def.name} has started`, link: `/play/${id}`, dedupeKey: `game-start:${id}` });
    return { ok: true };
  });

  app.post('/api/v1/play/sessions/:id/submit', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { payload } = parse(z.object({ payload: z.record(z.string(), z.unknown()) }), req.body);
    const { sess, me } = await loadSession(ctx, id, a.userId);
    if (sess.status !== 'active') throw badRequest('This game is not in progress.');
    if (!me || me.leftAt) throw forbidden('Join the game to play.');
    const state = sess.state as SessionState;
    const round = state.rounds[sess.roundIndex];
    if (!canAct(round, a.userId)) throw forbidden(round.actorId ? 'It is not your turn.' : 'You sit this round out — it is about you.');
    let clean: Record<string, unknown>;
    try {
      clean = GAME_BY_KEY[sess.gameKey].validate(round, payload, contextFor(sess, state), a.userId);
    } catch (e) {
      if (e instanceof GameError) throw badRequest(e.message);
      throw e;
    }
    if (typeof clean.text === 'string') {
      const screened = screenText(clean.text, await blockedPhrases(ctx.db), { protectIdentity: true });
      if (!screened.ok) throw badRequest(screened.reason!);
    }
    const roundIndex = sess.roundIndex;
    const result = await ctx.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(s.gameSessions).where(eq(s.gameSessions.id, id)).for('update');
      if (locked.status !== 'active' || locked.roundIndex !== roundIndex) throw conflict('That round just closed. Here is the next one.');
      // Answers can be changed until the round closes.
      await tx.insert(s.gameSubmissions).values({ sessionId: id, roundIndex, userId: a.userId, payload: clean })
        .onConflictDoUpdate({ target: [s.gameSubmissions.sessionId, s.gameSubmissions.roundIndex, s.gameSubmissions.userId], set: { payload: clean, withdrawnAt: null, createdAt: new Date() } });
      await tx.update(s.gameSessions).set({ updatedAt: new Date() }).where(eq(s.gameSessions.id, id));
      const players = (await activeParticipants(tx, id)).map((p) => p.userId);
      const pending = pendingActors(round, players, await roundSubs(tx, id, roundIndex));
      const closed = pending.length === 0 ? await closeRound(ctx, tx, id) : locked;
      await track(tx, a.userId, 'game_round_played', { game: sess.gameKey });
      await recordFirstAction(tx, a.userId, 'game');
      return closed;
    });
    await afterCompletion(ctx, result);
    return { ok: true, status: result.status, roundIndex: result.roundIndex };
  });

  /**
   * Rematch: a player of a finished game opens a new lobby of the same game in the same circle and the
   * other players are invited (notified). Nobody is joined without acting — they choose to join.
   */
  app.post('/api/v1/play/sessions/:id/rematch', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { sess, me } = await loadSession(ctx, id, a.userId);
    if (!me) throw forbidden('Only players of this game can ask for a rematch.');
    if (sess.status !== 'completed' && sess.status !== 'abandoned') throw badRequest('Finish this game first.');
    const def = GAME_BY_KEY[sess.gameKey];
    if (sess.circleId) {
      if (!(await circleMembership(ctx.db, sess.circleId, a.userId))) throw notFound('Circle');
      const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.gameSessions).where(and(eq(s.gameSessions.circleId, sess.circleId), inArray(s.gameSessions.status, ['lobby', 'active'])));
      if (n >= MAX_LIVE_SESSIONS_PER_CIRCLE) throw badRequest('This circle already has five games in progress. Finish one first.');
    }
    const next = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.insert(s.gameSessions).values({ gameKey: def.key, gameVersion: def.version, circleId: sess.circleId, hostId: a.userId, state: { rematchOf: sess.id } }).returning();
      await tx.insert(s.gameParticipants).values({ sessionId: row.id, userId: a.userId, allowReuse: me.allowReuse, shareIdentity: me.shareIdentity });
      return row;
    });
    const host = (await displayNames(ctx.db, [a.userId])).get(a.userId);
    const others = (await ctx.db.select({ u: s.gameParticipants.userId }).from(s.gameParticipants).where(eq(s.gameParticipants.sessionId, sess.id))).map((r) => r.u).filter((u) => u !== a.userId);
    for (const u of others) {
      if (sess.circleId && !(await circleMembership(ctx.db, sess.circleId, u))) continue;
      await notify(ctx, ctx.db, { userId: u, category: 'games', title: `${host?.displayName ?? 'Someone'} wants a rematch of ${def.name}`, body: 'Join the lobby if you’re up for it.', link: `/play/${next.id}`, dedupeKey: `rematch:${next.id}` });
    }
    await track(ctx.db, a.userId, 'game_rematch', { game: def.key });
    return { session: { id: next.id }, invited: others.length };
  });

  /** Withdraw your line before the round closes (submission rounds only). */
  app.post('/api/v1/play/sessions/:id/withdraw', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { sess } = await loadSession(ctx, id, a.userId);
    const round = (sess.state as SessionState).rounds?.[sess.roundIndex];
    if (sess.status !== 'active' || !round || round.kind !== 'submit') throw badRequest('Only an open writing round can be withdrawn from.');
    const res = await ctx.db.update(s.gameSubmissions).set({ withdrawnAt: new Date() }).where(and(eq(s.gameSubmissions.sessionId, id), eq(s.gameSubmissions.roundIndex, sess.roundIndex), eq(s.gameSubmissions.userId, a.userId), isNull(s.gameSubmissions.withdrawnAt))).returning();
    if (!res.length) throw notFound('Submission');
    return { ok: true };
  });

  /** Host moves on when someone is away. Needs at least one answer, except turn rounds whose player is absent. */
  app.post('/api/v1/play/sessions/:id/advance', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { sess } = await loadSession(ctx, id, a.userId);
    if (sess.hostId !== a.userId) throw forbidden('Only the host can move the game on.');
    if (sess.status !== 'active') throw badRequest('This game is not in progress.');
    const round = (sess.state as SessionState).rounds[sess.roundIndex];
    const subs = await roundSubs(ctx.db, id, sess.roundIndex);
    if (round.kind === 'resolve') throw badRequest('Record the real outcome to finish this game.');
    if (!subs.length && round.kind !== 'turn') throw badRequest('Wait for at least one answer before moving on.');
    const result = await ctx.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(s.gameSessions).where(eq(s.gameSessions.id, id)).for('update');
      if (locked.roundIndex !== sess.roundIndex) return locked;
      return closeRound(ctx, tx, id);
    });
    await afterCompletion(ctx, result);
    return { ok: true, status: result.status };
  });

  app.get('/api/v1/play/sessions/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { sess, me } = await loadSession(ctx, id, a.userId);
    const def = GAME_BY_KEY[sess.gameKey];
    const state = sess.state as Partial<SessionState>;
    const parts = await ctx.db.select().from(s.gameParticipants).where(eq(s.gameParticipants.sessionId, id)).orderBy(s.gameParticipants.joinedAt);
    const names = await displayNames(ctx.db, parts.map((p) => p.userId));
    const round = sess.status === 'active' ? state.rounds![sess.roundIndex] : null;
    const subs = round ? await roundSubs(ctx.db, id, sess.roundIndex) : [];
    const activeIds = parts.filter((p) => !p.leftAt).map((p) => p.userId);
    const pending = round ? pendingActors(round, activeIds, subs) : [];
    // In hidden-author rounds the author is the one player who never has to act, so per-player
    // waiting state would reveal them. Only the aggregate count is shared.
    const secretRound = Boolean(round && hidesAuthor(round));
    const mySub = subs.find((x) => x.userId === a.userId);
    const [circle] = sess.circleId ? await ctx.db.select({ name: s.groups.name }).from(s.groups).where(eq(s.groups.id, sess.circleId)) : [];
    return {
      session: { id: sess.id, status: sess.status, gameKey: sess.gameKey, circleId: sess.circleId, circleName: circle?.name ?? null, hostId: sess.hostId, roundIndex: sess.roundIndex, totalRounds: state.rounds?.length ?? 0, createdAt: sess.createdAt, completedAt: sess.completedAt },
      game: { key: def.key, name: def.name, tagline: def.tagline, howToPlay: def.howToPlay, safety: def.safety, consents: def.consents ?? [], minPlayers: def.minPlayers, maxPlayers: def.maxPlayers, category: def.category },
      me: { joined: Boolean(me && !me.leftAt), isHost: sess.hostId === a.userId, allowReuse: me?.allowReuse ?? false, shareIdentity: me?.shareIdentity ?? false, canAct: Boolean(round && me && !me.leftAt && canAct(round, a.userId)), submission: mySub ? { id: mySub.id, payload: mySub.payload } : null },
      players: parts.map((p) => ({ userId: p.userId, name: names.get(p.userId)?.displayName ?? 'Player', score: p.score, left: Boolean(p.leftAt), waitingOn: !secretRound && pending.includes(p.userId) })),
      round: round ? { index: sess.roundIndex, ...publicRound(round), submitted: subs.length, waitingFor: pending.length, hidesAuthor: secretRound } : null,
      history: (state.rounds ?? []).map((r, i) => ({ index: i, title: r.title, prompt: r.prompt, reveal: state.reveals?.[String(i)] ?? null })).filter((h) => h.reveal),
      summary: state.summary ?? null,
      payouts: state.payouts ? Object.entries(state.payouts).map(([userId, pts]) => ({ name: names.get(userId)?.displayName ?? 'Player', playPoints: pts })) : null,
    };
  });

  void lt;
}
