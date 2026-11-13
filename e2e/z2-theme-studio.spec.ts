import { expect, test } from '@playwright/test';
import { quickUser, watchErrors } from './helpers';

const rootVar = (page: import('@playwright/test').Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test('theme studio: accent, text size and corners apply at once and survive a reload', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Stylist');
  await page.goto('/theme');
  await expect(page.getByRole('heading', { name: 'Universe studio' })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Light' }).click();
  await page.getByRole('radio', { name: 'Jade' }).click();
  await expect(page.getByRole('radio', { name: 'Jade' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => rootVar(page, '--accent')).toBe('#22603f');
  await page.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: 'Larger' }).click();
  await page.getByRole('radiogroup', { name: 'Corners' }).getByRole('radio', { name: 'Crisp' }).click();
  await expect.poll(() => rootVar(page, '--radius-sm')).toBe('4px');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('20px');

  await page.waitForLoadState('networkidle');
  await page.reload();
  await expect.poll(() => rootVar(page, '--accent')).toBe('#22603f');
  await expect(page.getByRole('radio', { name: 'Jade' })).toHaveAttribute('aria-checked', 'true');

  // Larger text must not make phone layouts scroll sideways.
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/home', '/theme', '/thoughts', '/circles', '/play', '/journal', '/year']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const culprits = overflow > 1 ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((e) => `${e.tagName}.${(e.className || '').toString().slice(0, 80)} "${(e.textContent || '').trim().slice(0, 30)}" r=${Math.round(e.getBoundingClientRect().right)}`)) : [];
    expect(overflow, `${path} overflows at 360px with larger text: ${culprits.join(' | ')}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/theme');

  await page.getByRole('button', { name: 'Reset to the default look' }).click();
  await expect.poll(() => rootVar(page, '--radius-sm')).toBe('10px');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('16px');
  await w.assertClean();
});
