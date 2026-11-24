import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { randomToken, sha256 } from '../lib/crypto';
import { notify } from '../lib/notify';
import { awardXp, evaluateAchievements } from '../lib/rewards';
import { placeById, timezoneFor } from '../lib/geo';
import {
  DEFAULT_VEDIC_CONFIG, DEFAULT_WESTERN_CONFIG, buildChart, compatibility, compositeChart, normalizeBirth, transitsToNatal,
  type ChartResult, type RelationshipKind,
} from '../../astro';
import { bigThreeFrom, birthInputOf, currentChart, displayNames, grantedScope, isBlockedEitherWay, relationOf } from '../services/identity';

export const BOND_KINDS = ['friend', 'romantic', 'dating', 'partner', 'spouse', 'sibling', 'parent_child', 'family', 'colleague', 'business', 'custom'] as const;
const Scope = z.enum(['big_three', 'chart']);

const CONVERSATION_PROMPTS: Record<string, string[]> = {
  emotional: ['What helps you feel cared for after a long day?', 'Which small gesture from me means the most to you?'],
  communication: ['How do you prefer to talk through disagreements — right away or after some space?', 'What topic could we talk about for hours?'],
  attraction: ['What was your first impression of me?', 'What does a perfect day together look like for you?'],
  stability: ['What does commitment look like in everyday life for you?', 'Which shared routine would you like us to keep?'],
  growth: ['What is one thing you want to learn this year?', 'How can I support a goal you’re working on?'],
};

type BondRow = typeof s.bonds.$inferSelect;

async function loadBondFor(db: Executor, id: string, userId: string): Promise<{ bond: BondRow; role: 'owner' | 'partner' }> {
  const [bond] = await db.select().from(s.bonds).where(and(eq(s.bonds.id, id), isNull(s.bonds.deletedAt)));
  if (!bond) throw notFound('Bond');
  if (bond.ownerId === userId) return { bond, role: 'owner' };
  if (bond.partnerUserId === userId && bond.status === 'active') return { bond, role: 'partner' };
  throw notFound('Bond');
}

/** Charts for both sides of a bond, respecting consent. Returns null for a side whose data is not permitted. */
async function chartsForBond(ctx: Ctx, bond: BondRow, viewerId: string) {
  const otherId = bond.ownerId === viewerId ? bond.partnerUserId : bond.ownerId;
  const mineW = await currentChart(ctx.db, viewerId, 'western_default');
  const mineV = await currentChart(ctx.db, viewerId, 'vedic_default');
  let otherW: ChartResult | null = null;
  let otherV: ChartResult | null = null;
  let scope: string = 'none';
  let otherLabel = bond.partnerLabel;
  if (bond.privateBirthProfileId && bond.ownerId === viewerId) {
    const [bp] = await ctx.db.select().from(s.birthProfiles).where(and(eq(s.birthProfiles.id, bond.privateBirthProfileId), eq(s.birthProfiles.userId, viewerId)));
    if (bp) {
      otherW = buildChart(birthInputOf(bp), DEFAULT_WESTERN_CONFIG);
      otherV = buildChart(birthInputOf(bp), DEFAULT_VEDIC_CONFIG);
      scope = 'chart';
    }
  } else if (otherId && bond.status === 'active') {
    scope = await grantedScope(ctx.db, otherId, viewerId);
    const names = await displayNames(ctx.db, [otherId]);
    otherLabel = names.get(otherId)?.displayName ?? otherLabel;
    if (scope === 'chart' || scope === 'birth_details' || scope === 'big_three') {
      otherW = (await currentChart(ctx.db, otherId, 'western_default'))?.result ?? null;
      otherV = (await currentChart(ctx.db, otherId, 'vedic_default'))?.result ?? null;
    }
  }
  return { mineW: mineW?.result ?? null, mineV: mineV?.result ?? null, otherW, otherV, scope, otherId, otherLabel };
}

