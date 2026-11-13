import { expect, test } from '@playwright/test';
import { quickUser, watchErrors } from './helpers';

test('first visit: the introduction plays once, can be skipped, replayed on request, and leads into the five dimensions', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const w = watchErrors(page);

  await page.goto('/');
  const intro = page.getByTestId('cinematic-intro');
  await expect(intro).toBeVisible();
  await expect(intro.getByRole('link', { name: 'Sign in' })).toBeVisible();
  // The page under it is already there: the film never blocks the product.
  await expect(page.getByRole('heading', { name: 'Discover your kind of person.' })).toBeAttached();
  await intro.getByRole('button', { name: 'Skip intro' }).click();
  await expect(intro).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Discover your kind of person.' })).toBeVisible();

  // Not again on the next visit.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('cinematic-intro')).toHaveCount(0);

  // Replay on request, watched to the end: seven scenes, then the invitation.
  await page.getByRole('link', { name: 'Watch the introduction' }).click();
  await expect(intro).toBeVisible();
  await expect(intro).toHaveAttribute('data-intro-scene', 'invitation', { timeout: 20_000 });
  await expect(intro.getByText('Discover your kind of person.')).toBeVisible();
  await intro.screenshot({ path: 'test-results/shot-intro.png' });
  await intro.getByRole('button', { name: 'Enter Your Universe' }).click();
  await expect(page).toHaveURL(/\/personality$/);
  await expect(page.getByTestId('cinematic-intro')).toHaveCount(0);

  // Identity introduction: the product's own five dimensions, each explained, then into the statements.
  const dims = page.getByRole('region', { name: 'The five dimensions' });
  await expect(dims.locator('button[aria-pressed]')).toHaveCount(5);
  await dims.getByRole('button', { name: 'Decision style' }).click();
  await expect(dims.getByRole('status')).toContainText('Decision style: Logic-led ↔ Feeling-led');
  await dims.getByRole('button', { name: 'Discover My Identity' }).click();
  await expect(page.locator('#assessment input[type=radio]').first()).toBeFocused();
  await w.assertClean();
  await ctx.close();
});

test('the introduction never plays by itself with reduced motion, or for a signed-in member', async ({ browser }) => {
  const calm = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await calm.newPage();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('cinematic-intro')).toHaveCount(0);
  // An explicit replay still works, as a still final frame with its choices.
  await page.goto('/?intro=1');
  await expect(page.getByTestId('cinematic-intro').getByRole('button', { name: 'Enter Your Universe' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cinematic-intro')).toHaveCount(0);
  await calm.close();

  const ctx = await browser.newContext({ reducedMotion: 'no-preference' });
  const member = await ctx.newPage();
  await member.addInitScript(() => { try { localStorage.setItem('nk_intro_seen', '1'); } catch { /* ignore */ } });
  await quickUser(member, 'Returning');
  await member.evaluate(() => localStorage.removeItem('nk_intro_seen'));
  await member.goto('/');
  await member.waitForLoadState('networkidle');
  await expect(member.getByTestId('cinematic-intro')).toHaveCount(0);

  // Identity Studio reads as one place with four rooms.
  await member.goto('/identity');
  const studio = member.getByRole('navigation', { name: 'Identity Studio' });
  await expect(studio.getByRole('link')).toHaveCount(4);
  await expect(studio.getByRole('link', { name: 'Identity' })).toHaveAttribute('aria-current', 'page');
  await studio.getByRole('link', { name: 'Avatar' }).click();
  await expect(member).toHaveURL(/\/avatar$/);
  await member.getByRole('navigation', { name: 'Identity Studio' }).getByRole('link', { name: 'Universe' }).click();
  await expect(member).toHaveURL(/\/theme$/);
  await member.getByRole('navigation', { name: 'Identity Studio' }).getByRole('link', { name: 'Profile' }).click();
  await expect(member).toHaveURL(/\/settings\/profile$/);
  await ctx.close();
});
