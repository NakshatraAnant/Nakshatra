import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, conflict, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { randomToken } from '../lib/crypto';
import { awardXp, evaluateAchievements } from '../lib/rewards';
import {
  AssessmentError, DIMENSIONS, DIMENSION_INFO, IDENTITY_LABELS, PERSONA_BY_KEY, PERSONALITY_VERSION, QUESTIONS,
  assessQuality, explainScores, scorePersonality, type Answers, type Vector,
} from '../../shared/personality';
import { deriveArchetype } from '../../astro';
import { ACHIEVEMENTS } from '../../shared/gamification';
import { ARCHETYPES } from '../../content/archetypes';
import { currentChart, relationOf } from '../services/identity';
import { collectibleStates } from '../services/progress';
import { blockedPhrases, screenText } from '../services/moderation';
import { evaluateReferral } from '../services/referrals';

/** Identity attributes and their default visibility (stored in profiles.fieldVisibility). */
export const IDENTITY_FIELDS = { persona: 'public', labels: 'public', cosmic: 'connections' } as const;
type Vis = 'public' | 'connections' | 'private';

export function personaView(r: { archetypeKey: string; secondaryKey: string | null; scores: unknown; confidence: string; version: string; createdAt: Date; answers?: unknown }) {
  const a = PERSONA_BY_KEY[r.archetypeKey];
  const scores = r.scores as Vector;
  const quality = r.answers ? assessQuality(r.answers as Answers, scores) : null;
  // v2 results are recomputed from the stored answers for the blend/strength detail (deterministic, same version).
  // Older results keep the archetype they were given; they are labelled with the model that produced them.
  const current = r.version === PERSONALITY_VERSION;
  const detail = current && r.answers ? (() => { try { return scorePersonality(r.answers as Answers); } catch { return null; } })() : null;
  const blend = detail?.blend ? { secondaryKey: detail.blend.secondary, secondaryName: PERSONA_BY_KEY[detail.blend.secondary]?.name, primaryWeight: detail.blend.primaryWeight } : null;
  // Results saved before quality-v1 are re-labelled honestly on read.
  const confidence = quality?.level === 'insufficient' ? 'inconclusive' : quality?.level === 'low' && r.confidence !== 'low' ? 'low' : r.confidence;
  return {
    key: a.key, name: a.name, signature: a.signature, traits: a.traits, inCircles: a.inCircles, growth: a.growth,
    secondary: r.secondaryKey ? { key: r.secondaryKey, name: PERSONA_BY_KEY[r.secondaryKey]?.name } : null,
    confidence, quality, version: r.version, takenAt: r.createdAt,
    blend, strength: detail?.strength ?? null,
    model: { version: r.version, current, note: current ? null : 'Scored with an earlier version of the archetype model. Your result is kept as it was; retake to be scored with the current model.' },
    dimensions: DIMENSIONS.map((d) => ({ key: d, ...DIMENSION_INFO[d], score: scores[d] })),
    explanation: explainScores(scores).slice(0, 2).map((e) => e.text),
  };
}

const AnswersBody = z.object({ answers: z.record(z.string().max(5), z.number().int().min(1).max(5)) });

function score(answers: Answers) {
  try {
    return scorePersonality(answers);
  } catch (e) {
    if (e instanceof AssessmentError) throw badRequest(e.message);
    throw e;
  }
}

/** Friends' guesses about you from completed Archetype Showdown rounds (community-derived identity). */
async function communityGuesses(ctx: Ctx, userId: string) {
  const sessions = await ctx.db.select({ id: s.gameSessions.id, state: s.gameSessions.state }).from(s.gameSessions)
    .innerJoin(s.gameParticipants, and(eq(s.gameParticipants.sessionId, s.gameSessions.id), eq(s.gameParticipants.userId, userId)))
    .where(and(eq(s.gameSessions.gameKey, 'archetype_showdown'), eq(s.gameSessions.status, 'completed'))).limit(50);
  const tally = new Map<string, number>();
  for (const sess of sessions) {
    const rounds = ((sess.state as { rounds?: { aboutId?: string }[] }).rounds ?? []);
    const idx = rounds.map((r, i) => (r.aboutId === userId ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const subs = await ctx.db.select({ payload: s.gameSubmissions.payload }).from(s.gameSubmissions).where(and(eq(s.gameSubmissions.sessionId, sess.id), inArray(s.gameSubmissions.roundIndex, idx)));
    for (const sub of subs) { const k = String((sub.payload as { optionId?: string }).optionId); tally.set(k, (tally.get(k) ?? 0) + 1); }
  }
  return [...tally.entries()].filter(([k]) => PERSONA_BY_KEY[k]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ key: k, name: PERSONA_BY_KEY[k].name, guesses: n }));
}

