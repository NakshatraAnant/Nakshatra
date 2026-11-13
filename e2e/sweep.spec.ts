import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { api, quickUser, seededAccount, signIn } from './helpers';

/**
 * Diagnostic sweep (E2E_PERF=1 npx playwright test): every page, full motion, GPU requested. Stricter than the
 * smoke test: it records console errors, uncaught errors, server errors (5xx) and unexpected client errors (4xx
 * other than the permission and not-found answers pages are designed to handle). Findings go to
 * test-results/sweep.json and fail the test.
 */
const MEMBER = [
  '/home', '/identity', '/explore', '/create', '/thoughts', '/circles', '/play', '/play/quizzes', '/play/quizzes/new', '/play/tournaments',
  '/play/tournaments/new', '/play/leaderboard', '/progress', '/journal', '/year', '/theme', '/avatar', '/unlocks', '/saved', '/close-friends',
  '/creators', '/creator-studio', '/invite', '/today', '/cosmic-id', '/chart', '/calendar', '/bonds', '/membership', '/merch', '/perks', '/orgs',
  '/notifications', '/search?q=star', '/support', '/settings', '/settings/privacy', '/settings/security', '/settings/notifications', '/settings/data',
];
const ADMIN = ['overview', 'users', 'moderation', 'flags', 'launch', 'performance', 'funnel', 'audit'].map((s) => `/admin/${s}`);
const PUBLIC = ['/', '/personality', '/discover', '/signin', '/signup', '/legal/terms', '/legal/privacy', '/about/methodology'];

/** Answers the app is built to handle gracefully (signed-out probes, hidden content, disabled modules). */
const EXPECTED_4XX = new Set([401, 403, 404, 409]);

async function sweep(page: Page, paths: string[], who: string, out: Record<string, string[]>) {
  for (const path of paths) {
    const found: string[] = [];
    const onConsole = (m: import('@playwright/test').ConsoleMessage) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) found.push(`console: ${m.text().slice(0, 200)}`); };
    const onPageError = (e: Error) => found.push(`uncaught: ${e.message.slice(0, 200)}`);
    const onResponse = (r: import('@playwright/test').Response) => {
      const u = new URL(r.url());
      if (u.origin !== new URL(page.url() || 'http://x').origin && !u.pathname.startsWith('/api/')) return;
      const s = r.status();
      if (s >= 500 || (s >= 400 && !EXPECTED_4XX.has(s))) found.push(`${s} ${r.request().method()} ${u.pathname}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    await page.goto(path);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(600);
    if (await page.getByText('Something slipped out of orbit').count()) found.push('error screen shown');
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    if (found.length) out[`${who} ${path}`] = [...new Set(found)];
  }
}

test('diagnostic sweep: no console errors, crashes or unexpected failed requests on any page', async ({ browser }) => {
  test.setTimeout(600_000);
  const findings: Record<string, string[]> = {};

  const anon = await browser.newPage();
  await sweep(anon, PUBLIC, 'visitor', findings);
  await anon.close();

  const page = await browser.newPage();
  const { handle } = await quickUser(page, 'Sweeper');
  const { questions } = await api(page, 'GET', 'personality/questions');
  await api(page, 'POST', 'personality/assessment', { answers: Object.fromEntries((questions as { id: string }[]).map((q, i) => [q.id, [5, 2, 4, 1, 5, 3, 4, 2, 5, 1][i % 10]])) });
  await api(page, 'POST', 'posts', { kind: 'thought', body: 'Sweep drop', visibility: 'public' });
  const { circle } = await api(page, 'POST', 'circles', { name: 'Sweep circle' });
  await sweep(page, [...MEMBER, '/u/' + handle, '/circles/' + circle.id, '/circles/' + circle.id + '?tab=members'], 'member', findings);
  await page.close();

  const adminPage = await browser.newPage();
  const admin = seededAccount('admin');
  await signIn(adminPage, admin.email, admin.password);
  await sweep(adminPage, ADMIN, 'admin', findings);
  await adminPage.close();

  writeFileSync('test-results/sweep.json', JSON.stringify(findings, null, 2));
  console.info(JSON.stringify(findings, null, 2));
  expect(findings).toEqual({});
});
