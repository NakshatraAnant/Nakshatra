import { expect, test, type Page } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from '../helpers';

async function bookSlot(page: Page, expertId: string, which: 'first' | 'last' = 'first') {
  await page.goto(`/experts/${expertId}`);
  await page.getByRole('button', { name: 'Choose a time' }).first().click();
  const dialog = page.getByRole('dialog');
  // Real availability comes from the expert's weekly rules (next 14 days).
  const slots = dialog.locator('button[aria-pressed]');
  const slot = which === 'first' ? slots.first() : slots.last();
  await expect(slot).toBeVisible();
  await slot.click();
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL(/\/pay\/dev\//);
}

async function payWithSimulator(page: Page) {
  // The development simulator is labelled as such and only exists outside production.
  await expect(page.getByText(/development/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Simulate successful payment' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/experts\/bookings\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

test('Journey E: discover expert → real availability → book → pay (dev adapter) → session completed → accounting; cancel → refund', async ({ browser }) => {
  const expertAcct = seededAccount('sample expert');
  const ctxE = await browser.newContext();
  const ctxC = await browser.newContext();
  const ex = await ctxE.newPage();
  const cu = await ctxC.newPage();
  const wc = watchErrors(cu);
  await signIn(ex, expertAcct.email, expertAcct.password);
  const expertId: string = (await api(ex, 'GET', 'auth/me')).user.id;
  await quickUser(cu, 'Nisha');

  // Discover through the marketplace UI
  await cu.goto('/experts');
  await expect(cu.getByRole('link', { name: /.+/ }).filter({ has: cu.locator(`[href="/experts/${expertId}"]`) }).or(cu.locator(`a[href="/experts/${expertId}"]`)).first()).toBeVisible();

  // Booking 1: pay; the expert sees it
  await bookSlot(cu, expertId, 'first');
  const booking1 = await payWithSimulator(cu);
  await expect(cu.getByText('confirmed', { exact: false }).first()).toBeVisible();
  const d1 = await api(cu, 'GET', `bookings/${booking1}`);
  expect(d1.booking.status).toBe('confirmed');
  expect(d1.payment.status).toBe('succeeded');
  expect(d1.payment.provider).toBe('dev_simulator');

  // The expert sees the paid booking. Sessions cannot start or complete before their scheduled time
  // (server rule); completion with elapsed time is covered by tests/integration/journeys.test.ts (Journey E).
  await ex.goto(`/experts/bookings/${booking1}`);
  await expect(ex.getByText('Nisha').first()).toBeVisible();
  await expect(ex.getByRole('button', { name: 'Start session' })).toBeDisabled();
  await expect(ex.getByText(/You can start the session from .+ \(15 minutes before it begins\)\./)).toBeVisible();
  await expect(api(ex, 'POST', `bookings/${booking1}/start`)).rejects.toThrow(/400/);
  await expect(api(ex, 'POST', `bookings/${booking1}/complete`)).rejects.toThrow(/400/);

  // Accounting recorded at booking time: commission + expert earnings add up to the price paid
  const acct = await api(ex, 'GET', `bookings/${booking1}`);
  expect(acct.booking.commissionPaise + acct.booking.expertEarningsPaise).toBe(acct.booking.pricePaise);
  expect(acct.payment.amountPaise).toBe(acct.booking.pricePaise);

  // Booking 2: pay, then cancel well ahead of time → full refund through the signed refund flow
  // The latest slot is days away, so cancelling is inside the free-cancellation window (24 h+).
  await bookSlot(cu, expertId, 'last');
  const booking2 = await payWithSimulator(cu);
  await cu.getByRole('button', { name: 'Cancel booking' }).click();
  await expect.poll(async () => (await api(cu, 'GET', `bookings/${booking2}`)).booking.status, { timeout: 20_000 }).toMatch(/cancelled|refunded/);
  const d2 = await api(cu, 'GET', `bookings/${booking2}`);
  expect(d2.refunds.length).toBeGreaterThan(0);
  expect(d2.refunds[0].status).toMatch(/succeeded|approved|processing/);

  // The two bookings did not double-book the same slot
  expect(d2.booking.startsAt).not.toBe(d1.booking.startsAt);
  await wc.assertClean();
  await Promise.all([ctxE.close(), ctxC.close()]);
});
