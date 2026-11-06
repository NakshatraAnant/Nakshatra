import { expect, test, type Page } from '@playwright/test';
import { api, signUpViaUi, verifyEmail } from './helpers';

async function noHorizontalOverflow(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole('heading').first().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test('mobile: signup → onboarding by touch → Cosmic ID → bottom navigation and menu → no horizontal overflow', async ({ page }) => {
  test.setTimeout(400_000);
  const email = await signUpViaUi(page, 'Mobi');
  await verifyEmail(page, email);
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Continue' }).tap();
  await page.getByLabel('Date of birth').fill('1995-06-15');
  await page.getByLabel('Time of birth (local time at the birthplace)').fill('10:30');
  await page.getByRole('combobox', { name: 'Place of birth' }).fill('Mumbai');
  await page.getByRole('option', { name: /Mumbai/ }).first().tap();
  await page.getByText('I consent to Nakshatra processing my birth details').tap();
  await page.getByRole('button', { name: 'Calculate my chart' }).tap();
  await page.getByRole('button', { name: /Reveal my Cosmic ID/ }).tap();
  await page.waitForURL(/\/cosmic-id/);
  await expect(page.getByRole('list', { name: 'Identity layers' }).getByRole('button').first()).toBeVisible();

  // Bottom navigation: Home, Discover, Create, Circles, Play, Profile; everything else is in the header menu.
  const nav = page.getByRole('navigation', { name: 'Primary' }).last();
  await expect(nav).toBeVisible();
  for (const label of ['Home', 'Discover', 'Create', 'Circles', 'Play', 'Profile']) await expect(nav.getByRole('link', { name: label })).toBeVisible();
  await nav.getByRole('link', { name: 'Create' }).tap();
  await page.waitForURL(/\/create/);
  await page.getByRole('button', { name: 'More' }).tap();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: /Quests/ }).tap();
  await page.waitForURL(/\/progress/);

  for (const path of ['/home', '/explore', '/create', '/circles', '/play', '/identity', '/progress', '/today', '/cosmic-id', '/chart', '/calendar', '/bonds', '/dating', '/shop', '/settings', '/journey/rewards']) {
    await noHorizontalOverflow(page, path);
  }
  const me = await api(page, 'GET', 'auth/me');
  expect(me.user.onboardingComplete).toBe(true);
});
