import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('avatar studio shows the live 3D figure and saves a pose, creator showcase points at real offerings, interface sounds stay off until switched on', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const w = watchErrors(a);
  const { handle } = await quickUser(a, 'Showmaker');
  await quickUser(b, 'Showgoer');

  // Avatar: flat by default; the 3D stage only when asked.
  await a.goto('/avatar');
  // The figure is live from the start, with the round picture it stands for.
  await expect(a.getByTestId('avatar-stage')).toBeVisible();
  await expect(a.getByRole('img', { name: 'Your avatar picture' }).first()).toBeVisible();
  await expect(a.getByTestId('avatar-stage')).toHaveAttribute('data-pose', 'idle');
  await a.getByRole('radiogroup', { name: 'Pose' }).getByRole('radio', { name: 'Waving' }).click();
  await a.getByRole('radiogroup', { name: 'Outfit' }).getByRole('radio', { name: 'Jade' }).click();
  await expect(a.getByTestId('avatar-stage')).toHaveAttribute('data-pose', 'wave');
  await a.waitForTimeout(1500);
  await a.getByTestId('avatar-stage').screenshot({ path: 'test-results/shot-avatar-stage.png' });
  // Saved choices come back after a reload.
  await a.getByRole('button', { name: 'Save as my picture' }).click();
  await expect(a.getByText('Avatar saved', { exact: false })).toBeVisible();
  await a.reload();
  await expect(a.getByTestId('avatar-stage')).toHaveAttribute('data-pose', 'wave');
  await expect(a.getByRole('radiogroup', { name: 'Outfit' }).getByRole('radio', { name: 'Jade' })).toHaveAttribute('aria-checked', 'true');

  // Creator showcase: two listed offerings of different kinds.
  await api(a, 'PUT', 'creators/me', { headline: 'Small joys', categories: ['art'] });
  await api(a, 'POST', 'creators/me/offerings', { kind: 'newsletter', title: 'Monthly letter', status: 'listed' });
  await api(a, 'POST', 'creators/me/offerings', { kind: 'workshop', title: 'Zine workshop', status: 'listed' });
  await b.goto('/creators/' + handle);
  const show = b.getByLabel('Creator showcase');
  await expect(show).toBeVisible();
  await show.getByRole('button', { name: 'Zine workshop' }).click();
  await expect(show.getByRole('status')).toContainText('Zine workshop · Workshop (the cone)');
  await show.getByRole('button', { name: 'See details' }).click();
  await expect(b.locator('[id^="offering-"]').filter({ hasText: 'Zine workshop' })).toBeInViewport();
  await b.waitForTimeout(1200);
  await show.screenshot({ path: 'test-results/shot-creator-showcase.png' });

  // Interface sounds: off by default, on only by choice, saved on this device.
  await a.goto('/theme');
  const sounds = a.getByRole('switch', { name: /Interface sounds/ });
  await expect(sounds).toHaveAttribute('aria-checked', 'false');
  expect(await a.evaluate(() => localStorage.getItem('nk_sound'))).toBeNull();
  await sounds.click();
  await expect(sounds).toHaveAttribute('aria-checked', 'true');
  expect(await a.evaluate(() => localStorage.getItem('nk_sound'))).toBe('on');
  await sounds.click();
  expect(await a.evaluate(() => localStorage.getItem('nk_sound'))).toBeNull();

  await a.setViewportSize({ width: 360, height: 780 });
  await a.goto('/theme');
  await a.waitForLoadState('networkidle');
  expect(await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await w.assertClean();
  await Promise.all([ctxA.close(), ctxB.close()]);
});
