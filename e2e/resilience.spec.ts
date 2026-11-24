import { expect, test } from '@playwright/test';
import { quickUser } from './helpers';

test.use({ reducedMotion: 'no-preference' });

test('WebGL unavailable: 3D pages fall back to accessible 2D views', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // Simulate a browser/GPU with WebGL disabled; 2D canvas still works.
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const u = await quickUser(page, 'NoGpu');
  await page.goto('/cosmic-id');
  await expect(page.getByRole('img', { name: /Cosmic ID card for NoGpu/ })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Identity layers' }).getByRole('button')).toHaveCount(6);
  for (const path of ['/', '/chart', '/bonds', '/journey', '/journey/rewards']) {
    await page.goto(path);
    await expect(page.getByText('Something slipped out of orbit')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  void u;
  await ctx.close();
});

test('reduced motion: CSS animation is disabled and scenes do not run continuous animation', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await quickUser(page, 'Calm');
  await page.goto('/cosmic-id');
  const dur = await page.locator('.rise-in').first().evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(dur)).toBeLessThanOrEqual(0.01);
  // The 2D information remains fully available
  await expect(page.getByRole('list', { name: 'Identity layers' }).getByRole('button').first()).toBeVisible();
  // A canvas frame should not keep changing when motion is reduced (frameloop on demand)
  const canvas = page.locator('canvas').first();
  if (await canvas.count()) {
    const a = await canvas.screenshot();
    await page.waitForTimeout(1500);
    const b = await canvas.screenshot();
    expect(Buffer.compare(a, b)).toBe(0);
  }
  await ctx.close();
});

test('repeated route navigation between 3D pages does not leak WebGL contexts or crash', async ({ page }) => {
  await quickUser(page, 'Nav');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/Too many active WebGL contexts|CONTEXT_LOST/i.test(m.text())) errors.push(m.text()); });
  for (let i = 0; i < 6; i++) {
    for (const path of ['/cosmic-id', '/chart', '/journey']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading').first().waitFor();
    }
  }
  // Client-side navigation (no full reload) is the real leak risk; use the app's nav links.
  for (let i = 0; i < 6; i++) {
    await page.getByRole('link', { name: 'Cosmic ID' }).first().click();
    await page.getByRole('link', { name: 'Chart' }).first().click();
    await page.getByRole('link', { name: 'Journey' }).first().click();
  }
  await expect(page.getByText('Something slipped out of orbit')).toHaveCount(0);
  expect(await page.locator('canvas').count()).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('keyboard: skip link and dialog focus handling', async ({ page }) => {
  await quickUser(page, 'Keys');
  await page.goto('/bonds');
  await page.getByRole('heading', { name: 'Your constellation' }).waitFor();
  await page.locator('body').focus();
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(first?.toLowerCase()).toContain('skip');
  await page.getByRole('button', { name: 'New Bond' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New Bond' });
  await expect(dialog).toBeVisible();
  // Native <dialog> has an implicit dialog role (no role attribute).
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open], [role="dialog"]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('WebGL context loss switches the scene to its 2D fallback', async ({ page }) => {
  await quickUser(page, 'Lost');
  await page.goto('/cosmic-id');
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await canvas.evaluate((c: HTMLCanvasElement) => {
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.getByRole('img', { name: /Cosmic ID card for Lost/ })).toBeVisible();
  await expect(page.getByText('Something slipped out of orbit')).toHaveCount(0);
});
