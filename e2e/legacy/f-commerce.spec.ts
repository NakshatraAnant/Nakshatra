import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from '../helpers';

test('Journey F: product → variant → cart → checkout → dev payment → order → refund request → admin approval → refunded', async ({ browser }) => {
  const ctxC = await browser.newContext();
  const ctxA = await browser.newContext();
  const cu = await ctxC.newPage();
  const ad = await ctxA.newPage();
  const wc = watchErrors(cu);
  await quickUser(cu, 'Tara');

  // Product detail with server-side price and stock
  await cu.goto('/shop');
  await cu.getByRole('link', { name: /Brass Diya Set/ }).first().click();
  await cu.waitForURL(/\/shop\/p\/sample-puja-diya-set/);
  const product = await api(cu, 'GET', 'products/sample-puja-diya-set');
  const variants: { id: string; name: string; pricePaise: number; stock: number | null; available: boolean }[] = product.variants;
  const chosen = variants.filter((v) => v.available).at(-1)!;
  if (variants.length > 1) await cu.getByRole('button', { name: new RegExp(`^${chosen.name} ·`) }).click();
  await cu.getByLabel('Quantity').fill('2');
  await cu.getByRole('button', { name: /Add to cart/ }).click();
  await cu.goto('/shop/cart');

  // Totals come from the server; a client cannot change the price.
  const cart = await api(cu, 'GET', 'cart');
  expect(cart.totals.subtotalPaise).toBe(chosen.pricePaise * 2);

  for (const [label, value] of [['Full name', 'Tara Iyer'], ['Phone', '9876543210'], ['Address line 1', '12 MG Road'], ['City', 'Bengaluru'], ['State', 'Karnataka'], ['PIN code', '560001']]) {
    await cu.getByLabel(label, { exact: true }).fill(value);
  }
  await cu.getByRole('button', { name: 'Continue to payment' }).click();
  await cu.waitForURL(/\/pay\/dev\//);
  await expect(cu.getByText(/development/i).first()).toBeVisible();
  await cu.getByRole('button', { name: 'Simulate successful payment' }).click();
  await cu.getByRole('button', { name: 'Continue' }).click();
  await cu.waitForURL(/\/shop\/orders\/[0-9a-f-]{36}$/);
  const orderId = new URL(cu.url()).pathname.split('/').pop()!;

  const order = await api(cu, 'GET', `orders/${orderId}`);
  expect(order.payment.status).toBe('succeeded');
  expect(order.order.totalPaise).toBe(cart.totals.totalPaise);
  expect(['paid', 'fulfilling']).toContain(order.order.status);
  // Inventory decremented by the purchased quantity
  const after = (await api(cu, 'GET', 'products/sample-puja-diya-set')).variants.find((v: { id: string }) => v.id === chosen.id);
  if (chosen.stock !== null) expect(after.stock).toBe(chosen.stock - 2);

  // Customer requests a refund in the UI
  await cu.getByRole('button', { name: 'Request a refund' }).click();
  const dlg = cu.getByRole('dialog', { name: 'Request a refund' });
  await dlg.getByLabel('Reason').fill('Ordered the wrong size by mistake.');
  await dlg.getByRole('button').last().click();
  await expect.poll(async () => (await api(cu, 'GET', `orders/${orderId}`)).refunds.length).toBeGreaterThan(0);

  // Admin approves it from the console; the refund settles through the signed refund event
  const admin = seededAccount('admin');
  await signIn(ad, admin.email, admin.password);
  await ad.goto('/admin/refunds');
  const row = ad.getByRole('row').filter({ hasText: 'Ordered the wrong size' });
  await expect(row).toBeVisible();
  await row.getByLabel('Note').fill('Approved per policy');
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect.poll(async () => (await api(cu, 'GET', `orders/${orderId}`)).payment.status, { timeout: 20_000 }).toMatch(/refunded|partially_refunded/);
  const final = await api(cu, 'GET', `orders/${orderId}`);
  expect(final.refunds[0].status).toBe('succeeded');

  await cu.reload();
  await expect(cu.getByText(/refund/i).first()).toBeVisible();
  await wc.assertClean();
  await Promise.all([ctxC.close(), ctxA.close()]);
});
