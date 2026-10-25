import { expect, test } from '@playwright/test';
import { api, uniqueEmail, PASSWORD, watchErrors } from './helpers';

test('Journey J: landing sample → account-free Cosmic ID → reveal → share card → save → prefilled onboarding → same archetype', async ({ page }) => {
  const w = watchErrors(page);

  // Landing leads with the social promise; astrology is the optional path, with a real calculated sample.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover your kind of person');
  await expect(page.getByText(/Sample Cosmic ID ·/)).toBeVisible();
  await expect(page.getByRole('img', { name: /sigil: Janma Nakshatra/ }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Or read your sky (Cosmic ID)' }).click();
  await page.waitForURL(/\/discover/);

  // Account-free preview.
  await page.getByLabel('Date of birth').fill('1994-08-21');
  await page.getByLabel('Time of birth (local time at the birthplace)').fill('14:35');
  await page.getByRole('combobox', { name: 'Place of birth' }).fill('Pune');
  await page.getByRole('option', { name: /Pune/ }).first().click();
  await page.getByText('I am 18 or older and agree').click();
  await page.getByRole('button', { name: 'Reveal my Cosmic ID' }).click();

  // Reduced motion (the suite default) skips the staged reveal and lands on the result.
  await expect(page.getByText('This preview is not saved')).toBeVisible();
  const archetype = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
  expect(archetype.length).toBeGreaterThan(3);
  await expect(page.getByRole('heading', { name: 'The three Vedic layers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How this was derived' })).toBeVisible();

  // Share card renders a 1080×1920 PNG; intercept the download so nothing is written to disk.
  await page.evaluate(() => {
    const w = window as unknown as { __png?: { w: number; h: number } };
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b: Blob | MediaSource) => {
      if (b instanceof Blob && b.type === 'image/png') void createImageBitmap(b).then((bmp) => { w.__png = { w: bmp.width, h: bmp.height }; });
      return orig(b);
    };
    HTMLAnchorElement.prototype.click = function () { /* download intercepted in test */ };
  });
  await page.getByRole('button', { name: 'Story card (9:16)' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __png?: { w: number; h: number } }).__png)).toEqual({ w: 1080, h: 1920 });

  // Save → signup → onboarding prefilled from the preview.
  await page.getByRole('button', { name: 'Save my Cosmic ID' }).first().click();
  await page.waitForURL(/\/signup\?from=discover/);
  await expect(page.getByRole('heading', { name: 'Save your Cosmic ID' })).toBeVisible();
  const email = uniqueEmail('discover');
  await page.getByLabel('Your name').fill('Disha');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByText('I am 18 or older.').click();
  await page.getByText('I accept the').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Save your Cosmic ID' })).toBeVisible();
  await expect(page.getByLabel('Date of birth')).toHaveValue('1994-08-21');
  await expect(page.getByLabel('Time of birth (local time at the birthplace)')).toHaveValue('14:35');
  // Storing needs its own consent.
  await page.getByText('I consent to Nakshatra processing my birth details').click();
  await page.getByRole('button', { name: 'Save my Cosmic ID' }).click();
  await expect(page.getByRole('heading', { name: 'What draws you to the sky?' })).toBeVisible();
  await page.getByRole('button', { name: /Skip — choose later/ }).click();

  // The saved Cosmic ID has the same archetype as the preview.
  await page.waitForURL(/\/cosmic-id/);
  await expect(page.getByRole('heading', { name: archetype })).toBeVisible();
  const mine = await api(page, 'GET', 'cosmic-id/me');
  expect(mine.archetype.name).toBe(archetype);
  await w.assertClean();
});

test('public pages have no horizontal overflow on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const page = await ctx.newPage();
  for (const path of ['/', '/discover']) {
    await page.goto(path);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});
