import { expect, test, type Page } from '@playwright/test';
import { quickUser } from './helpers';

const WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440];
const PUBLIC = ['/', '/personality', '/signin', '/legal/privacy'];
const MEMBER = ['/home', '/explore', '/create', '/circles', '/play', '/identity', '/progress', '/settings/security', '/thoughts', '/play/tournaments', '/play/leaderboard'];

async function overflow(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole('heading').first().waitFor();
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test('no horizontal scrolling and primary navigation reachable at every supported width', async ({ page }) => {
  test.setTimeout(600_000);
  const problems: string[] = [];
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of PUBLIC) { const o = await overflow(page, p); if (o > 1) problems.push(`${w}px ${p}: ${o}px`); }
  }
  await quickUser(page, 'Widths');
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of MEMBER) { const o = await overflow(page, p); if (o > 1) problems.push(`${w}px ${p}: ${o}px`); }
    // Below the md breakpoint the bottom bar carries the six primary destinations; above it the sidebar does.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const visible = w < 768 ? nav.last() : nav.first();
    for (const label of ['Home', 'Discover', 'Create', 'Circles', 'Play', 'Profile']) {
      if (!(await visible.getByRole('link', { name: label }).isVisible())) problems.push(`${w}px: "${label}" not visible in navigation`);
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
