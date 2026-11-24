import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { quickUser } from './helpers';

/** Automated WCAG 2.1 A/AA checks (axe-core). Fails on serious or critical violations. */
async function scan(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole('heading').first().waitFor();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('canvas').analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${path} — ${v.id} (${v.impact}): ${v.help} × ${v.nodes.length} e.g. ${v.nodes[0]?.target.join(' ')}`);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`accessibility (${scheme}): public and member pages have no serious/critical axe violations`, async ({ browser }) => {
    test.setTimeout(400_000);
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();
    const found: string[] = [];
    for (const p of ['/', '/personality', '/signin', '/signup', '/legal/privacy', '/about/methodology']) found.push(...(await scan(page, p)));
    await quickUser(page, `A11y${scheme}`);
    for (const p of ['/home', '/identity', '/thoughts', '/circles', '/play', '/invite', '/today', '/cosmic-id', '/chart', '/calendar', '/bonds', '/social', '/messages', '/dating', '/experts', '/learn', '/shop', '/weddings', '/journey', '/journey/rewards', '/settings/privacy', '/notifications', '/support']) {
      found.push(...(await scan(page, p)));
    }
    expect(found, found.join('\n')).toEqual([]);
    await ctx.close();
  });
}
