import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import QRCode from 'qrcode';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import {
  DUMMY_HASH, decryptField, encryptField, generateTotpSecret, hashPassword, randomToken, sha256, verifyPassword, verifyTotp,
} from '../lib/crypto';
import { AppError, badRequest, conflict, notFound, parse, unauthorized } from '../lib/http';
import { evaluateReferral } from '../services/referrals';
import { CSRF_COOKIE, SESSION_COOKIE, SESSION_DAYS, requireAuth } from '../lib/auth';
import { notify, sendEmail, NOTIFICATION_CATEGORIES } from '../lib/notify';

export const POLICY_VERSION = '2026-10-v1';

const Password = z.string().min(10, 'Use at least 10 characters.').max(200);
const Email = z.email('Enter a valid email address.').max(254).transform((e) => e.trim().toLowerCase());

export const SignupBody = z.object({
  email: Email,
  password: Password,
  displayName: z.string().trim().min(1).max(60),
  confirmAdult: z.literal(true, { message: 'Nakshatra is available to adults (18+) only.' }),
  acceptTerms: z.literal(true, { message: 'Please accept the terms and privacy policy.' }),
  referralCode: z.string().trim().max(32).optional(),
});

const LoginBody = z.object({ email: Email, password: z.string().min(1).max(200), totp: z.string().optional() });

