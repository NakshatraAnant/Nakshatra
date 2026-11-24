import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, or, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { notify, sendEmail } from '../lib/notify';
import { coarsen, distanceKm, placeById } from '../lib/geo';
import { ageOn, bigThreeFor, currentChart, displayNames, isBlockedEitherWay, primaryBirth } from '../services/identity';
import { compatibility, manglik } from '../../astro';
import { createConversation, postSystemMessage } from './messaging';
import { GENDERS } from './dating';

export const FAMILY_PERMISSIONS = ['view_profile', 'view_shortlist', 'view_shared_reports', 'suggest_profiles'] as const;
const STAGES = ['connected', 'talking', 'families_introduced', 'engaged', 'married', 'closed'] as const;

const ProfileBody = z.object({
  gender: z.enum(GENDERS), seeking: z.array(z.enum(GENDERS)).min(1), about: z.string().max(1500).default(''),
  education: z.string().max(120).default(''), profession: z.string().max(120).default(''), placeId: z.string().optional(),
  willingToRelocate: z.boolean().default(false), values: z.array(z.string().max(30)).max(10).default([]), interests: z.array(z.string().max(30)).max(10).default([]),
  cultural: z.object({ languages: z.array(z.string().max(30)).max(5).optional(), community: z.string().max(60).optional(), religion: z.string().max(60).optional(), diet: z.string().max(30).optional() }).default({}),
  culturalPreferences: z.object({ languages: z.array(z.string().max(30)).max(5).optional(), religion: z.string().max(60).optional(), diet: z.string().max(30).optional() }).default({}),
  ageMin: z.number().int().min(18).max(99), ageMax: z.number().int().min(18).max(99),
  familyParticipation: z.boolean().default(false), kundliMatchingImportant: z.boolean().default(false),
  acceptTerms: z.literal(true),
});

/** Family members see only what the principal explicitly allowed — never messages or dating activity. */
async function familyAccess(db: Executor, memberUserId: string, principalId: string, permission: (typeof FAMILY_PERMISSIONS)[number]) {
  const [f] = await db.select().from(s.familyMembers).where(and(eq(s.familyMembers.memberUserId, memberUserId), eq(s.familyMembers.principalId, principalId), eq(s.familyMembers.status, 'active')));
  if (!f || !f.permissions.includes(permission)) throw notFound('Profile');
  return f;
}

async function profileCard(db: Executor, viewerId: string, targetId: string) {
  const [p] = await db.select().from(s.matchmakingProfiles).where(eq(s.matchmakingProfiles.userId, targetId));
  const bp = await primaryBirth(db, targetId);
  const names = await displayNames(db, [targetId]);
  const b3 = await bigThreeFor(db, targetId);
  const [conn] = await db.select().from(s.mmConnections).where(or(and(eq(s.mmConnections.fromId, viewerId), eq(s.mmConnections.toId, targetId)), and(eq(s.mmConnections.fromId, targetId), eq(s.mmConnections.toId, viewerId))));
  return {
    userId: targetId, displayName: names.get(targetId)?.displayName, avatarUrl: names.get(targetId)?.avatarUrl, age: bp ? ageOn(bp.birthDate) : null,
    city: p.city, about: p.about, education: p.education, profession: p.profession, values: p.values, interests: p.interests, cultural: p.cultural,
    willingToRelocate: p.willingToRelocate, verified: p.verification === 'verified', rashi: b3?.vedic.rashi ?? null, nakshatra: b3?.vedic.nakshatra ?? null,
    connection: conn ? { id: conn.id, status: conn.status, stage: conn.stage, direction: conn.fromId === viewerId ? 'outgoing' : 'incoming' } : null,
  };
}

