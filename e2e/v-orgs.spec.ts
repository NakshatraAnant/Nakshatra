import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from './helpers';

test('organisations: staff create a workspace → owner makes a circle and invite → colleague joins; outsiders get nothing', async ({ browser }) => {
  const [cs, co, cm, cx] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext(), browser.newContext()]);
  const staff = await cs.newPage();
  const owner = await co.newPage();
  const mate = await cm.newPage();
  const out = await cx.newPage();
  const wo = watchErrors(owner);
  const wm = watchErrors(mate);
  const admin = seededAccount('admin');
  await signIn(staff, admin.email, admin.password);
  await api(staff, 'PUT', 'admin/flags/orgs', { enabled: true, rolloutPercent: 100 });
  try {
    const o = await quickUser(owner, 'TeamLead');
    await staff.goto('/admin/orgs');
    await staff.getByLabel('Organisation name').fill('Acme Studio');
    await staff.getByLabel('Owner’s Nakshatra email').fill(o.email);
    await staff.getByRole('button', { name: 'Create organisation' }).click();
    await expect(staff.getByLabel('Organisation Acme Studio')).toBeVisible();

    await owner.goto('/orgs');
    await owner.getByRole('link', { name: /Acme Studio/ }).click();
    await owner.getByLabel('New circle name').fill('Lunch club');
    await owner.getByRole('button', { name: 'Create circle' }).click();
    await owner.getByRole('button', { name: 'Create invite link' }).click();
    const link = await owner.getByLabel('Invite link (valid 14 days)').inputValue();
    await expect(owner.getByLabel('Team insights').getByText(/Team picture appears once 5 people opt in/)).toBeVisible();
    const orgUrl = owner.url();

    await quickUser(mate, 'Colleague');
    await mate.goto(new URL(link).pathname);
    await expect(mate.getByText('never your personal results', { exact: false })).toBeVisible();
    await mate.getByRole('button', { name: 'Join' }).click();
    await mate.waitForURL(/\/orgs\/[0-9a-f-]{36}$/);
    await expect(mate.getByText('never your archetype', { exact: false })).toBeVisible();
    await mate.getByRole('switch', { name: 'Count me in the team picture' }).click();
    await expect(mate.getByRole('switch', { name: 'Count me in the team picture' })).toHaveAttribute('aria-checked', 'true');
    await mate.getByRole('button', { name: 'Join' }).click();
    await mate.waitForURL(/\/circles\/[0-9a-f-]{36}/);
    await expect(mate.getByRole('heading', { name: 'Lunch club' })).toBeVisible();

    await owner.reload();
    await expect(owner.getByLabel('People').getByText('Colleague')).toBeVisible();

    await quickUser(out, 'Stranger');
    await out.goto(orgUrl);
    await expect(out.getByRole('heading', { name: /Not found|Not available/ })).toBeVisible();
    await expect(out.getByText('Lunch club')).toHaveCount(0);
    await wo.assertClean();
    await wm.assertClean();
  } finally {
    await api(staff, 'PUT', 'admin/flags/orgs', { enabled: false, rolloutPercent: 100 });
    await Promise.all([cs.close(), co.close(), cm.close(), cx.close()]);
  }
});
