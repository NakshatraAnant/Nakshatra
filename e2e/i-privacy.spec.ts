import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { api, PASSWORD, quickUser, seededAccount, signIn, watchErrors } from './helpers';

test('Journey I: visibility → unauthorized access blocked → revoke Bond → export → delete account → retention rules', async ({ browser }) => {
  const ctxX = await browser.newContext({ acceptDownloads: true });
  const ctxY = await browser.newContext();
  const x = await ctxX.newPage();
  const y = await ctxY.newPage();
  const wx = watchErrors(x);
  const ux = await quickUser(x, 'Priya', { date: '1990-11-05', time: '04:15' });
  await quickUser(y, 'Vikram');

  // Private by default: Y cannot read X's profile details or birth data
  const priv = await y.request.get(`/api/v1/u/${ux.handle}`);
  const privBody = await priv.text();
  expect(privBody).not.toContain('1990-11-05');
  expect(privBody).not.toContain('04:15');

  // X makes the profile public and shares the Sun sign only (birth time/place can never be public)
  await x.goto('/settings/privacy');
  await x.getByLabel('Who can see your profile').selectOption('public');
  await x.getByLabel('Sun sign').selectOption('public');
  await expect.poll(async () => (await api(x, 'GET', 'profile')).profile.visibility).toBe('public');
  await y.goto(`/u/${ux.handle}`);
  await expect(y.getByText('Priya').first()).toBeVisible();
  const pub = await (await y.request.get(`/api/v1/u/${ux.handle}`)).text();
  expect(pub).not.toContain('04:15');
  expect(pub).not.toMatch(/latitude|longitude/);

  // Insecure direct object reference checks: Y cannot read X's chart, insights or bonds
  const xChart = await api(x, 'GET', 'charts/me');
  expect((await y.request.get(`/api/v1/charts/snapshots/${xChart.chartId}`)).status()).toBeGreaterThanOrEqual(400);
  const yBonds = await api(y, 'GET', 'bonds');
  expect(yBonds.bonds).toHaveLength(0);

  // Bond, then X revokes access in the UI; Y loses compatibility access
  await api(x, 'POST', 'bonds', { kind: 'friend', invite: { handle: (await api(y, 'GET', 'auth/me')).user.profile.handle, shareScope: 'chart', requestScope: 'chart' } });
  const inv = (await api(y, 'GET', 'bonds')).invitations[0];
  const accepted = await api(y, 'POST', `bonds/invitations/${inv.id}/respond`, { accept: true, shareScope: 'chart' });
  await x.goto(`/bonds/${accepted.bondId}`);
  await x.getByRole('button', { name: 'Revoke access' }).click();
  await x.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await x.waitForURL(/\/bonds$/);
  expect([403, 404]).toContain((await y.request.get(`/api/v1/bonds/${accepted.bondId}/compatibility`)).status());

  // Export from Settings → Data: a real JSON download containing the promised sections
  await x.goto('/settings/data');
  const [download] = await Promise.all([x.waitForEvent('download'), x.getByRole('button', { name: 'Export my data' }).click()]);
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  await download.delete();
  const text = JSON.stringify(exported);
  expect(text).toContain('1990-11-05');
  expect(text).toContain(ux.email);
  for (const key of ['profile', 'birthProfiles', 'bonds', 'consents']) expect(Object.keys(exported)).toContain(key);

  // Delete the account with password + typed confirmation
  await x.getByLabel('Your password').fill(PASSWORD);
  await x.getByRole('button', { name: 'Delete my account' }).click();
  const confirm = x.getByRole('dialog', { name: 'Delete your account permanently?' });
  await confirm.getByRole('textbox').fill('DELETE');
  await confirm.getByRole('button', { name: 'Delete account' }).click();
  await x.waitForURL((u) => u.pathname === '/');

  // Deleted: cannot sign in, public profile gone, Bond gone for Y
  const login = await x.request.post('/api/v1/auth/login', { data: { email: ux.email, password: PASSWORD }, headers: { 'x-csrf-token': (await ctxX.cookies()).find((c) => c.name === 'nk_csrf')?.value ?? '' } });
  expect(login.status()).toBeGreaterThanOrEqual(400);
  expect((await y.request.get(`/api/v1/u/${ux.handle}`)).status()).toBe(404);
  expect((await api(y, 'GET', 'bonds')).bonds).toHaveLength(0);

  // Retention: the deletion is recorded with a summary (no personal content) for the privacy team
  const ctxA = await browser.newContext();
  const ad = await ctxA.newPage();
  const admin = seededAccount('admin');
  await signIn(ad, admin.email, admin.password);
  const reqs = await api(ad, 'GET', 'admin/privacy-requests');
  const del = reqs.deletions.find((d: { status: string; summary: Record<string, unknown> | null }) => d.summary && d.status);
  expect(del).toBeTruthy();
  expect(JSON.stringify(reqs.deletions)).not.toContain(ux.email);
  expect(JSON.stringify(reqs.deletions)).not.toContain('1990-11-05');

  await wx.assertClean();
  for (const c of [ctxA, ctxY, ctxX]) await c.close();
});
