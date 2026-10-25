import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor, Tx } from '../db/client';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { randomToken } from '../lib/crypto';
import { notify } from '../lib/notify';
import { awardXp, evaluateAchievements } from '../lib/rewards';
import { createStorage, MEDIA_TYPES } from '../lib/storage';
import { displayNames } from '../services/identity';

type Course = typeof s.courses.$inferSelect;

async function enrollment(db: Executor, userId: string, courseId: string) {
  const [e] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.userId, userId), eq(s.enrollments.courseId, courseId), inArray(s.enrollments.status, ['active', 'completed'])));
  return e ?? null;
}

/** Access rule: preview lessons are open; other lessons need an active enrollment (or creator/admin). */
async function canAccessLesson(db: Executor, userId: string, roles: string[], course: Course, lesson: typeof s.lessons.$inferSelect) {
  if (lesson.isPreview || course.creatorId === userId || roles.includes('admin')) return true;
  return Boolean(await enrollment(db, userId, course.id));
}

/** Checks completion requirements and issues the certificate exactly once. */
export async function checkCourseCompletion(ctx: Ctx, db: Executor, userId: string, courseId: string) {
  const [course] = await db.select().from(s.courses).where(eq(s.courses.id, courseId));
  const e = await enrollment(db, userId, courseId);
  if (!e || e.status === 'completed') return null;
  const all = await db.select({ id: s.lessons.id }).from(s.lessons).where(eq(s.lessons.courseId, courseId));
  const done = await db.select({ id: s.lessonProgress.lessonId }).from(s.lessonProgress).where(and(eq(s.lessonProgress.userId, userId), inArray(s.lessonProgress.lessonId, all.map((l) => l.id).concat(['00000000-0000-0000-0000-000000000000']))));
  const quizzes = await db.select().from(s.quizzes).where(inArray(s.quizzes.lessonId, all.map((l) => l.id).concat(['00000000-0000-0000-0000-000000000000'])));
  const passed = quizzes.length ? await db.select({ q: s.quizAttempts.quizId }).from(s.quizAttempts).where(and(eq(s.quizAttempts.userId, userId), eq(s.quizAttempts.passed, true), inArray(s.quizAttempts.quizId, quizzes.map((q) => q.id)))) : [];
  const passedSet = new Set(passed.map((p) => p.q));
  if (done.length < all.length || quizzes.some((q) => !passedSet.has(q.id))) return null;
  await db.update(s.enrollments).set({ status: 'completed', completedAt: new Date() }).where(eq(s.enrollments.id, e.id));
  await awardXp(ctx, db, userId, 'course_completed', { sourceId: courseId });
  await evaluateAchievements(ctx, db, userId, ['courses_completed']);
  let certificate = null;
  if (course.certificateEnabled) {
    const [p] = await db.select().from(s.profiles).where(eq(s.profiles.userId, userId));
    const res = await db.insert(s.certificates).values({
      serial: `NK-${new Date().getFullYear()}-${randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, '7')}`, userId, courseId,
      recipientName: p.fullName ?? p.displayName, requirements: { lessons: all.length, quizzesPassed: quizzes.length, passPercent: course.passPercent },
    }).onConflictDoNothing().returning();
    certificate = res[0] ?? null;
    if (certificate) await notify(ctx, db, { userId, category: 'learning', title: `Certificate earned: ${course.title}`, link: `/learn/certificates/${certificate.serial}` });
  }
  return certificate;
}

export async function grantCourseEnrollment(db: Tx | Executor, userId: string, courseId: string, source: 'free' | 'purchase' | 'subscription' | 'admin', orderId?: string) {
  await db.insert(s.enrollments).values({ userId, courseId, source, orderId }).onConflictDoUpdate({ target: [s.enrollments.userId, s.enrollments.courseId], set: { status: 'active', source } });
}

