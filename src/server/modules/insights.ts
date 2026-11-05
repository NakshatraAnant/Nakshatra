import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
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

/** Admin-only diagnostics. Aggregates only — never individual answers. */
export async function insightRoutes(app: FastifyInstance, ctx: Ctx) {
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
