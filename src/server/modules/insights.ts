import type { FastifyInstance } from 'fastify';
import { and, gte, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { parse } from '../lib/http';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { requireCapability } from '../lib/auth';
import { snapshot } from '../services/metrics';
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

type Light = 'green' | 'amber' | 'red' | 'grey';
export interface ReadinessItem { key: string; area: string; feature: string; status: Light; reason: string; dependency: string | null; works: string; launchImpact: string; link: string | null }

/**
 * Launch Readiness / Blocker Centre. Every row is computed from live configuration and data at request time,
 * so it can't drift from reality: green = ready, amber = works with a caveat, red = blocks a public launch,
 * grey = deliberately switched off or not built.
 */
export async function launchReadiness(ctx: Ctx): Promise<ReadinessItem[]> {
  const c = ctx.config;
  const n = sql<number>`count(*)::int`;
  const flags = new Map((await ctx.db.select().from(s.featureFlags)).map((f) => [f.key, f.enabled]));
  const on = (k: string, def: boolean) => flags.get(k) ?? def;
  const t0 = performance.now();
  await ctx.db.execute(sql`select 1`);
  const dbMs = Math.round(performance.now() - t0);
  const day = new Date(Date.now() - 864e5);
  const week = new Date(Date.now() - 7 * 864e5);
  const [errs] = await ctx.db.select({ n }).from(s.analyticsEvents).where(and(sql`${s.analyticsEvents.name} = 'client_error'`, gte(s.analyticsEvents.createdAt, day)));
  const [events] = await ctx.db.select({ n }).from(s.analyticsEvents).where(gte(s.analyticsEvents.createdAt, week));
  const [openReports] = await ctx.db.select({ n }).from(s.reports).where(sql`${s.reports.status} = 'open'`);
  const [stock] = await ctx.db.select({ n: sql<number>`coalesce(sum(greatest(0, ${s.merchVariants.stockOnHand} - ${s.merchVariants.reserved})),0)::int` }).from(s.merchVariants).where(sql`${s.merchVariants.active}`);
  const [staleCod] = await ctx.db.select({ n }).from(s.codOrders).where(and(sql`${s.codOrders.status} = 'pending_confirmation'`, sql`${s.codOrders.placedAt} < now() - interval '48 hours'`));
  const perf = snapshot();
  const legacyOff = ['dating', 'matchmaking', 'experts', 'learning', 'marketplace', 'weddings', 'community', 'messages'].filter((k) => !on(k, false));
  const sim = summariseResults(simulatePopulation('persons', 3000, 11).map(scorePersonality));
  const merchOn = on('merch', false);
  return [
    { key: 'assessment', area: 'Identity', feature: 'Archetype assessment', status: sim.maxOverMin < 2.5 ? 'green' : 'amber', reason: `${PERSONALITY_VERSION}; every archetype between ${(sim.minShare * 100).toFixed(1)}% and ${(sim.maxShare * 100).toFixed(1)}% on the reference population.`, dependency: null, works: 'Assessment, blends, honest confidence, resumable progress, retakes with history.', launchImpact: 'Core of the product.', link: '/admin/assessment' },
    { key: 'mfa', area: 'Security', feature: 'Two-step verification and recovery codes', status: 'green', reason: 'Authenticator codes with one-time recovery codes; changes need password and a code.', dependency: null, works: 'Set up, sign in, lost-device recovery, regenerate codes.', launchImpact: 'Account takeover protection.', link: null },
    { key: 'secret', area: 'Security', feature: 'Application secret', status: c.APP_SECRET ? 'green' : c.isProd ? 'red' : 'amber', reason: c.APP_SECRET ? 'Set from the environment.' : 'Using the built-in development secret.', dependency: 'APP_SECRET (at least 32 random characters)', works: 'Sessions, encryption and signed links work locally.', launchImpact: 'Must be set before any hosted deployment (production refuses to start without it).', link: null },
    { key: 'email', area: 'Accounts', feature: 'Email delivery', status: c.MAIL_TRANSPORT === 'smtp' && c.SMTP_URL ? 'green' : 'red', reason: c.MAIL_TRANSPORT === 'smtp' ? 'SMTP selected.' : 'Emails go to the local development mailbox only.', dependency: 'SMTP provider and a verified sending domain (MAIL_TRANSPORT=smtp, SMTP_URL, MAIL_FROM)', works: 'Verification, password reset and gift emails can be read at /dev/mailbox locally.', launchImpact: 'Real people cannot verify email or reset passwords until this is set up.', link: null },
    { key: 'payments', area: 'Revenue', feature: 'Online payments', status: c.PAYMENTS_ENABLED === 'true' ? 'amber' : 'grey', reason: c.PAYMENTS_ENABLED === 'true' ? `Provider: ${c.PAYMENT_PROVIDER}.` : 'Switched off on purpose (PAYMENTS_ENABLED=false).', dependency: 'Payment provider account, published refund policy, then PAYMENTS_ENABLED=true', works: 'Paid items show as a preview; no one can be charged.', launchImpact: 'No online revenue until enabled. Cash-on-delivery merch does not depend on this.', link: null },
    { key: 'membership', area: 'Revenue', feature: 'Nakshatra+ memberships (monthly, yearly, Duo, Student, Founding)', status: c.PAYMENTS_ENABLED === 'true' ? 'green' : 'grey', reason: c.PAYMENTS_ENABLED === 'true' ? 'Plans can be bought; benefits start only after a confirmed payment.' : 'Plans are shown as a preview while payments are off.', dependency: 'Online payments', works: 'Plans, Duo invite links and seat management, student requests with staff review, founding cap with locked renewal price, one shared benefit check.', launchImpact: 'Recurring revenue once payments are on. Benefits are cosmetic and content only.', link: '/admin/students' },
    { key: 'cod', area: 'Revenue', feature: 'Merch, cash on delivery', status: merchOn && stock.n > 0 && !staleCod.n ? 'green' : 'amber', reason: merchOn ? `${stock.n} units available${staleCod.n ? `; ${staleCod.n} order(s) waiting over 48 h for confirmation` : ''}.` : 'Built and tested; switched off.', dependency: 'Real stock, a courier agreement, and staff to confirm orders', works: 'Ordering, confirmation, packing, dispatch, delivery, returns, RTO and refunds with stock tracking.', launchImpact: 'Optional revenue line; turn on in Flags once operations are ready.', link: '/admin/cod' },
    { key: 'storage', area: 'Infrastructure', feature: 'Uploaded files', status: 'amber', reason: c.STORAGE_DRIVER === 'local' ? 'Stored on this machine’s disk.' : 'Stored in the database (capped per file).', dependency: 'Object storage or a persistent disk for hosting', works: 'Photos, voice notes and avatars work locally.', launchImpact: 'A host with a temporary disk would lose uploads on restart.', link: null },
    { key: 'scheduler', area: 'Infrastructure', feature: 'Background jobs', status: 'amber', reason: 'Run inside the app process.', dependency: 'An always-on instance (or a separate worker)', works: 'Gift expiry, retention clean-up and reminders run while the app runs.', launchImpact: 'Jobs pause if a free host sleeps.', link: null },
    { key: 'database', area: 'Infrastructure', feature: 'Database', status: dbMs < 100 ? 'green' : 'amber', reason: `${c.DATABASE_URL ? 'PostgreSQL' : 'Embedded PostgreSQL (PGlite)'}; ping ${dbMs} ms.`, dependency: c.DATABASE_URL ? null : 'Managed PostgreSQL for hosting', works: 'All features.', launchImpact: c.DATABASE_URL ? 'None.' : 'Fine for one machine; hosting needs managed PostgreSQL.', link: null },
    { key: 'performance', area: 'Infrastructure', feature: 'API response times', status: !perf.overallApi.sampled ? 'grey' : perf.overallApi.p95 < 300 ? 'green' : perf.overallApi.p95 < 1000 ? 'amber' : 'red', reason: perf.overallApi.sampled ? `p50 ${Math.round(perf.overallApi.p50)} ms · p95 ${Math.round(perf.overallApi.p95)} ms · p99 ${Math.round(perf.overallApi.p99)} ms over ${perf.overallApi.sampled} recent API requests.` : 'No requests measured since start.', dependency: null, works: 'Measured live in this process.', launchImpact: 'Slow responses hurt first impressions.', link: '/admin/performance' },
    { key: 'errors', area: 'Quality', feature: 'Client errors (24 h)', status: errs.n > 100 ? 'red' : errs.n > 10 ? 'amber' : 'green', reason: `${errs.n} reported in the last 24 hours.`, dependency: null, works: 'Browsers report crashes and WebGL failures.', launchImpact: 'Rising errors mean broken screens for someone.', link: '/admin/analytics' },
    { key: 'moderation', area: 'Safety', feature: 'Moderation queue', status: openReports.n > 20 ? 'amber' : 'green', reason: `${openReports.n} open report(s).`, dependency: 'People on moderation duty', works: 'Reports, blocks, pen-name mutes, appeals.', launchImpact: 'Unreviewed reports erode trust.', link: '/admin/moderation' },
    { key: 'people', area: 'Social', feature: 'Discover → People', status: on('people', true) ? 'green' : 'grey', reason: on('people', true) ? 'On (opt-in, reciprocal).' : 'Switched off.', dependency: null, works: 'Opt-in listing with intents; blocks honoured.', launchImpact: 'Helps new members find people.', link: '/admin/flags' },
    { key: 'creators', area: 'Creators', feature: 'Creator pages and tips', status: !on('creators', true) ? 'grey' : 'amber', reason: !on('creators', true) ? 'Switched off.' : ctx.config.PAYMENT_PROVIDER === 'none' ? 'Pages and listings work; tips are unavailable while payments are off.' : 'Pages, listings and tips work; tip earnings are held because payouts are not built.', dependency: 'Payments for tips; payouts, KYC and tax handling before creators can be paid', works: 'Creator pages, links, featured drops, offering listings with Notify me, tips into a held ledger, moderator suspension.', launchImpact: 'Creators can be set up, but they can’t get paid yet.', link: '/admin/creators' },
    { key: 'funnel', area: 'Growth', feature: 'Funnel analytics', status: events.n ? 'green' : 'amber', reason: events.n ? `${events.n} events in the last 7 days.` : 'No events in the last 7 days.', dependency: null, works: 'Visitor and member funnels with drop-off.', launchImpact: 'Without data you can’t see where people leave.', link: '/admin/funnel' },
    { key: 'legal', area: 'Compliance', feature: 'Terms and privacy policy', status: 'amber', reason: 'Rewritten in plain language; not yet reviewed by a lawyer.', dependency: 'Legal review and a grievance-officer contact', works: 'Pages are published in the app.', launchImpact: 'Needed before a public launch in India (IT Rules, DPDP Act).', link: '/legal/terms' },
    { key: 'push', area: 'Engagement', feature: 'Push notifications', status: 'grey', reason: 'Not built.', dependency: 'A push provider (web push keys or FCM)', works: 'In-app notifications only.', launchImpact: 'Fewer return visits without reminders.', link: null },
    { key: 'legacy', area: 'Product', feature: 'Legacy modules', status: 'grey', reason: legacyOff.length ? `Switched off: ${legacyOff.join(', ')}.` : 'All legacy modules are on.', dependency: null, works: 'Pages explain they are off; APIs refuse requests.', launchImpact: 'Keeps the launch focused. Re-enable deliberately in Flags.', link: '/admin/flags' },
  ];
}

export async function opsRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/admin/launch-readiness', async (req) => {
    requireCapability(req, 'analytics');
    const items = await launchReadiness(ctx);
    const count = (l: Light) => items.filter((i) => i.status === l).length;
    return { generatedAt: new Date().toISOString(), summary: { green: count('green'), amber: count('amber'), red: count('red'), grey: count('grey') }, items };
  });

  app.get('/api/v1/admin/performance', async (req) => {
    requireCapability(req, 'analytics');
    const t0 = performance.now();
    await ctx.db.execute(sql`select 1`);
    return { ...snapshot(), dbPingMs: Math.round((performance.now() - t0) * 10) / 10, note: 'Measured in this server process since it started (most recent 1,000 requests per route). Route patterns only — no URLs, ids or users.' };
  });
}
