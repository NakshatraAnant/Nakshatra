import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from './helpers';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

test('Create and Discover: text, poll and photo drops; opt-in people list; next step and funnel', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const w = watchErrors(a);
  await quickUser(a, 'Anika');
  await quickUser(b, 'Bodhi');

  // Create: a text Thought Drop, a poll and a two-photo carousel.
  await a.goto('/create');
  await a.getByPlaceholder('Something on your mind.').fill('First drop from the new Create page');
  await a.getByRole('button', { name: 'Preview' }).click();
  await expect(a.getByLabel('Preview').getByText('not posted yet', { exact: false })).toBeVisible();
  await a.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(a.getByText('Posted. People can now react and reply.')).toBeVisible();
  await a.getByRole('radio', { name: 'Poll' }).click();
  await a.getByPlaceholder('2–4 options to vote on.').fill('Chai or coffee?');
  await a.getByLabel('Option 1').fill('Chai');
  await a.getByLabel('Option 2').fill('Coffee');
  await a.getByRole('button', { name: 'Preview' }).click();
  await expect(a.getByLabel('Preview').getByText('not posted yet', { exact: false })).toBeVisible();
  await a.getByRole('button', { name: 'Post', exact: true }).click();
  await a.getByRole('radio', { name: 'Photo' }).click();
  await a.locator('input[type=file]').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(a.getByRole('list', { name: 'Chosen photos' }).getByRole('listitem')).toHaveCount(2);
  await a.getByRole('button', { name: 'Preview' }).click();
  await expect(a.getByLabel('Preview').getByText('not posted yet', { exact: false })).toBeVisible();
  await a.getByRole('button', { name: 'Post', exact: true }).click();
  await a.goto('/thoughts');
  await expect(a.getByRole('region', { name: /2 photos/ }).first()).toBeVisible();
  await expect(a.getByText('Chai or coffee?').first()).toBeVisible();

  // Discover is opt-in both ways.
  await a.goto('/explore');
  await expect(a.getByText('Discover is opt-in both ways', { exact: false })).toBeVisible();
  await a.getByRole('switch', { name: /List me in Discover/ }).click();
  await a.getByRole('button', { name: 'Game partners' }).click();
  await a.getByLabel('People', { exact: true }).getByRole('button', { name: 'Save' }).click();
  await api(b, 'PUT', 'people/settings', { discoverable: true, intents: ['game_partners'] });
  await a.reload();
  const card = a.getByRole('listitem').filter({ hasText: 'Bodhi' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Follow' }).click();
  await expect(card.getByText(/Following|Requested/)).toBeVisible();

  // Home offers one next step.
  await a.goto('/home');
  await expect(a.getByRole('heading', { name: /Find your archetype|reward|Bring your people|Say something/ }).first()).toBeVisible();

  // Funnel shows these people.
  const admin = seededAccount('admin');
  const ctxAd = await browser.newContext();
  const ad = await ctxAd.newPage();
  await signIn(ad, admin.email, admin.password);
  const f = await api(ad, 'GET', 'admin/funnel?days=1');
  expect(f.member.find((s: { key: string }) => s.key === 'first_drop').value).toBeGreaterThanOrEqual(1);
  expect(f.member.find((s: { key: string }) => s.key === 'first_connection').value).toBeGreaterThanOrEqual(1);
  await ad.goto('/admin/launch');
  await expect(ad.getByRole('heading', { name: 'Email delivery' })).toBeVisible();
  await ad.goto('/admin/funnel');
  await expect(ad.getByText('New members, last 30 days')).toBeVisible();
  await w.assertClean();
  await Promise.all([ctxA.close(), ctxB.close(), ctxAd.close()]);
});