export async function bondRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/bonds', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.bonds).where(and(isNull(s.bonds.deletedAt), or(eq(s.bonds.ownerId, a.userId), and(eq(s.bonds.partnerUserId, a.userId), eq(s.bonds.status, 'active')))))
      .orderBy(desc(s.bonds.updatedAt));
    const names = await displayNames(ctx.db, rows.flatMap((r) => [r.ownerId, r.partnerUserId].filter(Boolean) as string[]));
    const invites = await ctx.db.select().from(s.bondInvitations).where(and(eq(s.bondInvitations.inviteeUserId, a.userId), eq(s.bondInvitations.status, 'pending')));
    const inviteBonds = invites.length ? await ctx.db.select().from(s.bonds).where(inArray(s.bonds.id, invites.map((i) => i.bondId))) : [];
    const inviterNames = await displayNames(ctx.db, invites.map((i) => i.inviterId));
    return {
      bonds: rows.map((b) => {
        const otherId = b.ownerId === a.userId ? b.partnerUserId : b.ownerId;
        const other = otherId ? names.get(otherId) : null;
        return { id: b.id, kind: b.kind, customLabel: b.customLabel, status: b.status, role: b.ownerId === a.userId ? 'owner' : 'partner', visibility: b.visibility,
          partner: other ? { userId: otherId, handle: other.handle, displayName: other.displayName, avatarUrl: other.avatarUrl } : { displayName: b.partnerLabel, external: true },
          gunaRoles: b.gunaRoles, createdAt: b.createdAt };
      }),
      invitations: invites.map((i) => {
        const b = inviteBonds.find((x) => x.id === i.bondId);
        return { id: i.id, bondId: i.bondId, kind: b?.kind, message: i.message, requestedScope: i.requestedScope, inviter: inviterNames.get(i.inviterId), expiresAt: i.expiresAt };
      }),
    };
  });

  /** Creates a Bond. Either invites an existing user (consent-based) or stores a private bond with self-entered birth data. */
  app.post('/api/v1/bonds', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({
      kind: z.enum(BOND_KINDS), customLabel: z.string().max(40).optional(),
      invite: z.object({ handle: z.string().optional(), createLink: z.boolean().optional(), shareScope: Scope.default('chart'), requestScope: Scope.default('chart'), message: z.string().max(280).default('') }).optional(),
      private: z.object({
        label: z.string().trim().min(1).max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
        timePrecision: z.enum(['exact', 'within_15m', 'within_1h', 'unknown']), placeId: z.string().optional(),
        manual: z.object({ name: z.string(), latitude: z.number(), longitude: z.number() }).optional(),
        consentConfirmed: z.literal(true, { message: 'Confirm you have this person’s permission to use their birth details.' }),
      }).optional(),
    }).refine((b) => Boolean(b.invite) !== Boolean(b.private), { message: 'Choose either an invitation or a private bond.' }), req.body);

    if (body.private) {
      const p = body.private;
      const place = p.placeId ? placeById(p.placeId) : null;
      const lat = place?.latitude ?? p.manual?.latitude;
      const lon = place?.longitude ?? p.manual?.longitude;
      if (lat === undefined || lon === undefined) throw badRequest('Choose a birthplace.');
      const tz = place?.timezone ?? timezoneFor(lat, lon);
      const n = normalizeBirth({ date: p.date, time: p.time, timePrecision: p.timePrecision, latitude: lat, longitude: lon, timezone: tz });
      const bond = await ctx.db.transaction(async (tx) => {
        const [bp] = await tx.insert(s.birthProfiles).values({
          userId: a.userId, label: p.label, isPrimary: false, isThirdParty: true, birthDate: p.date, birthTime: p.time, timePrecision: p.timePrecision,
          placeName: place?.label ?? p.manual!.name, countryCode: place?.countryCode ?? null, latitude: lat, longitude: lon, timezone: tz,
          utcOffsetMinutes: n.utcOffsetMinutes, birthUtc: n.utc, locationSource: place ? 'geonames' : 'manual',
        }).returning();
        const [b] = await tx.insert(s.bonds).values({ ownerId: a.userId, privateBirthProfileId: bp.id, partnerLabel: p.label, kind: body.kind, customLabel: body.customLabel, status: 'private' }).returning();
        await awardXp(ctx, tx, a.userId, 'bond_created', { sourceId: b.id });
        await evaluateAchievements(ctx, tx, a.userId, ['bonds']);
        await track(tx, a.userId, 'bond_created', { kind: body.kind, private: true });
        return b;
      });
      return { bond };
    }

    const inv = body.invite!;
    let invitee: { userId: string; displayName: string } | null = null;
    if (inv.handle) {
      const [p] = await ctx.db.select().from(s.profiles).innerJoin(s.users, eq(s.users.id, s.profiles.userId))
        .where(and(sql`lower(${s.profiles.handle}) = ${inv.handle.toLowerCase().replace(/^@/, '')}`, eq(s.users.status, 'active')));
      if (!p || p.profiles.userId === a.userId) throw notFound('User');
      if (await isBlockedEitherWay(ctx.db, a.userId, p.profiles.userId)) throw notFound('User');
      invitee = { userId: p.profiles.userId, displayName: p.profiles.displayName };
      const dup = await ctx.db.select().from(s.bonds).where(and(eq(s.bonds.ownerId, a.userId), eq(s.bonds.partnerUserId, p.profiles.userId), isNull(s.bonds.deletedAt), inArray(s.bonds.status, ['pending', 'active'])));
      if (dup.length) throw conflict('You already have a Bond with this person.');
    } else if (!inv.createLink) {
      throw badRequest('Choose someone to invite or create an invitation link.');
    }
    const token = randomToken(18);
    const result = await ctx.db.transaction(async (tx) => {
      const [b] = await tx.insert(s.bonds).values({ ownerId: a.userId, partnerUserId: null, partnerLabel: invitee?.displayName ?? 'Invited friend', kind: body.kind, customLabel: body.customLabel, status: 'pending' }).returning();
      const [i] = await tx.insert(s.bondInvitations).values({
        bondId: b.id, inviterId: a.userId, inviteeUserId: invitee?.userId ?? null, tokenHash: sha256(token), requestedScope: inv.requestScope,
        message: inv.message, expiresAt: new Date(Date.now() + 14 * 86400000),
      }).returning();
      // The inviter's own consent to share is recorded now; it becomes visible only once accepted.
      await tx.insert(s.chartShareGrants).values({ grantorId: a.userId, granteeId: invitee?.userId ?? a.userId, scope: inv.shareScope, context: 'bond', contextId: b.id, revokedAt: invitee ? null : new Date() });
      if (invitee) {
        const names = await displayNames(tx, [a.userId]);
        await notify(ctx, tx, { userId: invitee.userId, category: 'bonds', title: `${names.get(a.userId)?.displayName} invited you to a Bond`, body: inv.message || 'Compare charts and explore your connection — only if you choose to.', link: '/bonds', dedupeKey: `bond_invite:${i.id}` });
      }
      await awardXp(ctx, tx, a.userId, 'bond_created', { sourceId: b.id });
      await evaluateAchievements(ctx, tx, a.userId, ['bonds']);
      await track(tx, a.userId, 'bond_created', { kind: body.kind, private: false });
      await track(tx, a.userId, 'bond_invitation_sent', { viaLink: !invitee });
      return { bond: b, invitation: i };
    });
    return { bond: result.bond, invitationId: result.invitation.id, inviteUrl: `${ctx.config.APP_ORIGIN}/bonds/invite/${token}` };
  });

  app.get('/api/v1/bonds/invitations/by-token/:token', async (req) => {
    const a = requireAuth(req);
    const { token } = parse(z.object({ token: z.string().min(10) }), req.params);
    const [i] = await ctx.db.select().from(s.bondInvitations).where(and(eq(s.bondInvitations.tokenHash, sha256(token)), eq(s.bondInvitations.status, 'pending')));
    if (!i || i.expiresAt < new Date() || (i.inviteeUserId && i.inviteeUserId !== a.userId) || i.inviterId === a.userId) throw notFound('Invitation');
    const [b] = await ctx.db.select().from(s.bonds).where(eq(s.bonds.id, i.bondId));
    const names = await displayNames(ctx.db, [i.inviterId]);
    return { invitation: { id: i.id, kind: b.kind, message: i.message, requestedScope: i.requestedScope, inviter: names.get(i.inviterId) } };
  });

  app.post('/api/v1/bonds/invitations/:id/respond', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ accept: z.boolean(), shareScope: Scope.default('chart'), token: z.string().optional() }), req.body);
    const [i] = await ctx.db.select().from(s.bondInvitations).where(and(eq(s.bondInvitations.id, id), eq(s.bondInvitations.status, 'pending')));
    const addressed = i && (i.inviteeUserId === a.userId || (!i.inviteeUserId && body.token && sha256(body.token) === i.tokenHash));
    if (!i || !addressed || i.inviterId === a.userId) throw notFound('Invitation');
    if (i.expiresAt < new Date()) {
      await ctx.db.update(s.bondInvitations).set({ status: 'expired' }).where(eq(s.bondInvitations.id, i.id));
      throw badRequest('This invitation has expired.');
    }
    if (await isBlockedEitherWay(ctx.db, a.userId, i.inviterId)) throw notFound('Invitation');
    if (!body.accept) {
      await ctx.db.update(s.bondInvitations).set({ status: 'declined', respondedAt: new Date() }).where(eq(s.bondInvitations.id, i.id));
      await ctx.db.update(s.bonds).set({ status: 'revoked', updatedAt: new Date() }).where(eq(s.bonds.id, i.bondId));
      return { ok: true, status: 'declined' };
    }
    if (!(await currentChart(ctx.db, a.userId, 'vedic_default'))) throw badRequest('Complete your Cosmic ID (birth details) before accepting a Bond.');
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.bondInvitations).set({ status: 'accepted', respondedAt: new Date(), inviteeUserId: a.userId }).where(eq(s.bondInvitations.id, i.id));
      await tx.update(s.bonds).set({ status: 'active', partnerUserId: a.userId, updatedAt: new Date() }).where(eq(s.bonds.id, i.bondId));
      // Activate the inviter's grant toward the acceptor, and record the acceptor's own grant.
      await tx.update(s.chartShareGrants).set({ granteeId: a.userId, revokedAt: null }).where(and(eq(s.chartShareGrants.contextId, i.bondId), eq(s.chartShareGrants.grantorId, i.inviterId)));
      await tx.insert(s.chartShareGrants).values({ grantorId: a.userId, granteeId: i.inviterId, scope: body.shareScope, context: 'bond', contextId: i.bondId });
      const names = await displayNames(tx, [a.userId]);
      await notify(ctx, tx, { userId: i.inviterId, category: 'bonds', title: `${names.get(a.userId)?.displayName} accepted your Bond`, body: 'Your compatibility view is ready.', link: `/bonds/${i.bondId}`, dedupeKey: `bond_accept:${i.id}` });
      for (const uid of [a.userId, i.inviterId]) {
        await awardXp(ctx, tx, uid, 'bond_accepted', { sourceId: i.bondId });
        await evaluateAchievements(ctx, tx, uid, ['mutual_bonds', 'bonds']);
      }
      await track(tx, a.userId, 'invitation_accepted', { scope: body.shareScope });
    });
    return { ok: true, status: 'accepted', bondId: i.bondId };
  });

  app.get('/api/v1/bonds/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { bond, role } = await loadBondFor(ctx.db, id, a.userId);
    const c = await chartsForBond(ctx, bond, a.userId);
    const notes = await ctx.db.select().from(s.bondNotes).where(and(eq(s.bondNotes.bondId, id), eq(s.bondNotes.authorId, a.userId))).orderBy(desc(s.bondNotes.createdAt));
    const milestones = bond.status === 'active' || role === 'owner' ? await ctx.db.select().from(s.bondMilestones).where(eq(s.bondMilestones.bondId, id)).orderBy(desc(s.bondMilestones.eventDate)) : [];
    const myScope = c.otherId ? await grantedScope(ctx.db, a.userId, c.otherId) : 'none';
    const otherBig = c.otherW && c.otherV ? bigThreeFrom(c.otherW, c.otherV) : null;
    const myBig = c.mineW && c.mineV ? bigThreeFrom(c.mineW, c.mineV) : null;
    return {
      bond: { id: bond.id, kind: bond.kind, customLabel: bond.customLabel, status: bond.status, role, visibility: bond.visibility, gunaRoles: bond.gunaRoles, partnerLabel: c.otherLabel, isPrivate: Boolean(bond.privateBirthProfileId), createdAt: bond.createdAt },
      access: { partnerSharedScope: c.scope, youShareScope: myScope },
      comparison: { me: myBig, partner: otherBig },
      notes, milestones,
      conversationPrompts: Object.values(CONVERSATION_PROMPTS).flat().slice(0, 6),
    };
  });

  app.get('/api/v1/bonds/:id/compatibility', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { bond } = await loadBondFor(ctx.db, id, a.userId);
    const c = await chartsForBond(ctx, bond, a.userId);
    if (!c.mineW || !c.mineV) throw badRequest('Complete your Cosmic ID first.');
    if (!c.otherW || !c.otherV || !(c.scope === 'chart' || c.scope === 'birth_details')) {
      throw forbidden(c.scope === 'big_three' ? 'Your partner shared only their Sun, Moon and Rising signs; full compatibility needs chart sharing.' : 'Compatibility is available once both people have shared their charts.');
    }
    const ownerIsA = bond.ownerId === a.userId;
    const groomIsMe = bond.gunaRoles === 'owner_groom' ? ownerIsA : bond.gunaRoles === 'owner_bride' ? !ownerIsA : true;
    const [A_w, A_v, B_w, B_v, nameA, nameB] = groomIsMe
      ? [c.mineW, c.mineV, c.otherW, c.otherV, 'You', c.otherLabel]
      : [c.otherW, c.otherV, c.mineW, c.mineV, c.otherLabel, 'You'];
    const result = compatibility({ westernA: A_w, westernB: B_w, vedicA: A_v, vedicB: B_v, relationship: bond.kind as RelationshipKind, traditionalRoles: bond.gunaRoles !== 'none', nameA, nameB });
    const [row] = await ctx.db.insert(s.compatibilityResults).values({ bondId: bond.id, userA: a.userId, userB: c.otherId, method: result.version, engineVersion: A_w.engineVersion, result: result as unknown as Record<string, unknown> }).returning({ id: s.compatibilityResults.id });
    await track(ctx.db, a.userId, 'compatibility_viewed', { kind: bond.kind });
    const prompts = result.western.slice().sort((x, y) => x.score - y.score).slice(0, 2).flatMap((d) => CONVERSATION_PROMPTS[d.key] ?? []);
    return {
      compatibilityId: row.id, result, composite: compositeChart(c.mineW, c.otherW), conversationPrompts: prompts,
      transitsNow: transitsToNatal(c.otherW, new Date()).aspects.filter((x) => ['sun', 'moon', 'venus'].includes(String(x.b))).slice(0, 5),
    };
  });

  app.patch('/api/v1/bonds/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ kind: z.enum(BOND_KINDS).optional(), customLabel: z.string().max(40).nullable().optional(), visibility: z.enum(['private', 'connections']).optional(), gunaRoles: z.enum(['none', 'owner_groom', 'owner_bride']).optional() }), req.body);
    const { bond, role } = await loadBondFor(ctx.db, id, a.userId);
    if (role !== 'owner' && (body.kind || body.customLabel !== undefined)) throw forbidden('Only the person who created this Bond can change its type.');
    const [row] = await ctx.db.update(s.bonds).set({ ...body, updatedAt: new Date() }).where(eq(s.bonds.id, bond.id)).returning();
    return { bond: row };
  });

  /** Changes what the caller shares with the partner, or revokes the bond entirely. */
  app.post('/api/v1/bonds/:id/sharing', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { scope } = parse(z.object({ scope: z.enum(['none', 'big_three', 'chart']) }), req.body);
    const { bond } = await loadBondFor(ctx.db, id, a.userId);
    const otherId = bond.ownerId === a.userId ? bond.partnerUserId : bond.ownerId;
    if (!otherId) throw badRequest('This Bond has no partner on Nakshatra.');
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(and(eq(s.chartShareGrants.contextId, bond.id), eq(s.chartShareGrants.grantorId, a.userId), isNull(s.chartShareGrants.revokedAt)));
      if (scope !== 'none') await tx.insert(s.chartShareGrants).values({ grantorId: a.userId, granteeId: otherId, scope, context: 'bond', contextId: bond.id });
      await audit(tx, { actorId: a.userId, action: 'bond.sharing_changed', targetType: 'bond', targetId: bond.id, meta: { scope } });
    });
    return { ok: true, scope };
  });

  app.post('/api/v1/bonds/:id/revoke', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { bond } = await loadBondFor(ctx.db, id, a.userId);
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(and(eq(s.chartShareGrants.contextId, bond.id), isNull(s.chartShareGrants.revokedAt)));
      await tx.update(s.bonds).set({ status: bond.privateBirthProfileId ? 'private' : 'revoked', updatedAt: new Date() }).where(eq(s.bonds.id, bond.id));
      await tx.update(s.reportShares).set({ revokedAt: new Date() }).where(and(isNull(s.reportShares.revokedAt), sql`${s.reportShares.compatibilityId} in (select id from compatibility_results where bond_id = ${bond.id})`));
      await audit(tx, { actorId: a.userId, action: 'bond.revoke', targetType: 'bond', targetId: bond.id });
    });
    return { ok: true };
  });

  app.delete('/api/v1/bonds/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [bond] = await ctx.db.select().from(s.bonds).where(and(eq(s.bonds.id, id), eq(s.bonds.ownerId, a.userId), isNull(s.bonds.deletedAt)));
    if (!bond) throw notFound('Bond');
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.chartShareGrants).set({ revokedAt: new Date() }).where(eq(s.chartShareGrants.contextId, bond.id));
      await tx.update(s.bonds).set({ deletedAt: new Date(), status: 'revoked' }).where(eq(s.bonds.id, bond.id));
      await tx.delete(s.compatibilityResults).where(eq(s.compatibilityResults.bondId, bond.id));
      if (bond.privateBirthProfileId) await tx.delete(s.birthProfiles).where(and(eq(s.birthProfiles.id, bond.privateBirthProfileId), eq(s.birthProfiles.isThirdParty, true)));
      await audit(tx, { actorId: a.userId, action: 'bond.delete', targetType: 'bond', targetId: bond.id });
    });
    return { ok: true };
  });

  app.post('/api/v1/bonds/:id/notes', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
    await loadBondFor(ctx.db, id, a.userId);
    const [n] = await ctx.db.insert(s.bondNotes).values({ bondId: id, authorId: a.userId, body }).returning();
    return { note: n };
  });

  app.delete('/api/v1/bonds/:id/notes/:noteId', async (req) => {
    const a = requireAuth(req);
    const { id, noteId } = parse(z.object({ id: z.uuid(), noteId: z.uuid() }), req.params);
    const res = await ctx.db.delete(s.bondNotes).where(and(eq(s.bondNotes.id, noteId), eq(s.bondNotes.bondId, id), eq(s.bondNotes.authorId, a.userId))).returning();
    if (!res.length) throw notFound('Note');
    return { ok: true };
  });

  app.post('/api/v1/bonds/:id/milestones', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ title: z.string().trim().min(1).max(120), eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
    const { bond } = await loadBondFor(ctx.db, id, a.userId);
    const [m] = await ctx.db.insert(s.bondMilestones).values({ bondId: id, authorId: a.userId, ...body }).returning();
    const otherId = bond.ownerId === a.userId ? bond.partnerUserId : bond.ownerId;
    if (otherId && bond.status === 'active') await notify(ctx, ctx.db, { userId: otherId, category: 'bonds', title: 'A shared milestone was added', body: body.title, link: `/bonds/${id}` });
    return { milestone: m };
  });

  app.post('/api/v1/bonds/:id/share-report', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ compatibilityId: z.uuid(), to: z.union([z.object({ handle: z.string() }), z.object({ link: z.literal(true) })]), detail: z.enum(['summary', 'full']).default('summary') }), req.body);
    await loadBondFor(ctx.db, id, a.userId);
    const [cr] = await ctx.db.select().from(s.compatibilityResults).where(and(eq(s.compatibilityResults.id, body.compatibilityId), eq(s.compatibilityResults.bondId, id), eq(s.compatibilityResults.userA, a.userId)));
    if (!cr) throw notFound('Report');
    if ('handle' in body.to) {
      const [p] = await ctx.db.select().from(s.profiles).where(sql`lower(${s.profiles.handle}) = ${body.to.handle.toLowerCase().replace(/^@/, '')}`);
      if (!p || (await relationOf(ctx.db, a.userId, p.userId)) !== 'connection') throw badRequest('You can share reports only with your connections.');
      const [row] = await ctx.db.insert(s.reportShares).values({ compatibilityId: cr.id, ownerId: a.userId, shareType: 'user', granteeId: p.userId, detail: body.detail }).returning();
      await notify(ctx, ctx.db, { userId: p.userId, category: 'bonds', title: 'A compatibility report was shared with you', link: `/shared-report/${row.id}` });
      return { share: row };
    }
    const token = randomToken(18);
    const [row] = await ctx.db.insert(s.reportShares).values({ compatibilityId: cr.id, ownerId: a.userId, shareType: 'link', tokenHash: sha256(token), detail: 'summary' }).returning();
    await track(ctx.db, a.userId, 'profile_shared', { what: 'compatibility' });
    return { share: row, url: `${ctx.config.APP_ORIGIN}/shared-report/link/${token}` };
  });

  app.delete('/api/v1/report-shares/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const res = await ctx.db.update(s.reportShares).set({ revokedAt: new Date() }).where(and(eq(s.reportShares.id, id), eq(s.reportShares.ownerId, a.userId))).returning();
    if (!res.length) throw notFound('Share');
    return { ok: true };
  });

  const summarise = (result: Record<string, unknown>, detail: string) => {
    const r = result as unknown as ReturnType<typeof compatibility>;
    return {
      relationship: r.relationship,
      dimensions: r.western.map((d) => ({ label: d.label, score: d.score, ...(detail === 'full' ? { factors: d.factors } : {}) })),
      gunaMilan: r.vedic.gunaMilan ? { total: r.vedic.gunaMilan.total, max: 36, band: r.vedic.gunaMilan.band } : null,
      limitations: r.limitations,
    };
  };

  app.get('/api/v1/shared-reports/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [sh] = await ctx.db.select().from(s.reportShares).where(and(eq(s.reportShares.id, id), isNull(s.reportShares.revokedAt), or(eq(s.reportShares.granteeId, a.userId), eq(s.reportShares.ownerId, a.userId))));
    if (!sh) throw notFound('Report');
    const [cr] = await ctx.db.select().from(s.compatibilityResults).where(eq(s.compatibilityResults.id, sh.compatibilityId));
    return { report: summarise(cr.result as Record<string, unknown>, sh.detail) };
  });

  app.get('/api/v1/shared-reports/link/:token', async (req) => {
    const { token } = parse(z.object({ token: z.string().min(10) }), req.params);
    const [sh] = await ctx.db.select().from(s.reportShares).where(and(eq(s.reportShares.tokenHash, sha256(token)), isNull(s.reportShares.revokedAt)));
    if (!sh) throw notFound('Report');
    const [cr] = await ctx.db.select().from(s.compatibilityResults).where(eq(s.compatibilityResults.id, sh.compatibilityId));
    return { report: summarise(cr.result as Record<string, unknown>, 'summary') };
  });

  /** Permission-aware relationship graph for the 3D constellation. */
  app.get('/api/v1/bonds/graph', async (req) => {
    const a = requireAuth(req);
    const mine = await ctx.db.select().from(s.bonds).where(and(isNull(s.bonds.deletedAt), or(eq(s.bonds.ownerId, a.userId), and(eq(s.bonds.partnerUserId, a.userId), eq(s.bonds.status, 'active')))));
    const partnerIds = [...new Set(mine.map((b) => (b.ownerId === a.userId ? b.partnerUserId : b.ownerId)).filter(Boolean) as string[])];
    const names = await displayNames(ctx.db, [a.userId, ...partnerIds]);
    const nodes = [{ id: a.userId, label: names.get(a.userId)?.displayName ?? 'You', self: true, external: false }];
    for (const pid of partnerIds) nodes.push({ id: pid, label: names.get(pid)?.displayName ?? 'Friend', self: false, external: false });
    const edges: { id: string; source: string; target: string; kind: string; status: string }[] = [];
    for (const b of mine) {
      const other = b.ownerId === a.userId ? b.partnerUserId : b.ownerId;
      if (other) edges.push({ id: b.id, source: a.userId, target: other, kind: b.kind, status: b.status });
      else {
        const extId = `ext:${b.id}`;
        nodes.push({ id: extId, label: b.partnerLabel, self: false, external: true });
        edges.push({ id: b.id, source: a.userId, target: extId, kind: b.kind, status: b.status });
      }
    }
    // Edges between my partners, only when that bond is active and its members chose to show it to connections.
    if (partnerIds.length > 1) {
      const between = await ctx.db.select().from(s.bonds).where(and(isNull(s.bonds.deletedAt), eq(s.bonds.status, 'active'), eq(s.bonds.visibility, 'connections'), inArray(s.bonds.ownerId, partnerIds), inArray(s.bonds.partnerUserId, partnerIds)));
      for (const b of between) edges.push({ id: b.id, source: b.ownerId, target: b.partnerUserId!, kind: b.kind, status: b.status });
    }
    return { nodes, edges };
  });
}
