import type { FastifyInstance } from 'fastify';
import { and, gte, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { parse } from '../lib/http';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { requireCapability } from '../lib/auth';
import { PERSONA_ARCHETYPES, PERSONALITY_VERSION, scorePersonality, scorePersonalityV1 } from '../../shared/personality';
import { simulatePopulation, summariseResults, type DistributionSummary, type Population } from '../../shared/assessmentSim';

type Reference = Record<Population, { v1: DistributionSummary; v2: DistributionSummary }>;
let reference: Reference | null = null;
/** Simulated reference distribution (deterministic, computed once per process). */
function simulatedReference() {
  if (!reference) {
    const seeds: Record<Population, number> = { uniform: 7, persons: 11, mild: 13 };
    reference = Object.fromEntries((Object.keys(seeds) as Population[]).map((k) => {
      const sheets = simulatePopulation(k, 4000, seeds[k]);
      return [k, { v1: summariseResults(sheets.map(scorePersonalityV1)), v2: summariseResults(sheets.map(scorePersonality)) }];
    })) as Reference;
  }
  return reference;
}

/**
 * Funnel definition. Visitor steps count events (anonymous visitors carry no identifiers). Member steps
 * follow the cohort of accounts created in the window: each step is the number of those people who have
 * ever done it, so drop-off between steps is meaningful.
 */
const VISITOR_STEPS: { key: string; label: string; events: string[] }[] = [
  { key: 'landing', label: 'Landing page views', events: ['landing_viewed'] },
  { key: 'assessment_started', label: 'Assessment started', events: ['assessment_started'] },
  { key: 'assessment_completed', label: 'Assessment completed', events: ['personality_preview_completed', 'assessment_completed'] },
  { key: 'result_viewed', label: 'Result viewed', events: ['result_viewed'] },
  { key: 'share_card', label: 'Share card created', events: ['share_card_created', 'identity_share_created'] },
  { key: 'share_click', label: 'Share link opened', events: ['identity_share_viewed'] },
  { key: 'save_click', label: '“Save my archetype” clicked', events: ['preview_signup_clicked'] },
];
const MEMBER_STEPS: { key: string; label: string; events: string[] }[] = [
  { key: 'assessment', label: 'Saved an archetype', events: ['assessment_completed'] },
  { key: 'first_drop', label: 'First Thought Drop', events: ['post_created'] },
  { key: 'first_connection', label: 'First connection', events: ['connection_made', 'bond_created'] },
  { key: 'first_circle', label: 'First circle joined or started', events: ['circle_created', 'circle_invite_accepted'] },
  { key: 'first_game', label: 'First game played', events: ['game_round_played', 'game_completed'] },
  { key: 'first_quest', label: 'First quest completed', events: ['quest_claimed'] },
  { key: 'first_reward', label: 'First reward earned', events: ['achievement_unlocked', 'season_reward_claimed'] },
  { key: 'returned', label: 'Came back on a later day', events: ['return_visit'] },
];
export const FUNNEL_EVENTS = [...new Set([...VISITOR_STEPS, ...MEMBER_STEPS].flatMap((s) => s.events))];

/** Admin-only diagnostics. Aggregates only — never individual answers. */
export async function insightRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/admin/funnel', async (req) => {
    requireCapability(req, 'analytics');
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
    const since = new Date(Date.now() - days * 864e5);
    const ev = await ctx.db.select({ name: s.analyticsEvents.name, n: sql<number>`count(*)::int` }).from(s.analyticsEvents)
      .where(and(gte(s.analyticsEvents.createdAt, since), inArray(s.analyticsEvents.name, VISITOR_STEPS.flatMap((x) => x.events)))).groupBy(s.analyticsEvents.name);
    const visitor = VISITOR_STEPS.map((step) => ({ key: step.key, label: step.label, unit: 'events' as const, value: ev.filter((e) => step.events.includes(e.name)).reduce((a, e) => a + e.n, 0) }));
    const cohort = await ctx.db.select({ id: s.users.id }).from(s.users).where(and(gte(s.users.createdAt, since), ne(s.users.status, 'deleted')));
    const ids = cohort.map((c) => c.id);
    const member = [{ key: 'signup', label: 'Accounts created', unit: 'people' as const, value: ids.length }];
    for (const step of MEMBER_STEPS) {
      const [{ n }] = ids.length
        ? await ctx.db.select({ n: sql<number>`count(distinct ${s.analyticsEvents.userId})::int` }).from(s.analyticsEvents).where(and(inArray(s.analyticsEvents.userId, ids), inArray(s.analyticsEvents.name, step.events)))
        : [{ n: 0 }];
      member.push({ key: step.key, label: step.label, unit: 'people', value: n });
    }
    const withRates = <T extends { value: number }>(steps: T[]) => steps.map((st, i) => ({
      ...st,
      fromPrevious: i === 0 || !steps[i - 1].value ? null : Math.round((1000 * st.value) / steps[i - 1].value) / 10,
      fromFirst: !steps[0].value ? null : Math.round((1000 * st.value) / steps[0].value) / 10,
    }));
    const m = withRates(member);
    // Biggest drop-off between consecutive member steps (needs a meaningful base).
    const drops = m.slice(1).map((st, i) => ({ from: m[i].label, to: st.label, lost: m[i].value - st.value, base: m[i].value })).filter((d) => d.base >= 5).sort((a, b) => b.lost / b.base - a.lost / a.base);
    return {
      days, visitor: withRates(visitor), member: m, biggestDropOff: drops[0] ?? null,
      note: 'Visitor steps are event counts (one person can appear more than once; nothing identifies them). Member steps follow people who created an account in this window and count each person once.',
    };
  });

  app.get('/api/v1/admin/assessment', async (req) => {
    requireCapability(req, 'analytics');
    const rows = await ctx.db.select({
      version: s.assessmentResults.version, archetype: s.assessmentResults.archetypeKey, confidence: s.assessmentResults.confidence, n: sql<number>`count(*)::int`,
    }).from(s.assessmentResults).groupBy(s.assessmentResults.version, s.assessmentResults.archetypeKey, s.assessmentResults.confidence);
    const versions = [...new Set(rows.map((r) => r.version))].sort();
    const real = versions.map((version) => {
      const vr = rows.filter((r) => r.version === version);
      const total = vr.reduce((a, r) => a + r.n, 0);
      const byArchetype = PERSONA_ARCHETYPES.map((a) => {
        const n = vr.filter((r) => r.archetype === a.key).reduce((x, r) => x + r.n, 0);
        return { key: a.key, name: a.name, n, pct: total ? Math.round((1000 * n) / total) / 10 : 0 };
      });
      const confidence = Object.fromEntries(['high', 'medium', 'low', 'inconclusive'].map((c) => [c, vr.filter((r) => r.confidence === c).reduce((x, r) => x + r.n, 0)]));
      return { version, total, byArchetype, confidence };
    });
    return {
      currentVersion: PERSONALITY_VERSION,
      real,
      simulated: simulatedReference(),
      note: 'Simulated populations are seeded reference sheets for checking balance, not real users. Real counts are all saved results, including retakes; small totals are not meaningful.',
    };
  });
}
