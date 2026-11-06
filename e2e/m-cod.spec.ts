import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from './helpers';

/**
 * Cash-on-delivery merch: the module is off at launch, so an administrator switches it on for this test
 * (a deliberate server-side change) and switches it off again afterwards.
 */
test('COD checkout: draft → place (unpaid) → staff confirm → pack → dispatch → deliver (paid in cash) → stock updated', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxC = await browser.newContext();
  const ad = await ctxA.newPage();
  const cu = await ctxC.newPage();
  const wc = watchErrors(cu);
  const admin = seededAccount('admin');
  await signIn(ad, admin.email, admin.password);
  await quickUser(cu, 'Meera');
  expect((await cu.request.get('/api/v1/merch/products')).status()).toBe(404);
  await api(ad, 'PUT', 'admin/flags/merch', { enabled: true, rolloutPercent: 100 });
  try {
    const before = (await api(cu, 'GET', 'merch/products')).products.find((p: { slug: string }) => p.slug === 'sample-archetype-tee').variants.find((v: { name: string }) => v.name === 'M');

    await cu.goto('/merch');
    await expect(cu.getByText('Development sample').first()).toBeVisible();
    await cu.getByLabel('Quantity of Archetype tee (sample) M').selectOption('2');
    await cu.getByLabel('Full name').fill('Meera Nair');
    await cu.getByLabel('Mobile number').fill('98450 12345');
    await cu.getByLabel('House / street').fill('4 Temple Street');
    await cu.getByLabel('City').fill('Kochi');
    await cu.getByLabel('State / UT').selectOption('Kerala');
    await cu.getByLabel('PIN code').fill('682001');
    await cu.getByRole('button', { name: 'Review order' }).click();
    const review = cu.getByLabel('Order review');
    await expect(review.getByText('Pay the courier in cash')).toBeVisible();
    await expect(review.getByText('Free')).toBeVisible(); // ₹1,198 ≥ free-shipping threshold
    await cu.getByRole('button', { name: /Place order/ }).click();
    await cu.waitForURL(/\/merch\/orders\/[0-9a-f-]{36}$/);
    const orderId = new URL(cu.url()).pathname.split('/').pop()!;
    await expect(cu.getByText('Pending confirmation').first()).toBeVisible();
    await expect(cu.getByText('Unpaid — pay cash on delivery').first()).toBeVisible();
    const reserved = (await api(cu, 'GET', 'merch/products')).products.find((p: { slug: string }) => p.slug === 'sample-archetype-tee').variants.find((v: { name: string }) => v.name === 'M');
    expect(reserved.available).toBe(before.available - 2);

    // Staff fulfil it from the console.
    await ad.goto('/admin/cod');
    const number = (await api(cu, 'GET', `merch/orders/${orderId}`)).order.number;
    const row = ad.getByRole('listitem').filter({ hasText: number });
    for (const step of ['Confirmed', 'Processing', 'Packed']) {
      await row.getByLabel('Move to').selectOption({ label: step });
      await row.getByRole('button', { name: 'Update' }).click();
      await expect(row.getByText(step, { exact: true }).first()).toBeVisible();
    }
    await row.getByLabel('Move to').selectOption({ label: 'Dispatched' });
    await expect(row.getByRole('button', { name: 'Update' })).toBeDisabled(); // courier required
    await row.getByLabel('Courier (required)').fill('India Post');
    await row.getByRole('button', { name: 'Update' }).click();
    await expect(row.getByText('Dispatched', { exact: true }).first()).toBeVisible();
    await row.getByLabel('Move to').selectOption({ label: 'Delivered' });
    await row.getByRole('button', { name: 'Update' }).click();
    await expect(row.getByText('Paid on delivery')).toBeVisible();

    await cu.reload();
    await expect(cu.getByText('Paid on delivery').first()).toBeVisible();
    await expect(cu.getByText('India Post (no tracking reference shared yet)', { exact: false })).toBeVisible();
    await expect(cu.getByRole('button', { name: 'Request a return' })).toBeVisible();
    await wc.assertClean();
  } finally {
    await api(ad, 'PUT', 'admin/flags/merch', { enabled: false, rolloutPercent: 100 });
    await Promise.all([ctxA.close(), ctxC.close()]);
  }
});
