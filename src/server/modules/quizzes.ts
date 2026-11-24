import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { badRequest, forbidden, notFound, parse } from '../lib/http';
import { blockedPhrases, screenText } from '../services/moderation';
import { displayNames } from '../services/identity';
import { QUIZ_LIMITS, QuizError, publicQuestions, scoreQuiz, validateQuiz, type QuizDefinition } from '../../shared/quiz';

const L = QUIZ_LIMITS;
const Definition = z.object({
  kind: z.enum(['trivia', 'outcome']),
  title: z.string().trim().max(L.title),
  description: z.string().trim().max(L.description).default(''),
  outcomes: z.array(z.object({ title: z.string().trim().max(L.title), description: z.string().trim().max(L.description).default('') })).max(L.maxOutcomes).default([]),
  questions: z.array(z.object({
    text: z.string().trim().max(L.text),
    options: z.array(z.object({ text: z.string().trim().max(L.option), correct: z.boolean().optional(), outcome: z.number().int().min(0).max(L.maxOutcomes - 1).optional() })).max(L.maxOptions),
  })).max(L.maxQuestions),
});

type Quiz = typeof s.memberQuizzes.$inferSelect;

export async function quizRoutes(app: FastifyInstance, ctx: Ctx) {
  /** Can this member see the quiz? Circle quizzes: active circle members only. Blocks hide in both directions. */
  async function visible(userId: string, q: Quiz | undefined): Promise<Quiz> {
    if (!q || q.status !== 'published') throw notFound('Quiz');
    if (q.authorId === userId) return q;
    const [blocked] = await ctx.db.select().from(s.blocks).where(or(and(eq(s.blocks.blockerId, userId), eq(s.blocks.blockedId, q.authorId)), and(eq(s.blocks.blockerId, q.authorId), eq(s.blocks.blockedId, userId))));
    if (blocked) throw notFound('Quiz');
    if (q.visibility === 'circle') {
      const [m] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, q.groupId!), eq(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active')));
      if (!m) throw notFound('Quiz');
    }
    return q;
  }

  app.post('/api/v1/play/quizzes', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email before publishing a quiz.');
    const body = parse(z.object({ definition: Definition, visibility: z.enum(['members', 'circle']).default('members'), circleId: z.uuid().optional() }), req.body);
    const def = body.definition as QuizDefinition;
    try { validateQuiz(def); } catch (e) { if (e instanceof QuizError) throw badRequest(e.message); throw e; }
    const phrases = await blockedPhrases(ctx.db);
    const texts = [def.title, def.description, ...def.outcomes.flatMap((o) => [o.title, o.description]), ...def.questions.flatMap((q) => [q.text, ...q.options.map((o) => o.text)])].filter(Boolean);
    for (const t of texts) { const r = screenText(t, phrases); if (!r.ok) throw badRequest(r.reason!); }
    if (body.visibility === 'circle') {
      if (!body.circleId) throw badRequest('Choose a circle.');
      const [m] = await ctx.db.select().from(s.groupMembers).where(and(eq(s.groupMembers.groupId, body.circleId), eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active')));
      if (!m) throw forbidden('Join the circle to share a quiz there.');
    }
    const [q] = await ctx.db.insert(s.memberQuizzes).values({ authorId: a.userId, kind: def.kind, title: def.title, description: def.description, definition: def as unknown as Record<string, unknown>, visibility: body.visibility, groupId: body.visibility === 'circle' ? body.circleId! : null }).returning();
    await track(ctx.db, a.userId, 'quiz_created', { kind: def.kind, visibility: body.visibility });
    return reply.code(201).send({ quiz: { id: q.id } });
  });

  /** Quizzes you can take: members-wide ones and those in your circles, newest first. */
  app.get('/api/v1/play/quizzes', async (req) => {
    const a = requireAuth(req);
    const circles = (await ctx.db.select({ g: s.groupMembers.groupId }).from(s.groupMembers).where(and(eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active')))).map((r) => r.g);
    const blocks = await ctx.db.select({ a: s.blocks.blockerId, b: s.blocks.blockedId }).from(s.blocks).where(or(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, a.userId)));
    const hidden = new Set(blocks.map((r) => (r.a === a.userId ? r.b : r.a)));
    const rows = (await ctx.db.select().from(s.memberQuizzes).where(and(eq(s.memberQuizzes.status, 'published'),
      or(eq(s.memberQuizzes.visibility, 'members'), circles.length ? inArray(s.memberQuizzes.groupId, circles) : sql`false`, eq(s.memberQuizzes.authorId, a.userId))))
      .orderBy(desc(s.memberQuizzes.createdAt)).limit(60)).filter((q) => !hidden.has(q.authorId));
    const ids = rows.map((r) => r.id);
    const counts = ids.length ? await ctx.db.select({ id: s.memberQuizAttempts.quizId, n: sql<number>`count(*)::int` }).from(s.memberQuizAttempts).where(inArray(s.memberQuizAttempts.quizId, ids)).groupBy(s.memberQuizAttempts.quizId) : [];
    const mine = ids.length ? await ctx.db.select({ id: s.memberQuizAttempts.quizId }).from(s.memberQuizAttempts).where(and(inArray(s.memberQuizAttempts.quizId, ids), eq(s.memberQuizAttempts.userId, a.userId))) : [];
    const names = await displayNames(ctx.db, rows.map((r) => r.authorId));
    return { quizzes: rows.map((q) => ({ id: q.id, kind: q.kind, title: q.title, description: q.description, visibility: q.visibility, author: names.get(q.authorId)?.displayName ?? 'Member', isMine: q.authorId === a.userId, takes: counts.find((c) => c.id === q.id)?.n ?? 0, taken: mine.some((m) => m.id === q.id), createdAt: q.createdAt })) };
  });

  app.get('/api/v1/play/quizzes/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [row] = await ctx.db.select().from(s.memberQuizzes).where(eq(s.memberQuizzes.id, id));
    const q = await visible(a.userId, row);
    const def = q.definition as unknown as QuizDefinition;
    const [attempt] = await ctx.db.select().from(s.memberQuizAttempts).where(and(eq(s.memberQuizAttempts.quizId, id), eq(s.memberQuizAttempts.userId, a.userId)));
    const names = await displayNames(ctx.db, [q.authorId]);
    const isMine = q.authorId === a.userId;
    let summary: { takes: number; outcomes?: { title: string; n: number }[]; averageScore?: number } | null = null;
    if (isMine) {
      const rows = await ctx.db.select({ score: s.memberQuizAttempts.score, outcome: s.memberQuizAttempts.outcome }).from(s.memberQuizAttempts).where(eq(s.memberQuizAttempts.quizId, id));
      summary = def.kind === 'outcome'
        ? { takes: rows.length, outcomes: def.outcomes.map((o, i) => ({ title: o.title, n: rows.filter((r) => r.outcome === i).length })) }
        : { takes: rows.length, averageScore: rows.length ? Math.round((rows.reduce((t, r) => t + r.score, 0) / rows.length) * 10) / 10 : 0 };
    }
    return {
      quiz: { id: q.id, kind: q.kind, title: q.title, description: q.description, author: names.get(q.authorId)?.displayName ?? 'Member', isMine, total: def.questions.length, questions: publicQuestions(def) },
      result: attempt ? resultView(def, attempt.answers as number[]) : null,
      summary,
    };
  });

  function resultView(def: QuizDefinition, answers: number[]) {
    const r = scoreQuiz(def, answers);
    return r.kind === 'trivia'
      ? { kind: r.kind, score: r.score, total: r.total, review: def.questions.map((q, i) => ({ question: q.text, chosen: q.options[answers[i]].text, correct: q.options.find((o) => o.correct)!.text, right: r.correct![i] })) }
      : { kind: r.kind, outcome: def.outcomes[r.outcome!], total: r.total };
  }

  /** One saved attempt per person (taking it again replaces it). Authors can't answer their own quiz. */
  app.post('/api/v1/play/quizzes/:id/attempts', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { answers } = parse(z.object({ answers: z.array(z.number().int().min(0).max(L.maxOptions - 1)).max(L.maxQuestions) }), req.body);
    const [row] = await ctx.db.select().from(s.memberQuizzes).where(eq(s.memberQuizzes.id, id));
    const q = await visible(a.userId, row);
    if (q.authorId === a.userId) throw badRequest('You made this quiz — share it so others can take it.');
    const def = q.definition as unknown as QuizDefinition;
    let r;
    try { r = scoreQuiz(def, answers); } catch (e) { if (e instanceof QuizError) throw badRequest(e.message); throw e; }
    await ctx.db.insert(s.memberQuizAttempts).values({ quizId: id, userId: a.userId, answers, score: r.score, outcome: r.outcome })
      .onConflictDoUpdate({ target: [s.memberQuizAttempts.quizId, s.memberQuizAttempts.userId], set: { answers, score: r.score, outcome: r.outcome, createdAt: new Date() } });
    await track(ctx.db, a.userId, 'quiz_taken', { kind: def.kind });
    return { result: resultView(def, answers) };
  });

  /** Authors remove their quiz; moderators can remove any (audited). */
  app.delete('/api/v1/play/quizzes/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [q] = await ctx.db.select().from(s.memberQuizzes).where(eq(s.memberQuizzes.id, id));
    if (!q) throw notFound('Quiz');
    const staff = a.roles.includes('admin') || a.roles.includes('moderator');
    if (q.authorId !== a.userId && !staff) throw notFound('Quiz');
    await ctx.db.update(s.memberQuizzes).set({ status: 'removed' }).where(eq(s.memberQuizzes.id, id));
    if (q.authorId !== a.userId) await audit(ctx.db, { actorId: a.userId, action: 'moderation.quiz_removed', targetType: 'quiz', targetId: id });
    return { ok: true };
  });
}
