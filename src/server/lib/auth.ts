import type { FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { DB } from '../db/client';
import { sessions, userRoles, users } from '../db/schema';
import { sha256 } from './crypto';
import { AppError, forbidden, unauthorized } from './http';

export const SESSION_COOKIE = 'nk_session';
export const CSRF_COOKIE = 'nk_csrf';
export const SESSION_DAYS = 30;

export type Role = 'admin' | 'moderator' | 'support' | 'expert' | 'creator' | 'vendor' | 'seller';

export interface AuthInfo {
  userId: string;
  sessionId: string;
  roles: Role[];
  status: string;
  email: string;
  emailVerified: boolean;
  mfaPending: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthInfo | null;
  }
}

export async function resolveSession(db: DB, token: string | undefined): Promise<AuthInfo | null> {
  if (!token) return null;
  const rows = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  const row = rows[0];
  if (!row || row.u.status === 'deleted') return null;
  const roles = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, row.u.id));
  // Touch last-seen at most every 10 minutes.
  if (Date.now() - row.s.lastSeenAt.getTime() > 600000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.s.id));
  }
  return {
    userId: row.u.id,
    sessionId: row.s.id,
    roles: roles.map((r) => r.role as Role),
    status: row.u.status,
    email: row.u.email,
    emailVerified: Boolean(row.u.emailVerifiedAt),
    mfaPending: row.u.mfaEnabled && !row.s.mfaPassed,
  };
}

/** Server-side authentication guard. Suspended accounts may only reach routes that opt in (appeals, export, logout). */
export function requireAuth(req: FastifyRequest, opts: { allowSuspended?: boolean; allowMfaPending?: boolean } = {}): AuthInfo {
  const a = req.auth;
  if (!a) throw unauthorized();
  if (a.mfaPending && !opts.allowMfaPending) throw new AppError(401, 'mfa_required', 'Enter your authenticator code to continue.');
  if (a.status === 'suspended' && !opts.allowSuspended) throw new AppError(403, 'account_suspended', 'Your account is suspended. You can submit an appeal from Settings.');
  return a;
}

export function hasRole(a: AuthInfo | null, ...roles: Role[]): boolean {
  return Boolean(a && a.roles.some((r) => roles.includes(r)));
}

export function requireRole(req: FastifyRequest, ...roles: Role[]): AuthInfo {
  const a = requireAuth(req);
  if (!hasRole(a, ...roles)) throw forbidden();
  return a;
}

/** Staff capability map: admin can do everything; others are least-privilege. */
export const STAFF_CAPABILITIES: Record<string, Role[]> = {
  'users.manage': ['admin'],
  'users.view': ['admin', 'support', 'moderator'],
  'moderation': ['admin', 'moderator'],
  'verification': ['admin', 'moderator'],
  'refunds': ['admin', 'support'],
  'commerce': ['admin'],
  'content': ['admin'],
  'analytics': ['admin'],
  'flags': ['admin'],
  'support': ['admin', 'support'],
  'privacy': ['admin', 'support'],
  'audit': ['admin'],
};

export function requireCapability(req: FastifyRequest, capability: keyof typeof STAFF_CAPABILITIES): AuthInfo {
  return requireRole(req, ...STAFF_CAPABILITIES[capability]);
}
