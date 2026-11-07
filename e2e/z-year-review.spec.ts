import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test('year in review: own recap, private facts locked, share a consented card, view it signed out, switch it off', async ({ page, browser }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Yearling');
  await api(page, 'POST', 'posts', { kind: 'thought', body: 'A drop for my year', visibility: 'public' });
  await api(page, 'POST', 'vibe', { mood: 'calm' });
  for (const n of [2, 3]) await api(page, 'POST', 'journal', { body: 'Catching up', date: daysAgo(n) });

  await page.goto('/year');
  await expect(page.getByRole('heading', { name: /Your \d{4} so far/ })).toBeVisible();
  const numbers = page.getByRole('list', { name: 'Your year in numbers' });
  await expect(numbers.getByText('Most common mood')).toBeVisible();
  await expect(numbers.getByText('Private — only you').first()).toBeVisible();

  const share = page.getByLabel('Share a card');
  await expect(share.getByText('Most common mood')).toHaveCount(0);
  await expect(share.getByLabel('Thought Drops')).toBeChecked();
  await share.getByLabel('Show my display name on the card').check();
  await share.getByRole('button', { name: 'Create share link' }).click();

  const url = page.getByTestId('year-card-url').first();
  await expect(url).toBeVisible();
  const slugPath = new URL((await url.textContent())!.trim()).pathname;

  const visitor = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const pub = await visitor.newPage();
  await pub.goto(slugPath);
  await expect(pub.getByText('Yearling’s year')).toBeVisible();
  await expect(pub.getByText('Thought Drops')).toBeVisible();
  await expect(pub.getByText(/calm/i)).toHaveCount(0);
  await expect(pub.getByRole('link', { name: 'Find my archetype' })).toBeVisible();

  await page.getByRole('button', { name: /Switch off the \d{4} card link/ }).click();
  await expect(page.getByText('No cards shared')).toBeVisible();
  await pub.reload();
  await expect(pub.getByText('Yearling’s year')).toHaveCount(0);
  await visitor.close();
  await w.assertClean();
});