export async function studioRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/personality/questions', async () => ({
    version: PERSONALITY_VERSION,
    questions: QUESTIONS.map((q) => ({ id: q.id, text: q.text })),
    scale: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
    dimensions: DIMENSIONS.map((d) => ({ key: d, ...DIMENSION_INFO[d] })),
    note: 'This describes tendencies, not fixed traits. It is not a psychological test or a diagnosis.',
  }));

  /** Account-free preview: scored in memory, nothing stored. */
  app.post('/api/v1/personality/preview', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { answers } = parse(AnswersBody, req.body);
    const r = score(answers);
    await track(ctx.db, null, 'personality_preview_completed', { confidence: r.confidence });
    return { result: personaView({ archetypeKey: r.archetype, secondaryKey: r.secondary, scores: r.scores, confidence: r.confidence, version: r.version, createdAt: new Date(), answers }), unknown: r.unknown };
  });

  app.post('/api/v1/personality/assessment', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { answers } = parse(AnswersBody, req.body);
    const r = score(answers);
    const row = await ctx.db.transaction(async (tx) => {
      const [saved] = await tx.insert(s.assessmentResults).values({ userId: a.userId, version: r.version, answers, scores: r.scores, archetypeKey: r.archetype, secondaryKey: r.secondary, confidence: r.confidence }).returning();
      // Identity discovery completes onboarding; birth details stay optional.
      await tx.update(s.profiles).set({ onboardingCompletedAt: sql`coalesce(${s.profiles.onboardingCompletedAt}, now())` }).where(eq(s.profiles.userId, a.userId));
      await awardXp(ctx, tx, a.userId, 'assessment_completed');
      await evaluateAchievements(ctx, tx, a.userId, ['assessment']);
      await track(tx, a.userId, 'assessment_completed', { archetype: r.archetype, confidence: r.confidence });
      return saved;
    });
    await evaluateReferral(ctx, ctx.db, a.userId);
    return { result: personaView(row) };
  });

  app.get('/api/v1/identity/me', async (req) => {
    const a = requireAuth(req);
    const [latest] = await ctx.db.select().from(s.assessmentResults).where(eq(s.assessmentResults.userId, a.userId)).orderBy(desc(s.assessmentResults.createdAt)).limit(1);
    const history = await ctx.db.select({ id: s.assessmentResults.id, archetypeKey: s.assessmentResults.archetypeKey, version: s.assessmentResults.version, createdAt: s.assessmentResults.createdAt }).from(s.assessmentResults).where(eq(s.assessmentResults.userId, a.userId)).orderBy(desc(s.assessmentResults.createdAt)).limit(10);
    const [p] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const vedic = await currentChart(ctx.db, a.userId, 'vedic_default');
    const cosmic = vedic ? (() => { const c = deriveArchetype(vedic.result); const d = ARCHETYPES[c.key]; return { key: c.key, name: d.name, essence: d.essence, element: c.element, modality: c.modality }; })() : null;
    const fv = (p.fieldVisibility ?? {}) as Record<string, Vis>;
    const styles = (await collectibleStates(ctx.db, a.userId)).filter((c) => c.kind === 'card');
    return {
      persona: latest ? personaView(latest) : null,
      history: history.map((h) => ({ ...h, name: PERSONA_BY_KEY[h.archetypeKey]?.name })),
      labels: p.identityLabels, labelCatalogue: IDENTITY_LABELS,
      pseudonym: p.pseudonym, handle: p.handle, displayName: p.displayName,
      cardStyle: p.cardStyle, cardStyles: styles.map((c) => ({ key: c.key.replace(/^card_/, ''), title: c.title, unlocked: c.unlocked, source: c.source, unlock: c.unlock })),
      cosmic,
      community: await communityGuesses(ctx, a.userId),
      visibility: Object.fromEntries(Object.entries(IDENTITY_FIELDS).map(([k, d]) => [k, fv[k] ?? d])),
      profileVisibility: p.visibility,
    };
  });

  app.patch('/api/v1/identity/me', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({
      labels: z.array(z.enum(IDENTITY_LABELS)).max(5).optional(),
      pseudonym: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_. -]{2,23}$/, 'Pen names are 3–24 letters, numbers, spaces, dots, dashes or underscores.').nullable().optional(),
      cardStyle: z.string().max(40).optional(),
      visibility: z.object({ persona: z.enum(['public', 'connections', 'private']), labels: z.enum(['public', 'connections', 'private']), cosmic: z.enum(['public', 'connections', 'private']) }).partial().optional(),
    }), req.body);
    const [p] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const set: Partial<typeof s.profiles.$inferInsert> = { updatedAt: new Date() };
    if (body.labels) set.identityLabels = [...new Set(body.labels)];
    if (body.pseudonym !== undefined) {
      if (body.pseudonym) {
        if (body.pseudonym.toLowerCase() === p.handle.toLowerCase() || body.pseudonym.toLowerCase() === p.displayName.toLowerCase()) throw badRequest('Your pen name should be different from your name and handle.');
        const screened = screenText(body.pseudonym, await blockedPhrases(ctx.db), { protectIdentity: true });
        if (!screened.ok) throw badRequest(screened.reason!);
        const [taken] = await ctx.db.select({ u: s.profiles.userId }).from(s.profiles).where(sql`lower(${s.profiles.pseudonym}) = ${body.pseudonym.toLowerCase()}`);
        if (taken && taken.u !== a.userId) throw conflict('That pen name is taken.');
      }
      set.pseudonym = body.pseudonym || null;
    }
    if (body.cardStyle) {
      const style = (await collectibleStates(ctx.db, a.userId)).find((c) => c.kind === 'card' && c.key === `card_${body.cardStyle}`);
      if (!style) throw badRequest('Unknown card style.');
      if (!style.unlocked) throw badRequest(style.unlock.type === 'purchase' ? 'This style is part of a paid pack.' : 'Keep participating to unlock this style.');
      set.cardStyle = body.cardStyle;
    }
    if (body.visibility) set.fieldVisibility = { ...(p.fieldVisibility as Record<string, unknown>), ...body.visibility };
    await ctx.db.update(s.profiles).set(set).where(eq(s.profiles.userId, a.userId));
    await audit(ctx.db, { actorId: a.userId, action: 'identity.update', targetType: 'profile', targetId: a.userId, meta: { fields: Object.keys(body).join(',') } });
    return { ok: true };
  });

  /**
   * Shareable identity for a handle. Respects profile visibility and per-attribute
   * visibility; never includes birth details, chart positions, pen name or email.
   */
  app.get('/api/v1/identity/u/:handle', async (req) => {
    const { handle } = parse(z.object({ handle: z.string().max(40) }), req.params);
    const viewerId = req.auth?.userId ?? null;
    const [p] = await ctx.db.select().from(s.profiles).innerJoin(s.users, eq(s.users.id, s.profiles.userId)).where(and(sql`lower(${s.profiles.handle}) = ${handle.toLowerCase()}`, eq(s.users.status, 'active')));
    if (!p) throw notFound('Profile');
    const prof = p.profiles;
    const viewer = await relationOf(ctx.db, viewerId, prof.userId);
    if (viewer !== 'self' && prof.visibility !== 'public' && viewer !== 'connection') throw notFound('Profile');
    const fv = (prof.fieldVisibility ?? {}) as Record<string, Vis>;
    const show = (k: keyof typeof IDENTITY_FIELDS) => { const v = fv[k] ?? IDENTITY_FIELDS[k]; return viewer === 'self' || v === 'public' || (v === 'connections' && viewer === 'connection'); };
    const [latest] = show('persona') ? await ctx.db.select().from(s.assessmentResults).where(eq(s.assessmentResults.userId, prof.userId)).orderBy(desc(s.assessmentResults.createdAt)).limit(1) : [];
    let cosmic = null;
    if (show('cosmic')) {
      const v = await currentChart(ctx.db, prof.userId, 'vedic_default');
      if (v) { const c = deriveArchetype(v.result); cosmic = { name: ARCHETYPES[c.key].name, essence: ARCHETYPES[c.key].essence }; }
    }
    return {
      handle: prof.handle, displayName: prof.displayName, cardStyle: prof.cardStyle,
      persona: latest ? (({ key, name, signature, traits, secondary, dimensions }) => ({ key, name, signature, traits, secondary, dimensions }))(personaView(latest)) : null,
      labels: show('labels') ? prof.identityLabels : [],
      cosmic,
    };
  });

  /**
   * Identity Evolution Timeline (private to you): every saved result with how each dimension moved since
   * the previous one, your recent vibe check-ins, and milestones (achievements, first circle). Nothing
   * here is visible to anyone else.
   */
  app.get('/api/v1/identity/timeline', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.assessmentResults).where(eq(s.assessmentResults.userId, a.userId)).orderBy(s.assessmentResults.createdAt).limit(50);
    const results = rows.map((r, i) => {
      const scores = r.scores as Vector;
      const prev = i ? (rows[i - 1].scores as Vector) : null;
      const view = personaView(r);
      return {
        id: r.id, takenAt: r.createdAt, key: r.archetypeKey, name: PERSONA_BY_KEY[r.archetypeKey]?.name, confidence: view.confidence,
        changedArchetype: Boolean(i && rows[i - 1].archetypeKey !== r.archetypeKey),
        dimensions: DIMENSIONS.map((d) => ({ key: d, name: DIMENSION_INFO[d].name, score: scores[d], delta: prev ? Math.round((scores[d] - prev[d]) * 100) / 100 : null })),
      };
    });
    const vibes = await ctx.db.select({ date: s.vibeCheckins.localDate, mood: s.vibeCheckins.mood }).from(s.vibeCheckins).where(eq(s.vibeCheckins.userId, a.userId)).orderBy(desc(s.vibeCheckins.localDate)).limit(90);
    const achievements = await ctx.db.select({ key: s.userAchievements.achievementKey, at: s.userAchievements.awardedAt }).from(s.userAchievements).where(eq(s.userAchievements.userId, a.userId));
    const [firstCircle] = await ctx.db.select({ at: s.groupMembers.createdAt, name: s.groups.name }).from(s.groupMembers).innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId))
      .where(and(eq(s.groupMembers.userId, a.userId), eq(s.groups.kind, 'circle'))).orderBy(s.groupMembers.createdAt).limit(1);
    const titles = new Map(ACHIEVEMENTS.map((x) => [x.key, x.title]));
    const milestones = [
      ...achievements.map((x) => ({ at: x.at, kind: 'achievement', title: titles.get(x.key) ?? x.key })),
      ...(firstCircle ? [{ at: firstCircle.at, kind: 'circle', title: `Joined your first circle: ${firstCircle.name}` }] : []),
    ].sort((x, y) => +new Date(y.at) - +new Date(x.at));
    return { results: results.reverse(), vibes, milestones, note: 'Only you can see your timeline. Archetypes describe tendencies at a moment in time — change is normal.' };
  });

  /* ---------- Public archetype shares (/s/:slug) ---------- */

  /**
   * Creates a public share link for an archetype card. Signed in: built from your latest saved result;
   * your display name is included only if you ask. Signed out: the server scores the submitted preview
   * answers itself (a client cannot claim an archetype it did not earn) and nothing identifies you.
   */
  app.post('/api/v1/share/identity', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const body = parse(z.object({ showName: z.boolean().default(false), cardStyle: z.string().max(40).optional(), answers: AnswersBody.shape.answers.optional() }), req.body ?? {});
    let row: { archetypeKey: string; secondaryKey: string | null; scores: Record<string, number>; userId: string | null; displayName: string | null; referralCode: string | null; cardStyle: string };
    if (req.auth && !req.auth.mfaPending) {
      const a = requireAuth(req);
      const [latest] = await ctx.db.select().from(s.assessmentResults).where(eq(s.assessmentResults.userId, a.userId)).orderBy(desc(s.assessmentResults.createdAt)).limit(1);
      if (!latest) throw badRequest('Take the assessment first, then share your archetype.');
      if (assessQuality(latest.answers as Answers, latest.scores as Vector).level === 'insufficient') throw badRequest('Your answers were too evenly balanced to show a clear archetype, so there is nothing reliable to share yet. Retake it with your first instinct.');
      const [p] = await ctx.db.select({ displayName: s.profiles.displayName, cardStyle: s.profiles.cardStyle }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
      const [u] = await ctx.db.select({ code: s.users.referralCode }).from(s.users).where(eq(s.users.id, a.userId));
      let style = p.cardStyle;
      if (body.cardStyle) {
        const st = (await collectibleStates(ctx.db, a.userId)).find((c) => c.kind === 'card' && c.key === `card_${body.cardStyle}`);
        if (!st?.unlocked) throw badRequest('That card style is not unlocked.');
        style = body.cardStyle;
      }
      row = { archetypeKey: latest.archetypeKey, secondaryKey: latest.secondaryKey, scores: latest.scores as Record<string, number>, userId: a.userId, displayName: body.showName ? p.displayName : null, referralCode: u.code, cardStyle: style };
    } else {
      if (!body.answers) throw badRequest('Answer the statements first.');
      const r = score(body.answers);
      if (r.confidence === 'inconclusive') throw badRequest('Your answers were too evenly balanced to show a clear archetype, so there is nothing reliable to share yet. Retake it with your first instinct.');
      row = { archetypeKey: r.archetype, secondaryKey: r.secondary, scores: r.scores, userId: null, displayName: null, referralCode: null, cardStyle: 'classic' };
    }
    const slug = randomToken(9);
    await ctx.db.insert(s.identityShares).values({ slug, ...row });
    await track(ctx.db, row.userId, 'identity_share_created', { signedIn: Boolean(row.userId), named: Boolean(row.displayName), archetype: row.archetypeKey });
    const url = `${ctx.config.APP_ORIGIN}/s/${slug}${row.referralCode ? `?ref=${encodeURIComponent(row.referralCode)}` : ''}`;
    return { share: { slug, url, displayName: row.displayName, archetype: PERSONA_BY_KEY[row.archetypeKey]?.name } };
  });

  app.get('/api/v1/share/mine', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.identityShares).where(and(eq(s.identityShares.userId, a.userId), isNull(s.identityShares.revokedAt))).orderBy(desc(s.identityShares.createdAt)).limit(20);
    return { shares: rows.map((r) => ({ slug: r.slug, url: `${ctx.config.APP_ORIGIN}/s/${r.slug}`, named: Boolean(r.displayName), views: r.views, signups: r.signups, createdAt: r.createdAt })) };
  });

  /** Public, unauthenticated view of a share: archetype only (+ display name if the owner chose it). */
  app.get('/api/v1/share/:slug', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { slug } = parse(z.object({ slug: z.string().min(8).max(32) }), req.params);
    const [sh] = await ctx.db.select().from(s.identityShares).where(and(eq(s.identityShares.slug, slug), isNull(s.identityShares.revokedAt)));
    if (!sh || !PERSONA_BY_KEY[sh.archetypeKey]) throw notFound('Share');
    await ctx.db.update(s.identityShares).set({ views: sql`${s.identityShares.views} + 1` }).where(eq(s.identityShares.id, sh.id));
    await track(ctx.db, null, 'identity_share_viewed', { archetype: sh.archetypeKey });
    const v = personaView({ archetypeKey: sh.archetypeKey, secondaryKey: sh.secondaryKey, scores: sh.scores, confidence: 'medium', version: PERSONALITY_VERSION, createdAt: sh.createdAt });
    return { share: { slug: sh.slug, displayName: sh.displayName, cardStyle: sh.cardStyle, referralCode: sh.referralCode, persona: { key: v.key, name: v.name, signature: v.signature, traits: v.traits, inCircles: v.inCircles, growth: v.growth, secondary: v.secondary, dimensions: v.dimensions, explanation: v.explanation } } };
  });

  app.delete('/api/v1/share/:slug', async (req) => {
    const a = requireAuth(req);
    const { slug } = parse(z.object({ slug: z.string().min(8).max(32) }), req.params);
    const res = await ctx.db.update(s.identityShares).set({ revokedAt: new Date() }).where(and(eq(s.identityShares.slug, slug), eq(s.identityShares.userId, a.userId))).returning();
    if (!res.length) throw notFound('Share');
    return { ok: true };
  });
}
