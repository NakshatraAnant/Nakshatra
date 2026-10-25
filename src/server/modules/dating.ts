import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, or, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { notify } from '../lib/notify';
import { coarsen, distanceKm, placeById } from '../lib/geo';
import { LocalStorage, IMAGE_TYPES, DOC_TYPES } from '../lib/storage';
import { rankDating, type DatingCandidate } from '../services/ranking';
import { ageOn, bigThreeFor, currentChart, displayNames, isBlockedEitherWay, primaryBirth } from '../services/identity';
import { compatibility } from '../../astro';
import { createConversation, postSystemMessage } from './messaging';

export const GENDERS = ['woman', 'man', 'non_binary', 'other'] as const;
export const INTENTS = ['casual', 'dating', 'long_term', 'marriage', 'unsure'] as const;

export const DATE_PROMPTS = [
  'Suggest a daytime coffee in a busy public place for your first meeting.',
  'Plan a walk in a park or a museum visit — easy to talk, easy to leave.',
  'Compare your favourite festival foods and pick a place to try one together.',
  'Share one song each that you have on repeat this month.',
];

export const SAFETY_TIPS = [
  'Keep conversations on Nakshatra until you feel comfortable — scammers often push to move platforms quickly.',
  'Never send money or financial details to someone you have not met. Report anyone who asks.',
  'Meet in a public place for the first few dates and tell a friend where you will be.',
  'You can unmatch, block or report at any time; the other person is not told who reported them.',
  'Astrology is one lens among many — it never replaces getting to know someone or your own judgement.',
];

const ProfileBody = z.object({
  intent: z.enum(INTENTS),
  gender: z.enum(GENDERS),
  interestedIn: z.array(z.enum(GENDERS)).min(1),
  bio: z.string().max(600).default(''),
  prompts: z.array(z.object({ question: z.string().max(100), answer: z.string().max(300) })).max(3).default([]),
  interests: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  placeId: z.string().optional(),
  ageMin: z.number().int().min(18).max(99),
  ageMax: z.number().int().min(18).max(99),
  maxDistanceKm: z.number().int().min(1).max(500),
  preferredIntents: z.array(z.enum(INTENTS)).default([]),
  useAstrology: z.boolean().default(true),
  showSunSign: z.boolean().default(true),
  showMoonSign: z.boolean().default(false),
  incognito: z.boolean().default(false),
  acknowledgeSafety: z.literal(true, { message: 'Please read and acknowledge the safety guidelines.' }),
});

async function requireDatingEligible(ctx: Ctx, userId: string, emailVerified: boolean) {
  if (!emailVerified) throw forbidden('Verify your email before using dating.');
  const bp = await primaryBirth(ctx.db, userId);
  if (!bp) throw forbidden('Complete your Cosmic ID (birth details) first — it is also how we confirm you are 18+.');
  if (ageOn(bp.birthDate) < 18) throw forbidden('Dating is available to adults (18+) only.');
  return bp;
}

function completeness(p: typeof s.datingProfiles.$inferSelect): number {
  let c = 0;
  if (p.bio.length >= 40) c += 0.3;
  if (p.photos.length) c += 0.3;
  if ((p.prompts as unknown[]).length) c += 0.2;
  if (p.interests.length >= 3) c += 0.2;
  return c;
}

