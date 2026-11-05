import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { requireAuth } from '../lib/auth';
import { forbidden, parse } from '../lib/http';
import { INTENT_KEYS, MAX_INTENTS } from '../../shared/people';
import { PERSONA_BY_KEY } from '../../shared/personality';

/**
 * Discover → People. Strictly opt-in and reciprocal: only members who chose to be listed appear, and only
 * members who are listed themselves can browse. Blocks in either direction, suspended and deleted accounts
 * are never shown. Archetype and labels appear only if the member's own visibility setting for them is public.
 * Nothing is inferred: intents are what the member picked; there is no ranking by personality or identity.
 */
export async function peopleRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/people/settings', async (req) => {
    const a = requireAuth(req);
    const [p] = await ctx.db.select({ discoverable: s.profiles.discoverable, intents: s.profiles.connectionIntents }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    return { discoverable: p.discoverable, intents: p.intents };
  });

  app.put('/api/v1/people/settings', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ discoverable: z.boolean(), intents: z.array(z.enum(INTENT_KEYS)).max(MAX_INTENTS).default([]) }), req.body);
    if (body.discoverable && !a.emailVerified) throw forbidden('Verify your email before appearing in Discover.');
    const [before] = await ctx.db.select({ discoverable: s.profiles.discoverable }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    await ctx.db.update(s.profiles).set({ discoverable: body.discoverable, connectionIntents: [...new Set(body.intents)], updatedAt: new Date() }).where(eq(s.profiles.userId, a.userId));
    if (before.discoverable !== body.discoverable) {
      await audit(ctx.db, { actorId: a.userId, action: body.discoverable ? 'people.discoverable_on' : 'people.discoverable_off', targetType: 'user', targetId: a.userId });
      await track(ctx.db, a.userId, 'discovery_opt_in', { on: body.discoverable });
    }
    return { discoverable: body.discoverable, intents: body.intents };
  });

  app.get('/api/v1/people/discover', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const q = parse(z.object({ intent: z.enum(INTENT_KEYS).optional(), offset: z.coerce.number().int().min(0).max(400).default(0) }), req.query);
    const [me] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, a.userId));
    if (!me.discoverable) return { optedIn: false, people: [], nextOffset: null };
    const blocked = await ctx.db.select({ a: s.blocks.blockerId, b: s.blocks.blockedId }).from(s.blocks).where(or(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, a.userId)));
    const hidden = [a.userId, ...blocked.map((r) => (r.a === a.userId ? r.b : r.a))];
    const PAGE = 20;
    // Candidates: most recently updated first (bounded), then people sharing more of your intents first.
    // No ranking by personality, archetype or any inferred trait.
    const candidates = (await ctx.db.select({ p: s.profiles }).from(s.profiles)
      .innerJoin(s.users, eq(s.users.id, s.profiles.userId))
      .where(and(eq(s.profiles.discoverable, true), eq(s.users.status, 'active'), notInArray(s.profiles.userId, hidden),
        q.intent ? sql`${q.intent} = any(${s.profiles.connectionIntents})` : undefined))
      .orderBy(desc(s.profiles.updatedAt)).limit(500)).map((r) => r.p);
    const shared = (p: (typeof candidates)[number]) => p.connectionIntents.filter((i) => me.connectionIntents.includes(i)).length;
    const ranked = candidates.map((p, i) => ({ p, i, n: shared(p) })).sort((x, y) => y.n - x.n || x.i - y.i).map((x) => x.p);
    const rows = ranked.slice(q.offset, q.offset + PAGE + 1);
    const page = rows.slice(0, PAGE);
    const ids = page.map((p) => p.userId);
    const personas = ids.length ? await ctx.db.selectDistinctOn([s.assessmentResults.userId], { userId: s.assessmentResults.userId, key: s.assessmentResults.archetypeKey })
      .from(s.assessmentResults).where(inArray(s.assessmentResults.userId, ids)).orderBy(s.assessmentResults.userId, desc(s.assessmentResults.createdAt)) : [];
    const following = ids.length ? await ctx.db.select({ id: s.follows.followeeId, status: s.follows.status }).from(s.follows).where(and(eq(s.follows.followerId, a.userId), inArray(s.follows.followeeId, ids))) : [];
    const mine = new Set(me.identityLabels);
    return {
      optedIn: true,
      nextOffset: rows.length > PAGE ? q.offset + PAGE : null,
      people: page.map((p) => {
        const fv = (p.fieldVisibility ?? {}) as Record<string, string>;
        const personaKey = (fv.persona ?? 'public') === 'public' ? personas.find((x) => x.userId === p.userId)?.key : undefined;
        const labels = (fv.labels ?? 'public') === 'public' ? p.identityLabels : [];
        return {
          userId: p.userId, handle: p.handle, displayName: p.displayName, avatarUrl: p.avatarUrl,
          archetype: personaKey && PERSONA_BY_KEY[personaKey] ? { key: personaKey, name: PERSONA_BY_KEY[personaKey].name } : null,
          labels, sharedLabels: labels.filter((l) => mine.has(l)),
          intents: p.connectionIntents, sharedIntents: p.connectionIntents.filter((i) => me.connectionIntents.includes(i)),
          follow: following.find((f) => f.id === p.userId)?.status ?? null,
        };
      }),
    };
  });

}
