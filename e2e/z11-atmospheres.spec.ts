import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('journal sky joins your journal days, calendar sky shows the real Moon, photos develop, avatar figure', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Skywatcher');

  // Journal: one star per day written this month (entries for today and, when still this month, two days ago).
  await api(page, 'POST', 'journal', { body: 'Today' });
  const earlier = daysAgo(2);
  const sameMonth = earlier.slice(0, 7) === daysAgo(0).slice(0, 7);
  if (sameMonth) await api(page, 'POST', 'journal', { body: 'Earlier', date: earlier });
  await page.goto('/journal');
  const sky = page.getByRole('figure', { name: 'Journal sky' });
  await expect(sky).toBeVisible();
  await expect(sky).toHaveAttribute('aria-label', 'Journal sky');
  await expect(sky.locator('figcaption')).toContainText(sameMonth ? 'This month’s 2 journal days, joined as a constellation.' : 'This month’s 1 journal day');
  await expect(sky.locator('[data-sky]')).toHaveAttribute('data-sky', /^(dawn|day|dusk|night)$/);

  // Calendar: the selected day's Moon, tithi and nakshatra in words; picking another day updates it.
  await page.goto('/calendar');
  const moon = page.getByRole('figure', { name: 'Moon sky' });
  await expect(moon).toBeVisible();
  await expect(moon.locator('figcaption')).toContainText(/New moon|Full moon|% lit and (growing|shrinking)/);
  const before = await moon.textContent();
  const days = page.getByRole('group', { name: 'Month calendar' }).getByRole('button');
  await days.nth(14).click();
  await expect.poll(async () => moon.textContent()).not.toBe(before);
  await page.waitForTimeout(800);
  await moon.screenshot({ path: 'test-results/shot-moon-sky.png' });

  // Photos develop once loaded.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  const csrf = (await page.context().cookies()).find((c) => c.name === 'nk_csrf')?.value ?? '';
  const up = await page.request.post('/api/v1/posts/image', { multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: png } }, headers: { 'x-csrf-token': csrf } });
  expect(up.ok(), await up.text()).toBe(true);
  const { url } = await up.json();
  await api(page, 'POST', 'posts', { kind: 'image', body: 'A photo drop', imageUrl: url, visibility: 'public' });
  await page.goto('/thoughts');
  const img = page.getByRole('article').filter({ hasText: 'A photo drop' }).first().getByRole('img', { name: 'Photo shared with this post' });
  await expect(img).toHaveAttribute('data-loaded', 'true');

  // Avatar studio: the 3D figure describes its pose.
  await page.goto('/avatar');
  await expect(page.getByTestId('avatar-stage').getByRole('group')).toHaveAttribute('aria-label', /3D figure, standing relaxed/);

  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/journal', '/calendar']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path + ' overflows at 360px').toBeLessThanOrEqual(1);
  }
  await w.assertClean();
});
