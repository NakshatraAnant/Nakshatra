import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../../src/server/config';
import { buildApp } from '../../src/server/app';
import { openDatabase } from '../../src/server/db/client';
import type { Ctx } from '../../src/server/lib/context';
import * as s from '../../src/server/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

/** Tables another application keeps in public with the same names as Nakshatra's, plus a row each. */
export const LEGACY_PUBLIC_TABLES = `
  create table public.profiles (id uuid primary key default gen_random_uuid(), username text, created_at timestamptz default now());
  create table public.products (id serial primary key, name text);
  create table public.referrals (id serial primary key, code text);
  create table public.analytics_events (id serial primary key, name text);
  create table public.audit_logs (id serial primary key, action text);
  create table public.users (id serial primary key, legacy text);
  insert into public.profiles (username) values ('legacy-user');
  insert into public.products (name) values ('legacy-product');
  insert into public.referrals (code) values ('LEGACY');
  insert into public.analytics_events (name) values ('legacy-event');
  insert into public.audit_logs (action) values ('legacy-action');
  insert into public.users (legacy) values ('legacy');
`;

export interface TestApp { app: FastifyInstance; ctx: Ctx; close: () => Promise<void> }

/**
 * In-memory PGlite by default. Set TEST_DATABASE_URL (a PostgreSQL server URL whose user may CREATE DATABASE)
 * to run the same suite against real PostgreSQL: each test file gets its own throwaway database, dropped afterwards.
 */
export async function makeApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  // Tests never depend on the local .env: payments use the labelled no-money simulator, email the dev mailbox.
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', PGLITE_DIR: ':memory:', PAYMENT_PROVIDER: 'dev_simulator', MAIL_TRANSPORT: 'dev_mailbox', UPLOAD_DIR: './.data/test-uploads', APP_ORIGIN: 'http://localhost:5173', ...overrides });
  const serverUrl = process.env.TEST_DATABASE_URL;
  let dropDb: (() => Promise<void>) | null = null;
  let databaseUrl: string | undefined;
  if (serverUrl) {
    const pg = (await import('pg')).default;
    const name = `nakshatra_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const admin = new pg.Client({ connectionString: serverUrl });
    await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.end();
    const u = new URL(serverUrl);
    u.pathname = `/${name}`;
    databaseUrl = u.toString();
    dropDb = async () => {
      const c = new pg.Client({ connectionString: serverUrl });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    };
  }
  // TEST_DATABASE_SCHEMA runs the suite with the app in its own schema, next to clashing tables in public.
  const schemaName = process.env.TEST_DATABASE_SCHEMA || undefined;
  const dbHandle = await openDatabase({ databaseUrl, pgliteDir: ':memory:', schemaName });
  if (schemaName) for (const st of LEGACY_PUBLIC_TABLES.split(';').map((x) => x.trim()).filter(Boolean)) await dbHandle.db.execute(sql.raw(st));
  const { app, ctx } = await buildApp(config, { dbHandle, logger: false });
  await app.ready();
  return { app, ctx, close: async () => { await app.close(); await dbHandle.close(); if (dropDb) await dropDb(); } };
}

/** A cookie-jar client that handles session + CSRF like a browser. */
export class Client {
  cookies = new Map<string, string>();
  constructor(private app: FastifyInstance) {}

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async req<T = any>(method: string, url: string, body?: unknown, opts: { expect?: number; headers?: Record<string, string> } = {}): Promise<{ status: number; body: T; raw: string }> {
    if (!this.cookies.has('nk_csrf')) await this.prime();
    const res = await this.app.inject({
      method: method as never, url,
      headers: { cookie: this.cookieHeader(), 'x-csrf-token': this.cookies.get('nk_csrf') ?? '', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...opts.headers },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of ([] as string[]).concat((res.headers['set-cookie'] as string | string[] | undefined) ?? [])) {
      const [pair] = c.split(';');
      const [k, ...v] = pair.split('=');
      const value = v.join('=');
      if (/expires=Thu, 01 Jan 1970/i.test(c) || value === '') this.cookies.delete(k.trim());
      else this.cookies.set(k.trim(), value);
    }
    let parsed: T;
    try { parsed = JSON.parse(res.body); } catch { parsed = res.body as unknown as T; }
    if (opts.expect !== undefined && res.statusCode !== opts.expect) {
      throw new Error(`${method} ${url} → ${res.statusCode} (expected ${opts.expect}): ${res.body.slice(0, 500)}`);
    }
    return { status: res.statusCode, body: parsed, raw: res.body };
  }

  async prime() {
    const res = await this.app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
    for (const c of ([] as string[]).concat((res.headers['set-cookie'] as string | string[] | undefined) ?? [])) {
      const [pair] = c.split(';');
      const [k, ...v] = pair.split('=');
      this.cookies.set(k.trim(), v.join('='));
    }
  }

  get = <T = any>(url: string, expect = 200) => this.req<T>('GET', url, undefined, { expect }).then((r) => r.body);
  post = <T = any>(url: string, body: unknown = {}, expect = 200) => this.req<T>('POST', url, body, { expect }).then((r) => r.body);
  put = <T = any>(url: string, body: unknown = {}, expect = 200) => this.req<T>('PUT', url, body, { expect }).then((r) => r.body);
  patch = <T = any>(url: string, body: unknown = {}, expect = 200) => this.req<T>('PATCH', url, body, { expect }).then((r) => r.body);
  del = <T = any>(url: string, expect = 200) => this.req<T>('DELETE', url, undefined, { expect }).then((r) => r.body);
}

let counter = 0;
export async function signup(t: TestApp, name = 'Tester', opts: { verify?: boolean; birth?: Partial<{ date: string; time: string | null; placeId: string }> | false; referralCode?: string } = {}) {
  const c = new Client(t.app);
  const email = `user${Date.now()}${counter++}@example.test`;
  const password = 'correct-horse-battery';
  const r = await c.post('/api/v1/auth/signup', { email, password, displayName: name, confirmAdult: true, acceptTerms: true, referralCode: opts.referralCode }, 201);
  if (opts.verify !== false) {
    const [mail] = await t.ctx.db.select().from(s.emailOutbox).where(eq(s.emailOutbox.toEmail, email)).orderBy(desc(s.emailOutbox.createdAt));
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.textBody)![1];
    await c.post('/api/v1/auth/verify-email', { token });
  }
  if (opts.birth !== false) {
    const b = { date: '1992-05-14', time: '06:20', placeId: '', ...opts.birth };
    await c.put('/api/v1/birth-profile', {
      date: b.date, time: b.time, timePrecision: b.time ? 'exact' : 'unknown',
      place: { kind: 'manual', name: 'New Delhi, India', latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata' },
      consentBirthData: true,
    });
  }
  return { c, email, password, userId: r.user.id as string, handle: r.user.profile.handle as string };
}

export async function makeAdmin(t: TestApp, userId: string) {
  await t.ctx.db.insert(s.userRoles).values({ userId, role: 'admin' }).onConflictDoNothing();
}
