import { expect, test } from '@playwright/test';
import { api, signIn, signOut, signUpViaUi, verifyEmail, watchErrors } from './helpers';

test.use({ reducedMotion: 'no-preference' });

test('Journey A: signup → onboarding → chart → Cosmic ID → save insight → sign out/in → persistence', async ({ page }) => {
  const w = watchErrors(page);
  const email = await signUpViaUi(page, 'Asha');
  await verifyEmail(page, email);

  // Onboarding: intro → birth data → interests
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Date of birth').fill('1990-03-21');
  await page.getByLabel('How sure are you of the time?').selectOption('exact');
  await page.getByLabel('Time of birth (local time at the birthplace)').fill('05:45');
  await page.getByRole('combobox', { name: 'Place of birth' }).fill('Jaipur');
  await page.getByRole('option', { name: /Jaipur/ }).first().click();
  await page.getByText('I consent to Nakshatra processing my birth details').click();
  await page.getByRole('button', { name: 'Calculate my chart' }).click();

  await expect(page.getByRole('heading', { name: 'What draws you to the sky?' })).toBeVisible();
  await page.getByRole('group', { name: 'Interests' }).getByRole('button', { name: 'relationships' }).click();
  await page.getByRole('button', { name: /Reveal my Cosmic ID/ }).click();

  // Cosmic ID with calculated layers
  await page.waitForURL(/\/cosmic-id/);
  await expect(page.getByText('Your Cosmic ID is ready')).toBeVisible();
  const layers = page.getByRole('list', { name: 'Identity layers' }).getByRole('button');
  await expect(layers.first()).toBeVisible();
  expect(await layers.count()).toBeGreaterThanOrEqual(6);

  // The calculation is real: compare the page with the API's chart for the same user.
  const chart = await api(page, 'GET', 'charts/me?config=vedic_default');
  const moonSign: string = chart.chart.placements.find((p: { id: string }) => p.id === 'moon').signName;
  await expect(page.getByRole('list', { name: 'Identity layers' })).toContainText(new RegExp(moonSign, 'i'));

  // Save the first layer that has an interpretation
  let saved = false;
  for (let i = 0; i < (await layers.count()) && !saved; i++) {
    await layers.nth(i).click();
    const btn = page.getByRole('button', { name: 'Save insight' });
    if (await btn.isVisible()) { await btn.click(); await expect(page.getByText('Saved to your insights')).toBeVisible(); saved = true; }
  }
  expect(saved).toBe(true);

  // Sign out, sign back in, verify persistence of the chart and the saved insight
  await signOut(page);
  await page.goto('/cosmic-id');
  await expect(page).toHaveURL(/\/signin/);
  await signIn(page, email);
  await page.goto('/journey');
  await expect(page.getByRole('heading', { name: 'Saved insights' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="saved-insights"] li')).toHaveCount(1);
  await page.goto('/cosmic-id');
  await expect(page.getByRole('list', { name: 'Identity layers' })).toContainText(new RegExp(moonSign, 'i'));
  await w.assertClean();
});
