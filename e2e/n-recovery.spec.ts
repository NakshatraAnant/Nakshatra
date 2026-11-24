import { expect, test } from '@playwright/test';
import { totp } from '../src/server/lib/crypto';
import { PASSWORD, quickUser, signOut, watchErrors } from './helpers';

test('account recovery: turn on two-step verification → save recovery codes → lose the device → sign in with a recovery code', async ({ page }) => {
  const w = watchErrors(page);
  const u = await quickUser(page, 'Ravi');
  await page.goto('/settings/security');
  await page.getByRole('button', { name: 'Set up with an authenticator app' }).click();
  const secret = (await page.locator('code').first().textContent())!.trim();
  await page.getByLabel('Enter the 6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on' }).click();
  const codes = page.getByTestId('recovery-codes').getByRole('listitem');
  await expect(codes).toHaveCount(10);
  const code = (await codes.first().textContent())!.trim();
  await page.getByRole('button', { name: 'I have saved them' }).click();
  await expect(page.getByText(/Recovery codes: 10 unused/)).toBeVisible();

  await signOut(page);
  await page.goto('/signin');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Lost your authenticator/ }).click();
  await page.getByLabel('Recovery code').fill('zzzzz-zzzzz');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That recovery code is not valid or has already been used.')).toBeVisible();
  await page.getByLabel('Recovery code').fill(code.toUpperCase());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/signin/);

  await page.goto('/settings/security');
  await expect(page.getByText(/Recovery codes: 9 unused/)).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByText('A recovery code was used to sign in').first()).toBeVisible();
  await w.assertClean();
});
