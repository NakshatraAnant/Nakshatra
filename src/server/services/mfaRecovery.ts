import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import type { Executor as Db } from '../db/client';
import { hmac } from '../lib/crypto';

export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i

/** Canonical form: lowercase, no separators. Users may type "abcd-efgh-ij" or "ABCDEFGHIJ". */
export function normaliseRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function looksLikeRecoveryCode(input: string | undefined): boolean {
  return !!input && normaliseRecoveryCode(input).length === 10;
}

function newCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

function codeHash(ctx: Ctx, userId: string, code: string): string {
  return hmac(ctx.config.appSecret, `mfa-recovery:${userId}:${normaliseRecoveryCode(code)}`);
}

/** Replaces every existing code with a fresh set. Returns the plaintext codes — shown once, never stored. */
export async function issueRecoveryCodes(ctx: Ctx, db: Db, userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newCode);
  await db.delete(s.mfaRecoveryCodes).where(eq(s.mfaRecoveryCodes.userId, userId));
  await db.insert(s.mfaRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: codeHash(ctx, userId, c) })));
  return codes;
}

/** Atomically consumes a code. True only for an unused code belonging to this user. */
export async function consumeRecoveryCode(ctx: Ctx, db: Db, userId: string, code: string): Promise<boolean> {
  if (!looksLikeRecoveryCode(code)) return false;
  const hit = await db.update(s.mfaRecoveryCodes).set({ usedAt: new Date() })
    .where(and(eq(s.mfaRecoveryCodes.userId, userId), eq(s.mfaRecoveryCodes.codeHash, codeHash(ctx, userId, code)), isNull(s.mfaRecoveryCodes.usedAt)))
    .returning({ id: s.mfaRecoveryCodes.id });
  return hit.length === 1;
}

export async function recoveryCodesRemaining(db: Db, userId: string): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.mfaRecoveryCodes)
    .where(and(eq(s.mfaRecoveryCodes.userId, userId), isNull(s.mfaRecoveryCodes.usedAt)));
  return n;
}

export async function clearRecoveryCodes(db: Db, userId: string) {
  await db.delete(s.mfaRecoveryCodes).where(eq(s.mfaRecoveryCodes.userId, userId));
}
