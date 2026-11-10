import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('avatar creator: build an avatar, save it as my picture, it is served as an image', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Sketchy');
  await page.goto('/avatar');
  await expect(page.getByRole('heading', { name: 'Avatar creator' })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Hair' }).getByRole('radio', { name: 'Bun' }).click();
  await page.getByRole('radiogroup', { name: 'Skin tone' }).getByRole('radio', { name: 'Deep' }).click();
  await page.getByRole('radiogroup', { name: 'Extras' }).getByRole('radio', { name: 'Round glasses' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Hair' }).getByRole('radio', { name: 'Bun' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Save as my picture' }).click();
  await expect(page.getByRole('button', { name: 'Remove my picture' })).toBeVisible();
  const me = await api(page, 'GET', 'auth/me');
  expect(me.user.profile.avatarUrl).toMatch(/^\/api\/v1\/avatars\//);
  const img = await page.request.get(me.user.profile.avatarUrl);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toContain('image/svg+xml');
  await w.assertClean();
});

test('paid unlock and paid tier pass go through the (development) payment simulator before anything opens', async ({ browser }) => {
  const [ca, cb] = await Promise.all([browser.newContext(), browser.newContext()]);
  const host = await ca.newPage();
  const fan = await cb.newPage();
  const wf = watchErrors(fan);
  const creator = await quickUser(host, 'RecipeHost');
  await quickUser(fan, 'RecipeFan');

  // Paid unlock.
  await api(host, 'PUT', 'creators/me', { headline: 'Recipes from home' });
  await api(host, 'POST', 'creators/me/offerings', { kind: 'digital', title: 'Chutney recipe card', pricePaise: 4900, unlockContent: 'Two green mangoes and a fist of jaggery.', status: 'listed' });
  await fan.goto(`/creators/${creator.handle}`);
  await expect(fan.getByText('Chutney recipe card')).toBeVisible();
  await expect(fan.getByText('fist of jaggery', { exact: false })).toHaveCount(0);
  await fan.getByRole('button', { name: 'Unlock — ₹49' }).click();
  await fan.waitForURL(/\/pay\/dev\//);
  await fan.getByRole('button', { name: 'Simulate successful payment' }).click();
  await fan.getByRole('button', { name: 'Continue' }).click();
  await fan.waitForURL(new RegExp(`/creators/${creator.handle}$`));
  await expect(fan.getByText('fist of jaggery', { exact: false })).toBeVisible();
  await expect(fan.getByText('✓ Unlocked')).toBeVisible();
  await fan.goto('/unlocks');
  await expect(fan.getByText('Chutney recipe card')).toBeVisible();
  await expect(fan.getByText('test payment', { exact: false })).toBeVisible();

  // Paid circle tier pass.
  const { circle } = await api(host, 'POST', 'circles', { name: 'Supper club' });
  const { token } = await api(host, 'POST', `circles/${circle.id}/invites`, {});
  await api(fan, 'POST', `circle-invites/${token}/accept`);
  const { tier } = await api(host, 'POST', `circles/${circle.id}/tiers`, { name: 'Regulars' });
  await host.goto(`/circles/${circle.id}?tab=members`);
  const tiers = host.getByLabel('Membership tiers');
  await tiers.getByLabel('Pass price in rupees').fill('99');
  await tiers.getByRole('button', { name: 'Set price' }).click();
  await expect(tiers.getByText('₹99 for 30 days', { exact: false })).toBeVisible();
  await api(host, 'POST', `circles/${circle.id}/channels`, { name: 'Regulars table', tierId: tier.id });

  await fan.goto(`/circles/${circle.id}?tab=members`);
  await expect(fan.getByRole('button', { name: /Regulars table/ })).toHaveCount(0);
  await fan.getByLabel('Membership tiers').getByRole('button', { name: 'Get pass — ₹99' }).click();
  await fan.waitForURL(/\/pay\/dev\//);
  await fan.getByRole('button', { name: 'Simulate successful payment' }).click();
  await fan.getByRole('button', { name: 'Continue' }).click();
  await fan.waitForURL(new RegExp(`/circles/${circle.id}`));
  await fan.goto(`/circles/${circle.id}?tab=members`);
  await expect(fan.getByText('your pass runs until', { exact: false })).toBeVisible();
  await fan.goto(`/circles/${circle.id}`);
  await expect(fan.getByRole('button', { name: /Regulars table/ })).toBeVisible();

  await host.reload();
  await expect(host.getByText('1 pass sold', { exact: false })).toBeVisible();
  await wf.assertClean();
  await Promise.all([ca.close(), cb.close()]);
});
