import { expect, test } from '@playwright/test';
import { quickUser, watchErrors } from './helpers';

test('creator page: set up → list an offering → fan taps Notify me and tips through the (development) simulator → supporter shown, tip held', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const wa = watchErrors(a);
  const wb = watchErrors(b);
  const creator = await quickUser(a, 'ZineMaker');
  await quickUser(b, 'ZineFan');

  await a.goto('/create');
  await a.getByRole('link', { name: /Creator page/ }).first().click();
  await a.waitForURL(/\/creator-studio$/);
  await a.getByLabel('Headline').fill('Zines about small joys');
  await a.getByLabel('About').fill('Hand-drawn zines every monsoon.');
  await a.getByRole('button', { name: 'Art', exact: true }).click();
  await a.getByLabel('Link 1 label').fill('Shop');
  await a.getByLabel('Link 1 URL').fill('https://example.com/zines');
  await a.getByRole('switch', { name: 'Accept tips' }).click();
  await a.getByRole('button', { name: 'Create my creator page' }).click();
  await expect(a.getByLabel('Earnings')).toBeVisible();
  await a.getByLabel('Offering title').fill('Monsoon zine (PDF)');
  await a.getByLabel('Planned price in ₹ (optional)').fill('99');
  await a.getByRole('button', { name: 'List offering' }).click();
  await expect(a.getByText('0 want', { exact: false })).toBeVisible();

  await b.goto('/explore');
  await b.getByRole('link', { name: /Creators/ }).first().click();
  await b.getByRole('link', { name: /ZineMaker/ }).click();
  await expect(b.getByRole('heading', { name: 'ZineMaker', exact: true })).toBeVisible();
  await expect(b.getByRole('link', { name: 'Shop ↗' })).toHaveAttribute('rel', /nofollow/);
  await b.getByRole('button', { name: 'Notify me' }).click();
  await expect(b.getByRole('button', { name: /You’ll be notified/ })).toBeVisible();

  const tip = b.getByLabel('Tip');
  await expect(tip.getByText(/no real money moves/i)).toBeVisible();
  await tip.getByRole('radio', { name: '₹100' }).click();
  await tip.getByLabel('Message (optional)').fill('Loved the last one');
  await tip.getByRole('checkbox', { name: /List me as a supporter/ }).check();
  await expect(tip.getByText('₹90 goes to ZineMaker', { exact: false })).toBeVisible();
  await tip.getByRole('button', { name: 'Send ₹100' }).click();
  await b.waitForURL(/\/pay\/dev\//);
  await b.getByRole('button', { name: 'Simulate successful payment' }).click();
  await b.getByRole('button', { name: 'Continue' }).click();
  await b.waitForURL(new RegExp(`/creators/${creator.handle}$`));
  await expect(b.getByText('“Loved the last one”', { exact: false })).toBeVisible();

  await a.reload();
  const earnings = a.getByLabel('Earnings');
  await expect(earnings.getByText('ZineFan')).toBeVisible();
  await expect(earnings.getByText('simulated', { exact: true })).toBeVisible();
  await expect(earnings.getByText(/Payouts aren’t available yet/)).toBeVisible();
  await expect(a.getByText('1 wants it', { exact: false })).toBeVisible();
  await wa.assertClean();
  await wb.assertClean();
  await Promise.all([ctxA.close(), ctxB.close()]);
});
