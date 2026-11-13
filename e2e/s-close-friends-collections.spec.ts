import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('close friends + collections: list a friend → close-friends drop seen only by them → save it to a public collection → visitor sees only what they may', async ({ browser }) => {
  const [ca, cb, cc] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const a = await ca.newPage();
  const b = await cb.newPage();
  const c = await cc.newPage();
  const wa = watchErrors(a);
  const wb = watchErrors(b);
  const author = await quickUser(a, 'InnerCircle');
  const friend = await quickUser(b, 'BestFriend');
  await quickUser(c, 'Acquaintance');
  await api(a, 'PATCH', 'profile', { visibility: 'public' });
  await api(b, 'POST', `follows/${author.userId}`);
  await api(b, 'PATCH', 'profile', { visibility: 'public' });
  await api(c, 'POST', `follows/${author.userId}`);

  await a.goto('/close-friends');
  await a.getByRole('button', { name: 'Add BestFriend to close friends' }).click();
  await expect(a.getByText('1 of up to 150', { exact: false })).toBeVisible();

  await a.goto('/thoughts');
  await a.getByPlaceholder('Something on your mind.').fill('Secret chai spot: the blue door on 4th Cross');
  await a.getByLabel('Who can see this').selectOption('close_friends');
  await expect(a.getByText('Only people on your close-friends list will see this.')).toBeVisible();
  await a.getByRole('button', { name: 'Preview' }).click();
  await expect(a.getByLabel('Preview').getByText('not posted yet', { exact: false })).toBeVisible();
  await a.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(a.getByText('Secret chai spot', { exact: false })).toBeVisible();

  await b.goto('/thoughts');
  const card = b.getByRole('article').filter({ hasText: 'Secret chai spot' });
  await expect(card.getByText('Close friends')).toBeVisible();
  await card.getByRole('button', { name: 'Save to…' }).click();
  await b.getByLabel('New collection name').fill('Bangalore finds');
  await b.getByRole('button', { name: 'Create' }).click();
  await expect(b.getByRole('checkbox', { name: 'Bangalore finds' })).toBeChecked();
  await b.getByRole('button', { name: 'Done' }).click();

  const { post } = await api(b, 'POST', 'posts', { kind: 'thought', body: 'Public tip: try the filter coffee', visibility: 'public' });
  await b.goto('/saved');
  await b.getByRole('link', { name: /Bangalore finds/ }).click();
  await b.getByRole('button', { name: 'Edit' }).click();
  await b.getByLabel('Who can see it').selectOption('public');
  await b.getByRole('button', { name: 'Save', exact: true }).click();
  const collectionUrl = b.url();
  await api(b, 'POST', `collections/${collectionUrl.split('/').pop()}/items`, { postId: post.id });

  await c.goto('/thoughts');
  await expect(c.getByText('Secret chai spot', { exact: false })).toHaveCount(0);
  await c.goto(collectionUrl);
  await expect(c.getByText('Public tip: try the filter coffee')).toBeVisible();
  await expect(c.getByText('Secret chai spot', { exact: false })).toHaveCount(0);
  await expect(c.getByText('1 post isn’t shown', { exact: false })).toBeVisible();
  await c.goto(`/u/${friend.handle}`);
  await expect(c.getByRole('link', { name: /Bangalore finds/ })).toBeVisible();

  await wa.assertClean();
  await wb.assertClean();
  await Promise.all([ca.close(), cb.close(), cc.close()]);
});
