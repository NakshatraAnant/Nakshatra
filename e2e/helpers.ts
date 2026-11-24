import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

let n = 0;
export const uniqueEmail = (tag: string) => `${tag}.${Date.now()}.${n++}@example.test`;
/** Throwaway password for accounts that exist only in the e2e database. */
export const PASSWORD = `e2e-${randomUUID()}`;

export function seededAccount(role: string): { email: string; password: string } {
  const creds: { role: string; email: string; password: string }[] = JSON.parse(readFileSync(resolve(process.cwd(), '.data/e2e/credentials.json'), 'utf8'));
  const c = creds.find((x) => x.role === role);
  if (!c) throw new Error(`No seeded ${role} account`);
  return c;
}

/** JSON API calls that share the page's cookies, including the CSRF double-submit header. */
export async function api(page: Page, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: unknown) {
  const req: APIRequestContext = page.request;
  let csrf = (await page.context().cookies()).find((c) => c.name === 'nk_csrf')?.value;
  if (!csrf) {
    await req.get('/api/v1/auth/csrf');
    csrf = (await page.context().cookies()).find((c) => c.name === 'nk_csrf')?.value;
  }
  const res = await req.fetch(`/api/v1/${path}`, { method, data: data === undefined ? undefined : data, headers: { 'x-csrf-token': csrf ?? '' } });
  const text = await res.text();
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

export async function signUpViaUi(page: Page, name: string, email = uniqueEmail(name.toLowerCase())) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByText('I am 18 or older.').click();
  await page.getByText('I accept the').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/(onboarding|today|verify)/);
  return email;
}

export async function verifyEmail(page: Page, email: string) {
  const box = await api(page, 'GET', `dev/mailbox?to=${encodeURIComponent(email)}`);
  const mail = box.emails.find((m: { subject: string }) => /verify/i.test(m.subject)) ?? box.emails[0];
  const token = /token=([A-Za-z0-9_-]+)/.exec(mail.textBody)![1];
  await api(page, 'POST', 'auth/verify-email', { token });
}

/** Fast account setup for journeys that are not about onboarding itself. */
export async function quickUser(page: Page, name: string, birth: { date?: string; time?: string } = {}) {
  const email = uniqueEmail(name.toLowerCase());
  await page.goto('/');
  await api(page, 'POST', 'auth/signup', { email, password: PASSWORD, displayName: name, confirmAdult: true, acceptTerms: true });
  await verifyEmail(page, email);
  await api(page, 'PUT', 'birth-profile', {
    date: birth.date ?? '1993-08-21', time: birth.time ?? '14:35', timePrecision: 'exact',
    place: { kind: 'manual', name: 'Jaipur, India', latitude: 26.9124, longitude: 75.7873, timezone: 'Asia/Kolkata' },
    consentBirthData: true,
  });
  const me = await api(page, 'GET', 'auth/me');
  return { email, userId: me.user.id as string, handle: me.user.profile.handle as string };
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/signin/);
}

export async function signOut(page: Page) {
  await api(page, 'POST', 'auth/logout');
  await page.context().clearCookies();
}

/** Fails the test if the app rendered its route error boundary or logged an uncaught error. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return {
    errors,
    async assertClean() {
      await expect(page.getByText('Something slipped out of orbit')).toHaveCount(0);
      expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toEqual([]);
    },
  };
}

/** A first-time visitor sees the introduction over the landing page; journeys that start there skip it, as a person would. */
export async function skipIntro(page: Page) {
  const skip = page.getByTestId('cinematic-intro').getByRole('button', { name: 'Skip intro' });
  await skip.click({ timeout: 8000 }).catch(() => undefined);
  await expect(page.getByTestId('cinematic-intro')).toHaveCount(0);
}
