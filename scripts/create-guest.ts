/**
 * Creates a ready-to-sign-in guest login on a LOCAL Nakshatra install, through the app's own sign-up and
 * email-verification flow (nothing is written to the database directly).
 *
 *   npx tsx scripts/create-guest.ts "Display Name"
 *
 * The app must be running on http://localhost:4500 in development mode (it reads the local test mailbox, which only
 * answers this computer). The password is random and is NOT printed: the email and password are added to
 * .data/dev-credentials.json (git-ignored). The guest answers the onboarding questions themselves on first sign-in.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.NAKSHATRA_LOCAL ?? 'http://localhost:4500';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('Guest logins are only created on a local install.');
const name = (process.argv[2] ?? 'Guest').trim().slice(0, 40) || 'Guest';
const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'guest';
const email = `${slug}.${randomBytes(3).toString('hex')}@guest.nakshatra.local`;
// Readable but strong: three groups of random letters and digits.
const group = () => randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).padEnd(4, '7');
const password = `Nk-${group()}-${group()}-${group()}`;

let cookie = '';
const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(BASE + path, { method, headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': /nk_csrf=([^;]+)/.exec(cookie)?.[1] ?? '' }, body: body ? JSON.stringify(body) : undefined });
  for (const c of res.headers.getSetCookie?.() ?? []) { const kv = c.split(';')[0]; const k = kv.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; '); }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

await call('GET', '/api/v1/auth/csrf');
await call('POST', '/api/v1/auth/signup', { email, password, displayName: name, confirmAdult: true, acceptTerms: true });
const { emails } = await call('GET', `/api/v1/dev/mailbox?to=${encodeURIComponent(email)}`);
const token = (emails as { textBody?: string; body?: string }[]).map((e) => /verify-email\?token=([A-Za-z0-9_-]+)/.exec(e.textBody ?? e.body ?? '')?.[1]).find(Boolean);
if (!token) throw new Error('No verification email found in the local mailbox.');
await call('POST', '/api/v1/auth/verify-email', { token });
const me = await call('GET', '/api/v1/auth/me');
if (!me.user?.emailVerified && !me.user?.emailVerifiedAt) console.warn('Created, but could not confirm verification from the session.');

const dir = resolve(process.cwd(), '.data');
mkdirSync(dir, { recursive: true });
const file = resolve(dir, 'dev-credentials.json');
const prior = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
writeFileSync(file, JSON.stringify([...prior, { role: `guest login (${name})`, email, password }], null, 2));
console.log(`Created a verified guest login for "${name}" (${email}). The password is in ${file}.`);
