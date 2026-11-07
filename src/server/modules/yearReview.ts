import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import type { Executor } from '../db/client';
import { track } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { randomToken } from '../lib/crypto';
import { badRequest, conflict, notFound, parse } from '../lib/http';
import { userTz } from '../services/progression';
import { PERSONA_BY_KEY, assessQuality, type Answers, type Vector } from '../../shared/personality';
import { topMood } from '../../shared/journal';
import {
  FACT_LABEL, SHAREABLE_FACTS, YEAR_FACTS, YEAR_RULES as R, cardValue, highlightsFor, summariseYear,
  type DayCount, type YearFactKey, type YearFacts,
} from '../../shared/yearReview';

/** Builds one member's year from their own records only. Counts, never content. */
export async function computeYear(db: Executor, userId: string, tz: string, year: number) {
  const start = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: tz });
  const end = start.endOf('year');
  const now = DateTime.now().setZone(tz);
  const fromTs = start.toJSDate(), toTs = end.toJSDate(), nowTs = now.toJSDate();
  const from = start.toISODate()!, to = end.toISODate()!;
  const local = (col: unknown) => sql<string>`to_char((${col} at time zone ${tz})::date, 'YYYY-MM-DD')`;
  const n = sql<number>`count(*)::int`;
  const [drops, games, quizzes, tournaments, events, vibes, journal, [reactions], [circles], [latest]] = await Promise.all([
    db.select({ d: local(s.posts.createdAt), n }).from(s.posts).where(and(eq(s.posts.authorId, userId), isNull(s.posts.deletedAt), gte(s.posts.createdAt, fromTs), lte(s.posts.createdAt, toTs))).groupBy(sql`1`),
    db.select({ d: local(s.gameSessions.completedAt), n: sql<number>`count(distinct ${s.gameSessions.id})::int` }).from(s.gameParticipants).innerJoin(s.gameSessions, eq(s.gameSessions.id, s.gameParticipants.sessionId)).where(and(eq(s.gameParticipants.userId, userId), eq(s.gameSessions.status, 'completed'), gte(s.gameSessions.completedAt, fromTs), lte(s.gameSessions.completedAt, toTs))).groupBy(sql`1`),
    db.select({ d: local(s.memberQuizAttempts.createdAt), n }).from(s.memberQuizAttempts).where(and(eq(s.memberQuizAttempts.userId, userId), gte(s.memberQuizAttempts.createdAt, fromTs), lte(s.memberQuizAttempts.createdAt, toTs))).groupBy(sql`1`),
    db.select({ d: local(s.tournamentEntries.finishedAt), n }).from(s.tournamentEntries).where(and(eq(s.tournamentEntries.userId, userId), eq(s.tournamentEntries.state, 'finished'), gte(s.tournamentEntries.finishedAt, fromTs), lte(s.tournamentEntries.finishedAt, toTs))).groupBy(sql`1`),
    // Only events that have already happened.
    db.select({ d: local(s.events.startsAt), n }).from(s.eventRsvps).innerJoin(s.events, eq(s.events.id, s.eventRsvps.eventId)).where(and(eq(s.eventRsvps.userId, userId), inArray(s.eventRsvps.status, ['going', 'attended']), ne(s.events.status, 'cancelled'), gte(s.events.startsAt, fromTs), lte(s.events.startsAt, toTs < nowTs ? toTs : nowTs))).groupBy(sql`1`),
    db.select({ d: s.vibeCheckins.localDate, mood: s.vibeCheckins.mood }).from(s.vibeCheckins).where(and(eq(s.vibeCheckins.userId, userId), gte(s.vibeCheckins.localDate, from), lte(s.vibeCheckins.localDate, to))),
    db.select({ d: s.journalEntries.localDate, n }).from(s.journalEntries).where(and(eq(s.journalEntries.userId, userId), gte(s.journalEntries.localDate, from), lte(s.journalEntries.localDate, to))).groupBy(s.journalEntries.localDate),
    // Reactions other people left on your drops this year.
    db.select({ n }).from(s.reactions).innerJoin(s.posts, eq(s.posts.id, s.reactions.postId)).where(and(eq(s.posts.authorId, userId), ne(s.reactions.userId, userId), isNull(s.posts.deletedAt), gte(s.reactions.createdAt, fromTs), lte(s.reactions.createdAt, toTs))),
    db.select({ n }).from(s.groupMembers).innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId)).where(and(eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active'), eq(s.groups.kind, 'circle'), gte(s.groupMembers.createdAt, fromTs), lte(s.groupMembers.createdAt, toTs))),
    db.select().from(s.assessmentResults).where(and(eq(s.assessmentResults.userId, userId), lte(s.assessmentResults.createdAt, toTs))).orderBy(desc(s.assessmentResults.createdAt)).limit(1),
  ]);
  const y = summariseYear(year, { drops, games, quizzes, tournaments, events, journal, checkins: vibes.map((v): DayCount => ({ d: v.d, n: 1 })) });
  const archetype = latest && assessQuality(latest.answers as Answers, latest.scores as Vector).level !== 'insufficient' ? PERSONA_BY_KEY[latest.archetypeKey]?.name ?? null : null;
  const facts: YearFacts = {
    activeDays: y.activeDays, longestRun: y.longestRun, busiestMonth: y.busiestMonth,
    drops: y.totals.drops, reactions: reactions.n, circles: circles.n, games: y.totals.games, quizzes: y.totals.quizzes,
    tournaments: y.totals.tournaments, events: y.totals.events, archetype,
    checkins: y.totals.checkins, topMood: topMood(vibes.map((v) => ({ date: v.d, mood: v.mood, journal: 0, posts: 0, events: 0, games: 0 }))), journalDays: journal.length,
  };
  return { facts, months: y.months, soFar: year === now.year };
}

