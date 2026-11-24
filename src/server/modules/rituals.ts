import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { badRequest, conflict, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { awardXp } from '../lib/rewards';
import { displayNames } from '../services/identity';
import { circleMembership, checkCircleActivation } from '../services/circles';
import { blockedPhrases, screenText } from '../services/moderation';
import { evaluateReferral } from '../services/referrals';
import { recordFirstAction } from '../services/activation';
import { RITUALS, RITUAL_BY_KEY, periodFor, promptFor, type RitualDef, type RitualKey } from '../../shared/rituals';
import type { PairPrompt, Prompt } from '../../shared/play/content';

/**
 * Social rituals. Personal rituals use the member's own time zone; circle rituals
 * use one shared zone (CIRCLE_TIMEZONE) so the whole circle sees the same question
 * on the same day. Rituals never send push or email nudges — they wait in the app,
 * and missing a day costs nothing.
 */
export const CIRCLE_TIMEZONE = 'Asia/Kolkata';

const isPair = (p: Prompt | PairPrompt): p is PairPrompt => 'a' in p;

function promptView(p: Prompt | PairPrompt) {
  return isPair(p) ? { id: p.id, text: 'Would you rather…', options: [{ id: 'a', label: p.a }, { id: 'b', label: p.b }] } : { id: p.id, text: p.text, options: null };
}

async function userTimezone(ctx: Ctx, userId: string) {
  const [loc] = await ctx.db.select({ tz: s.userLocations.timezone }).from(s.userLocations).where(eq(s.userLocations.userId, userId));
  return loc?.tz ?? 'Asia/Kolkata';
}

async function choiceSplit(ctx: Ctx, def: RitualDef, periodKey: string) {
  const rows = await ctx.db.select({ payload: s.ritualResponses.payload }).from(s.ritualResponses).where(and(eq(s.ritualResponses.ritualKey, def.key), eq(s.ritualResponses.periodKey, periodKey), eq(s.ritualResponses.circleKey, '')));
  const a = rows.filter((r) => (r.payload as { optionId?: string }).optionId === 'a').length;
  return { a, b: rows.length - a, total: rows.length };
}

export async function ritualRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/social-rituals', async (req) => {
    const a = requireAuth(req);
    const tz = await userTimezone(ctx, a.userId);
    const now = new Date();
    const personal = [];
    for (const def of RITUALS.filter((r) => r.audience === 'personal')) {
      const period = periodFor(def, now, tz);
      const prompt = promptFor(def.key, period.index, '');
      const [mine] = await ctx.db.select().from(s.ritualResponses).where(and(eq(s.ritualResponses.userId, a.userId), eq(s.ritualResponses.ritualKey, def.key), eq(s.ritualResponses.periodKey, period.key), eq(s.ritualResponses.circleKey, '')));
      personal.push({
        ...def, period, prompt: promptView(prompt),
        myResponse: mine ? mine.payload : null,
        results: mine && def.response === 'choice' ? await choiceSplit(ctx, def, period.key) : null,
      });
    }
    const circles = await ctx.db.select({ id: s.groups.id, name: s.groups.name, theme: s.groups.theme }).from(s.groupMembers).innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId))
      .where(and(eq(s.groupMembers.userId, a.userId), eq(s.groupMembers.status, 'active'), eq(s.groups.kind, 'circle'), isNull(s.groups.archivedAt)));
    const def = RITUAL_BY_KEY.circle_question;
    const period = periodFor(def, now, CIRCLE_TIMEZONE);
    const circle = [];
    for (const c of circles) {
      const prompt = promptFor('circle_question', period.index, c.id);
      const answers = await ctx.db.select().from(s.ritualResponses).where(and(eq(s.ritualResponses.ritualKey, 'circle_question'), eq(s.ritualResponses.periodKey, period.key), eq(s.ritualResponses.circleKey, c.id))).orderBy(s.ritualResponses.createdAt);
      const answered = answers.some((x) => x.userId === a.userId);
      const names = answered ? await displayNames(ctx.db, answers.map((x) => x.userId)) : new Map();
      circle.push({
        ...def, circle: c, period, prompt: promptView(prompt), answeredCount: answers.length,
        myResponse: answers.find((x) => x.userId === a.userId)?.payload ?? null,
        // Answers unlock only after you have answered yourself.
        answers: answered ? answers.map((x) => ({ name: names.get(x.userId)?.displayName ?? 'Member', text: String((x.payload as { text?: string }).text ?? ''), mine: x.userId === a.userId })) : null,
      });
    }
    return { timezone: tz, personal, circle, note: 'Rituals never expire your progress. Skip any day you like.' };
  });

  app.post('/api/v1/social-rituals/:key/respond', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { key } = parse(z.object({ key: z.enum(RITUALS.map((r) => r.key) as [RitualKey, ...RitualKey[]]) }), req.params);
    const body = parse(z.object({ circleId: z.uuid().optional(), optionId: z.enum(['a', 'b']).optional(), text: z.string().trim().max(500).optional(), done: z.boolean().optional() }), req.body);
    const def = RITUAL_BY_KEY[key];
    let scope = '';
    if (def.audience === 'circle') {
      if (!body.circleId || !(await circleMembership(ctx.db, body.circleId, a.userId))) throw notFound('Circle');
      scope = body.circleId;
    }
    const tz = def.audience === 'circle' ? CIRCLE_TIMEZONE : await userTimezone(ctx, a.userId);
    const period = periodFor(def, new Date(), tz);
    const prompt = promptFor(key, period.index, scope);
    let payload: Record<string, unknown>;
    if (def.response === 'choice') {
      if (!body.optionId) throw badRequest('Pick one of the two options.');
      payload = { optionId: body.optionId };
    } else if (def.response === 'text') {
      if (!body.text) throw badRequest('Write an answer first.');
      if (body.text.length > (def.maxLength ?? 280)) throw badRequest(`Keep it under ${def.maxLength} characters.`);
      const screened = screenText(body.text, await blockedPhrases(ctx.db), { protectIdentity: def.audience === 'circle' });
      if (!screened.ok) throw badRequest(screened.reason!);
      payload = { text: body.text };
    } else {
      if (!body.done) throw badRequest('Mark it done when you have tried it.');
      payload = { done: true, note: body.text?.slice(0, def.maxLength ?? 200) ?? '' };
    }
    const res = await ctx.db.transaction(async (tx) => {
      const rows = await tx.insert(s.ritualResponses).values({ userId: a.userId, ritualKey: key, periodKey: period.key, circleKey: scope, promptId: prompt.id, payload }).onConflictDoNothing().returning();
      if (!rows.length) return null;
      const points = await awardXp(ctx, tx, a.userId, 'ritual_response', { sourceId: `${key}:${period.key}:${scope}` });
      await track(tx, a.userId, 'ritual_responded', { ritual: key, circle: Boolean(scope) });
      await recordFirstAction(tx, a.userId, 'ritual');
      return { points };
    });
    if (!res) throw conflict('You have already answered this one. A new one arrives next period.');
    if (scope) await checkCircleActivation(ctx, ctx.db, scope);
    await evaluateReferral(ctx, ctx.db, a.userId);
    return { ok: true, pointsAwarded: res.points, results: def.response === 'choice' ? await choiceSplit(ctx, def, period.key) : null };
  });

  /** Personal ritual history (private to you). */
  app.get('/api/v1/social-rituals/history', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.ritualResponses).where(and(eq(s.ritualResponses.userId, a.userId), inArray(s.ritualResponses.ritualKey, ['daily_thought', 'weekly_reflection', 'micro_challenge']))).orderBy(sql`${s.ritualResponses.createdAt} desc`).limit(60);
    return { history: rows.map((r) => ({ ritual: r.ritualKey, period: r.periodKey, promptId: r.promptId, payload: r.payload, createdAt: r.createdAt })) };
  });
}