export async function datingRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = new LocalStorage(ctx.config.UPLOAD_DIR);

  app.get('/api/v1/dating/profile', async (req) => {
    const a = requireAuth(req);
    const [p] = await ctx.db.select().from(s.datingProfiles).where(eq(s.datingProfiles.userId, a.userId));
    return { profile: p ?? null, safetyTips: SAFETY_TIPS };
  });

  app.put('/api/v1/dating/profile', async (req) => {
    const a = requireAuth(req);
    await requireDatingEligible(ctx, a.userId, a.emailVerified);
    const body = parse(ProfileBody, req.body);
    if (body.ageMin > body.ageMax) throw badRequest('Minimum age must be below maximum age.');
    const [existing] = await ctx.db.select().from(s.datingProfiles).where(eq(s.datingProfiles.userId, a.userId));
    const place = body.placeId ? placeById(body.placeId) : null;
    if (!place && !existing) throw badRequest('Choose your city.');
    const values = {
      userId: a.userId, active: true, intent: body.intent, gender: body.gender, interestedIn: body.interestedIn, bio: body.bio, prompts: body.prompts,
      interests: body.interests.map((i) => i.toLowerCase()), city: place?.label ?? existing!.city, approxLat: place ? coarsen(place.latitude) : existing!.approxLat, approxLon: place ? coarsen(place.longitude) : existing!.approxLon,
      ageMin: body.ageMin, ageMax: body.ageMax, maxDistanceKm: body.maxDistanceKm, preferredIntents: body.preferredIntents,
      useAstrology: body.useAstrology, showSunSign: body.showSunSign, showMoonSign: body.showMoonSign, incognito: body.incognito,
      safetyAcknowledgedAt: new Date(), updatedAt: new Date(),
    };
    if (existing?.suspendedAt) throw forbidden('Your dating profile is suspended pending review.');
    await ctx.db.insert(s.datingProfiles).values(values).onConflictDoUpdate({ target: s.datingProfiles.userId, set: { ...values, photos: existing?.photos ?? [] } });
    await ctx.db.insert(s.consentRecords).values({ userId: a.userId, purpose: 'dating_terms', granted: true, policyVersion: '2026-10-v1' });
    if (!existing) await track(ctx.db, a.userId, 'dating_profile_created', { intent: body.intent });
    return { ok: true };
  });

  app.post('/api/v1/dating/profile/pause', async (req) => {
    const a = requireAuth(req);
    const { active } = parse(z.object({ active: z.boolean() }), req.body);
    await ctx.db.update(s.datingProfiles).set({ active }).where(eq(s.datingProfiles.userId, a.userId));
    return { ok: true };
  });

  app.post('/api/v1/dating/photos', async (req) => {
    const a = requireAuth(req);
    const [p] = await ctx.db.select().from(s.datingProfiles).where(eq(s.datingProfiles.userId, a.userId));
    if (!p) throw badRequest('Create your dating profile first.');
    if (p.photos.length >= 6) throw badRequest('You can add up to six photos.');
    const file = await req.file();
    if (!file) throw badRequest('No file');
    const saved = await storage.save(await file.toBuffer(), { allowed: IMAGE_TYPES, isPrivate: false, maxBytes: ctx.config.MAX_UPLOAD_MB * 1048576 });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'dating_photo', path: saved.path, mime: saved.mime, bytes: saved.bytes });
    const url = `/uploads/${saved.path}`;
    await ctx.db.update(s.datingProfiles).set({ photos: [...p.photos, url] }).where(eq(s.datingProfiles.userId, a.userId));
    return { url };
  });

  app.delete('/api/v1/dating/photos', async (req) => {
    const a = requireAuth(req);
    const { url } = parse(z.object({ url: z.string() }), req.body);
    const [p] = await ctx.db.select().from(s.datingProfiles).where(eq(s.datingProfiles.userId, a.userId));
    if (!p) throw notFound('Profile');
    await ctx.db.update(s.datingProfiles).set({ photos: p.photos.filter((x) => x !== url) }).where(eq(s.datingProfiles.userId, a.userId));
    return { ok: true };
  });

  app.post('/api/v1/dating/verification', async (req) => {
    const a = requireAuth(req);
    const file = await req.file();
    if (!file) throw badRequest('Upload a selfie holding a handwritten note with your Nakshatra handle.');
    const saved = await storage.save(await file.toBuffer(), { allowed: DOC_TYPES, isPrivate: true, maxBytes: ctx.config.MAX_UPLOAD_MB * 1048576 });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'verification', path: saved.path, mime: saved.mime, bytes: saved.bytes, isPrivate: true });
    await ctx.db.insert(s.verificationRequests).values({ userId: a.userId, kind: 'dating', evidence: [saved.path], note: 'Selfie with handle note' });
    await ctx.db.update(s.datingProfiles).set({ verification: 'pending' }).where(eq(s.datingProfiles.userId, a.userId));
    return { status: 'pending', message: 'A member of our safety team will review your photo manually. It is never shown on your profile.' };
  });

  app.get('/api/v1/dating/discover', async (req) => {
    const a = requireAuth(req);
    const bp = await requireDatingEligible(ctx, a.userId, a.emailVerified);
    const [me] = await ctx.db.select().from(s.datingProfiles).where(eq(s.datingProfiles.userId, a.userId));
    if (!me) throw badRequest('Create your dating profile first.');
    if (!me.active || me.suspendedAt) throw forbidden('Your dating profile is paused or under review.');
    const q = parse(z.object({ astroOnly: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(30).default(10) }), req.query);
    const myAge = ageOn(bp.birthDate);
    // Hard eligibility filters in SQL: active, not suspended, mutual gender interest, not already acted on, not blocked.
    const rows = await ctx.db.execute(sql`
      select dp.*, b.birth_date from dating_profiles dp
      join users u on u.id = dp.user_id and u.status = 'active'
      join birth_profiles b on b.user_id = dp.user_id and b.is_primary
      where dp.user_id <> ${a.userId} and dp.active and dp.suspended_at is null
        and ${me.gender} = any(dp.interested_in) and dp.gender in (${sql.join(me.interestedIn.map((g) => sql`${g}`), sql`, `)})
        and not exists (select 1 from dating_actions da where da.actor_id = ${a.userId} and da.target_id = dp.user_id)
        and not exists (select 1 from blocks bl where (bl.blocker_id = ${a.userId} and bl.blocked_id = dp.user_id) or (bl.blocker_id = dp.user_id and bl.blocked_id = ${a.userId}))
        and (not dp.incognito or exists (select 1 from dating_actions l where l.actor_id = dp.user_id and l.target_id = ${a.userId} and l.action = 'like'))
      limit 200`);
    type Row = typeof s.datingProfiles.$inferSelect & { birth_date: string; user_id: string; approx_lat: number; approx_lon: number; age_min: number; age_max: number; max_distance_km: number; use_astrology: boolean; show_sun_sign: boolean; show_moon_sign: boolean; interested_in: string[] };
    const cands = ((rows as unknown as { rows: Row[] }).rows ?? []).filter((r) => {
      const age = ageOn(r.birth_date);
      const dist = distanceKm(me.approxLat, me.approxLon, r.approx_lat, r.approx_lon);
      return age >= me.ageMin && age <= me.ageMax && myAge >= r.age_min && myAge <= r.age_max
        && dist <= me.maxDistanceKm && dist <= r.max_distance_km
        && (!me.preferredIntents.length || me.preferredIntents.includes(r.intent as never));
    });
    const likedMe = new Set((await ctx.db.select({ id: s.datingActions.actorId }).from(s.datingActions).where(and(eq(s.datingActions.targetId, a.userId), eq(s.datingActions.action, 'like')))).map((r) => r.id));
    const myW = me.useAstrology ? await currentChart(ctx.db, a.userId, 'western_default') : null;
    const list: DatingCandidate[] = [];
    for (const r of cands) {
      let astroScore: number | null = null;
      if (myW && r.use_astrology) {
        const theirW = await currentChart(ctx.db, r.user_id, 'western_default');
        if (theirW) {
          const c = compatibility({ westernA: myW.result, westernB: theirW.result, relationship: 'dating' });
          const dims = c.western.filter((d) => ['emotional', 'attraction', 'communication'].includes(d.key));
          astroScore = Math.round(dims.reduce((x, d) => x + d.score, 0) / dims.length);
        }
      }
      list.push({ userId: r.user_id, intent: r.intent, interests: r.interests, distanceKm: distanceKm(me.approxLat, me.approxLon, r.approx_lat, r.approx_lon), completeness: completeness({ ...r, photos: r.photos ?? [], prompts: r.prompts ?? [] } as never), likedViewer: likedMe.has(r.user_id), astroScore, verified: r.verification === 'verified' });
    }
    const filtered = q.astroOnly ? list.filter((c) => (c.astroScore ?? 0) >= 60) : list;
    const ranked = rankDating(filtered, { intent: me.intent, interests: me.interests, maxDistanceKm: me.maxDistanceKm, useAstrology: me.useAstrology }).slice(0, q.limit);
    const names = await displayNames(ctx.db, ranked.map((r) => r.userId));
    const out = [];
    for (const r of ranked) {
      const row = cands.find((c) => c.user_id === r.userId)!;
      const b3 = row.show_sun_sign || row.show_moon_sign ? await bigThreeFor(ctx.db, r.userId) : null;
      out.push({
        userId: r.userId, displayName: names.get(r.userId)?.displayName, age: ageOn(row.birth_date), city: row.city,
        distanceLabel: r.distanceKm < 5 ? 'Under 5 km away' : `About ${Math.round(r.distanceKm / 5) * 5} km away`,
        intent: row.intent, bio: row.bio, prompts: row.prompts, photos: row.photos, interests: row.interests, verified: r.verified,
        signs: b3 ? { sun: row.show_sun_sign ? b3.western.sun : null, moon: row.show_moon_sign ? b3.western.moon : null } : null,
        astroScore: r.astroScore, reasons: r.reasons,
      });
    }
    return { candidates: out, explanation: 'Only people who match both your preferences and theirs are shown. Order considers shared intent, interests, distance, profile completeness and — if you both opt in — chart contacts.' };
  });

  app.post('/api/v1/dating/actions', { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } }, async (req) => {
    const a = requireAuth(req);
    await requireDatingEligible(ctx, a.userId, a.emailVerified);
    const { targetId, action } = parse(z.object({ targetId: z.uuid(), action: z.enum(['like', 'pass']) }), req.body);
    if (targetId === a.userId) throw badRequest('Invalid target');
    const [me] = await ctx.db.select().from(s.datingProfiles).where(eq(s.datingProfiles.userId, a.userId));
    const [them] = await ctx.db.select().from(s.datingProfiles).where(eq(s.datingProfiles.userId, targetId));
    if (!me?.active || !them?.active || them.suspendedAt) throw notFound('Profile');
    if (await isBlockedEitherWay(ctx.db, a.userId, targetId)) throw notFound('Profile');
    const ins = await ctx.db.insert(s.datingActions).values({ actorId: a.userId, targetId, action }).onConflictDoNothing().returning();
    if (!ins.length) throw conflict('You have already responded to this profile.');
    if (action === 'pass') return { matched: false };
    const [reciprocal] = await ctx.db.select().from(s.datingActions).where(and(eq(s.datingActions.actorId, targetId), eq(s.datingActions.targetId, a.userId), eq(s.datingActions.action, 'like')));
    if (!reciprocal) return { matched: false };
    const [ua, ub] = [a.userId, targetId].sort();
    const match = await ctx.db.transaction(async (tx) => {
      const [m] = await tx.insert(s.datingMatches).values({ userA: ua, userB: ub }).onConflictDoNothing().returning();
      if (!m) return null;
      const convId = await createConversation(tx, 'dating_match', a.userId, [ua, ub], m.id);
      await postSystemMessage(tx, convId, 'You matched! Say hello. Remember: keep chats here until you feel comfortable, and never send money.');
      await tx.update(s.datingMatches).set({ conversationId: convId }).where(eq(s.datingMatches.id, m.id));
      return { ...m, conversationId: convId };
    });
    if (match) {
      for (const uid of [ua, ub]) await notify(ctx, ctx.db, { userId: uid, category: 'dating', title: 'It’s a match ✦', body: 'You both liked each other.', link: `/messages/${match.conversationId}`, dedupeKey: `match:${match.id}` });
      await track(ctx.db, a.userId, 'dating_match_created', {});
    }
    return { matched: true, matchId: match?.id, conversationId: match?.conversationId };
  });

  app.get('/api/v1/dating/matches', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.datingMatches).where(or(eq(s.datingMatches.userA, a.userId), eq(s.datingMatches.userB, a.userId))).orderBy(desc(s.datingMatches.createdAt));
    const others = rows.map((m) => (m.userA === a.userId ? m.userB : m.userA));
    const names = await displayNames(ctx.db, others);
    const profiles = others.length ? await ctx.db.select().from(s.datingProfiles).where(inArray(s.datingProfiles.userId, others)) : [];
    return {
      matches: rows.map((m) => {
        const o = m.userA === a.userId ? m.userB : m.userA;
        const p = profiles.find((x) => x.userId === o);
        return { id: m.id, userId: o, displayName: names.get(o)?.displayName, photo: p?.photos[0] ?? null, conversationId: m.conversationId, createdAt: m.createdAt, active: !m.unmatchedAt, unmatchedAt: m.unmatchedAt };
      }),
      datePrompts: DATE_PROMPTS,
    };
  });

  app.get('/api/v1/dating/matches/:id/compatibility', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [m] = await ctx.db.select().from(s.datingMatches).where(and(eq(s.datingMatches.id, id), isNull(s.datingMatches.unmatchedAt), or(eq(s.datingMatches.userA, a.userId), eq(s.datingMatches.userB, a.userId))));
    if (!m) throw notFound('Match');
    const other = m.userA === a.userId ? m.userB : m.userA;
    const profs = await ctx.db.select().from(s.datingProfiles).where(inArray(s.datingProfiles.userId, [a.userId, other]));
    if (!profs.every((p) => p.useAstrology)) throw forbidden('Astrology insights are shown only when both people opt in.');
    const [wa, wb] = await Promise.all([currentChart(ctx.db, a.userId, 'western_default'), currentChart(ctx.db, other, 'western_default')]);
    if (!wa || !wb) throw notFound('Chart');
    const c = compatibility({ westernA: wa.result, westernB: wb.result, relationship: 'dating', nameA: 'You', nameB: 'Your match' });
    // Placement-level factors are summarised so exact chart details stay private.
    return { dimensions: c.western.map((d) => ({ label: d.label, score: d.score, description: d.description, factorCount: d.factors.filter((f) => f.weight !== 0).length })), limitations: c.limitations };
  });

  app.post('/api/v1/dating/matches/:id/unmatch', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [m] = await ctx.db.update(s.datingMatches).set({ unmatchedAt: new Date(), unmatchedBy: a.userId })
      .where(and(eq(s.datingMatches.id, id), isNull(s.datingMatches.unmatchedAt), or(eq(s.datingMatches.userA, a.userId), eq(s.datingMatches.userB, a.userId)))).returning();
    if (!m) throw notFound('Match');
    if (m.conversationId) await ctx.db.update(s.conversations).set({ closedAt: new Date() }).where(eq(s.conversations.id, m.conversationId));
    await audit(ctx.db, { actorId: a.userId, action: 'dating.unmatch', targetType: 'dating_match', targetId: id });
    return { ok: true };
  });

  app.get('/api/v1/dating/safety', async () => ({ tips: SAFETY_TIPS }));
}
