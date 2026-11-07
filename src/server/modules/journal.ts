import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { decryptField, encryptField } from '../lib/crypto';
import { badRequest, conflict, notFound, parse } from '../lib/http';
import { userTz } from '../services/progression';
import { JOURNAL_RULES as R, PROMPT_BY_KEY, promptForDate, topMood, type DaySummary } from '../../shared/journal';

/** Private journal and the member's own identity calendar. Nothing here is visible to anyone else. */
export async function journalRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;
  const enc = (t: string) => encryptField(ctx.config.appSecret, t);
  const dec = (t: string) => decryptField(ctx.config.appSecret, t);
  const view = (e: typeof s.journalEntries.$inferSelect) => ({ id: e.id, date: e.localDate, prompt: e.promptKey ? PROMPT_BY_KEY[e.promptKey] ?? null : null, body: dec(e.bodyEnc), createdAt: e.createdAt, updatedAt: e.updatedAt });

  app.get('/api/v1/journal', async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req.query);
    const tz = await userTz(db, a.userId);
    const today = DateTime.now().setZone(tz).toISODate()!;
    const where = q.month
      ? and(eq(s.journalEntries.userId, a.userId), gte(s.journalEntries.localDate, `${q.month}-01`), lte(s.journalEntries.localDate, DateTime.fromISO(`${q.month}-01`).endOf('month').toISODate()!))
      : eq(s.journalEntries.userId, a.userId);
    const rows = await db.select().from(s.journalEntries).where(where).orderBy(desc(s.journalEntries.localDate), desc(s.journalEntries.createdAt)).limit(q.month ? 400 : 30);
    return { today, prompt: promptForDate(today), entries: rows.map(view), privacy: 'Only you can read your journal. It’s encrypted when stored and never used for your feed, matches, ads or anything else.' };
  });

  app.post('/api/v1/journal', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const a = requireAuth(req);
    const body = parse(z.object({ body: z.string().trim().min(1).max(R.maxChars), promptKey: z.string().max(40).optional(), date: z.iso.date().optional() }), req.body);
    if (body.promptKey && !PROMPT_BY_KEY[body.promptKey]) throw badRequest('Unknown prompt.');
    const tz = await userTz(db, a.userId);
    const today = DateTime.now().setZone(tz).toISODate()!;
    const day = body.date ?? today;
    if (day > today) throw badRequest('You can’t write in the future.');
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.journalEntries).where(and(eq(s.journalEntries.userId, a.userId), eq(s.journalEntries.localDate, day)));
    if (n >= R.maxPerDay) throw conflict(`Up to ${R.maxPerDay} entries a day.`);
    const [e] = await db.insert(s.journalEntries).values({ userId: a.userId, localDate: day, promptKey: body.promptKey ?? null, bodyEnc: enc(body.body) }).returning();
    // Only that an entry was written — never its text, prompt or length.
    await track(db, a.userId, 'journal_written', {});
    return reply.code(201).send({ entry: view(e) });
  });

  app.patch('/api/v1/journal/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(R.maxChars) }), req.body);
    const [e] = await db.update(s.journalEntries).set({ bodyEnc: enc(body), updatedAt: new Date() }).where(and(eq(s.journalEntries.id, id), eq(s.journalEntries.userId, a.userId))).returning();
    if (!e) throw notFound('Entry');
    return { entry: view(e) };
  });

  app.delete('/api/v1/journal/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const r = await db.delete(s.journalEntries).where(and(eq(s.journalEntries.id, id), eq(s.journalEntries.userId, a.userId))).returning({ id: s.journalEntries.id });
    if (!r.length) throw notFound('Entry');
    return { ok: true };
  });

  /**
   * Identity calendar: your own month at a glance — mood check-ins, journal days, Thought Drops, circle events you
   * said you'd attend, and games finished. Counts only; built from your own records.
   */
  app.get('/api/v1/me/calendar', async (req) => {
    const a = requireAuth(req);
    const tz = await userTz(db, a.userId);
    const q = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req.query);
    const start = q.month ? DateTime.fromISO(`${q.month}-01`, { zone: tz }) : DateTime.now().setZone(tz).startOf('month');
    if (!start.isValid) throw badRequest('Unknown month.');
    const end = start.endOf('month');
    const from = start.toISODate()!, to = end.toISODate()!;
    const fromTs = start.toJSDate(), toTs = end.toJSDate();
    const local = (col: unknown) => sql<string>`to_char((${col} at time zone ${tz})::date, 'YYYY-MM-DD')`;
    const [vibes, journal, posts, events, games] = await Promise.all([
      db.select({ d: s.vibeCheckins.localDate, mood: s.vibeCheckins.mood }).from(s.vibeCheckins).where(and(eq(s.vibeCheckins.userId, a.userId), gte(s.vibeCheckins.localDate, from), lte(s.vibeCheckins.localDate, to))),
      db.select({ d: s.journalEntries.localDate, n: sql<number>`count(*)::int` }).from(s.journalEntries).where(and(eq(s.journalEntries.userId, a.userId), gte(s.journalEntries.localDate, from), lte(s.journalEntries.localDate, to))).groupBy(s.journalEntries.localDate),
      db.select({ d: local(s.posts.createdAt), n: sql<number>`count(*)::int` }).from(s.posts).where(and(eq(s.posts.authorId, a.userId), sql`${s.posts.deletedAt} is null`, gte(s.posts.createdAt, fromTs), lte(s.posts.createdAt, toTs))).groupBy(sql`1`),
      db.select({ d: local(s.events.startsAt), n: sql<number>`count(*)::int` }).from(s.eventRsvps).innerJoin(s.events, eq(s.events.id, s.eventRsvps.eventId)).where(and(eq(s.eventRsvps.userId, a.userId), inArray(s.eventRsvps.status, ['going', 'attended']), sql`${s.events.status} <> 'cancelled'`, gte(s.events.startsAt, fromTs), lte(s.events.startsAt, toTs))).groupBy(sql`1`),
      db.select({ d: local(s.gameSessions.completedAt), n: sql<number>`count(distinct ${s.gameSessions.id})::int` }).from(s.gameParticipants).innerJoin(s.gameSessions, eq(s.gameSessions.id, s.gameParticipants.sessionId)).where(and(eq(s.gameParticipants.userId, a.userId), eq(s.gameSessions.status, 'completed'), gte(s.gameSessions.completedAt, fromTs), lte(s.gameSessions.completedAt, toTs))).groupBy(sql`1`),
    ]);
    const days: DaySummary[] = [];
    for (let d = start; d <= end; d = d.plus({ days: 1 })) {
      const iso = d.toISODate()!;
      days.push({ date: iso, mood: vibes.find((v) => v.d === iso)?.mood ?? null, journal: journal.find((j) => j.d === iso)?.n ?? 0, posts: posts.find((p) => p.d === iso)?.n ?? 0, events: events.find((e) => e.d === iso)?.n ?? 0, games: games.find((g) => g.d === iso)?.n ?? 0 });
    }
    return {
      month: start.toFormat('yyyy-LL'), label: start.toFormat('LLLL yyyy'), today: DateTime.now().setZone(tz).toISODate(), days,
      summary: { moodDays: days.filter((d) => d.mood).length, topMood: topMood(days), journalDays: days.filter((d) => d.journal).length, posts: days.reduce((t, d) => t + d.posts, 0), events: days.reduce((t, d) => t + d.events, 0), games: days.reduce((t, d) => t + d.games, 0) },
    };
  });
}
