import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import QRCode from 'qrcode';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { badRequest, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { placeById, searchPlaces, timezoneFor } from '../lib/geo';
import { awardXp, evaluateAchievements, totalXp } from '../lib/rewards';
import { BirthDataError, normalizeBirth } from '../../astro';
import { levelForXp } from '../../shared/gamification';
import { createStorage, IMAGE_TYPES } from '../lib/storage';
import {
  DEFAULT_FIELD_VISIBILITY, ageOn, bigThreeFor, calculateAndStore, fieldVisible, isBlockedEitherWay, primaryBirth, relationOf,
  type FieldVis,
} from '../services/identity';
import { POLICY_VERSION } from './auth';
import { ACCENT_KEYS, CORNER_KEYS, TEXT_SIZE_KEYS } from '../../shared/appearance';
import { UNIVERSE_PARTS, universeKeys } from '../../shared/universe';
import { AVATAR_PART_KEYS, avatarVersion, normaliseAvatar, partKeys, renderAvatarSvg, type AvatarConfig } from '../../shared/avatar';

export const BirthBody = z.object({
  fullName: z.string().trim().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  timePrecision: z.enum(['exact', 'within_15m', 'within_1h', 'unknown']),
  place: z.union([
    z.object({ kind: z.literal('geonames'), id: z.string().min(1) }),
    z.object({ kind: z.literal('manual'), name: z.string().trim().min(1).max(120), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), timezone: z.string().optional() }),
  ]),
  consentBirthData: z.literal(true, { message: 'Consent is needed to calculate your chart from your birth data.' }),
}).refine((b) => (b.time === null) === (b.timePrecision === 'unknown'), { message: 'Mark the time as unknown when no time is given.', path: ['timePrecision'] });

const ProfileBody = z.object({
  displayName: z.string().trim().min(1).max(60),
  fullName: z.string().trim().max(120).nullable(),
  bio: z.string().max(500),
  statusText: z.string().max(80),
  theme: z.enum(['midnight', 'dawn', 'aurora', 'saffron', 'nebula', 'eclipse']),
  emblem: z.enum(['orbit', 'lotus', 'star', 'crescent', 'mandala']),
  background: z.enum(['nebula', 'starfield', 'aurora', 'plain']),
  interests: z.array(z.string().trim().min(1).max(30)).max(12),
  featuredBadges: z.array(z.string()).max(3),
  featuredInsights: z.array(z.string()).max(3),
  visibility: z.enum(['public', 'private']),
  fieldVisibility: z.record(z.string(), z.enum(['public', 'connections', 'private'])),
  language: z.enum(['en', 'hi']),
  colorScheme: z.enum(['system', 'dark', 'light']),
  appearance: z.object({ accent: z.enum(ACCENT_KEYS), textSize: z.enum(TEXT_SIZE_KEYS), corners: z.enum(CORNER_KEYS),
    // Universe Studio: fixed keys only; optional so older clients keep working.
    world: z.object(Object.fromEntries(UNIVERSE_PARTS.map((p) => [p, z.enum(universeKeys(p))])) as Record<string, z.ZodEnum<Record<string, string>>>).strict().optional() }).strict(),
  reducedMotion: z.boolean(),
  preferredSystem: z.enum(['vedic', 'western']),
}).partial();

/** Validates birth data, resolves the place and normalises the moment; shared by saved profiles and the account-free preview. */
export function resolveBirth(raw: unknown) {
  const body = parse(BirthBody, raw);
  let place: { name: string; latitude: number; longitude: number; timezone: string; countryCode: string | null; source: 'geonames' | 'manual' };
  if (body.place.kind === 'geonames') {
    const p = placeById(body.place.id);
    if (!p) throw badRequest('Birthplace not found. Search again or enter coordinates manually.');
    place = { name: p.label, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone, countryCode: p.countryCode, source: 'geonames' };
  } else {
    place = { name: body.place.name, latitude: body.place.latitude, longitude: body.place.longitude, timezone: body.place.timezone ?? timezoneFor(body.place.latitude, body.place.longitude), countryCode: null, source: 'manual' };
  }
  if (ageOn(body.date) < 18) throw badRequest('Nakshatra is currently available to adults (18+) only.');
  if (ageOn(body.date) > 120) throw badRequest('Please check the birth year.');
  let normalized;
  try {
    normalized = normalizeBirth({ date: body.date, time: body.time, timePrecision: body.timePrecision, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone });
  } catch (e) {
    if (e instanceof BirthDataError) throw badRequest(e.message, [{ path: e.field, message: e.message }]);
    throw e;
  }
  return { body, place, normalized };
}

