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
  await page.waitForTimeout(1200);
  await theatre.screenshot({ path: 'test-results/shot-reveal.png' });
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
  await page.waitForTimeout(1200);
  await explorer.screenshot({ path: 'test-results/shot-dimensions.png' });

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

  // Season path: the current season as milestone worlds, with how far to the next one in words.
  const season = page.getByRole('region', { name: 'Season path' });
  await expect(season).toBeVisible();
  await expect(season.getByText(/points to .+.|Every milestone reached./)).toBeVisible();
  await page.waitForTimeout(1500);
  await season.screenshot({ path: 'test-results/shot-season.png' });

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

test('profile world and achievement gallery: shown from real data, usable from the page, hidden when the archetype is hidden', async ({ page, browser }) => {
  const w = watchErrors(page);
  const { handle } = await quickUser(page, 'Worldly');
  await takeAssessment(page);

  await page.goto('/u/' + handle);
  const world = page.getByTestId('profile-world');
  await expect(world).toBeVisible();
  await expect(world.getByText('Your identity world')).toBeVisible();
  await expect(world.getByRole('link', { name: /Explore your five dimensions/ })).toBeVisible();
  await page.waitForTimeout(1200);
  await world.screenshot({ path: 'test-results/shot-profile-world.png' });

  // Achievement gallery: every achievement is in the list; picking one explains it.
  await page.goto('/progress');
  const gallery = page.getByLabel('Achievement gallery');
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('button')).toHaveCount(28);
  const scholar = gallery.getByRole('button', { name: /Scholar/ });
  await scholar.click();
  await expect(scholar).toHaveAttribute('aria-pressed', 'true');
  await expect(gallery.getByRole('status')).toContainText('Completed five lessons.');
  await expect(gallery.getByRole('status')).toContainText('Not earned yet.');
  await page.waitForTimeout(1500);
  await gallery.screenshot({ path: 'test-results/shot-gallery.png' });

  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/u/' + handle, '/progress']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path + ' overflows at 360px').toBeLessThanOrEqual(1);
  }

  // Privacy: another person sees the world only while the archetype is visible to them.
  await api(page, 'PATCH', 'profile', { visibility: 'public', fieldVisibility: { persona: 'public' } });
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  const w2 = watchErrors(other);
  await quickUser(other, 'Visitor');
  await other.goto('/u/' + handle);
  await expect(other.getByTestId('profile-world')).toBeVisible();
  await expect(other.getByTestId('profile-world').getByText('Worldly’s identity world')).toBeVisible();
  await api(page, 'PATCH', 'profile', { fieldVisibility: { persona: 'private' } });
  await other.reload();
  await expect(other.getByRole('heading', { name: 'Worldly' })).toBeVisible();
  await other.waitForLoadState('networkidle');
  await expect(other.getByTestId('profile-world')).toHaveCount(0);
  await w2.assertClean();
  await ctx.close();
  await w.assertClean();
});
