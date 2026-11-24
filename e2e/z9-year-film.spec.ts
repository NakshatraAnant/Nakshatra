import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('year film plays only when asked, steps through real moments, and closes; reactions burst only when added', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Filmgoer');
  await api(page, 'POST', 'posts', { kind: 'thought', body: 'Something for the year film', visibility: 'public' });

  await page.goto('/year');
  const card = page.getByLabel('Year film');
  await expect(card.getByRole('button', { name: 'Play' })).toBeVisible();
  // Nothing plays until asked.
  await expect(page.locator('[data-film-beat]')).toHaveCount(0);
  await card.getByRole('button', { name: 'Play' }).click();

  const film = page.getByRole('region', { name: 'Year film' });
  const beat = film.getByRole('status');
  await expect(beat).toContainText(/\d{4} so far|\d{4}/);
  await expect(beat).toContainText(/things? you did on Nakshatra|A quiet year/);
  await film.getByRole('button', { name: 'Pause' }).click();
  await film.getByRole('button', { name: 'Next moment' }).click();
  await expect(film.locator('[data-film-beat]')).toHaveAttribute('data-film-beat', '1');
  await expect(beat).toContainText(/busiest month|started in/);
  await page.waitForTimeout(1500);
  await film.screenshot({ path: 'test-results/shot-year-film.png' });
  // Step to the end.
  while (await film.getByRole('button', { name: 'Next moment' }).isEnabled()) await film.getByRole('button', { name: 'Next moment' }).click();
  await expect(beat).toContainText('isn’t over yet');
  await expect(film.getByRole('button', { name: 'Watch again' })).toBeVisible();
  await film.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-film-beat]')).toHaveCount(0);

  // Reactions: a burst appears when a reaction is added, never when it is removed.
  await page.goto('/thoughts');
  const post = page.getByRole('article').filter({ hasText: 'Something for the year film' }).first();
  const love = post.getByRole('button', { name: /^Love/ });
  await love.click();
  await expect(love).toHaveAttribute('aria-pressed', 'true');
  await expect(love.locator('.react-burst')).toHaveCount(1);
  await love.click();
  await expect(love).toHaveAttribute('aria-pressed', 'false');
  await expect(love.locator('.react-burst')).toHaveCount(0);

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/year');
  await page.getByLabel('Year film').getByRole('button', { name: 'Play' }).click();
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await w.assertClean();
});
