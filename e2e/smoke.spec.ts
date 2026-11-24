import { expect, test, type Page } from '@playwright/test';
import { quickUser, seededAccount, signIn } from './helpers';

const PUBLIC = ['/', '/personality', '/discover', '/signin', '/signup', '/forgot-password', '/legal/terms', '/legal/privacy', '/about/methodology', '/dev/mailbox'];
const MEMBER = [
  '/home', '/identity', '/thoughts', '/circles', '/play', '/invite', '/shop/p/cosmetic-card-styles', '/shop/p/report-identity-expanded',
  '/today', '/cosmic-id', '/chart', '/calendar', '/calendar?tab=festivals', '/calendar?tab=muhurat', '/journey', '/journey/rewards', '/journey/wrapped',
  '/bonds', '/social', '/social/groups', '/social/events', '/social/requests', '/messages', '/dating', '/dating/profile',
  '/matchmaking', '/matchmaking/profile', '/matchmaking/family', '/experts', '/experts/bookings', '/expert/dashboard',
  '/learn', '/learn/foundations-of-astrology-sample', '/creator', '/shop', '/shop/p/report-complete-vedic', '/shop/p/sample-puja-diya-set', '/shop/cart', '/shop/orders', '/shop/library', '/seller',
  '/weddings', '/weddings/new', '/vendors', '/vendor/dashboard', '/notifications', '/search?q=astro', '/support',
  '/settings', '/settings/birth', '/settings/privacy', '/settings/notifications', '/settings/security', '/settings/subscription', '/settings/data', '/settings/appeals', '/membership', '/explore', '/create', '/progress', '/play/tournaments', '/play/tournaments/new', '/play/leaderboard', '/play/quizzes', '/creators', '/creator-studio', '/saved', '/close-friends', '/journal', '/year', '/theme', '/avatar', '/unlocks',
];
const ADMIN = ['overview', 'users', 'moderation', 'appeals', 'verification', 'refunds', 'payouts', 'commerce', 'courses', 'vendors', 'content', 'config', 'templates', 'analytics', 'audit', 'flags', 'support', 'privacy', 'launch', 'performance', 'funnel', 'assessment', 'cod', 'students'].map((s) => `/admin/${s}`);

async function visitAll(page: Page, paths: string[]) {
  const failures: string[] = [];
  for (const path of paths) {
    const errors: string[] = [];
    const onErr = (e: Error) => errors.push(e.message);
    page.on('pageerror', onErr);
    await page.goto(path);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const crashed = await page.getByText('Something slipped out of orbit').count();
    const notFound = await page.getByText('This path leads nowhere').count();
    const loadError = await page.getByRole('alert').filter({ hasText: /couldn’t load|could not load|went wrong/i }).count();
    const heading = await page.getByRole('heading').first().isVisible().catch(() => false);
    page.off('pageerror', onErr);
    if (crashed || notFound || loadError || !heading || errors.length) failures.push(`${path}: crashed=${crashed} 404=${notFound} loadError=${loadError} heading=${heading} errors=${errors.join(' | ')}`);
  }
  return failures;
}

test('every public route renders', async ({ page }) => {
  expect(await visitAll(page, PUBLIC)).toEqual([]);
});

test('every member route renders without errors', async ({ page }) => {
  test.setTimeout(600_000);
  const u = await quickUser(page, 'Smoke');
  const extra = [`/u/${u.handle}`];
  expect(await visitAll(page, [...MEMBER, ...extra])).toEqual([]);
});

test('every admin section renders for an administrator and is refused to members', async ({ browser }) => {
  test.setTimeout(400_000);
  const ctxA = await browser.newContext();
  const ad = await ctxA.newPage();
  const admin = seededAccount('admin');
  await signIn(ad, admin.email, admin.password);
  expect(await visitAll(ad, ADMIN)).toEqual([]);

  const ctxM = await browser.newContext();
  const m = await ctxM.newPage();
  await quickUser(m, 'NotStaff');
  for (const path of ['admin/overview', 'admin/users', 'admin/refunds', 'admin/audit', 'admin/analytics', 'admin/privacy-requests']) {
    expect((await m.request.get(`/api/v1/${path}`)).status(), path).toBe(403);
  }
  await m.goto('/admin/users');
  await expect(m.getByRole('heading', { name: 'Users' })).toHaveCount(0);
  await Promise.all([ctxA.close(), ctxM.close()]);
});

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/this/does/not/exist');
  await expect(page.getByText('This path leads nowhere')).toBeVisible();
});
