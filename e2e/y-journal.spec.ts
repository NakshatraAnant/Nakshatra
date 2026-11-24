import { expect, test } from '@playwright/test';
import { quickUser, watchErrors } from './helpers';

test('journal: write with today’s prompt → calendar marks the day → edit and delete; private notice shown', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Diarist');
  await page.goto('/journal');
  await expect(page.getByText('Only you can read your journal', { exact: false })).toBeVisible();
  await page.getByLabel('Journal entry').fill('Quiet day. Finished the book I started in June.');
  await page.getByRole('button', { name: 'Save entry' }).click();
  const entry = page.getByRole('article').filter({ hasText: 'Quiet day.' });
  await expect(entry).toBeVisible();

  const todayCell = page.getByLabel('Your month').getByRole('button', { name: /1 journal/ });
  await expect(todayCell).toBeVisible();
  await todayCell.click();
  await expect(page.getByRole('article').filter({ hasText: 'Quiet day.' })).toBeVisible();

  await entry.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit entry').fill('Quiet day. Finished the book — and started another.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('and started another', { exact: false })).toBeVisible();
  await page.getByRole('article').filter({ hasText: 'and started another' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('and started another', { exact: false })).toHaveCount(0);
  await w.assertClean();
});