/** Year in review: your own year, and cards you choose to share. */
export async function yearReviewRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;
  const cardUrl = (slug: string) => `${ctx.config.APP_ORIGIN}/y/${slug}`;

  async function yearsFor(userId: string, tz: string) {
    const [u] = await db.select({ createdAt: s.users.createdAt }).from(s.users).where(eq(s.users.id, userId));
    const first = DateTime.fromJSDate(u.createdAt).setZone(tz).year;
    const current = DateTime.now().setZone(tz).year;
    return Array.from({ length: Math.max(1, current - first + 1) }, (_, i) => current - i);
  }

  app.get('/api/v1/year-review', async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }), req.query);
    const tz = await userTz(db, a.userId);
    const years = await yearsFor(a.userId, tz);
    const year = q.year ?? years[0];
    if (!years.includes(year)) throw notFound('Year');
    const { facts, months, soFar } = await computeYear(db, a.userId, tz, year);
    await track(db, a.userId, 'year_review_viewed', { year });
    return {
      year, years, soFar, facts, months, highlights: highlightsFor(facts, soFar),
      factList: YEAR_FACTS.map((f) => ({ key: f.key, label: f.label, shareable: f.shareable, value: facts[f.key] })),
      canShare: facts.activeDays >= R.minActiveDaysToShare,
      note: 'Built only from your own activity. Moods and your journal stay private and can never go on a shared card.',
    };
  });

  app.post('/api/v1/year-review/cards', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const body = parse(z.object({
      year: z.number().int().min(2000).max(2100),
      facts: z.array(z.enum(SHAREABLE_FACTS as [YearFactKey, ...YearFactKey[]])).min(1).max(R.maxCardFacts),
      showName: z.boolean().default(false),
    }), req.body);
    const tz = await userTz(db, a.userId);
    if (!(await yearsFor(a.userId, tz)).includes(body.year)) throw notFound('Year');
    const [{ live }] = await db.select({ live: sql<number>`count(*)::int` }).from(s.yearCards).where(and(eq(s.yearCards.userId, a.userId), isNull(s.yearCards.revokedAt)));
    if (live >= R.maxActiveCards) throw conflict(`You can keep up to ${R.maxActiveCards} cards live. Switch one off first.`);
    const { facts } = await computeYear(db, a.userId, tz, body.year);
    if (facts.activeDays < R.minActiveDaysToShare) throw badRequest('There isn’t enough in this year to share yet.');
    const chosen = [...new Set(body.facts)].map((key) => ({ key, value: cardValue(facts, key) })).filter((f): f is { key: YearFactKey; value: string } => f.value !== null);
    if (!chosen.length) throw badRequest('Those facts are empty for this year — pick ones with something to show.');
    const [p] = await db.select({ displayName: s.profiles.displayName }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const slug = randomToken(9);
    await db.insert(s.yearCards).values({ slug, userId: a.userId, year: body.year, facts: chosen, displayName: body.showName ? p?.displayName ?? null : null });
    // Which kinds of fact were shared and how many — never the values.
    await track(db, a.userId, 'year_card_created', { year: body.year, facts: chosen.length, named: body.showName });
    return reply.code(201).send({ card: { slug, url: cardUrl(slug), year: body.year, facts: chosen.map((f) => ({ ...f, label: FACT_LABEL[f.key] })), named: body.showName } });
  });

  app.get('/api/v1/year-review/cards', async (req) => {
    const a = requireAuth(req);
    const rows = await db.select().from(s.yearCards).where(and(eq(s.yearCards.userId, a.userId), isNull(s.yearCards.revokedAt))).orderBy(desc(s.yearCards.createdAt));
    return { cards: rows.map((r) => ({ slug: r.slug, url: cardUrl(r.slug), year: r.year, facts: (r.facts as { key: string; value: string }[]).map((f) => ({ ...f, label: FACT_LABEL[f.key] ?? f.key })), named: Boolean(r.displayName), views: r.views, createdAt: r.createdAt })) };
  });

  app.delete('/api/v1/year-review/cards/:slug', async (req) => {
    const a = requireAuth(req);
    const { slug } = parse(z.object({ slug: z.string().min(8).max(32) }), req.params);
    const r = await db.update(s.yearCards).set({ revokedAt: new Date() }).where(and(eq(s.yearCards.slug, slug), eq(s.yearCards.userId, a.userId), isNull(s.yearCards.revokedAt))).returning({ id: s.yearCards.id });
    if (!r.length) throw notFound('Card');
    return { ok: true };
  });

  /** Public, unauthenticated: the snapshot the member chose, and their display name only if they asked. */
  app.get('/api/v1/year-cards/:slug', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { slug } = parse(z.object({ slug: z.string().min(8).max(32) }), req.params);
    const [c] = await db.select().from(s.yearCards).where(and(eq(s.yearCards.slug, slug), isNull(s.yearCards.revokedAt)));
    if (!c) throw notFound('Card');
    await db.update(s.yearCards).set({ views: sql`${s.yearCards.views} + 1` }).where(eq(s.yearCards.id, c.id));
    await track(db, null, 'year_card_viewed', {});
    return { card: { year: c.year, displayName: c.displayName, facts: (c.facts as { key: string; value: string }[]).filter((f) => SHAREABLE_FACTS.includes(f.key as YearFactKey)).map((f) => ({ ...f, label: FACT_LABEL[f.key] })) } };
  });
}
