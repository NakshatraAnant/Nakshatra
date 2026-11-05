import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('Journey H (launch): vibe check-in → quest complete → claim XP once → progress persists', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Kavya');
  await page.goto('/progress');
  const vibe = page.getByRole('button', { name: 'calm', exact: true });
  await vibe.click();
  await expect(vibe).toHaveAttribute('aria-pressed', 'true');

  const quest = page.getByRole('listitem').filter({ has: page.getByText('Vibe check', { exact: true }) });
  await quest.getByRole('button', { name: 'Claim' }).click();
  await expect(quest.getByText('Claimed')).toBeVisible();

  // Claiming twice is refused by the server and the ledger holds a single award.
  await expect(api(page, 'POST', 'quests/daily_vibe/claim')).rejects.toThrow(/40\d/);
  const journey = await api(page, 'GET', 'journey');
  const history: unknown[] = journey.history;
  expect(history.filter((h) => JSON.stringify(h).includes('daily_vibe'))).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole('listitem').filter({ has: page.getByText('Vibe check', { exact: true }) }).getByText('Claimed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'calm', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await w.assertClean();
});