export async function saveBirthProfile(ctx: Ctx, userId: string, raw: unknown, ip?: string) {
  const { body, place, normalized } = resolveBirth(raw);
  return ctx.db.transaction(async (tx) => {
    const existing = await primaryBirth(tx, userId);
    const values = {
      userId, label: 'Me', isPrimary: true, birthDate: body.date, birthTime: body.time, timePrecision: body.timePrecision,
      placeName: place.name, countryCode: place.countryCode, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone,
      utcOffsetMinutes: normalized.utcOffsetMinutes, birthUtc: normalized.utc, locationSource: place.source, updatedAt: new Date(),
    };
    const [bp] = existing
      ? await tx.update(s.birthProfiles).set(values).where(eq(s.birthProfiles.id, existing.id)).returning()
      : await tx.insert(s.birthProfiles).values(values).returning();
    await tx.insert(s.consentRecords).values({ userId, purpose: 'birth_data_processing', granted: true, policyVersion: POLICY_VERSION });
    if (body.fullName !== undefined) await tx.update(s.profiles).set({ fullName: body.fullName || null }).where(eq(s.profiles.userId, userId));
    await calculateAndStore(tx, userId, bp, 'vedic_default');
    await calculateAndStore(tx, userId, bp, 'western_default');
    const [prof] = await tx.select().from(s.profiles).where(eq(s.profiles.userId, userId));
    if (!prof.onboardingCompletedAt) {
      await tx.update(s.profiles).set({ onboardingCompletedAt: new Date() }).where(eq(s.profiles.userId, userId));
      // Daily location defaults to the birthplace until the user sets a current location.
      await tx.insert(s.userLocations).values({ userId, placeName: place.name, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone }).onConflictDoNothing();
    }
    await awardXp(ctx, tx, userId, 'cosmic_id_completed');
    await evaluateAchievements(ctx, tx, userId, ['cosmic_id']);
    await track(tx, userId, 'cosmic_id_completed', { timePrecision: body.timePrecision, locationSource: place.source, update: Boolean(existing) });
    await track(tx, userId, 'chart_calculated', { systems: 2 });
    await audit(tx, { actorId: userId, action: existing ? 'birth_profile.update' : 'birth_profile.create', targetType: 'birth_profile', targetId: bp.id, ip });
    return { id: bp.id, warnings: normalized.warnings, utcOffsetMinutes: normalized.utcOffsetMinutes };
  });
}