export async function matchmakingRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/matchmaking/profile', async (req) => {
    const a = requireAuth(req);
    const [p] = await ctx.db.select().from(s.matchmakingProfiles).where(eq(s.matchmakingProfiles.userId, a.userId));
    return { profile: p ?? null };
  });

  app.put('/api/v1/matchmaking/profile', async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw forbidden('Verify your email to create a matchmaking profile.');
    const bp = await primaryBirth(ctx.db, a.userId);
    if (!bp || ageOn(bp.birthDate) < 18) throw forbidden('Complete your Cosmic ID first (adults 18+ only).');
    const body = parse(ProfileBody, req.body);
    if (body.ageMin > body.ageMax) throw badRequest('Minimum age must be below maximum age.');
    const [existing] = await ctx.db.select().from(s.matchmakingProfiles).where(eq(s.matchmakingProfiles.userId, a.userId));
    const place = body.placeId ? placeById(body.placeId) : null;
    if (!place && !existing) throw badRequest('Choose your city.');
    const { acceptTerms: _t, placeId: _p, ...rest } = body;
    const values = { ...rest, userId: a.userId, city: place?.label ?? existing!.city, approxLat: place ? coarsen(place.latitude) : existing!.approxLat, approxLon: place ? coarsen(place.longitude) : existing!.approxLon, updatedAt: new Date(), active: true };
    await ctx.db.insert(s.matchmakingProfiles).values(values).onConflictDoUpdate({ target: s.matchmakingProfiles.userId, set: values });
    await ctx.db.insert(s.consentRecords).values({ userId: a.userId, purpose: 'matchmaking_terms', granted: true, policyVersion: '2026-10-v1' });
    return { ok: true };
  });

  app.get('/api/v1/matchmaking/discover', async (req) => {
    const a = requireAuth(req);
    const [me] = await ctx.db.select().from(s.matchmakingProfiles).where(eq(s.matchmakingProfiles.userId, a.userId));
    if (!me?.active) throw badRequest('Create your matchmaking profile first.');
    const q = parse(z.object({ maxKm: z.coerce.number().int().min(10).max(5000).default(500), kundli: z.coerce.boolean().optional(), language: z.string().optional() }), req.query);
    const myBp = await primaryBirth(ctx.db, a.userId);
    const myAge = myBp ? ageOn(myBp.birthDate) : 0;
    const rows = await ctx.db.select({ p: s.matchmakingProfiles, birthDate: s.birthProfiles.birthDate }).from(s.matchmakingProfiles)
      .innerJoin(s.users, and(eq(s.users.id, s.matchmakingProfiles.userId), eq(s.users.status, 'active')))
      .innerJoin(s.birthProfiles, and(eq(s.birthProfiles.userId, s.matchmakingProfiles.userId), eq(s.birthProfiles.isPrimary, true)))
      .where(and(eq(s.matchmakingProfiles.active, true), sql`${s.matchmakingProfiles.userId} <> ${a.userId}`, sql`${me.gender} = any(${s.matchmakingProfiles.seeking})`, inArray(s.matchmakingProfiles.gender, me.seeking)))
      .limit(200);
    const myV = q.kundli || me.kundliMatchingImportant ? await currentChart(ctx.db, a.userId, 'vedic_default') : null;
    const out = [];
    for (const r of rows) {
      const age = ageOn(r.birthDate);
      if (age < me.ageMin || age > me.ageMax || myAge < r.p.ageMin || myAge > r.p.ageMax) continue;
      const dist = distanceKm(me.approxLat, me.approxLon, r.p.approxLat, r.p.approxLon);
      if (dist > q.maxKm && !(me.willingToRelocate || r.p.willingToRelocate)) continue;
      if (await isBlockedEitherWay(ctx.db, a.userId, r.p.userId)) continue;
      const prefs = me.culturalPreferences as { languages?: string[]; religion?: string; diet?: string };
      const theirs = r.p.cultural as { languages?: string[]; religion?: string; diet?: string };
      if (q.language && !(theirs.languages ?? []).includes(q.language)) continue;
      if (prefs.religion && theirs.religion && prefs.religion !== theirs.religion) continue;
      let guna: number | null = null;
      if (myV) {
        const tv = await currentChart(ctx.db, r.p.userId, 'vedic_default');
        const tw = await currentChart(ctx.db, r.p.userId, 'western_default');
        const mw = await currentChart(ctx.db, a.userId, 'western_default');
        if (tv && tw && mw) {
          const meGroom = me.gender === 'man' || (me.gender !== 'woman' && a.userId < r.p.userId);
          const c = meGroom
            ? compatibility({ westernA: mw.result, westernB: tw.result, vedicA: myV.result, vedicB: tv.result, relationship: 'spouse', traditionalRoles: true })
            : compatibility({ westernA: tw.result, westernB: mw.result, vedicA: tv.result, vedicB: myV.result, relationship: 'spouse', traditionalRoles: true });
          guna = c.vedic.gunaMilan?.total ?? null;
        }
      }
      const sharedValues = r.p.values.filter((v) => me.values.includes(v)).length;
      out.push({ card: await profileCard(ctx.db, a.userId, r.p.userId), guna, sharedValues, distanceKm: Math.round(dist / 10) * 10 });
    }
    // Deterministic order: shared values, then (if requested) Guna Milan, then distance.
    out.sort((x, y) => y.sharedValues - x.sharedValues || (q.kundli ? (y.guna ?? 0) - (x.guna ?? 0) : 0) || x.distanceKm - y.distanceKm || x.card.userId.localeCompare(y.card.userId));
    return { results: out.slice(0, 30), note: 'Guna Milan is shown as one traditional lens; it never filters people out unless you ask it to.' };
  });

  app.get('/api/v1/matchmaking/shortlist', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.mmShortlist).where(eq(s.mmShortlist.userId, a.userId)).orderBy(desc(s.mmShortlist.createdAt));
    return { shortlist: await Promise.all(rows.map(async (r) => ({ note: r.note, card: await profileCard(ctx.db, a.userId, r.targetId) }))) };
  });

  app.post('/api/v1/matchmaking/shortlist', async (req) => {
    const a = requireAuth(req);
    const { targetId, note, remove } = parse(z.object({ targetId: z.uuid(), note: z.string().max(300).default(''), remove: z.boolean().optional() }), req.body);
    if (remove) await ctx.db.delete(s.mmShortlist).where(and(eq(s.mmShortlist.userId, a.userId), eq(s.mmShortlist.targetId, targetId)));
    else {
      const [t] = await ctx.db.select().from(s.matchmakingProfiles).where(and(eq(s.matchmakingProfiles.userId, targetId), eq(s.matchmakingProfiles.active, true)));
      if (!t) throw notFound('Profile');
      await ctx.db.insert(s.mmShortlist).values({ userId: a.userId, targetId, note }).onConflictDoUpdate({ target: [s.mmShortlist.userId, s.mmShortlist.targetId], set: { note } });
    }
    return { ok: true };
  });

  app.post('/api/v1/matchmaking/connect', { config: { rateLimit: { max: 20, timeWindow: '1 day' } } }, async (req) => {
    const a = requireAuth(req);
    const { targetId, message, shareChart } = parse(z.object({ targetId: z.uuid(), message: z.string().max(500).default(''), shareChart: z.boolean().default(false) }), req.body);
    const [t] = await ctx.db.select().from(s.matchmakingProfiles).where(and(eq(s.matchmakingProfiles.userId, targetId), eq(s.matchmakingProfiles.active, true)));
    if (!t || (await isBlockedEitherWay(ctx.db, a.userId, targetId))) throw notFound('Profile');
    const existing = await ctx.db.select().from(s.mmConnections).where(or(and(eq(s.mmConnections.fromId, a.userId), eq(s.mmConnections.toId, targetId)), and(eq(s.mmConnections.fromId, targetId), eq(s.mmConnections.toId, a.userId))));
    if (existing.length) throw conflict('A connection request already exists between you.');
    const [c] = await ctx.db.insert(s.mmConnections).values({ fromId: a.userId, toId: targetId, message }).returning();
    if (shareChart) await ctx.db.insert(s.chartShareGrants).values({ grantorId: a.userId, granteeId: targetId, scope: 'chart', context: 'matchmaking', contextId: c.id });
    await notify(ctx, ctx.db, { userId: targetId, category: 'matchmaking', title: 'New matchmaking connection request', body: message.slice(0, 100), link: '/matchmaking/requests' });
    await track(ctx.db, a.userId, 'mm_connect_requested', { shareChart });
    return { connection: c };
  });

  app.get('/api/v1/matchmaking/connections', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.mmConnections).where(or(eq(s.mmConnections.fromId, a.userId), eq(s.mmConnections.toId, a.userId))).orderBy(desc(s.mmConnections.createdAt));
    return { connections: await Promise.all(rows.map(async (c) => ({ id: c.id, status: c.status, stage: c.stage, message: c.message, direction: c.fromId === a.userId ? 'outgoing' : 'incoming', conversationId: c.conversationId, createdAt: c.createdAt, card: await profileCard(ctx.db, a.userId, c.fromId === a.userId ? c.toId : c.fromId) }))) };
  });

  app.post('/api/v1/matchmaking/connections/:id/respond', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { accept, shareChart } = parse(z.object({ accept: z.boolean(), shareChart: z.boolean().default(false) }), req.body);
    const [c] = await ctx.db.select().from(s.mmConnections).where(and(eq(s.mmConnections.id, id), eq(s.mmConnections.toId, a.userId), eq(s.mmConnections.status, 'pending')));
    if (!c) throw notFound('Request');
    if (!accept) {
      await ctx.db.update(s.mmConnections).set({ status: 'declined', respondedAt: new Date() }).where(eq(s.mmConnections.id, id));
      await ctx.db.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(and(eq(s.chartShareGrants.contextId, id), isNull(s.chartShareGrants.revokedAt)));
      return { ok: true };
    }
    const convId = await ctx.db.transaction(async (tx) => {
      const conv = await createConversation(tx, 'matchmaking', a.userId, [c.fromId, c.toId], c.id);
      await postSystemMessage(tx, conv, 'You are connected. Take your time — involve family only when you both feel ready.');
      await tx.update(s.mmConnections).set({ status: 'accepted', respondedAt: new Date(), conversationId: conv }).where(eq(s.mmConnections.id, id));
      await tx.insert(s.mmStageHistory).values({ connectionId: id, stage: 'connected', changedBy: a.userId });
      if (shareChart) await tx.insert(s.chartShareGrants).values({ grantorId: a.userId, granteeId: c.fromId, scope: 'chart', context: 'matchmaking', contextId: id });
      return conv;
    });
    await notify(ctx, ctx.db, { userId: c.fromId, category: 'matchmaking', title: 'Your connection request was accepted', link: `/messages/${convId}` });
    return { ok: true, conversationId: convId };
  });

  app.post('/api/v1/matchmaking/connections/:id/share-chart', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { share } = parse(z.object({ share: z.boolean() }), req.body);
    const [c] = await ctx.db.select().from(s.mmConnections).where(and(eq(s.mmConnections.id, id), or(eq(s.mmConnections.fromId, a.userId), eq(s.mmConnections.toId, a.userId))));
    if (!c) throw notFound('Connection');
    const other = c.fromId === a.userId ? c.toId : c.fromId;
    await ctx.db.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(and(eq(s.chartShareGrants.contextId, id), eq(s.chartShareGrants.grantorId, a.userId), isNull(s.chartShareGrants.revokedAt)));
    if (share) await ctx.db.insert(s.chartShareGrants).values({ grantorId: a.userId, granteeId: other, scope: 'chart', context: 'matchmaking', contextId: id });
    return { ok: true };
  });

  /** Kundli matching report — only when both sides have shared their charts in this connection. */
  app.get('/api/v1/matchmaking/connections/:id/kundli', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [c] = await ctx.db.select().from(s.mmConnections).where(and(eq(s.mmConnections.id, id), eq(s.mmConnections.status, 'accepted'), or(eq(s.mmConnections.fromId, a.userId), eq(s.mmConnections.toId, a.userId))));
    if (!c) throw notFound('Connection');
    const grants = await ctx.db.select().from(s.chartShareGrants).where(and(eq(s.chartShareGrants.contextId, id), isNull(s.chartShareGrants.revokedAt)));
    if (!grants.some((g) => g.grantorId === c.fromId) || !grants.some((g) => g.grantorId === c.toId)) throw forbidden('Kundli matching is available after both of you choose to share your charts.');
    const profs = await ctx.db.select().from(s.matchmakingProfiles).where(inArray(s.matchmakingProfiles.userId, [c.fromId, c.toId]));
    const groomId = profs.find((p) => p.gender === 'man')?.userId ?? c.fromId;
    const brideId = groomId === c.fromId ? c.toId : c.fromId;
    const [gv, gw, bv, bw] = await Promise.all([currentChart(ctx.db, groomId, 'vedic_default'), currentChart(ctx.db, groomId, 'western_default'), currentChart(ctx.db, brideId, 'vedic_default'), currentChart(ctx.db, brideId, 'western_default')]);
    if (!gv || !gw || !bv || !bw) throw notFound('Chart');
    const names = await displayNames(ctx.db, [groomId, brideId]);
    const result = compatibility({ westernA: gw.result, westernB: bw.result, vedicA: gv.result, vedicB: bv.result, relationship: 'spouse', traditionalRoles: true, nameA: names.get(groomId)?.displayName, nameB: names.get(brideId)?.displayName });
    const [row] = await ctx.db.insert(s.compatibilityResults).values({ userA: groomId, userB: brideId, method: result.version, engineVersion: gv.result.engineVersion, result: result as unknown as Record<string, unknown> }).returning();
    await ctx.db.update(s.mmConnections).set({ compatibilityId: row.id }).where(eq(s.mmConnections.id, id));
    return { compatibilityId: row.id, result, manglik: { groom: manglik(gv.result), bride: manglik(bv.result) }, roles: { groom: names.get(groomId)?.displayName, bride: names.get(brideId)?.displayName }, expertReferral: { path: '/experts?specialization=vedic', note: 'For a fuller reading of both charts, you can consult a verified Vedic astrologer.' } };
  });

  app.post('/api/v1/matchmaking/connections/:id/stage', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { stage } = parse(z.object({ stage: z.enum(STAGES) }), req.body);
    const [c] = await ctx.db.select().from(s.mmConnections).where(and(eq(s.mmConnections.id, id), eq(s.mmConnections.status, 'accepted'), or(eq(s.mmConnections.fromId, a.userId), eq(s.mmConnections.toId, a.userId))));
    if (!c) throw notFound('Connection');
    if (STAGES.indexOf(stage) < STAGES.indexOf(c.stage as never) && stage !== 'closed') throw badRequest('Stages move forward; choose “closed” to end the connection.');
    await ctx.db.update(s.mmConnections).set({ stage }).where(eq(s.mmConnections.id, id));
    await ctx.db.insert(s.mmStageHistory).values({ connectionId: id, stage, changedBy: a.userId });
    const other = c.fromId === a.userId ? c.toId : c.fromId;
    await notify(ctx, ctx.db, { userId: other, category: 'matchmaking', title: `Connection stage updated: ${stage.replace('_', ' ')}`, link: '/matchmaking' });
    if (stage === 'engaged') return { ok: true, next: { path: '/weddings/new', label: 'Start planning your wedding together' } };
    return { ok: true };
  });

  /* ---------- Family Bridge ---------- */
  app.get('/api/v1/family', async (req) => {
    const a = requireAuth(req);
    const mine = await ctx.db.select().from(s.familyMembers).where(eq(s.familyMembers.principalId, a.userId)).orderBy(desc(s.familyMembers.createdAt));
    const asMember = await ctx.db.select().from(s.familyMembers).where(and(eq(s.familyMembers.memberUserId, a.userId), eq(s.familyMembers.status, 'active')));
    const names = await displayNames(ctx.db, [...mine.map((m) => m.memberUserId).filter(Boolean) as string[], ...asMember.map((m) => m.principalId)]);
    return {
      members: mine.map((m) => ({ id: m.id, relation: m.relation, permissions: m.permissions, status: m.status, inviteEmail: m.inviteEmail, member: m.memberUserId ? names.get(m.memberUserId) : null })),
      supporting: asMember.map((m) => ({ id: m.id, principalId: m.principalId, principal: names.get(m.principalId), relation: m.relation, permissions: m.permissions })),
      permissionsAvailable: FAMILY_PERMISSIONS,
    };
  });

  app.post('/api/v1/family/invite', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ email: z.email(), relation: z.string().trim().min(2).max(30), permissions: z.array(z.enum(FAMILY_PERMISSIONS)).min(1) }), req.body);
    const token = randomToken(18);
    const [f] = await ctx.db.insert(s.familyMembers).values({ principalId: a.userId, inviteEmail: body.email.toLowerCase(), tokenHash: sha256(token), relation: body.relation, permissions: body.permissions }).returning();
    const names = await displayNames(ctx.db, [a.userId]);
    await sendEmail(ctx, ctx.db, body.email, `${names.get(a.userId)?.displayName} invited you to Nakshatra Family Bridge`, `You have been invited as ${body.relation}.\nYou will be able to: ${body.permissions.join(', ')}.\nYou will never see private messages or dating activity.\n\nAccept: ${ctx.config.APP_ORIGIN}/family/accept/${token}`);
    await audit(ctx.db, { actorId: a.userId, action: 'family.invite', targetType: 'family_member', targetId: f.id, meta: { permissions: body.permissions } });
    return { invitation: { id: f.id }, acceptUrl: `${ctx.config.APP_ORIGIN}/family/accept/${token}` };
  });

  app.post('/api/v1/family/accept', async (req) => {
    const a = requireAuth(req);
    const { token } = parse(z.object({ token: z.string().min(10) }), req.body);
    const [f] = await ctx.db.select().from(s.familyMembers).where(and(eq(s.familyMembers.tokenHash, sha256(token)), eq(s.familyMembers.status, 'invited')));
    if (!f || f.principalId === a.userId) throw notFound('Invitation');
    if (f.inviteEmail !== a.email.toLowerCase()) throw forbidden('This invitation was sent to a different email address.');
    await ctx.db.update(s.familyMembers).set({ status: 'active', memberUserId: a.userId, acceptedAt: new Date() }).where(eq(s.familyMembers.id, f.id));
    await notify(ctx, ctx.db, { userId: f.principalId, category: 'matchmaking', title: 'A family member joined your Family Bridge', link: '/matchmaking/family' });
    return { ok: true, principalId: f.principalId };
  });

  app.patch('/api/v1/family/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ permissions: z.array(z.enum(FAMILY_PERMISSIONS)).optional(), revoke: z.boolean().optional() }), req.body);
    const [f] = await ctx.db.update(s.familyMembers).set({ ...(body.permissions ? { permissions: body.permissions } : {}), ...(body.revoke ? { status: 'revoked', revokedAt: new Date() } : {}) })
      .where(and(eq(s.familyMembers.id, id), eq(s.familyMembers.principalId, a.userId))).returning();
    if (!f) throw notFound('Family member');
    await audit(ctx.db, { actorId: a.userId, action: body.revoke ? 'family.revoke' : 'family.permissions', targetType: 'family_member', targetId: id, meta: { permissions: body.permissions } });
    return { ok: true };
  });

  /** Family view of a principal — scoped strictly to granted permissions. */
  app.get('/api/v1/family/view/:principalId', async (req) => {
    const a = requireAuth(req);
    const { principalId } = parse(z.object({ principalId: z.uuid() }), req.params);
    const [f] = await ctx.db.select().from(s.familyMembers).where(and(eq(s.familyMembers.memberUserId, a.userId), eq(s.familyMembers.principalId, principalId), eq(s.familyMembers.status, 'active')));
    if (!f) throw notFound('Profile');
    const out: Record<string, unknown> = { relation: f.relation, permissions: f.permissions };
    if (f.permissions.includes('view_profile')) {
      const [p] = await ctx.db.select().from(s.matchmakingProfiles).where(eq(s.matchmakingProfiles.userId, principalId));
      out.profile = p ? { about: p.about, education: p.education, profession: p.profession, city: p.city, values: p.values } : null;
    }
    if (f.permissions.includes('view_shortlist')) {
      const rows = await ctx.db.select().from(s.mmShortlist).where(eq(s.mmShortlist.userId, principalId));
      out.shortlist = await Promise.all(rows.map(async (r) => {
        const card = await profileCard(ctx.db, principalId, r.targetId);
        return { userId: card.userId, displayName: card.displayName, age: card.age, city: card.city, profession: card.profession, education: card.education };
      }));
    }
    if (f.permissions.includes('view_shared_reports')) {
      const shares = await ctx.db.select().from(s.reportShares).where(and(eq(s.reportShares.ownerId, principalId), eq(s.reportShares.granteeId, a.userId), isNull(s.reportShares.revokedAt)));
      out.sharedReports = shares.map((x) => ({ id: x.id, createdAt: x.createdAt }));
    }
    return out;
  });

  app.post('/api/v1/family/view/:principalId/suggest', async (req) => {
    const a = requireAuth(req);
    const { principalId } = parse(z.object({ principalId: z.uuid() }), req.params);
    const { targetId, note } = parse(z.object({ targetId: z.uuid(), note: z.string().max(300).default('') }), req.body);
    const f = await familyAccess(ctx.db, a.userId, principalId, 'suggest_profiles');
    await ctx.db.insert(s.familySuggestions).values({ familyMemberId: f.id, principalId, targetId, note });
    await notify(ctx, ctx.db, { userId: principalId, category: 'matchmaking', title: `Your ${f.relation} suggested a profile`, body: note, link: '/matchmaking/family' });
    return { ok: true };
  });

  app.post('/api/v1/family/share-report', async (req) => {
    const a = requireAuth(req);
    const { compatibilityId, familyMemberId } = parse(z.object({ compatibilityId: z.uuid(), familyMemberId: z.uuid() }), req.body);
    const [f] = await ctx.db.select().from(s.familyMembers).where(and(eq(s.familyMembers.id, familyMemberId), eq(s.familyMembers.principalId, a.userId), eq(s.familyMembers.status, 'active')));
    if (!f?.memberUserId || !f.permissions.includes('view_shared_reports')) throw badRequest('This family member does not have permission to view shared reports.');
    const [cr] = await ctx.db.select().from(s.compatibilityResults).where(and(eq(s.compatibilityResults.id, compatibilityId), or(eq(s.compatibilityResults.userA, a.userId), eq(s.compatibilityResults.userB, a.userId))));
    if (!cr) throw notFound('Report');
    const [row] = await ctx.db.insert(s.reportShares).values({ compatibilityId, ownerId: a.userId, shareType: 'user', granteeId: f.memberUserId, detail: 'summary' }).returning();
    await notify(ctx, ctx.db, { userId: f.memberUserId, category: 'matchmaking', title: 'A compatibility summary was shared with you', link: `/shared-report/${row.id}` });
    return { share: row };
  });

  app.get('/api/v1/family/suggestions', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.familySuggestions).where(eq(s.familySuggestions.principalId, a.userId)).orderBy(desc(s.familySuggestions.createdAt));
    return { suggestions: await Promise.all(rows.map(async (r) => ({ id: r.id, note: r.note, card: await profileCard(ctx.db, a.userId, r.targetId) }))) };
  });
}
