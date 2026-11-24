import { and, eq, gte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Executor } from '../db/client';
import { emailOutbox, notificationPreferences, notificationSettings, notifications, users } from '../db/schema';
import type { Ctx } from './context';

export const NOTIFICATION_CATEGORIES = [
  'bonds', 'social', 'messages', 'bookings', 'orders', 'learning', 'weddings', 'security', 'daily', 'matchmaking', 'dating', 'system', 'circles', 'games',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Categories that cannot be disabled in-app (account security and transactional receipts). */
const ESSENTIAL: NotificationCategory[] = ['security', 'orders', 'bookings'];

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  link?: string;
  /** Prevents duplicate notifications for the same trigger. */
  dedupeKey?: string;
}

function inQuietHours(now: DateTime, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const m = now.hour * 60 + now.minute;
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

/**
 * Creates an in-app notification honouring category preferences, a daily cap for
 * non-essential categories, and dedupe keys. Email is sent only when the user opted in,
 * is outside quiet hours and has not unsubscribed. Returns whether it was delivered in-app.
 */
export async function notify(ctx: Ctx, db: Executor, n: NotifyInput): Promise<boolean> {
  const [pref] = await db.select().from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, n.userId), eq(notificationPreferences.category, n.category)));
  const essential = ESSENTIAL.includes(n.category);
  const inApp = essential || (pref?.inApp ?? true);
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, n.userId));
  let delivered = false;
  if (inApp) {
    if (!essential) {
      const since = new Date(Date.now() - 86400000);
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications)
        .where(and(eq(notifications.userId, n.userId), gte(notifications.createdAt, since)));
      if (count >= (settings?.dailyCap ?? 10) * 3) return false; // hard ceiling on in-app volume
    }
    const res = await db.insert(notifications).values({
      userId: n.userId, category: n.category, title: n.title, body: n.body ?? '', link: n.link, dedupeKey: n.dedupeKey,
    }).onConflictDoNothing().returning({ id: notifications.id });
    delivered = res.length > 0;
  }
  const wantsEmail = essential ? (pref?.email ?? true) : (pref?.email ?? false);
  if (delivered && wantsEmail && !settings?.unsubscribedAllEmailAt) {
    const now = DateTime.now().setZone(settings?.timezone ?? 'Asia/Kolkata');
    if (essential || !inQuietHours(now, settings?.quietStart ?? null, settings?.quietEnd ?? null)) {
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, n.userId));
      if (u) await sendEmail(ctx, db, u.email, n.title, `${n.body ?? ''}\n\n${n.link ? ctx.config.APP_ORIGIN + n.link : ''}\n\nManage notifications: ${ctx.config.APP_ORIGIN}/settings/notifications`);
    }
  }
  return delivered;
}

/**
 * Mail adapter.
 * - dev_mailbox: stored in email_outbox and readable at /dev/mailbox; nothing leaves the machine (refused in production).
 * - smtp: queued in email_outbox, then delivered by deliverOutbox() after the caller's transaction commits
 *   (so a rolled-back action never sends mail). Failures retry up to MAX_ATTEMPTS times from the scheduler.
 */
export async function sendEmail(ctx: Ctx, db: Executor, to: string, subject: string, text: string) {
  if (ctx.config.MAIL_TRANSPORT === 'dev_mailbox') {
    await db.insert(emailOutbox).values({ toEmail: to, subject, textBody: text, transport: 'dev_mailbox', status: 'sent', sentAt: new Date() });
    ctx.log.info({ subject }, 'dev mailbox: email stored locally (not sent)');
    return;
  }
  await db.insert(emailOutbox).values({ toEmail: to, subject, textBody: text, transport: 'smtp', status: 'queued' });
  // Deliver shortly after the current request/transaction finishes.
  setTimeout(() => { void deliverOutbox(ctx).catch((e) => ctx.log.error({ err: (e as Error).message }, 'email delivery run failed')); }, 50);
}

const MAX_ATTEMPTS = 3;
type Transport = { sendMail: (m: { from: string; to: string; subject: string; text: string }) => Promise<unknown> };
let transport: Transport | null = null;
let transportUrl: string | null = null;
/** Tests can inject a transport; production builds one from SMTP_URL. */
export function setMailTransport(t: Transport | null) { transport = t; transportUrl = t ? 'injected' : null; }

async function getTransport(ctx: Ctx): Promise<Transport> {
  if (transport && (transportUrl === 'injected' || transportUrl === ctx.config.SMTP_URL)) return transport;
  const nodemailer = (await import('nodemailer')).default;
  // smtp://user:pass@host:587 (STARTTLS when offered) or smtps://user:pass@host:465 (implicit TLS).
  const u = new URL(ctx.config.SMTP_URL!);
  const secure = u.protocol === 'smtps:';
  transport = nodemailer.createTransport({
    host: u.hostname, port: Number(u.port || (secure ? 465 : 587)), secure,
    auth: u.username ? { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  }) as unknown as Transport;
  transportUrl = ctx.config.SMTP_URL!;
  return transport;
}

let running = false;
/** Sends queued SMTP mail and retries failures. Safe to call concurrently (single in-process runner + row claiming). */
export async function deliverOutbox(ctx: Ctx, limit = 50): Promise<{ sent: number; failed: number }> {
  if (ctx.config.MAIL_TRANSPORT !== 'smtp' || running) return { sent: 0, failed: 0 };
  running = true;
  let sent = 0;
  let failed = 0;
  try {
    // Claim queued mail, failed mail with attempts left, and claims abandoned for 10+ minutes (process died mid-send).
    const claimed = await ctx.db.update(emailOutbox).set({ status: 'sending', attempts: sql`${emailOutbox.attempts} + 1`, lastAttemptAt: new Date() })
      .where(sql`${emailOutbox.id} in (select id from email_outbox where transport = 'smtp' and attempts < ${MAX_ATTEMPTS} and (status = 'queued' or status = 'failed' or (status = 'sending' and last_attempt_at < now() - interval '10 minutes')) order by created_at limit ${limit} for update skip locked)`)
      .returning();
    if (!claimed.length) return { sent, failed };
    const tr = await getTransport(ctx);
    for (const m of claimed) {
      try {
        await tr.sendMail({ from: ctx.config.MAIL_FROM, to: m.toEmail, subject: m.subject, text: m.textBody });
        await ctx.db.update(emailOutbox).set({ status: 'sent', sentAt: new Date(), error: null }).where(eq(emailOutbox.id, m.id));
        sent++;
      } catch (e) {
        // Keep the provider's message short; it never contains the recipient's content.
        await ctx.db.update(emailOutbox).set({ status: 'failed', error: String((e as Error).message).slice(0, 300) }).where(eq(emailOutbox.id, m.id));
        ctx.log.warn({ attempts: m.attempts, err: (e as Error).message }, 'smtp delivery failed');
        failed++;
      }
    }
    return { sent, failed };
  } finally {
    running = false;
  }
}
