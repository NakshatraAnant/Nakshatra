import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('game hub: step through the games, open the same rules dialog, and see live games as moons', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Orbiter');
  const { games } = await api(page, 'GET', 'play/games');
  const solo = (games as { key: string; name: string; solo: boolean }[]).find((g) => g.solo)!;
  const { session } = await api(page, 'POST', 'play/sessions', { gameKey: solo.key });
  expect(session.id).toBeTruthy();

  await page.goto('/play');
  const hub = page.getByLabel('Game hub');
  await expect(hub).toBeVisible();
  await expect(hub.getByText(/1 game in progress/)).toBeVisible();
  await expect(hub.getByRole('button', { name: 'Rules & play' })).toBeDisabled();
  await hub.getByRole('button', { name: 'Next game' }).click();
  await expect(hub.getByRole('status')).not.toContainText('Step through');

  // Step until the solo game is chosen, then open its rules from the hub.
  for (let i = 0; i < games.length && !((await hub.getByRole('status').textContent()) ?? '').startsWith(solo.name); i++) await hub.getByRole('button', { name: 'Next game' }).click();
  await expect(hub.getByRole('status')).toContainText(solo.name + ' ·');
  await expect(hub.getByRole('status')).toContainText('1 in progress');
  await page.waitForTimeout(1200);
  await hub.screenshot({ path: 'test-results/shot-game-hub.png' });
  await hub.getByRole('button', { name: 'Rules & play' }).click();
  await expect(page.getByRole('dialog', { name: solo.name })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/play');
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await w.assertClean();
});
