import { expect, test } from '@playwright/test';
import { quickUser, watchErrors } from './helpers';

test('Journey B: invite → accept as second user → Bond compatibility → share summary → revoke → access blocked', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxAnon = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const anon = await ctxAnon.newPage();
  const wa = watchErrors(a);
  const wb = watchErrors(b);

  await quickUser(a, 'Rohan', { date: '1991-01-12', time: '07:10' });
  await quickUser(b, 'Meera', { date: '1992-09-03', time: '21:40' });

  // A creates an invite link in the UI
  await a.goto('/bonds');
  await a.getByRole('button', { name: 'New Bond' }).first().click();
  const dialog = a.getByRole('dialog', { name: 'New Bond' });
  await dialog.getByRole('radio', { name: 'Invite link' }).or(dialog.getByRole('button', { name: 'Invite link' })).first().click();
  await dialog.getByLabel('Relationship').selectOption('friend');
  await dialog.getByRole('button', { name: 'Create invite link' }).click();
  const link = await dialog.getByLabel('Invite link').inputValue();
  expect(link).toMatch(/\/bonds\/invite\//);
  await dialog.getByRole('button', { name: 'Done' }).click();

  // B accepts
  await b.goto(new URL(link).pathname);
  await expect(b.getByRole('heading', { name: /Rohan invited you to a Bond/ })).toBeVisible();
  await b.getByLabel('What will you share?').selectOption('chart');
  await b.getByRole('button', { name: 'Accept' }).click();
  await b.waitForURL(/\/bonds\/[0-9a-f-]{36}$/);
  const bondPath = new URL(b.url()).pathname;

  // A sees the mutual Bond with calculated compatibility
  await a.goto(bondPath);
  await expect(a.getByRole('heading', { name: /You & Meera/ })).toBeVisible();
  await expect(a.getByText(/Guna Milan/).first()).toBeVisible();

  // Share a permitted summary as a link and open it signed-out
  await a.getByRole('button', { name: 'Share a summary' }).click();
  const share = a.getByRole('dialog', { name: 'Share a compatibility summary' });
  await share.getByRole('button', { name: 'Share' }).click();
  const shareUrl = await share.getByLabel('Share link').inputValue();
  await a.keyboard.press('Escape');
  await anon.goto(new URL(shareUrl).pathname);
  await expect(anon.getByText(/Guna Milan/).first()).toBeVisible();
  // The shared summary must not reveal birth details
  await expect(anon.locator('body')).not.toContainText('1992-09-03');
  await expect(anon.locator('body')).not.toContainText('21:40');

  // A revokes access
  await a.getByRole('button', { name: 'Revoke access' }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await a.waitForURL(/\/bonds$/);

  // The share link and B's view of the Bond are now blocked
  await anon.reload();
  await expect(anon.getByRole('heading', { name: 'Not found' }).or(anon.getByRole('alert'))).toBeVisible();
  await expect(anon.getByText(/Guna Milan/)).toHaveCount(0);
  await b.goto(bondPath);
  await expect(b.getByText(/Guna Milan/)).toHaveCount(0);
  const compat = await b.request.get(`/api/v1${bondPath}/compatibility`);
  expect([403, 404]).toContain(compat.status());

  await wa.assertClean();
  await wb.assertClean();
  await Promise.all([ctxA.close(), ctxB.close(), ctxAnon.close()]);
});