export async function profileRoutes(app: FastifyInstance, ctx: Ctx) {
  const storage = createStorage(ctx);

  /* ---------- Creator / seller applications (reviewed by staff in Admin → Verification) ---------- */
  const AppliedRole = z.object({ role: z.enum(['creator', 'seller']) });
  app.get('/api/v1/role-applications/:role', async (req) => {
    const a = requireAuth(req);
    const { role } = parse(AppliedRole, req.params);
    const [latest] = await ctx.db.select({ status: s.verificationRequests.status, reviewNote: s.verificationRequests.reviewNote, createdAt: s.verificationRequests.createdAt })
      .from(s.verificationRequests).where(and(eq(s.verificationRequests.userId, a.userId), eq(s.verificationRequests.kind, role))).orderBy(desc(s.verificationRequests.createdAt)).limit(1);
    return { hasRole: a.roles.includes(role), application: latest ?? null };
  });
  app.post('/api/v1/role-applications', async (req) => {
    const a = requireAuth(req);
    if (!a.emailVerified) throw badRequest('Verify your email before applying.');
    const { role, note } = parse(AppliedRole.extend({ note: z.string().trim().min(30).max(2000) }), req.body);
    if (a.roles.includes(role)) throw badRequest('You already have access.');
    const [pending] = await ctx.db.select({ id: s.verificationRequests.id }).from(s.verificationRequests)
      .where(and(eq(s.verificationRequests.userId, a.userId), eq(s.verificationRequests.kind, role), eq(s.verificationRequests.status, 'pending')));
    if (pending) throw badRequest('Your application is already being reviewed.');
    await ctx.db.insert(s.verificationRequests).values({ userId: a.userId, kind: role, evidence: [], note });
    await audit(ctx.db, { actorId: a.userId, action: `role_application.${role}`, ip: req.ip });
    return { ok: true, status: 'pending' };
  });

  app.get('/api/v1/places', async (req) => {
    const { q } = parse(z.object({ q: z.string().max(80) }), req.query);
    return { results: searchPlaces(q), attribution: 'Place data © GeoNames (CC BY 4.0). Time zones: timezone-boundary-builder (ODbL).' };
  });

  app.get('/api/v1/timezone', async (req) => {
    const { lat, lon } = parse(z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) }), req.query);
    return { timezone: timezoneFor(lat, lon) };
  });

  app.get('/api/v1/birth-profile', async (req) => {
    const a = requireAuth(req);
    const bp = await primaryBirth(ctx.db, a.userId);
    if (!bp) return { birthProfile: null };
    return {
      birthProfile: {
        id: bp.id, date: bp.birthDate, time: bp.birthTime, timePrecision: bp.timePrecision, placeName: bp.placeName,
        latitude: bp.latitude, longitude: bp.longitude, timezone: bp.timezone, utcOffsetMinutes: bp.utcOffsetMinutes,
        birthUtc: bp.birthUtc, locationSource: bp.locationSource, updatedAt: bp.updatedAt,
      },
    };
  });

  app.put('/api/v1/birth-profile', async (req) => {
    const a = requireAuth(req);
    return saveBirthProfile(ctx, a.userId, req.body, req.ip);
  });

  app.get('/api/v1/profile', async (req) => {
    const a = requireAuth(req);
    const [p] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, a.userId));
    return { profile: { ...p, fieldVisibility: { ...DEFAULT_FIELD_VISIBILITY, ...(p.fieldVisibility as object) } } };
  });

  app.patch('/api/v1/profile', async (req) => {
    const a = requireAuth(req);
    const body = parse(ProfileBody, req.body);
    if (body.fieldVisibility) {
      for (const k of ['birthTime', 'birthPlace', 'coordinates']) delete body.fieldVisibility[k];
    }
    const [before] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) if (JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(v)) changes[k] = v;
    const [p] = await ctx.db.update(s.profiles).set({ ...body, updatedAt: new Date() }).where(eq(s.profiles.userId, a.userId)).returning();
    if (Object.keys(changes).length) {
      await ctx.db.insert(s.profileHistory).values({ userId: a.userId, changes: Object.fromEntries(Object.keys(changes).map((k) => [k, { from: (before as Record<string, unknown>)[k], to: changes[k] }])) });
    }
    if (changes.theme || changes.emblem || changes.appearance) await evaluateAchievements(ctx, ctx.db, a.userId, ['theme_customised']);
    return { profile: p };
  });

  app.get('/api/v1/profile/history', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.profileHistory).where(eq(s.profileHistory.userId, a.userId)).orderBy(desc(s.profileHistory.createdAt)).limit(50);
    return { history: rows };
  });

  /* ---------- Avatar creator ---------- */

  const AvatarBody = z.object(Object.fromEntries(AVATAR_PART_KEYS.map((p) => [p, z.enum(partKeys(p))])) as Record<string, z.ZodEnum<Record<string, string>>>).strict();

  app.get('/api/v1/profile/avatar-builder', async (req) => {
    const a = requireAuth(req);
    const [p] = await ctx.db.select({ c: s.profiles.avatarConfig, url: s.profiles.avatarUrl }).from(s.profiles).where(eq(s.profiles.userId, a.userId));
    return { config: p?.c ? normaliseAvatar(p.c) : null, inUse: Boolean(p?.url?.startsWith('/api/v1/avatars/')) };
  });

  /** Saves the built avatar and makes it your picture (replacing any uploaded photo). */
  app.put('/api/v1/profile/avatar-builder', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const a = requireAuth(req);
    const config = parse(AvatarBody, req.body) as unknown as AvatarConfig;
    const avatarUrl = `/api/v1/avatars/${a.userId}?v=${avatarVersion(config)}`;
    await ctx.db.update(s.profiles).set({ avatarConfig: config, avatarUrl, updatedAt: new Date() }).where(eq(s.profiles.userId, a.userId));
    await track(ctx.db, a.userId, 'avatar_built', {});
    return { config, avatarUrl };
  });

  /** Removes your picture (built or uploaded); your built avatar is kept so you can switch it back on. */
  app.delete('/api/v1/profile/avatar', async (req) => {
    const a = requireAuth(req);
    await ctx.db.update(s.profiles).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(s.profiles.userId, a.userId));
    return { ok: true };
  });

  /** A member's built avatar as an image — only while it is their picture. Drawn from fixed parts only. */
  app.get('/api/v1/avatars/:id', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [p] = await ctx.db.select({ c: s.profiles.avatarConfig, url: s.profiles.avatarUrl }).from(s.profiles).where(eq(s.profiles.userId, id));
    if (!p?.c || !p.url?.startsWith(`/api/v1/avatars/${id}`)) throw notFound('Avatar');
    return reply.header('content-type', 'image/svg+xml; charset=utf-8').header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'").header('cache-control', 'public, max-age=86400')
      .send(renderAvatarSvg(normaliseAvatar(p.c)));
  });

  app.post('/api/v1/profile/avatar', async (req) => {
    const a = requireAuth(req);
    const file = await req.file();
    if (!file) throw badRequest('No file uploaded');
    const buf = await file.toBuffer();
    const saved = await storage.save(buf, { allowed: IMAGE_TYPES, isPrivate: false, maxBytes: ctx.config.MAX_UPLOAD_MB * 1048576 });
    await ctx.db.insert(s.uploads).values({ ownerId: a.userId, purpose: 'avatar', path: saved.path, mime: saved.mime, bytes: saved.bytes });
    const url = `/uploads/${saved.path}`;
    await ctx.db.update(s.profiles).set({ avatarUrl: url }).where(eq(s.profiles.userId, a.userId));
    return { avatarUrl: url };
  });

  app.post('/api/v1/profile/share', async (req) => {
    const a = requireAuth(req);
    const [p] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, a.userId));
    const url = `${ctx.config.APP_ORIGIN}/u/${p.handle}?ref=${encodeURIComponent((await ctx.db.select({ c: s.users.referralCode }).from(s.users).where(eq(s.users.id, a.userId)))[0].c)}`;
    await awardXp(ctx, ctx.db, a.userId, 'profile_shared');
    await evaluateAchievements(ctx, ctx.db, a.userId, ['profile_shared']);
    await track(ctx.db, a.userId, 'profile_shared', { visibility: p.visibility });
    return { url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b0d24', light: '#f5efde' } }), publicProfile: p.visibility === 'public' };
  });

  /** Public profile with server-enforced privacy. */
  app.get('/api/v1/u/:handle', async (req) => {
    const { handle } = parse(z.object({ handle: z.string().min(1).max(40) }), req.params);
    const [p] = await ctx.db.select().from(s.profiles).innerJoin(s.users, eq(s.users.id, s.profiles.userId))
      .where(and(sql`lower(${s.profiles.handle}) = ${handle.toLowerCase()}`, eq(s.users.status, 'active')));
    if (!p) throw notFound('Profile');
    const ownerId = p.profiles.userId;
    const viewerId = req.auth?.userId ?? null;
    if (viewerId && (await isBlockedEitherWay(ctx.db, viewerId, ownerId))) throw notFound('Profile');
    const viewer = await relationOf(ctx.db, viewerId, ownerId);
    const vis = { ...DEFAULT_FIELD_VISIBILITY, ...(p.profiles.fieldVisibility as Record<string, FieldVis>) };
    const limited = p.profiles.visibility === 'private' && viewer === 'public';
    // Counts that someone viewed a profile; who was viewed is never recorded.
    if (viewerId && viewer !== 'self') await track(ctx.db, viewerId, 'profile_viewed');
    const base = {
      userId: ownerId, handle: p.profiles.handle, displayName: p.profiles.displayName, avatarUrl: p.profiles.avatarUrl,
      theme: p.profiles.theme, emblem: p.profiles.emblem, background: p.profiles.background, viewer, limited,
      visibility: p.profiles.visibility,
    };
    if (limited) return { profile: base };
    const b3 = await bigThreeFor(ctx.db, ownerId);
    const badges = fieldVisible(vis, 'badges', viewer)
      ? (await ctx.db.select().from(s.userAchievements).where(eq(s.userAchievements.userId, ownerId))).map((r) => r.achievementKey) : [];
    const followers = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.follows).where(and(eq(s.follows.followeeId, ownerId), eq(s.follows.status, 'accepted')));
    const following = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.follows).where(and(eq(s.follows.followerId, ownerId), eq(s.follows.status, 'accepted')));
    let followState: string | null = null;
    if (viewerId && viewerId !== ownerId) {
      const [f] = await ctx.db.select().from(s.follows).where(and(eq(s.follows.followerId, viewerId), eq(s.follows.followeeId, ownerId)));
      followState = f?.status ?? 'none';
    }
    return {
      profile: {
        ...base,
        bio: fieldVisible(vis, 'bio', viewer) ? p.profiles.bio : null,
        statusText: p.profiles.statusText,
        interests: fieldVisible(vis, 'interests', viewer) ? p.profiles.interests : [],
        badges: badges.filter((k) => !p.profiles.featuredBadges.length || p.profiles.featuredBadges.includes(k)),
        level: fieldVisible(vis, 'level', viewer) ? levelForXp(await totalXp(ctx.db, ownerId)) : null,
        identity: b3 ? {
          sunSign: fieldVisible(vis, 'sunSign', viewer) ? { western: b3.western.sun, vedic: b3.vedic.sunSign } : null,
          moonSign: fieldVisible(vis, 'moonSign', viewer) ? { western: b3.western.moon, vedic: b3.vedic.rashi } : null,
          rising: fieldVisible(vis, 'rising', viewer) ? { western: b3.western.rising, vedic: b3.vedic.lagna } : null,
          nakshatra: fieldVisible(vis, 'nakshatra', viewer) ? { name: b3.vedic.nakshatra, pada: b3.vedic.pada } : null,
        } : null,
        counts: { followers: followers[0].n, following: following[0].n },
        followState,
      },
    };
  });

  app.get('/api/v1/location', async (req) => {
    const a = requireAuth(req);
    const [l] = await ctx.db.select().from(s.userLocations).where(eq(s.userLocations.userId, a.userId));
    return { location: l ?? null };
  });

  app.put('/api/v1/location', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ placeId: z.string() }), req.body);
    const p = placeById(body.placeId);
    if (!p) throw notFound('Place');
    const values = { userId: a.userId, placeName: p.label, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone, updatedAt: new Date() };
    await ctx.db.insert(s.userLocations).values(values).onConflictDoUpdate({ target: s.userLocations.userId, set: values });
    await ctx.db.update(s.notificationSettings).set({ timezone: p.timezone }).where(eq(s.notificationSettings.userId, a.userId));
    return { location: values };
  });
}
