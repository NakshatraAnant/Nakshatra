import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Executor } from '../db/client';
import type { Ctx } from '../lib/context';
import { audit, track } from '../lib/context';
import { randomToken, sha256 } from '../lib/crypto';
import { conflict, AppError, forbidden, notFound } from '../lib/http';
import { notify, sendEmail } from '../lib/notify';
import { generateReport } from './reports';

/**
 * Gifting (gifts-v1).
 *
 * 1. A gift claim is created only inside the payment-succeeded handler, one per gifted order item
 *    (unique on order_item_id, so a replayed provider event cannot create a second claim).
 * 2. The entitlement is granted to the RECIPIENT, never the purchaser, when a verified account whose
 *    email matches the intended address claims it — automatically on email verification, or via the
 *    emailed claim link while signed in. Only a hash of the claim token is stored.
 * 3. Claims expire after GIFT_TTL_DAYS; refunds cancel pending claims and revoke claimed entitlements.
 * 4. Reports are generated lazily (on claim or later from the library), never inside the payment
 *    transaction, so missing recipient data can never fail a payment.
 */
export const GIFT_TTL_DAYS = 30;

export function maskEmail(email: string): string {
  const [local, domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain}`;
}

interface DigitalAsset { courseId?: string; reportTemplate?: string }

/** Called from the order payment handler (inside its transaction) for each gifted digital item. */
export async function createGiftClaim(ctx: Ctx, tx: Executor, o: typeof s.orders.$inferSelect, item: typeof s.orderItems.$inferSelect): Promise<void> {
  const email = (o.giftRecipientEmail ?? '').trim().toLowerCase();
  if (!email) return;
  const token = randomToken(24);
  const [claim] = await tx.insert(s.giftClaims).values({
    orderItemId: item.id, orderId: o.id, productId: item.productId, purchaserId: o.userId, recipientEmail: email,
    message: o.giftMessage ?? '', tokenHash: sha256(token), expiresAt: new Date(Date.now() + GIFT_TTL_DAYS * 86400000),
  }).onConflictDoNothing().returning();
  if (!claim) return; // already created for this item (duplicate provider event)
  await audit(tx, { actorId: o.userId, action: 'gift.created', targetType: 'gift_claim', targetId: claim.id });
  await sendEmail(ctx, tx, email, 'You received a gift on Nakshatra',
    `${o.giftMessage ? `“${o.giftMessage}”\n\n` : ''}Someone sent you “${item.title}” on Nakshatra.\n\nClaim it here (sign in or create an account with this email address): ${ctx.config.APP_ORIGIN}/gifts/claim/${token}\n\nThis gift can be claimed until ${claim.expiresAt.toDateString()}.`);
  // A verified member with this email gets it straight away; nobody else can.
  const [recipient] = await tx.select({ id: s.users.id, verified: s.users.emailVerifiedAt }).from(s.users).where(and(sql`lower(${s.users.email}) = ${email}`, eq(s.users.status, 'active')));
  if (recipient?.verified) await claimGift(ctx, tx, claim.id, recipient.id).catch(() => undefined);
}

/**
 * Claims one pending gift for a user. The caller must have checked the user's verified email matches.
 * Transaction-safe: the status guard in the UPDATE makes concurrent claims a no-op for all but one.
 */
export async function claimGift(ctx: Ctx, db: Executor, claimId: string, userId: string) {
  const [c] = await db.select().from(s.giftClaims).where(eq(s.giftClaims.id, claimId));
  if (!c) throw notFound('Gift');
  if (c.status === 'claimed') { if (c.recipientUserId === userId) return c; throw conflict('This gift has already been claimed.'); }
  if (c.status !== 'pending') throw new AppError(410, 'gift_unavailable', c.status === 'expired' ? 'This gift has expired.' : 'This gift is no longer available.');
  if (c.expiresAt < new Date()) throw new AppError(410, 'gift_expired', 'This gift has expired.');
  const [u] = await db.select({ email: s.users.email, verified: s.users.emailVerifiedAt }).from(s.users).where(eq(s.users.id, userId));
  if (!u?.verified) throw forbidden('Verify your email address to claim this gift.');
  if (u.email.toLowerCase() !== c.recipientEmail) throw forbidden('This gift was sent to a different email address.');
  const [p] = await db.select().from(s.products).where(eq(s.products.id, c.productId));
  const asset = (p.digitalAsset ?? {}) as DigitalAsset;
  const refId = asset.courseId ?? p.id;
  const owned = await db.select({ id: s.entitlements.id }).from(s.entitlements).where(and(eq(s.entitlements.userId, userId), eq(s.entitlements.refId, refId), isNull(s.entitlements.revokedAt)));
  if (owned.length) throw conflict('You already own this. The sender can ask for a refund of the gift.');
  const [taken] = await db.update(s.giftClaims).set({ status: 'claimed', recipientUserId: userId, claimedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.giftClaims.id, c.id), eq(s.giftClaims.status, 'pending'), gt(s.giftClaims.expiresAt, new Date()))).returning();
  if (!taken) throw conflict('This gift has already been claimed.');
  const [ent] = await db.insert(s.entitlements).values({ userId, kind: asset.courseId ? 'course' : 'product', refId, sourceType: 'gift_claim', sourceId: c.id }).onConflictDoNothing().returning();
  if (ent) await db.update(s.giftClaims).set({ entitlementId: ent.id }).where(eq(s.giftClaims.id, c.id));
  if (asset.courseId) {
    const { grantCourseEnrollment } = await import('../modules/learning');
    await grantCourseEnrollment(db as never, userId, asset.courseId, 'purchase', c.orderId);
  }
  if (ent && asset.reportTemplate) await tryGenerateReport(db, userId, ent.id, asset.reportTemplate);
  await audit(db, { actorId: userId, action: 'gift.claimed', targetType: 'gift_claim', targetId: c.id });
  await track(db, userId, 'gift_claimed', {});
  await notify(ctx, db, { userId: c.purchaserId, category: 'orders', title: 'Your gift was claimed', body: p.title, link: '/shop/library', dedupeKey: `gift-claimed:${c.id}` });
  await notify(ctx, db, { userId, category: 'orders', title: 'A gift is in your library', body: p.title, link: '/shop/library', dedupeKey: `gift-received:${c.id}` });
  return taken;
}

/** Claims every pending, unexpired gift addressed to this (verified) user's email. Never throws. */
export async function claimPendingGiftsForUser(ctx: Ctx, userId: string): Promise<number> {
  const [u] = await ctx.db.select({ email: s.users.email, verified: s.users.emailVerifiedAt }).from(s.users).where(eq(s.users.id, userId));
  if (!u?.verified) return 0;
  const pending = await ctx.db.select({ id: s.giftClaims.id }).from(s.giftClaims).where(and(eq(s.giftClaims.recipientEmail, u.email.toLowerCase()), eq(s.giftClaims.status, 'pending'), gt(s.giftClaims.expiresAt, new Date())));
  let n = 0;
  for (const g of pending) {
    try { await ctx.db.transaction(async (tx) => { await claimGift(ctx, tx, g.id, userId); }); n++; } catch { /* already owned or raced: leave pending */ }
  }
  return n;
}

/**
 * Generates a report document for an entitlement inside a savepoint. Missing prerequisites (no assessment,
 * no birth profile) leave the entitlement without a document; the library offers to generate it later.
 */
export async function tryGenerateReport(db: Executor, userId: string, entitlementId: string, templateKey: string): Promise<boolean> {
  try {
    await (db as unknown as { transaction: (fn: (sp: Executor) => Promise<void>) => Promise<void> }).transaction(async (sp) => {
      const content = await generateReport(sp, userId, templateKey);
      await sp.insert(s.reportDocuments).values({ userId, entitlementId, templateKey, engineVersion: content.engineVersion, content: content as unknown as Record<string, unknown> });
    });
    return true;
  } catch {
    return false;
  }
}

/** Refund of a gifted order: pending claims are cancelled; claimed entitlements are revoked. */
export async function refundGifts(tx: Executor, orderId: string) {
  await tx.update(s.giftClaims).set({ status: 'refunded', updatedAt: new Date() }).where(and(eq(s.giftClaims.orderId, orderId), eq(s.giftClaims.status, 'pending')));
  const claimed = await tx.select({ id: s.giftClaims.id }).from(s.giftClaims).where(and(eq(s.giftClaims.orderId, orderId), eq(s.giftClaims.status, 'claimed')));
  for (const c of claimed) {
    await tx.update(s.entitlements).set({ revokedAt: new Date() }).where(and(eq(s.entitlements.sourceType, 'gift_claim'), eq(s.entitlements.sourceId, c.id)));
    await tx.update(s.giftClaims).set({ status: 'refunded', updatedAt: new Date() }).where(eq(s.giftClaims.id, c.id));
  }
}

/** Scheduler: pending claims past their expiry become expired, and the purchaser is told. */
export async function expireGifts(ctx: Ctx, now = new Date()): Promise<number> {
  const expired = await ctx.db.update(s.giftClaims).set({ status: 'expired', updatedAt: now }).where(and(eq(s.giftClaims.status, 'pending'), lt(s.giftClaims.expiresAt, now))).returning();
  for (const g of expired) await notify(ctx, ctx.db, { userId: g.purchaserId, category: 'orders', title: 'A gift you sent expired unclaimed', body: 'You can request a refund from the order page.', link: `/shop/orders/${g.orderId}`, dedupeKey: `gift-expired:${g.id}` });
  return expired.length;
}
