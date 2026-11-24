import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('circle tiers: owner adds a tier and a members-only channel → tiered member sees it, others never do', async ({ browser }) => {
  const [ca, cb, cc] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const owner = await ca.newPage();
  const core = await cb.newPage();
  const other = await cc.newPage();
  const w = watchErrors(owner);
  await quickUser(owner, 'TierHost');
  await quickUser(core, 'CoreMember');
  await quickUser(other, 'NewMember');
  const { circle } = await api(owner, 'POST', 'circles', { name: 'Hiking crew' });
  const { token } = await api(owner, 'POST', `circles/${circle.id}/invites`, {});
  await api(core, 'POST', `circle-invites/${token}/accept`);
  await api(other, 'POST', `circle-invites/${token}/accept`);

  await owner.goto(`/circles/${circle.id}?tab=members`);
  const tiers = owner.getByLabel('Membership tiers');
  await tiers.getByLabel('Tier name').fill('Trail leads');
  await tiers.getByRole('button', { name: 'Add tier' }).click();
  await expect(tiers.getByText('Trail leads')).toBeVisible();
  await owner.getByLabel('Tier for CoreMember').selectOption({ label: 'Trail leads' });
  await expect(owner.getByLabel('Tier for CoreMember')).toHaveValue(/.+/);
  await owner.reload();
  await expect(owner.getByText('Trail leads').first()).toBeVisible();

  await owner.getByRole('tab', { name: 'Feed' }).click();
  await owner.getByRole('button', { name: 'Manage channels' }).click();
  await owner.getByLabel('Channel name').fill('Route planning');
  await owner.getByLabel('Who can see it').selectOption({ label: 'Trail leads and above' });
  await owner.getByRole('button', { name: 'Add channel' }).click();
  await expect(owner.getByText('Trail leads and above', { exact: false }).first()).toBeVisible();

  await core.goto(`/circles/${circle.id}`);
  await core.getByRole('button', { name: /# Route planning · Trail leads\+/ }).click();
  await core.getByPlaceholder('Something on your mind.').fill('Saturday: Nandi Hills, 5 am start');
  await core.getByRole('button', { name: 'Preview' }).click();
  await expect(core.getByLabel('Preview').getByText('not posted yet', { exact: false })).toBeVisible();
  await core.getByRole('button', { name: 'Post', exact: true }).click();
  // The preview closes only once the post is saved.
  await expect(core.getByLabel('Preview', { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect(core.getByText('Saturday: Nandi Hills, 5 am start')).toBeVisible();

  await other.goto(`/circles/${circle.id}`);
  await expect(other.getByRole('heading', { name: 'Hiking crew' })).toBeVisible();
  await expect(other.getByRole('button', { name: /Route planning/ })).toHaveCount(0);
  await expect(other.getByText('Saturday: Nandi Hills', { exact: false })).toHaveCount(0);
  await other.goto('/thoughts');
  await expect(other.getByText('Saturday: Nandi Hills', { exact: false })).toHaveCount(0);
  await w.assertClean();
  await Promise.all([ca.close(), cb.close(), cc.close()]);
});
