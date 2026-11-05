import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { parse } from '../lib/http';
import { requireAuth, requireCapability } from '../lib/auth';
import { collectibleStates } from '../services/progress';
import { checkInVibe, claimQuest, claimSeasonMilestone, progressOverview, reverseXp } from '../services/progression';
import { ACHIEVEMENTS } from '../../shared/gamification';
import { VIBES } from '../../shared/progression';

export async function progressionRoutes(app: FastifyInstance, ctx: Ctx) {
  /** Everything on the Progress page: XP, level, streaks, vibe, quests and season track. */
  app.get('/api/v1/progress', async (req) => {
    const a = requireAuth(req);
    return progressOverview(ctx, a.userId);
  });

  app.post('/api/v1/quests/:key/claim', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { key } = parse(z.object({ key: z.string().max(60) }), req.params);
    return claimQuest(ctx, a.userId, key);
  });

  app.post('/api/v1/seasons/:key/milestones/:at/claim', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { key, at } = parse(z.object({ key: z.string().max(60), at: z.coerce.number().int().min(1).max(100000) }), req.params);
    return claimSeasonMilestone(ctx, a.userId, key, at);
  });

  app.post('/api/v1/vibe', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const a = requireAuth(req);
    const { mood } = parse(z.object({ mood: z.enum(VIBES) }), req.body);
    return checkInVibe(ctx, a.userId, mood);
  });

  /** Reward inventory: badges, card styles, themes and achievements, each with how it was unlocked. */
  app.get('/api/v1/progress/inventory', async (req) => {
    const a = requireAuth(req);
    const items = await collectibleStates(ctx.db, a.userId);
    const got = await ctx.db.select().from(s.userAchievements).where(eq(s.userAchievements.userId, a.userId));
    return {
      items: items.map((c) => ({ key: c.key, kind: c.kind, title: c.title, unlocked: c.unlocked, source: c.source, unlock: c.unlock })),
      achievements: ACHIEVEMENTS.map((x) => ({ key: x.key, family: x.family, title: x.title, description: x.description, earnedAt: got.find((g) => g.achievementKey === x.key)?.awardedAt ?? null })),
    };
  });

  /** Staff: reverse one XP award (e.g. farming or a bug) with an audited correction. */
  app.post('/api/v1/admin/xp/:id/reverse', async (req) => {
    const a = requireCapability(req, 'users.manage');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
    return { entry: await reverseXp(ctx, id, a.userId, reason) };
  });
}
