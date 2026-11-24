import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from './helpers';

/**
 * Launch configuration: the legacy modules (dating, matchmaking, experts, courses, marketplace, weddings,
 * community groups, direct messages) are switched off on the server. Their journeys live in e2e/legacy and run
 * only against a server started with E2E_MODULE_SCOPE=all.
 */
const LEGACY: { module: string; page: string; api: string }[] = [
  { module: 'dating', page: '/dating', api: 'dating/profile' },
  { module: 'matchmaking', page: '/matchmaking', api: 'matchmaking/profile' },
  { module: 'experts', page: '/experts', api: 'experts' },
  { module: 'learning', page: '/learn', api: 'courses' },
  { module: 'marketplace', page: '/seller', api: 'seller/products' },
  { module: 'weddings', page: '/weddings', api: 'weddings' },
  { module: 'community', page: '/social', api: 'groups' },
  { module: 'messages', page: '/messages', api: 'conversations' },
];

test('legacy modules are switched off: pages explain it, APIs refuse, navigation hides them', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Legacy');
  const status = await api(page, 'GET', 'features');
  for (const l of LEGACY) {
    expect(status.modules[l.module], `${l.module} flag`).toBe(false);
    const res = await page.request.get(`/api/v1/${l.api}`);
    expect(res.status(), `${l.api} should be refused`).toBe(404);
    expect((await res.json()).error.code).toBe('module_disabled');
    await page.goto(l.page);
    await expect(page.getByRole('heading', { name: 'This part of Nakshatra is switched off' })).toBeVisible();
  }
  // Booking an expert is refused server-side even with a well-formed request.
  const book = await page.request.post('/api/v1/bookings', { data: { serviceId: '00000000-0000-4000-8000-000000000000', start: new Date(Date.now() + 864e5).toISOString(), idempotencyKey: 'e2e-legacy-0001' }, headers: { 'x-csrf-token': (await page.context().cookies()).find((c) => c.name === 'nk_csrf')?.value ?? '' } });
  expect(book.status()).toBe(404);

  await page.goto('/home');
  const nav = page.getByRole('navigation').first();
  for (const label of ['Dating', 'Experts', 'Learn', 'Weddings', 'Messages', 'Matchmaking']) {
    await expect(nav.getByRole('link', { name: new RegExp(`^${label}$`) })).toHaveCount(0);
  }
  await w.assertClean();
});

test('re-enabling a legacy module is a deliberate, audited server-side change and is reversible', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxM = await browser.newContext();
  const ad = await ctxA.newPage();
  const m = await ctxM.newPage();
  const admin = seededAccount('admin');
  await signIn(ad, admin.email, admin.password);
  await quickUser(m, 'Toggle');

  expect((await m.request.get('/api/v1/experts')).status()).toBe(404);
  await api(ad, 'PUT', 'admin/flags/experts', { enabled: true, rolloutPercent: 100 });
  try {
    expect((await m.request.get('/api/v1/experts')).status()).toBe(200);
  } finally {
    await api(ad, 'PUT', 'admin/flags/experts', { enabled: false, rolloutPercent: 100 });
  }
  expect((await m.request.get('/api/v1/experts')).status()).toBe(404);
  const audit = await api(ad, 'GET', 'admin/audit?action=flag.update');
  expect(JSON.stringify(audit)).toContain('experts');
  // Members cannot flip flags.
  const csrf = (await ctxM.cookies()).find((c) => c.name === 'nk_csrf')?.value ?? '';
  expect((await m.request.put('/api/v1/admin/flags/experts', { data: { enabled: true, rolloutPercent: 100 }, headers: { 'x-csrf-token': csrf } })).status()).toBe(403);
  await Promise.all([ctxA.close(), ctxM.close()]);
});
