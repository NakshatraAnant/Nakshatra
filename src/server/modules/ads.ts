import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth, requireCapability } from '../lib/auth';
import { hmac, safeEqual } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { plusStatus } from '../services/entitlements';
import { AD_LANGUAGES, AD_PLACEMENTS, AD_RULES, AD_TOPICS, adDisclosure, adPolicyIssues, canMoveAd, matchesContext, sponsoredContentIssues, whyThisAd, type AdStatus, type AdTargeting, type SponsoredQuest } from '../../shared/ads';
import { publicQuestions, scoreQuiz, type QuizDefinition } from '../../shared/quiz';

/** Pseudonymous key for frequency caps and hides; the raw member id is never stored with ad data. */
export const adViewerKey = (secret: string, userId: string) => hmac(secret, `ad-viewer:${userId}`);
const today = () => DateTime.now().setZone('Asia/Kolkata').toISODate()!;

type Campaign = typeof s.adCampaigns.$inferSelect;

export async function adRoutes(app: FastifyInstance, ctx: Ctx) {
  const db = ctx.db;
  const clickToken = (campaignId: string, viewer: string, day: string) => hmac(ctx.config.appSecret, `ad-click:${campaignId}:${viewer}:${day}`);

  /* ---------------- Serving ---------------- */

  /**
   * One sponsored card for this feed position, or none. Eligible: approved, inside its dates, advertiser active,
   * contextual match, not hidden by this viewer, under its per-viewer daily cap. Nakshatra+ members get none.
   * The showing is counted here (server-side), so caps can't be bypassed by a client.
   */
  app.get('/api/v1/ads/slot', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ placement: z.enum(['feed']).default('feed'), topic: z.string().max(40).optional() }), req.query);
    if ((await plusStatus(db, a.userId)).active) return { ad: null, reason: 'plus' };
    const [p] = await db.select({ language: s.profiles.language }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const context = { topic: q.topic ?? null, language: p?.language ?? 'en' };
    const now = new Date();
    const rows = await db.select({ c: s.adCampaigns, advertiser: s.adAdvertisers.name }).from(s.adCampaigns).innerJoin(s.adAdvertisers, eq(s.adAdvertisers.id, s.adCampaigns.advertiserId))
      .where(and(eq(s.adCampaigns.status, 'approved'), eq(s.adCampaigns.placement, q.placement), lte(s.adCampaigns.startsAt, now), gt(s.adCampaigns.endsAt, now), eq(s.adAdvertisers.status, 'active')));
    const viewer = adViewerKey(ctx.config.appSecret, a.userId);
    const day = today();
    const ids = rows.map((r) => r.c.id);
    if (!ids.length) return { ad: null };
    const hidden = new Set((await db.select({ c: s.adHides.campaignId }).from(s.adHides).where(and(eq(s.adHides.viewerKey, viewer), inArray(s.adHides.campaignId, ids)))).map((r) => r.c));
    const shown = await db.select({ c: s.adDelivery.campaignId, n: s.adDelivery.impressions }).from(s.adDelivery).where(and(eq(s.adDelivery.viewerKey, viewer), eq(s.adDelivery.day, day), inArray(s.adDelivery.campaignId, ids)));
    const eligible = rows.filter((r) => !hidden.has(r.c.id) && (shown.find((x) => x.c === r.c.id)?.n ?? 0) < r.c.frequencyCapPerDay && matchesContext(r.c.targeting as AdTargeting, context));
    if (!eligible.length) return { ad: null };
    // Least-shown to this viewer today first, so several campaigns rotate fairly.
    eligible.sort((x, y) => (shown.find((v) => v.c === x.c.id)?.n ?? 0) - (shown.find((v) => v.c === y.c.id)?.n ?? 0));
    const pick = eligible[0];
    await db.insert(s.adDelivery).values({ campaignId: pick.c.id, viewerKey: viewer, day, impressions: 1 })
      .onConflictDoUpdate({ target: [s.adDelivery.campaignId, s.adDelivery.viewerKey, s.adDelivery.day], set: { impressions: sql`${s.adDelivery.impressions} + 1` } });
    return {
      ad: {
        id: pick.c.id, headline: pick.c.headline, body: pick.c.body, ctaLabel: pick.c.ctaLabel, url: pick.c.destinationUrl,
        disclosure: adDisclosure(pick.advertiser), why: whyThisAd(pick.c.targeting as AdTargeting, context), token: clickToken(pick.c.id, viewer, day),
      },
    };
  });

  app.post('/api/v1/ads/:id/click', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    const viewer = adViewerKey(ctx.config.appSecret, a.userId);
    const day = today();
    // A click only counts against a showing this viewer actually received today.
    if (!safeEqual(token, clickToken(id, viewer, day))) return { counted: false };
    const r = await db.update(s.adDelivery).set({ clicks: sql`${s.adDelivery.clicks} + 1` })
      .where(and(eq(s.adDelivery.campaignId, id), eq(s.adDelivery.viewerKey, viewer), eq(s.adDelivery.day, day), sql`${s.adDelivery.clicks} < ${s.adDelivery.impressions}`)).returning();
    return { counted: r.length > 0 };
  });

  app.post('/api/v1/ads/:id/hide', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason } = parse(z.object({ reason: z.enum(['not_relevant', 'seen_too_often', 'misleading', 'offensive']).default('not_relevant') }), req.body);
    const [c] = await db.select({ id: s.adCampaigns.id }).from(s.adCampaigns).where(eq(s.adCampaigns.id, id));
    if (!c) throw notFound('Ad');
    await db.insert(s.adHides).values({ campaignId: id, viewerKey: adViewerKey(ctx.config.appSecret, a.userId), reason }).onConflictDoNothing();
    await track(db, a.userId, 'ad_hidden', { reason });
    return { ok: true };
  });

  /* ---------------- Sponsored quizzes and challenges ---------------- */

  /** Live sponsored quizzes or challenges for this member, with their own progress. No rewards are attached. */
  app.get('/api/v1/ads/sponsored', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ placement: z.enum(['quiz', 'quest']) }), req.query);
    if ((await plusStatus(db, a.userId)).active) return { items: [], reason: 'plus' };
    const [p] = await db.select({ language: s.profiles.language }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const context = { topic: null, language: p?.language ?? 'en' };
    const now = new Date();
    const rows = await db.select({ c: s.adCampaigns, advertiser: s.adAdvertisers.name }).from(s.adCampaigns).innerJoin(s.adAdvertisers, eq(s.adAdvertisers.id, s.adCampaigns.advertiserId))
      .where(and(eq(s.adCampaigns.status, 'approved'), eq(s.adCampaigns.placement, q.placement), lte(s.adCampaigns.startsAt, now), gt(s.adCampaigns.endsAt, now), eq(s.adAdvertisers.status, 'active'))).limit(10);
    const viewer = adViewerKey(ctx.config.appSecret, a.userId);
    const ids = rows.map((r) => r.c.id);
    if (!ids.length) return { items: [] };
    const hidden = new Set((await db.select({ c: s.adHides.campaignId }).from(s.adHides).where(and(eq(s.adHides.viewerKey, viewer), inArray(s.adHides.campaignId, ids)))).map((r) => r.c));
    const mine = await db.select().from(s.adParticipation).where(and(eq(s.adParticipation.viewerKey, viewer), inArray(s.adParticipation.campaignId, ids)));
    return {
      items: rows.filter((r) => !hidden.has(r.c.id) && r.c.content && matchesContext(r.c.targeting as AdTargeting, context)).slice(0, 3).map((r) => {
        const own = mine.filter((m) => m.campaignId === r.c.id);
        const quiz = own.find((m) => m.kind === 'quiz');
        return {
          id: r.c.id, disclosure: adDisclosure(r.advertiser), why: 'Shown to everyone on this page. Sponsored content on Nakshatra is never based on your profile, personality or activity, and taking part earns no rewards.',
          ctaLabel: r.c.ctaLabel, url: r.c.destinationUrl, endsAt: r.c.endsAt,
          ...(q.placement === 'quiz'
            ? { quiz: { title: (r.c.content as QuizDefinition).title, description: (r.c.content as QuizDefinition).description, questions: publicQuestions(r.c.content as QuizDefinition) }, myScore: quiz?.score ?? null, total: (r.c.content as QuizDefinition).questions.length }
            : { quest: r.c.content as SponsoredQuest, accepted: own.some((m) => m.kind === 'quest_accepted'), done: own.some((m) => m.kind === 'quest_done') }),
        };
      }),
    };
  });

  async function liveSponsored(id: string, placement: 'quiz' | 'quest') {
    const now = new Date();
    const [r] = await db.select({ c: s.adCampaigns }).from(s.adCampaigns).innerJoin(s.adAdvertisers, eq(s.adAdvertisers.id, s.adCampaigns.advertiserId))
      .where(and(eq(s.adCampaigns.id, id), eq(s.adCampaigns.status, 'approved'), eq(s.adCampaigns.placement, placement), lte(s.adCampaigns.startsAt, now), gt(s.adCampaigns.endsAt, now), eq(s.adAdvertisers.status, 'active')));
    if (!r?.c.content) throw notFound('Sponsored item');
    return r.c;
  }

  /** Answer a sponsored quiz once. Scored on the server; the sponsor only ever sees totals. */
  app.post('/api/v1/ads/:id/quiz', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { answers } = parse(z.object({ answers: z.array(z.number().int().min(0).max(3)).max(12) }), req.body);
    const c = await liveSponsored(id, 'quiz');
    const def = c.content as QuizDefinition;
    if (answers.length !== def.questions.length) throw badRequest('Answer every question.');
    const viewer = adViewerKey(ctx.config.appSecret, a.userId);
    const [done] = await db.select().from(s.adParticipation).where(and(eq(s.adParticipation.campaignId, id), eq(s.adParticipation.viewerKey, viewer), eq(s.adParticipation.kind, 'quiz')));
    if (done) throw conflict('You’ve already taken this quiz.');
    const result = scoreQuiz(def, answers);
    await db.insert(s.adParticipation).values({ campaignId: id, viewerKey: viewer, kind: 'quiz', score: result.score }).onConflictDoNothing();
    return { score: result.score, total: result.total, correct: result.correct, answers: def.questions.map((q) => q.options.findIndex((o) => o.correct)) };
  });

  /** Join, finish or leave a sponsored challenge. Self-reported, and it earns nothing. */
  app.post('/api/v1/ads/:id/quest', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { action } = parse(z.object({ action: z.enum(['accept', 'done', 'leave']) }), req.body);
    await liveSponsored(id, 'quest');
    const viewer = adViewerKey(ctx.config.appSecret, a.userId);
    const key = { campaignId: id, viewerKey: viewer };
    if (action === 'leave') await db.delete(s.adParticipation).where(and(eq(s.adParticipation.campaignId, id), eq(s.adParticipation.viewerKey, viewer)));
    else {
      await db.insert(s.adParticipation).values({ ...key, kind: 'quest_accepted' }).onConflictDoNothing();
      if (action === 'done') await db.insert(s.adParticipation).values({ ...key, kind: 'quest_done' }).onConflictDoNothing();
    }
    return { ok: true };
  });

  /* ---------------- Staff ---------------- */

  const Campaign = z.object({
    advertiserId: z.uuid(), name: z.string().trim().min(2).max(80),
    headline: z.string().trim().min(3).max(AD_RULES.headline), body: z.string().trim().max(AD_RULES.body).default(''), ctaLabel: z.string().trim().min(2).max(AD_RULES.cta).default('Learn more'),
    destinationUrl: z.string().trim().max(500),
    targeting: z.object({ topics: z.array(z.enum(AD_TOPICS)).max(6).default([]), languages: z.array(z.enum(AD_LANGUAGES)).max(2).default([]) }).strict().default({ topics: [], languages: [] }),
    startsAt: z.iso.datetime(), endsAt: z.iso.datetime(),
    frequencyCapPerDay: z.number().int().min(1).max(AD_RULES.maxCapPerDay).default(AD_RULES.defaultCapPerDay),
    placement: z.enum(AD_PLACEMENTS).default('feed'), content: z.unknown().optional(),
  });
  /** Edits change only the fields sent (no defaults, so an edit never resets text, targeting or caps). */
  const CampaignPatch = z.object({
    name: z.string().trim().min(2).max(80), headline: z.string().trim().min(3).max(AD_RULES.headline), body: z.string().trim().max(AD_RULES.body), ctaLabel: z.string().trim().min(2).max(AD_RULES.cta),
    destinationUrl: z.string().trim().max(500), targeting: z.object({ topics: z.array(z.enum(AD_TOPICS)).max(6), languages: z.array(z.enum(AD_LANGUAGES)).max(2) }).strict(),
    startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), frequencyCapPerDay: z.number().int().min(1).max(AD_RULES.maxCapPerDay), content: z.unknown(),
  }).partial();

  async function loadCampaign(id: string): Promise<Campaign> {
    const [c] = await db.select().from(s.adCampaigns).where(eq(s.adCampaigns.id, id));
    if (!c) throw notFound('Campaign');
    return c;
  }
  function checkDates(startsAt: Date, endsAt: Date) {
    if (endsAt <= startsAt) throw badRequest('End must be after start.');
    if (endsAt.getTime() - startsAt.getTime() > AD_RULES.maxDays * 864e5) throw badRequest(`Campaigns run for at most ${AD_RULES.maxDays} days.`);
  }
  const issuesOf = (c: Pick<Campaign, 'headline' | 'body' | 'ctaLabel' | 'destinationUrl' | 'targeting' | 'placement' | 'content'>) => [...adPolicyIssues(c, c.targeting as AdTargeting), ...sponsoredContentIssues(c.placement, c.content ?? null)];

  app.get('/api/v1/admin/ads', async (req) => {
    requireCapability(req, 'moderation');
    const advertisers = await db.select().from(s.adAdvertisers).orderBy(desc(s.adAdvertisers.createdAt));
    const campaigns = await db.select().from(s.adCampaigns).orderBy(desc(s.adCampaigns.updatedAt)).limit(200);
    const ids = campaigns.map((c) => c.id);
    const stats = ids.length ? await db.select({ c: s.adDelivery.campaignId, impressions: sql<number>`sum(${s.adDelivery.impressions})::int`, clicks: sql<number>`sum(${s.adDelivery.clicks})::int`, reach: sql<number>`count(distinct ${s.adDelivery.viewerKey})::int` }).from(s.adDelivery).where(inArray(s.adDelivery.campaignId, ids)).groupBy(s.adDelivery.campaignId) : [];
    const hides = ids.length ? await db.select({ c: s.adHides.campaignId, n: sql<number>`count(*)::int` }).from(s.adHides).where(inArray(s.adHides.campaignId, ids)).groupBy(s.adHides.campaignId) : [];
    const part = ids.length ? await db.select({ c: s.adParticipation.campaignId, kind: s.adParticipation.kind, n: sql<number>`count(*)::int`, avg: sql<number | null>`round(avg(${s.adParticipation.score}), 1)::float` }).from(s.adParticipation).where(inArray(s.adParticipation.campaignId, ids)).groupBy(s.adParticipation.campaignId, s.adParticipation.kind) : [];
    const pick = (id: string, kind: string) => part.find((x) => x.c === id && x.kind === kind);
    return {
      advertisers,
      campaigns: campaigns.map((c) => {
        const st = stats.find((x) => x.c === c.id);
        return { ...c, advertiser: advertisers.find((x) => x.id === c.advertiserId)?.name ?? '—', impressions: st?.impressions ?? 0, clicks: st?.clicks ?? 0, reach: st?.reach ?? 0, hides: hides.find((x) => x.c === c.id)?.n ?? 0, quizTakes: pick(c.id, 'quiz')?.n ?? 0, quizAverage: pick(c.id, 'quiz')?.avg ?? null, questAccepted: pick(c.id, 'quest_accepted')?.n ?? 0, questDone: pick(c.id, 'quest_done')?.n ?? 0, policyIssues: issuesOf(c) };
      }),
      rules: { topics: AD_TOPICS, languages: AD_LANGUAGES, placements: AD_PLACEMENTS, maxCapPerDay: AD_RULES.maxCapPerDay, maxDays: AD_RULES.maxDays },
      billing: 'Not built: campaigns are arranged by Nakshatra staff; nothing is charged in the app.',
    };
  });

  app.post('/api/v1/admin/ads/advertisers', async (req, reply) => {
    const a = requireCapability(req, 'commerce');
    const body = parse(z.object({ name: z.string().trim().min(2).max(80), website: z.url().startsWith('https://'), contactEmail: z.email() }), req.body);
    const [adv] = await db.insert(s.adAdvertisers).values({ ...body, createdBy: a.userId }).returning();
    await audit(db, { actorId: a.userId, action: 'ads.advertiser_created', targetType: 'advertiser', targetId: adv.id, meta: { name: adv.name } });
    return reply.code(201).send({ advertiser: adv });
  });

  app.post('/api/v1/admin/ads/advertisers/:id/status', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status } = parse(z.object({ status: z.enum(['active', 'suspended']) }), req.body);
    const [adv] = await db.update(s.adAdvertisers).set({ status }).where(eq(s.adAdvertisers.id, id)).returning();
    if (!adv) throw notFound('Advertiser');
    await audit(db, { actorId: a.userId, action: `ads.advertiser_${status}`, targetType: 'advertiser', targetId: id });
    return { ok: true };
  });

  app.post('/api/v1/admin/ads/campaigns', async (req, reply) => {
    const a = requireCapability(req, 'commerce');
    const body = parse(Campaign, req.body);
    const [adv] = await db.select().from(s.adAdvertisers).where(eq(s.adAdvertisers.id, body.advertiserId));
    if (!adv) throw notFound('Advertiser');
    const startsAt = new Date(body.startsAt), endsAt = new Date(body.endsAt);
    checkDates(startsAt, endsAt);
    const [c] = await db.insert(s.adCampaigns).values({ ...body, content: body.content ?? null, startsAt, endsAt, createdBy: a.userId }).returning();
    await audit(db, { actorId: a.userId, action: 'ads.campaign_created', targetType: 'ad_campaign', targetId: c.id, meta: { name: c.name } });
    return reply.code(201).send({ campaign: c, policyIssues: issuesOf(c) });
  });

  /** Any edit returns the campaign to draft, so changed creative is always reviewed again. */
  app.patch('/api/v1/admin/ads/campaigns/:id', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const c = await loadCampaign(id);
    if (c.status === 'ended') throw badRequest('Ended campaigns can’t be edited.');
    const body = parse(CampaignPatch, req.body);
    const startsAt = body.startsAt ? new Date(body.startsAt) : c.startsAt, endsAt = body.endsAt ? new Date(body.endsAt) : c.endsAt;
    checkDates(startsAt, endsAt);
    const [u] = await db.update(s.adCampaigns).set({ ...body, startsAt, endsAt, status: 'draft', reviewedBy: null, reviewedAt: null, reviewNote: null, updatedAt: new Date() }).where(eq(s.adCampaigns.id, id)).returning();
    await audit(db, { actorId: a.userId, action: 'ads.campaign_edited', targetType: 'ad_campaign', targetId: id, meta: { previousStatus: c.status } });
    return { campaign: u, policyIssues: issuesOf(u) };
  });

  app.post('/api/v1/admin/ads/campaigns/:id/submit', async (req) => {
    const a = requireCapability(req, 'commerce');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const c = await loadCampaign(id);
    if (!canMoveAd(c.status as AdStatus, 'in_review')) throw conflict(`A ${c.status.replace('_', ' ')} campaign can’t be submitted.`);
    const issues = issuesOf(c);
    if (issues.length) throw badRequest(issues.join(' '));
    await db.update(s.adCampaigns).set({ status: 'in_review', submittedBy: a.userId, updatedAt: new Date() }).where(eq(s.adCampaigns.id, id));
    await audit(db, { actorId: a.userId, action: 'ads.campaign_submitted', targetType: 'ad_campaign', targetId: id });
    return { ok: true };
  });

  /** Four-eyes review: whoever wrote or submitted a campaign can't approve it. */
  app.post('/api/v1/admin/ads/campaigns/:id/review', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { decision, note } = parse(z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).default('') }), req.body);
    const c = await loadCampaign(id);
    if (c.status !== 'in_review') throw conflict('Only campaigns in review can be decided.');
    if (c.createdBy === a.userId || c.submittedBy === a.userId) throw forbidden('A different staff member must review this campaign.');
    if (decision === 'reject' && !note) throw badRequest('Say why it was rejected.');
    if (decision === 'approve' && issuesOf(c).length) throw badRequest('This campaign has policy issues.');
    await db.update(s.adCampaigns).set({ status: decision === 'approve' ? 'approved' : 'rejected', reviewedBy: a.userId, reviewedAt: new Date(), reviewNote: note || null, updatedAt: new Date() }).where(eq(s.adCampaigns.id, id));
    await audit(db, { actorId: a.userId, action: `ads.campaign_${decision === 'approve' ? 'approved' : 'rejected'}`, targetType: 'ad_campaign', targetId: id, meta: { note } });
    return { ok: true };
  });

  app.post('/api/v1/admin/ads/campaigns/:id/status', async (req) => {
    const a = requireCapability(req, 'moderation');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { status } = parse(z.object({ status: z.enum(['paused', 'approved', 'ended']) }), req.body);
    const c = await loadCampaign(id);
    // Resuming is only from paused; it never skips review.
    if (status === 'approved' && c.status !== 'paused') throw conflict('Only paused campaigns can be resumed.');
    if (!canMoveAd(c.status as AdStatus, status)) throw conflict(`Can’t move a ${c.status.replace('_', ' ')} campaign to ${status}.`);
    await db.update(s.adCampaigns).set({ status, updatedAt: new Date() }).where(eq(s.adCampaigns.id, id));
    await audit(db, { actorId: a.userId, action: `ads.campaign_${status === 'approved' ? 'resumed' : status}`, targetType: 'ad_campaign', targetId: id });
    return { ok: true };
  });
}
