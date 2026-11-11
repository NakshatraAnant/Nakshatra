import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

/** A varied, non-straight-lined answer sheet so the result is a real archetype. */
async function takeAssessment(page: import('@playwright/test').Page) {
  const { questions } = await api(page, 'GET', 'personality/questions');
  const answers = Object.fromEntries((questions as { id: string }[]).map((q, i) => [q.id, [5, 2, 4, 1, 5, 3, 4, 2, 5, 1][i % 10]]));
  await api(page, 'POST', 'personality/assessment', { answers });
}

test('identity universe: reveal theatre with skip and replay, dimension explorer, home world, quest map, graphics setting', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Stargazer');
  await takeAssessment(page);

  await page.goto('/identity');
  const theatre = page.getByTestId('reveal-theatre');
  await expect(theatre).toBeVisible();
  // First visit plays the reveal; Skip jumps to the finished scene, Replay starts it again.
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(theatre).toHaveAttribute('data-reveal-stage', '3');
  await expect(theatre.getByText('This is you')).toBeVisible();
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(theatre).toHaveAttribute('data-reveal-stage', '0');
  await page.getByRole('button', { name: 'Skip' }).click();

  // The five dimensions work from the list alone.
  const explorer = page.getByLabel('Dimension explorer');
  await expect(explorer.getByRole('button')).toHaveCount(5);
  const first = explorer.getByRole('button').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(explorer.getByRole('status')).not.toHaveText('Pick a dimension to see where you sit on it.');

  // Eco graphics: scenes stay, drawn on demand.
  await page.goto('/theme');
  await page.getByLabel('3D graphics').selectOption('eco');
  await expect(page.getByText('Still scenes only', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('nk_graphics'))).toBe('eco');

  await page.goto('/home');
  const world = page.getByLabel('Your identity world');
  await expect(world).toBeVisible();
  await expect(world.getByRole('link', { name: /Explore your five dimensions/ })).toBeVisible();

  await page.goto('/progress');
  const map = page.getByLabel('Quest constellation');
  await expect(map).toBeVisible();
  await map.getByRole('button').first().click();
  await expect(map.getByRole('status')).not.toHaveText(/Tap a star/);

  // No sideways scroll on a phone.
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/identity', '/home', '/progress']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path} overflows at 360px`).toBeLessThanOrEqual(1);
  }
  await w.assertClean();
});

test('identity universe without WebGL: every experience still works from the page', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  const page = await ctx.newPage();
  const w = watchErrors(page);
  await quickUser(page, 'NoGpu');
  await takeAssessment(page);
  await page.goto('/identity');
  await expect(page.getByTestId('reveal-theatre')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  const explorer = page.getByLabel('Dimension explorer');
  await explorer.getByRole('button').nth(2).click();
  await expect(explorer.getByRole('status')).toContainText(':');
  await page.goto('/home');
  await expect(page.getByLabel('Your identity world')).toBeVisible();
  await w.assertClean();
  await ctx.close();
});
