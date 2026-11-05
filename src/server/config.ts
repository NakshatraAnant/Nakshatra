import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Loads .env (if present) without overriding real environment variables. */
function loadDotEnv() {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('127.0.0.1'),
  /** postgres://… for a real PostgreSQL server; omit to use the embedded PGlite database. */
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('./.data/pglite'),
  /** PEM CA certificate for verifying the PostgreSQL server (e.g. Supabase's CA). Literal "
" sequences are accepted for single-line env vars. */
  DATABASE_CA_CERT: z.string().optional(),
  /** Maximum pooled PostgreSQL connections; keep small on hosted poolers with per-project client limits. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  /** Dedicated schema for all app tables (e.g. "nakshatra") when sharing a database; unset = public. */
  DATABASE_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/, 'lower-case letters, digits and underscores').optional(),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Secret used for HMAC signing (unsubscribe links, dev payment webhooks). */
  APP_SECRET: z.string().min(32).optional(),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** local = files under UPLOAD_DIR; database = bytes in PostgreSQL (for hosts without a persistent disk). */
  STORAGE_DRIVER: z.enum(['local', 'database']).default('local'),
  /** Per-file cap when STORAGE_DRIVER=database, to stay inside small database quotas. */
  DATABASE_FILE_MAX_MB: z.coerce.number().min(1).max(50).default(5),
  MAX_UPLOAD_MB: z.coerce.number().default(5),
  /**
   * Master switch for real money. Must be exactly "true" before any live provider (razorpay) can be used.
   * The dev simulator (no money moves; refused in production) is a test mode and is not gated by this.
   */
  PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false'),
  /** Payments: dev_simulator (clearly labelled, no real money), razorpay (live; needs PAYMENTS_ENABLED=true) or none. */
  PAYMENT_PROVIDER: z.enum(['dev_simulator', 'razorpay', 'none']).default('dev_simulator'),
  /** launch = legacy modules start switched off (once per database); all = every module on (tests, legacy e2e). */
  MODULE_SCOPE: z.enum(['launch', 'all']).optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  /** Email: dev_mailbox stores mail in the database for local viewing; smtp requires SMTP_URL. */
  MAIL_TRANSPORT: z.enum(['dev_mailbox', 'smtp']).default('dev_mailbox'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Nakshatra <no-reply@nakshatra.local>'),
  /** Video consultation provider; unset = video unavailable (shown as such in UI). */
  VIDEO_PROVIDER: z.enum(['none']).default('none'),
  PUSH_PROVIDER: z.enum(['none']).default('none'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEED_DEMO_DATA: z.enum(['true', 'false']).default('true'),
  /** Number of trusted reverse-proxy hops (e.g. 1 behind Nginx/ALB) so client IPs are correct for rate limits and audit logs. 0 = direct. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

export type AppConfig = Omit<z.infer<typeof schema>, 'MODULE_SCOPE'> & { MODULE_SCOPE: 'launch' | 'all'; appSecret: string; isProd: boolean };

export function loadConfig(overrides: Partial<Record<keyof z.infer<typeof schema>, string>> = {}): AppConfig {
  // Blank values (e.g. `APP_SECRET=` copied from .env.example) mean "not set", not "set to an empty string".
  const raw: Record<string, string | undefined> = Object.fromEntries(Object.entries({ ...process.env, ...overrides }).filter(([, v]) => v !== undefined && v !== ''));
  // On Render the public URL is provided automatically; an explicit APP_ORIGIN (e.g. a custom domain) still wins.
  if (!raw.APP_ORIGIN && raw.RENDER_EXTERNAL_URL) raw.APP_ORIGIN = raw.RENDER_EXTERNAL_URL;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const c = parsed.data;
  const isProd = c.NODE_ENV === 'production';
  if (isProd && !c.APP_SECRET) throw new Error('APP_SECRET (≥32 chars) is required in production');
  if (isProd && c.PAYMENT_PROVIDER === 'dev_simulator') {
    throw new Error('The development payment simulator cannot be used when NODE_ENV=production');
  }
  if (c.PAYMENT_PROVIDER === 'razorpay' && c.PAYMENTS_ENABLED !== 'true') {
    throw new Error('PAYMENT_PROVIDER=razorpay moves real money and requires PAYMENTS_ENABLED=true. Payments are disabled for this installation.');
  }
  if (c.PAYMENT_PROVIDER === 'razorpay' && !(c.RAZORPAY_KEY_ID && c.RAZORPAY_KEY_SECRET && c.RAZORPAY_WEBHOOK_SECRET)) {
    throw new Error('PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET');
  }
  if (c.MAIL_TRANSPORT === 'smtp' && !c.SMTP_URL) throw new Error('MAIL_TRANSPORT=smtp requires SMTP_URL');
  if (isProd && c.MAIL_TRANSPORT === 'dev_mailbox' && process.env.ALLOW_DEV_MAILBOX_IN_PRODUCTION !== 'true') {
    throw new Error('MAIL_TRANSPORT=dev_mailbox stores mail locally and cannot be used in production. Set MAIL_TRANSPORT=smtp and SMTP_URL (or ALLOW_DEV_MAILBOX_IN_PRODUCTION=true for a local production-mode trial).');
  }
  return {
    ...c,
    MODULE_SCOPE: c.MODULE_SCOPE ?? (c.NODE_ENV === 'test' ? 'all' : 'launch'),
    // Development fallback secret is deterministic and clearly non-production.
    appSecret: c.APP_SECRET ?? 'dev-only-insecure-secret-change-me-0123456789',
    isProd,
  };
}

/** Integration status reported to the UI so unavailable providers are clearly labelled. */
export function integrationStatus(c: AppConfig) {
  return {
    payments: c.PAYMENT_PROVIDER === 'dev_simulator'
      ? { status: 'development', label: 'Development payment simulator — no real money moves' }
      : c.PAYMENT_PROVIDER === 'razorpay'
        ? { status: 'configured', label: 'Razorpay' }
        : { status: 'unavailable', label: 'Payments not configured' },
    email: c.MAIL_TRANSPORT === 'dev_mailbox'
      ? { status: 'development', label: 'Development mailbox — emails are stored locally, not sent' }
      : { status: 'configured', label: 'SMTP' },
    video: { status: 'unavailable', label: 'Video consultations unavailable — no video provider configured' },
    voice: { status: 'unavailable', label: 'Voice consultations unavailable — no telephony provider configured' },
    push: { status: 'unavailable', label: 'Push notifications unavailable — no push provider configured' },
    database: c.DATABASE_URL ? { status: 'configured', label: 'PostgreSQL' } : { status: 'development', label: 'Embedded PostgreSQL (PGlite)' },
  };
}