export async function learningRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = createStorage(ctx);

  app.get('/api/v1/courses', async (req) => {
    const q = parse(z.object({ q: z.string().max(60).optional(), topic: z.string().optional(), level: z.enum(['beginner', 'intermediate', 'advanced']).optional(), free: z.coerce.boolean().optional() }), req.query);
    const rows = await ctx.db.select().from(s.courses).where(and(eq(s.courses.status, 'published'),
      q.q ? sql`(${s.courses.title} ilike ${'%' + q.q + '%'} or ${s.courses.description} ilike ${'%' + q.q + '%'})` : undefined,
      q.topic ? sql`${q.topic} = any(${s.courses.topics})` : undefined, q.level ? eq(s.courses.level, q.level) : undefined, q.free ? eq(s.courses.pricePaise, 0) : undefined)).orderBy(desc(s.courses.publishedAt));
    const names = await displayNames(ctx.db, rows.map((r) => r.creatorId));
    const counts = rows.length ? await ctx.db.select({ c: s.lessons.courseId, n: sql<number>`count(*)::int`, mins: sql<number>`sum(${s.lessons.durationMinutes})::int` }).from(s.lessons).where(inArray(s.lessons.courseId, rows.map((r) => r.id))).groupBy(s.lessons.courseId) : [];
    const ratings = rows.length ? await ctx.db.select({ id: s.reviews.subjectId, avg: sql<number>`avg(${s.reviews.rating})::float`, n: sql<number>`count(*)::int` }).from(s.reviews).where(and(eq(s.reviews.subjectType, 'course'), inArray(s.reviews.subjectId, rows.map((r) => r.id)))).groupBy(s.reviews.subjectId) : [];
    let enrolled: string[] = [];
    let recommended: string[] = [];
    if (req.auth) {
      enrolled = (await ctx.db.select({ c: s.enrollments.courseId }).from(s.enrollments).where(eq(s.enrollments.userId, req.auth.userId))).map((r) => r.c);
      const [p] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, req.auth.userId));
      const interests = (p?.interests ?? []).map((i) => i.toLowerCase());
      const completedAny = (await ctx.db.select().from(s.enrollments).where(and(eq(s.enrollments.userId, req.auth.userId), eq(s.enrollments.status, 'completed')))).length > 0;
      // Deterministic recommendation: interest overlap, then beginner-first for new learners, then newest.
      recommended = rows.filter((r) => !enrolled.includes(r.id))
        .map((r) => ({ id: r.id, score: r.topics.filter((t) => interests.includes(t)).length * 2 + (!completedAny && r.level === 'beginner' ? 1.5 : 0) + (completedAny && r.level === 'intermediate' ? 1 : 0) }))
        .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3).map((x) => x.id);
    }
    return {
      courses: rows.map((c) => ({ ...c, creator: names.get(c.creatorId), lessonCount: counts.find((x) => x.c === c.id)?.n ?? 0, minutes: counts.find((x) => x.c === c.id)?.mins ?? 0, rating: ratings.find((x) => x.id === c.id) ?? null, enrolled: enrolled.includes(c.id) })),
      recommendedIds: recommended,
      recommendationExplanation: 'Recommended from the interests you chose on your profile and your learning progress.',
    };
  });

  app.get('/api/v1/courses/:slug', async (req) => {
    const { slug } = parse(z.object({ slug: z.string() }), req.params);
    const [c] = await ctx.db.select().from(s.courses).where(eq(s.courses.slug, slug));
    const isOwner = req.auth && (c?.creatorId === req.auth.userId || req.auth.roles.includes('admin'));
    if (!c || (c.status !== 'published' && !isOwner)) throw notFound('Course');
    const chapters = await ctx.db.select().from(s.courseChapters).where(eq(s.courseChapters.courseId, c.id)).orderBy(asc(s.courseChapters.position));
    const lessons = await ctx.db.select({ id: s.lessons.id, chapterId: s.lessons.chapterId, title: s.lessons.title, kind: s.lessons.kind, durationMinutes: s.lessons.durationMinutes, position: s.lessons.position, isPreview: s.lessons.isPreview }).from(s.lessons).where(eq(s.lessons.courseId, c.id)).orderBy(asc(s.lessons.position));
    const quizzes = lessons.length ? await ctx.db.select({ id: s.quizzes.id, lessonId: s.quizzes.lessonId }).from(s.quizzes).where(inArray(s.quizzes.lessonId, lessons.map((l) => l.id))) : [];
    let progress: string[] = [];
    let passedQuizzes: string[] = [];
    let enr = null;
    let certificate = null;
    let bookmarks: string[] = [];
    if (req.auth) {
      enr = await enrollment(ctx.db, req.auth.userId, c.id);
      progress = lessons.length ? (await ctx.db.select({ id: s.lessonProgress.lessonId }).from(s.lessonProgress).where(and(eq(s.lessonProgress.userId, req.auth.userId), inArray(s.lessonProgress.lessonId, lessons.map((l) => l.id))))).map((r) => r.id) : [];
      passedQuizzes = quizzes.length ? (await ctx.db.select({ q: s.quizAttempts.quizId }).from(s.quizAttempts).where(and(eq(s.quizAttempts.userId, req.auth.userId), eq(s.quizAttempts.passed, true), inArray(s.quizAttempts.quizId, quizzes.map((q) => q.id))))).map((r) => r.q) : [];
      [certificate] = await ctx.db.select().from(s.certificates).where(and(eq(s.certificates.userId, req.auth.userId), eq(s.certificates.courseId, c.id)));
      bookmarks = (await ctx.db.select({ id: s.lessonBookmarks.lessonId }).from(s.lessonBookmarks).where(eq(s.lessonBookmarks.userId, req.auth.userId))).map((r) => r.id);
    }
    const [product] = c.pricePaise > 0 ? await ctx.db.select({ slug: s.products.slug, id: s.products.id }).from(s.products).where(and(eq(s.products.category, 'digital_course'), sql`${s.products.digitalAsset}->>'courseId' = ${c.id}`)) : [];
    const reviews = await ctx.db.select().from(s.reviews).where(and(eq(s.reviews.subjectType, 'course'), eq(s.reviews.subjectId, c.id), eq(s.reviews.status, 'published'))).orderBy(desc(s.reviews.createdAt)).limit(10);
    const names = await displayNames(ctx.db, [c.creatorId, ...reviews.map((r) => r.authorId)]);
    return {
      course: { ...c, creator: names.get(c.creatorId) }, chapters,
      lessons: lessons.map((l) => ({ ...l, completed: progress.includes(l.id), quizId: quizzes.find((q) => q.lessonId === l.id)?.id ?? null, quizPassed: passedQuizzes.includes(quizzes.find((q) => q.lessonId === l.id)?.id ?? ''), bookmarked: bookmarks.includes(l.id) })),
      enrollment: enr, certificate: certificate ?? null, product: product ?? null,
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, author: names.get(r.authorId)?.displayName, createdAt: r.createdAt })),
    };
  });

  app.post('/api/v1/courses/:id/enroll', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [c] = await ctx.db.select().from(s.courses).where(and(eq(s.courses.id, id), eq(s.courses.status, 'published')));
    if (!c) throw notFound('Course');
    if (c.pricePaise > 0) {
      const [ent] = await ctx.db.select().from(s.entitlements).where(and(eq(s.entitlements.userId, a.userId), eq(s.entitlements.kind, 'course'), eq(s.entitlements.refId, c.id), sql`${s.entitlements.revokedAt} is null`));
      if (!ent) {
        const [product] = await ctx.db.select({ slug: s.products.slug }).from(s.products).where(and(eq(s.products.category, 'digital_course'), sql`${s.products.digitalAsset}->>'courseId' = ${c.id}`));
        return { requiresPurchase: true, productSlug: product?.slug ?? null };
      }
      await grantCourseEnrollment(ctx.db, a.userId, c.id, 'purchase');
    } else {
      await grantCourseEnrollment(ctx.db, a.userId, c.id, 'free');
    }
    await track(ctx.db, a.userId, 'course_enrolled', { paid: c.pricePaise > 0 });
    return { enrolled: true };
  });

  app.get('/api/v1/lessons/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [l] = await ctx.db.select().from(s.lessons).where(eq(s.lessons.id, id));
    if (!l) throw notFound('Lesson');
    const [c] = await ctx.db.select().from(s.courses).where(eq(s.courses.id, l.courseId));
    if (c.status !== 'published' && c.creatorId !== a.userId && !a.roles.includes('admin')) throw notFound('Lesson');
    if (!(await canAccessLesson(ctx.db, a.userId, a.roles, c, l))) throw forbidden('Enroll in this course to open this lesson.');
    const [quiz] = await ctx.db.select().from(s.quizzes).where(eq(s.quizzes.lessonId, id));
    const [done] = await ctx.db.select().from(s.lessonProgress).where(and(eq(s.lessonProgress.userId, a.userId), eq(s.lessonProgress.lessonId, id)));
    const notes = await ctx.db.select().from(s.lessonNotes).where(and(eq(s.lessonNotes.userId, a.userId), eq(s.lessonNotes.lessonId, id))).orderBy(desc(s.lessonNotes.createdAt));
    const attempts = quiz ? await ctx.db.select({ scorePercent: s.quizAttempts.scorePercent, passed: s.quizAttempts.passed, createdAt: s.quizAttempts.createdAt }).from(s.quizAttempts).where(and(eq(s.quizAttempts.userId, a.userId), eq(s.quizAttempts.quizId, quiz.id))).orderBy(desc(s.quizAttempts.createdAt)) : [];
    const siblings = await ctx.db.select({ id: s.lessons.id, position: s.lessons.position, title: s.lessons.title }).from(s.lessons).where(eq(s.lessons.courseId, c.id)).orderBy(asc(s.lessons.position));
    const idx = siblings.findIndex((x) => x.id === id);
    return {
      lesson: { ...l, mediaUrl: l.mediaUrl ? `/api/v1/lessons/${id}/media` : null }, course: { id: c.id, slug: c.slug, title: c.title, passPercent: c.passPercent },
      quiz: quiz ? { id: quiz.id, questions: (quiz.questions as { question: string; options: string[] }[]).map((q) => ({ question: q.question, options: q.options })) } : null,
      completed: Boolean(done), notes, attempts, prev: siblings[idx - 1] ?? null, next: siblings[idx + 1] ?? null,
    };
  });

  app.get('/api/v1/lessons/:id/media', async (req, reply) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [l] = await ctx.db.select().from(s.lessons).where(eq(s.lessons.id, id));
    if (!l?.mediaUrl) throw notFound('Media');
    const [c] = await ctx.db.select().from(s.courses).where(eq(s.courses.id, l.courseId));
    if (!(await canAccessLesson(ctx.db, a.userId, a.roles, c, l))) throw forbidden('Enroll to access this media.');
    const [u] = await ctx.db.select().from(s.uploads).where(eq(s.uploads.path, l.mediaUrl));
    reply.header('content-type', u?.mime ?? 'application/octet-stream').header('cache-control', 'private, max-age=600');
    return reply.send(await storage.read(l.mediaUrl));
  });

  app.post('/api/v1/lessons/:id/complete', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [l] = await ctx.db.select().from(s.lessons).where(eq(s.lessons.id, id));
    if (!l) throw notFound('Lesson');
    const [c] = await ctx.db.select().from(s.courses).where(eq(s.courses.id, l.courseId));
    if (!(await enrollment(ctx.db, a.userId, c.id))) throw forbidden('Enroll in this course to track progress.');
    const res = await ctx.db.insert(s.lessonProgress).values({ userId: a.userId, lessonId: id }).onConflictDoNothing().returning();
    let xp = 0;
    if (res.length) {
      xp = await awardXp(ctx, ctx.db, a.userId, 'lesson_completed', { sourceId: id });
      await evaluateAchievements(ctx, ctx.db, a.userId, ['lessons']);
      await track(ctx.db, a.userId, 'lesson_completed', { courseLevel: c.level });
    }
    const certificate = await checkCourseCompletion(ctx, ctx.db, a.userId, c.id);
    return { completed: true, xpAwarded: xp, certificate };
  });

  app.post('/api/v1/quizzes/:id/attempt', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { answers } = parse(z.object({ answers: z.array(z.number().int().min(0).max(9)) }), req.body);
    const [quiz] = await ctx.db.select().from(s.quizzes).where(eq(s.quizzes.id, id));
    if (!quiz) throw notFound('Quiz');
    const [l] = await ctx.db.select().from(s.lessons).where(eq(s.lessons.id, quiz.lessonId));
    const [c] = await ctx.db.select().from(s.courses).where(eq(s.courses.id, l.courseId));
    if (!(await enrollment(ctx.db, a.userId, c.id))) throw forbidden('Enroll in this course to take the quiz.');
    const qs = quiz.questions as { question: string; options: string[]; answer: number }[];
    if (answers.length !== qs.length) throw badRequest('Answer every question.');
    const correct = qs.filter((q, i) => q.answer === answers[i]).length;
    const scorePercent = Math.round((correct / qs.length) * 100);
    const passed = scorePercent >= c.passPercent;
    await ctx.db.insert(s.quizAttempts).values({ userId: a.userId, quizId: id, answers, scorePercent, passed });
    let xp = 0;
    if (passed) {
      xp = await awardXp(ctx, ctx.db, a.userId, 'quiz_passed', { sourceId: id });
      await evaluateAchievements(ctx, ctx.db, a.userId, ['perfect_quizzes']);
      await track(ctx.db, a.userId, 'quiz_passed', { scorePercent });
    }
    const certificate = passed ? await checkCourseCompletion(ctx, ctx.db, a.userId, c.id) : null;
    return { scorePercent, passed, passPercent: c.passPercent, correct, total: qs.length, xpAwarded: xp, certificate, review: qs.map((q, i) => ({ question: q.question, yourAnswer: answers[i], correct: q.answer === answers[i], correctAnswer: passed ? q.answer : undefined })) };
  });

  app.post('/api/v1/lessons/:id/bookmark', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { on } = parse(z.object({ on: z.boolean() }), req.body);
    if (on) await ctx.db.insert(s.lessonBookmarks).values({ userId: a.userId, lessonId: id }).onConflictDoNothing();
    else await ctx.db.delete(s.lessonBookmarks).where(and(eq(s.lessonBookmarks.userId, a.userId), eq(s.lessonBookmarks.lessonId, id)));
    return { ok: true };
  });

  app.post('/api/v1/lessons/:id/notes', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
    const [l] = await ctx.db.select().from(s.lessons).where(eq(s.lessons.id, id));
    if (!l) throw notFound('Lesson');
    const [n] = await ctx.db.insert(s.lessonNotes).values({ userId: a.userId, lessonId: id, body }).returning();
    return { note: n };
  });

  app.get('/api/v1/learning/me', async (req) => {
    const a = requireAuth(req);
    const enr = await ctx.db.select({ e: s.enrollments, c: s.courses }).from(s.enrollments).innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId)).where(eq(s.enrollments.userId, a.userId)).orderBy(desc(s.enrollments.createdAt));
    const certs = await ctx.db.select({ cert: s.certificates, title: s.courses.title }).from(s.certificates).innerJoin(s.courses, eq(s.courses.id, s.certificates.courseId)).where(eq(s.certificates.userId, a.userId));
    const bookmarks = await ctx.db.select({ id: s.lessons.id, title: s.lessons.title, courseId: s.lessons.courseId }).from(s.lessonBookmarks).innerJoin(s.lessons, eq(s.lessons.id, s.lessonBookmarks.lessonId)).where(eq(s.lessonBookmarks.userId, a.userId));
    const out = [];
    for (const r of enr) {
      const [{ total }] = await ctx.db.select({ total: sql<number>`count(*)::int` }).from(s.lessons).where(eq(s.lessons.courseId, r.c.id));
      const [{ done }] = await ctx.db.select({ done: sql<number>`count(*)::int` }).from(s.lessonProgress).innerJoin(s.lessons, eq(s.lessons.id, s.lessonProgress.lessonId)).where(and(eq(s.lessonProgress.userId, a.userId), eq(s.lessons.courseId, r.c.id)));
      out.push({ course: { id: r.c.id, slug: r.c.slug, title: r.c.title, level: r.c.level }, status: r.e.status, progress: total ? done / total : 0, done, total });
    }
    return { enrollments: out, certificates: certs.map((c) => ({ ...c.cert, courseTitle: c.title })), bookmarks };
  });

  app.get('/api/v1/certificates/:serial', async (req) => {
    const { serial } = parse(z.object({ serial: z.string().max(40) }), req.params);
    const [c] = await ctx.db.select({ cert: s.certificates, title: s.courses.title }).from(s.certificates).innerJoin(s.courses, eq(s.courses.id, s.certificates.courseId)).where(eq(s.certificates.serial, serial));
    if (!c) throw notFound('Certificate');
    return { certificate: { serial: c.cert.serial, recipientName: c.cert.recipientName, courseTitle: c.title, issuedAt: c.cert.issuedAt, requirements: c.cert.requirements, verified: true } };
  });

  app.post('/api/v1/courses/:id/review', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ rating: z.number().int().min(1).max(5), body: z.string().max(1500).default('') }), req.body);
    const e = await enrollment(ctx.db, a.userId, id);
    if (!e) throw forbidden('Only enrolled learners can review a course.');
    const res = await ctx.db.insert(s.reviews).values({ subjectType: 'course', subjectId: id, sourceId: e.id, authorId: a.userId, ...body }).onConflictDoNothing().returning();
    if (!res.length) throw conflict('You have already reviewed this course.');
    return { review: res[0] };
  });

  /* ---------- Creator tools ---------- */
  const requireCreator = (req: Parameters<typeof requireAuth>[0]) => {
    const a = requireAuth(req);
    if (!a.roles.some((r) => ['creator', 'expert', 'admin'].includes(r))) throw forbidden('Creator tools are available to approved creators and experts.');
    return a;
  };
  const ownCourse = async (userId: string, courseId: string, isAdmin: boolean) => {
    const [c] = await ctx.db.select().from(s.courses).where(eq(s.courses.id, courseId));
    if (!c || (c.creatorId !== userId && !isAdmin)) throw notFound('Course');
    return c;
  };

  app.get('/api/v1/creator/courses', async (req) => {
    const a = requireCreator(req);
    const rows = await ctx.db.select().from(s.courses).where(eq(s.courses.creatorId, a.userId)).orderBy(desc(s.courses.createdAt));
    const stats = rows.length ? await ctx.db.select({ c: s.enrollments.courseId, n: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${s.enrollments.status} = 'completed')::int` }).from(s.enrollments).where(inArray(s.enrollments.courseId, rows.map((r) => r.id))).groupBy(s.enrollments.courseId) : [];
    const revenue = await ctx.db.execute(sql`select p.digital_asset->>'courseId' as course_id, coalesce(sum(oi.unit_price_paise * (oi.quantity - oi.refunded_quantity)),0)::int as gross
      from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
      where p.category = 'digital_course' and o.status in ('paid','completed','partially_refunded') and p.seller_id = ${a.userId} group by 1`);
    const rev = (revenue as unknown as { rows: { course_id: string; gross: number }[] }).rows;
    const payoutRows = await ctx.db.select().from(s.payouts).where(and(eq(s.payouts.payeeId, a.userId), eq(s.payouts.payeeType, 'creator')));
    return { courses: rows.map((c) => { const g = rev.find((r) => r.course_id === c.id)?.gross ?? 0; return { ...c, enrollments: stats.find((x) => x.c === c.id)?.n ?? 0, completions: stats.find((x) => x.c === c.id)?.completed ?? 0, grossPaise: g, creatorSharePaise: Math.round((g * c.revenueSharePercent) / 100) }; }), payouts: payoutRows };
  });

  app.post('/api/v1/creator/courses', async (req) => {
    const a = requireCreator(req);
    const body = parse(z.object({ title: z.string().trim().min(5).max(120), subtitle: z.string().max(200).default(''), description: z.string().max(5000).default(''), level: z.enum(['beginner', 'intermediate', 'advanced']), topics: z.array(z.string().max(24)).max(6).default([]), pricePaise: z.number().int().min(0).max(10_000_000).default(0), passPercent: z.number().int().min(50).max(100).default(70) }), req.body);
    const slug = `${body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
    const [c] = await ctx.db.insert(s.courses).values({ ...body, slug, creatorId: a.userId }).returning();
    return { course: c };
  });

  app.patch('/api/v1/creator/courses/:id', async (req) => {
    const a = requireCreator(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const c = await ownCourse(a.userId, id, a.roles.includes('admin'));
    const body = parse(z.object({ title: z.string().min(5).max(120).optional(), subtitle: z.string().max(200).optional(), description: z.string().max(5000).optional(), topics: z.array(z.string()).max(6).optional(), pricePaise: z.number().int().min(0).optional(), passPercent: z.number().int().min(50).max(100).optional(), certificateEnabled: z.boolean().optional() }), req.body);
    if (c.status === 'published' && body.pricePaise !== undefined && body.pricePaise !== c.pricePaise) throw badRequest('Unpublish the course before changing its price.');
    const [row] = await ctx.db.update(s.courses).set(body).where(eq(s.courses.id, id)).returning();
    return { course: row };
  });

  app.post('/api/v1/creator/courses/:id/chapters', async (req) => {
    const a = requireCreator(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ownCourse(a.userId, id, a.roles.includes('admin'));
    const { title } = parse(z.object({ title: z.string().trim().min(1).max(120) }), req.body);
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.courseChapters).where(eq(s.courseChapters.courseId, id));
    const [ch] = await ctx.db.insert(s.courseChapters).values({ courseId: id, title, position: n }).returning();
    return { chapter: ch };
  });

  app.post('/api/v1/creator/courses/:id/lessons', async (req) => {
    const a = requireCreator(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ownCourse(a.userId, id, a.roles.includes('admin'));
    const body = parse(z.object({ chapterId: z.uuid(), title: z.string().trim().min(1).max(120), kind: z.enum(['text', 'video', 'audio']), body: z.string().max(50000).default(''), durationMinutes: z.number().int().min(1).max(300).default(5), isPreview: z.boolean().default(false), quiz: z.array(z.object({ question: z.string().min(3).max(300), options: z.array(z.string().min(1).max(200)).min(2).max(6), answer: z.number().int().min(0) })).max(20).optional() }), req.body);
    const [ch] = await ctx.db.select().from(s.courseChapters).where(and(eq(s.courseChapters.id, body.chapterId), eq(s.courseChapters.courseId, id)));
    if (!ch) throw badRequest('Chapter not found in this course.');
    if (body.quiz?.some((q) => q.answer >= q.options.length)) throw badRequest('Each quiz answer must refer to one of its options.');
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.lessons).where(eq(s.lessons.courseId, id));
    const lesson = await ctx.db.transaction(async (tx) => {
      const [l] = await tx.insert(s.lessons).values({ courseId: id, chapterId: body.chapterId, title: body.title, kind: body.kind, body: body.body, durationMinutes: body.durationMinutes, isPreview: body.isPreview, position: n }).returning();
      if (body.quiz?.length) await tx.insert(s.quizzes).values({ lessonId: l.id, questions: body.quiz });
      return l;
    });
    return { lesson };
  });

  app.post('/api/v1/creator/lessons/:id/media', async (req) => {
    const a = requireCreator(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [l] = await ctx.db.select().from(s.lessons).where(eq(s.lessons.id, id));
    if (!l) throw notFound('Lesson');
    await ownCourse(a.userId, l.courseId, a.roles.includes('admin'));
    const file = await req.file({ limits: { fileSize: 200 * 1048576 } });
    if (!file) throw badRequest('No file');
    const saved = await storage.save(await file.toBuffer(), { allowed: MEDIA_TYPES, isPrivate: true, maxBytes: 200 * 1048576 });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'lesson_media', path: saved.path, mime: saved.mime, bytes: saved.bytes, isPrivate: true });
    await ctx.db.update(s.lessons).set({ mediaUrl: saved.path, kind: saved.mime.startsWith('video') ? 'video' : 'audio' }).where(eq(s.lessons.id, id));
    return { ok: true };
  });

  app.delete('/api/v1/creator/lessons/:id', async (req) => {
    const a = requireCreator(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [l] = await ctx.db.select().from(s.lessons).where(eq(s.lessons.id, id));
    if (!l) throw notFound('Lesson');
    const c = await ownCourse(a.userId, l.courseId, a.roles.includes('admin'));
    if (c.status === 'published') throw badRequest('Unpublish the course before removing lessons, so enrolled learners keep their progress.');
    await ctx.db.delete(s.lessons).where(eq(s.lessons.id, id));
    return { ok: true };
  });

  app.post('/api/v1/creator/courses/:id/submit', async (req) => {
    const a = requireCreator(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const c = await ownCourse(a.userId, id, false);
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.lessons).where(eq(s.lessons.courseId, id));
    if (!n) throw badRequest('Add at least one lesson before submitting for review.');
    if (!['draft', 'rejected'].includes(c.status)) throw conflict(`This course is ${c.status}.`);
    await ctx.db.update(s.courses).set({ status: 'in_review' }).where(eq(s.courses.id, id));
    return { status: 'in_review' };
  });

  app.post('/api/v1/creator/courses/:id/unpublish', async (req) => {
    const a = requireCreator(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    await ownCourse(a.userId, id, a.roles.includes('admin'));
    await ctx.db.update(s.courses).set({ status: 'draft' }).where(eq(s.courses.id, id));
    return { ok: true };
  });
}