function slugHandle(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'star';
  return `${base}${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function createSession(ctx: Ctx, reply: FastifyReply, req: FastifyRequest, userId: string, mfaPassed: boolean) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await ctx.db.insert(s.sessions).values({
    userId, tokenHash: sha256(token), expiresAt, ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300), mfaPassed,
  });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: ctx.config.isProd, path: '/', expires: expiresAt,
  });
}

export async function issueEmailToken(ctx: Ctx, userId: string, purpose: 'verify_email' | 'reset_password', hours: number) {
  const token = randomToken(24);
  await ctx.db.insert(s.authTokens).values({ userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + hours * 3600000) });
  return token;
}

export async function meFor(ctx: Ctx, userId: string) {
  const [u] = await ctx.db.select().from(s.users).where(eq(s.users.id, userId));
  const [p] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, userId));
  const roles = await ctx.db.select({ role: s.userRoles.role }).from(s.userRoles).where(eq(s.userRoles.userId, userId));
  const [bp] = await ctx.db.select({ id: s.birthProfiles.id }).from(s.birthProfiles).where(and(eq(s.birthProfiles.userId, userId), eq(s.birthProfiles.isPrimary, true)));
  const [assessment] = await ctx.db.select({ id: s.assessmentResults.id }).from(s.assessmentResults).where(eq(s.assessmentResults.userId, userId)).limit(1);
  return {
    id: u.id,
    email: u.email,
    emailVerified: Boolean(u.emailVerifiedAt),
    status: u.status,
    mfaEnabled: u.mfaEnabled,
    roles: roles.map((r) => r.role),
    referralCode: u.referralCode,
    hasBirthProfile: Boolean(bp),
    hasAssessment: Boolean(assessment),
    onboardingComplete: Boolean(p?.onboardingCompletedAt),
    profile: p ? {
      handle: p.handle, displayName: p.displayName, fullName: p.fullName, avatarUrl: p.avatarUrl, theme: p.theme, emblem: p.emblem,
      background: p.background, language: p.language, colorScheme: p.colorScheme, reducedMotion: p.reducedMotion,
      preferredSystem: p.preferredSystem, visibility: p.visibility,
    } : null,
  };
}

export async function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/api/v1/auth/csrf', async (req, reply) => {
    // The CSRF cookie is set by the global hook; returning it lets SPA clients prime it.
    return reply.send({ ok: true });
  });

  app.post('/api/v1/auth/signup', strict, async (req, reply) => {
    const body = parse(SignupBody, req.body);
    const existing = await ctx.db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${body.email}`);
    if (existing.length) throw conflict('An account with this email already exists. Try signing in instead.');
    const passwordHash = await hashPassword(body.password);
    const userId = await ctx.db.transaction(async (tx) => {
      let referrer: string | null = null;
      if (body.referralCode) {
        const [r] = await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.referralCode, body.referralCode.toUpperCase()));
        referrer = r?.id ?? null;
      }
      const [u] = await tx.insert(s.users).values({
        email: body.email, passwordHash, ageConfirmedAt: new Date(), referralCode: `NK${randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`, referredBy: referrer,
      }).returning();
      let handle = slugHandle(body.displayName);
      for (let i = 0; i < 5; i++) {
        const clash = await tx.select({ id: s.profiles.userId }).from(s.profiles).where(sql`lower(${s.profiles.handle}) = ${handle}`);
        if (!clash.length) break;
        handle = slugHandle(body.displayName);
      }
      await tx.insert(s.profiles).values({ userId: u.id, handle, displayName: body.displayName });
      await tx.insert(s.consentRecords).values([
        { userId: u.id, purpose: 'terms', granted: true, policyVersion: POLICY_VERSION },
        { userId: u.id, purpose: 'privacy', granted: true, policyVersion: POLICY_VERSION },
      ]);
      await tx.insert(s.notificationSettings).values({ userId: u.id, unsubscribeTokenHash: sha256(randomToken(16)) });
      await tx.insert(s.notificationPreferences).values(NOTIFICATION_CATEGORIES.map((category) => ({
        userId: u.id, category, inApp: true, email: ['security', 'orders', 'bookings'].includes(category),
      })));
      if (referrer) await tx.insert(s.referrals).values({ referrerId: referrer, referredId: u.id, channel: 'signup' });
      await track(tx, u.id, 'signup_completed', { referred: Boolean(referrer) });
      await audit(tx, { actorId: u.id, action: 'auth.signup', targetType: 'user', targetId: u.id, ip: req.ip });
      return u.id;
    });
    const token = await issueEmailToken(ctx, userId, 'verify_email', 48);
    await sendEmail(ctx, ctx.db, body.email, 'Verify your Nakshatra email', `Welcome to Nakshatra.\n\nVerify your email: ${ctx.config.APP_ORIGIN}/verify-email?token=${token}\n\nThis link expires in 48 hours.`);
    await createSession(ctx, reply, req, userId, true);
    return reply.code(201).send({ user: await meFor(ctx, userId) });
  });

  app.post('/api/v1/auth/login', strict, async (req, reply) => {
    const body = parse(LoginBody, req.body);
    const [u] = await ctx.db.select().from(s.users).where(and(sql`lower(${s.users.email}) = ${body.email}`, ne(s.users.status, 'deleted')));
    // Per-account throttle on top of the per-IP limit: slows distributed password guessing against one account.
    if (u) {
      const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.auditLogs)
        .where(and(eq(s.auditLogs.actorId, u.id), inArray(s.auditLogs.action, ['auth.login_failed', 'auth.mfa_failed']), gt(s.auditLogs.createdAt, new Date(Date.now() - 15 * 60000))));
      if (n >= 8) throw new AppError(429, 'too_many_attempts', 'Too many unsuccessful sign-in attempts. Try again in 15 minutes or reset your password.');
    }
    const ok = await verifyPassword(body.password, u?.passwordHash ?? DUMMY_HASH);
    if (!u || !ok) {
      await audit(ctx.db, { actorId: u?.id ?? null, action: 'auth.login_failed', ip: req.ip });
      throw new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');
    }
    let mfaPassed = !u.mfaEnabled;
    if (u.mfaEnabled) {
      if (!body.totp) return reply.code(200).send({ mfaRequired: true });
      if (!verifyTotp(decryptField(ctx.config.appSecret, u.mfaSecret!), body.totp)) {
        await audit(ctx.db, { actorId: u.id, action: 'auth.mfa_failed', ip: req.ip });
        throw new AppError(401, 'invalid_mfa', 'That authenticator code is not valid.');
      }
      mfaPassed = true;
    }
    await createSession(ctx, reply, req, u.id, mfaPassed);
    await audit(ctx.db, { actorId: u.id, action: 'auth.login', ip: req.ip });
    await notify(ctx, ctx.db, { userId: u.id, category: 'security', title: 'New sign-in to your account', body: `Signed in from ${String(req.headers['user-agent'] ?? 'a browser').slice(0, 60)}. If this wasn’t you, revoke the session in Settings → Security.`, link: '/settings/security' });
    return reply.send({ user: await meFor(ctx, u.id) });
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    if (req.auth) await ctx.db.update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.id, req.auth.sessionId));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/v1/auth/me', async (req, reply) => {
    if (!req.auth) return reply.send({ user: null });
    if (req.auth.mfaPending) return reply.send({ user: null, mfaRequired: true });
    return reply.send({ user: await meFor(ctx, req.auth.userId) });
  });

  app.post('/api/v1/auth/verify-email', async (req, reply) => {
    const { token } = parse(z.object({ token: z.string().min(10) }), req.body);
    const [t] = await ctx.db.select().from(s.authTokens).where(and(eq(s.authTokens.tokenHash, sha256(token)), eq(s.authTokens.purpose, 'verify_email'), isNull(s.authTokens.usedAt)));
    if (!t || t.expiresAt < new Date()) throw badRequest('This verification link is invalid or has expired.');
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.authTokens).set({ usedAt: new Date() }).where(eq(s.authTokens.id, t.id));
      await tx.update(s.users).set({ emailVerifiedAt: new Date() }).where(eq(s.users.id, t.userId));
    });
    await evaluateReferral(ctx, ctx.db, t.userId);
    return reply.send({ ok: true });
  });

  app.post('/api/v1/auth/resend-verification', strict, async (req, reply) => {
    const a = requireAuth(req);
    if (a.emailVerified) return reply.send({ ok: true });
    const token = await issueEmailToken(ctx, a.userId, 'verify_email', 48);
    await sendEmail(ctx, ctx.db, a.email, 'Verify your Nakshatra email', `Verify your email: ${ctx.config.APP_ORIGIN}/verify-email?token=${token}`);
    return reply.send({ ok: true });
  });

  app.post('/api/v1/auth/forgot-password', strict, async (req, reply) => {
    const { email } = parse(z.object({ email: Email }), req.body);
    const [u] = await ctx.db.select().from(s.users).where(and(sql`lower(${s.users.email}) = ${email}`, eq(s.users.status, 'active')));
    if (u) {
      const token = await issueEmailToken(ctx, u.id, 'reset_password', 1);
      await sendEmail(ctx, ctx.db, u.email, 'Reset your Nakshatra password', `Reset your password: ${ctx.config.APP_ORIGIN}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you didn’t ask for this, you can ignore this email.`);
    }
    // Same response whether or not the account exists.
    return reply.send({ ok: true });
  });

  app.post('/api/v1/auth/reset-password', strict, async (req, reply) => {
    const { token, password } = parse(z.object({ token: z.string().min(10), password: Password }), req.body);
    const [t] = await ctx.db.select().from(s.authTokens).where(and(eq(s.authTokens.tokenHash, sha256(token)), eq(s.authTokens.purpose, 'reset_password'), isNull(s.authTokens.usedAt)));
    if (!t || t.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired.');
    const passwordHash = await hashPassword(password);
    await ctx.db.transaction(async (tx) => {
      await tx.update(s.authTokens).set({ usedAt: new Date() }).where(eq(s.authTokens.id, t.id));
      await tx.update(s.users).set({ passwordHash, updatedAt: new Date() }).where(eq(s.users.id, t.userId));
      await tx.update(s.sessions).set({ revokedAt: new Date() }).where(and(eq(s.sessions.userId, t.userId), isNull(s.sessions.revokedAt)));
      await audit(tx, { actorId: t.userId, action: 'auth.password_reset', ip: req.ip });
    });
    await notify(ctx, ctx.db, { userId: t.userId, category: 'security', title: 'Your password was changed', body: 'All sessions were signed out.' });
    return reply.send({ ok: true });
  });

  app.post('/api/v1/auth/change-password', strict, async (req, reply) => {
    const a = requireAuth(req);
    const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string(), newPassword: Password }), req.body);
    const [u] = await ctx.db.select().from(s.users).where(eq(s.users.id, a.userId));
    if (!(await verifyPassword(currentPassword, u.passwordHash))) throw badRequest('Current password is incorrect.');
    await ctx.db.update(s.users).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() }).where(eq(s.users.id, a.userId));
    await ctx.db.update(s.sessions).set({ revokedAt: new Date() }).where(and(eq(s.sessions.userId, a.userId), ne(s.sessions.id, a.sessionId), isNull(s.sessions.revokedAt)));
    await audit(ctx.db, { actorId: a.userId, action: 'auth.password_change', ip: req.ip });
    await notify(ctx, ctx.db, { userId: a.userId, category: 'security', title: 'Your password was changed', body: 'Other sessions were signed out.' });
    return reply.send({ ok: true });
  });

  app.get('/api/v1/auth/sessions', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.sessions).where(and(eq(s.sessions.userId, a.userId), isNull(s.sessions.revokedAt)));
    return {
      sessions: rows.filter((r) => r.expiresAt > new Date()).map((r) => ({
        id: r.id, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, userAgent: r.userAgent, current: r.id === a.sessionId,
      })),
    };
  });

  app.delete('/api/v1/auth/sessions/:id', async (req, reply) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const res = await ctx.db.update(s.sessions).set({ revokedAt: new Date() }).where(and(eq(s.sessions.id, id), eq(s.sessions.userId, a.userId))).returning();
    if (!res.length) throw notFound('Session');
    await audit(ctx.db, { actorId: a.userId, action: 'auth.session_revoke', targetType: 'session', targetId: id, ip: req.ip });
    return reply.send({ ok: true });
  });

  app.post('/api/v1/auth/mfa/setup', async (req) => {
    const a = requireAuth(req);
    const secret = generateTotpSecret();
    await ctx.db.update(s.users).set({ mfaSecret: encryptField(ctx.config.appSecret, secret), mfaEnabled: false }).where(eq(s.users.id, a.userId));
    const uri = `otpauth://totp/Nakshatra:${encodeURIComponent(a.email)}?secret=${secret}&issuer=Nakshatra`;
    return { secret, otpauthUrl: uri, qrDataUrl: await QRCode.toDataURL(uri) };
  });

  app.post('/api/v1/auth/mfa/enable', async (req, reply) => {
    const a = requireAuth(req);
    const { code } = parse(z.object({ code: z.string() }), req.body);
    const [u] = await ctx.db.select().from(s.users).where(eq(s.users.id, a.userId));
    if (!u.mfaSecret || !verifyTotp(decryptField(ctx.config.appSecret, u.mfaSecret), code)) throw badRequest('That code is not valid. Check the time on your device and try again.');
    await ctx.db.update(s.users).set({ mfaEnabled: true }).where(eq(s.users.id, a.userId));
    await ctx.db.update(s.sessions).set({ mfaPassed: true }).where(eq(s.sessions.id, a.sessionId));
    await audit(ctx.db, { actorId: a.userId, action: 'auth.mfa_enabled', ip: req.ip });
    await notify(ctx, ctx.db, { userId: a.userId, category: 'security', title: 'Two-step verification turned on' });
    return reply.send({ ok: true });
  });

  app.post('/api/v1/auth/mfa/disable', async (req, reply) => {
    const a = requireAuth(req);
    const { password } = parse(z.object({ password: z.string() }), req.body);
    const [u] = await ctx.db.select().from(s.users).where(eq(s.users.id, a.userId));
    if (!(await verifyPassword(password, u.passwordHash))) throw unauthorized('Password is incorrect.');
    await ctx.db.update(s.users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(s.users.id, a.userId));
    await audit(ctx.db, { actorId: a.userId, action: 'auth.mfa_disabled', ip: req.ip });
    await notify(ctx, ctx.db, { userId: a.userId, category: 'security', title: 'Two-step verification turned off' });
    return reply.send({ ok: true });
  });

  app.post('/api/v1/auth/mfa/verify', strict, async (req, reply) => {
    const a = requireAuth(req, { allowMfaPending: true });
    const { code } = parse(z.object({ code: z.string() }), req.body);
    const [u] = await ctx.db.select().from(s.users).where(eq(s.users.id, a.userId));
    if (!u.mfaSecret || !verifyTotp(decryptField(ctx.config.appSecret, u.mfaSecret), code)) throw new AppError(401, 'invalid_mfa', 'That authenticator code is not valid.');
    await ctx.db.update(s.sessions).set({ mfaPassed: true }).where(eq(s.sessions.id, a.sessionId));
    return reply.send({ user: await meFor(ctx, a.userId) });
  });

  // Development mailbox (never registered in production).
  if (!ctx.config.isProd && ctx.config.MAIL_TRANSPORT === 'dev_mailbox') {
    app.get('/api/v1/dev/mailbox', async (req) => {
      const q = parse(z.object({ to: z.string().optional() }), req.query);
      const rows = await ctx.db.select().from(s.emailOutbox).orderBy(sql`${s.emailOutbox.createdAt} desc`).limit(50);
      return { notice: 'Development mailbox: these emails were stored locally and not sent.', emails: q.to ? rows.filter((r) => r.toEmail === q.to!.toLowerCase()) : rows };
    });
  }
  void CSRF_COOKIE;
}
