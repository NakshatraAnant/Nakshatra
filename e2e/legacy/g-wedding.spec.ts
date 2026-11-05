import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from '../helpers';

test('Journey G: project → invite partner with permissions → task → vendor inquiry → quotation → accept → deposit → booked; permissions enforced', async ({ browser }) => {
  const ctxO = await browser.newContext();
  const ctxP = await browser.newContext();
  const ctxF = await browser.newContext();
  const ctxV = await browser.newContext();
  const owner = await ctxO.newPage();
  const partner = await ctxP.newPage();
  const family = await ctxF.newPage();
  const vendor = await ctxV.newPage();
  const wo = watchErrors(owner);
  await quickUser(owner, 'Ira');
  const p = await quickUser(partner, 'Kabir');
  const f = await quickUser(family, 'Auntie');
  const vendorAcct = seededAccount('sample vendor');
  await signIn(vendor, vendorAcct.email, vendorAcct.password);
  const vendorId: string = (await api(vendor, 'GET', 'vendor/me')).vendors[0].id;

  // Owner creates the project in the UI
  await owner.goto('/weddings/new');
  await owner.getByLabel('Project name').fill('Ira & Kabir');
  await owner.getByLabel('Total budget (₹, optional)').fill('1500000');
  await owner.getByRole('button', { name: 'Create project' }).click();
  await owner.waitForURL(/\/weddings\/[0-9a-f-]{36}$/);
  const projectPath = new URL(owner.url()).pathname;

  // Invite partner (all permissions) and a family member (no budget access)
  await owner.getByRole('tab', { name: 'People' }).click();
  await owner.getByLabel('Email').fill(p.email);
  await owner.getByLabel('Role').selectOption('partner');
  await owner.getByRole('button', { name: 'Send invitation' }).click();
  const partnerLink = (await owner.getByText(/Direct link:/).textContent())!.match(/https?:\/\/\S+/)![0];
  await owner.getByLabel('Email').fill(f.email);
  await owner.getByLabel('Role').selectOption('family');
  for (const perm of ['View budget', 'Edit budget', 'Manage vendors & payments']) await owner.locator('fieldset').getByText(perm).click();
  await owner.getByRole('button', { name: 'Send invitation' }).click();
  // The notice is reused; wait until it shows the new (family) link rather than the partner's.
  await expect(owner.getByText(/Direct link:/)).not.toContainText(partnerLink);
  const familyLink = (await owner.getByText(/Direct link:/).textContent())!.match(/https?:\/\/\S+/)![0];
  expect(familyLink).not.toBe(partnerLink);

  await partner.goto(new URL(partnerLink).pathname);
  await partner.getByRole('button', { name: 'Join' }).click();
  await partner.waitForURL(projectPath);
  await family.goto(new URL(familyLink).pathname);
  await family.getByRole('button', { name: 'Join' }).click();
  await family.waitForURL(projectPath);

  // Owner adds a task; partner sees it
  await owner.reload();
  await owner.getByRole('tab', { name: 'Tasks & timeline' }).click();
  await owner.getByLabel('New task').fill('Book the mehendi artist');
  await owner.getByRole('button', { name: 'Add task' }).click();
  await expect(owner.getByText('Book the mehendi artist')).toBeVisible();
  await partner.reload();
  await partner.getByRole('tab', { name: 'Tasks & timeline' }).click();
  await expect(partner.getByText('Book the mehendi artist')).toBeVisible();

  // Shared permissions: family member has no Budget/Vendors tabs and the API withholds the data
  await family.reload();
  await expect(family.getByRole('tab', { name: 'Budget' })).toHaveCount(0);
  await expect(family.getByRole('tab', { name: 'Vendors' })).toHaveCount(0);
  const famView = await api(family, 'GET', `weddings${projectPath.replace('/weddings', '')}`);
  expect(famView.budget).toBeNull();
  expect(famView.vendors).toBeNull();
  await expect(partner.getByRole('tab', { name: 'Budget' })).toBeVisible();

  // Vendor inquiry from the vendor page
  await owner.goto(`/vendors/${vendorId}`);
  await owner.getByLabel('Project').selectOption({ label: 'Ira & Kabir' });
  await owner.getByLabel('Message', { exact: true }).fill('Hello! We would love a quotation for our sangeet, about 150 guests.');
  await owner.getByRole('button', { name: 'Send inquiry' }).click();

  // Vendor records a quotation in the vendor studio
  await vendor.goto('/vendor/dashboard');
  const inquiry = vendor.getByRole('listitem').filter({ hasText: 'about 150 guests' });
  await inquiry.getByRole('button', { name: 'Send quotation' }).click();
  const qd = vendor.getByRole('dialog', { name: 'Send a quotation' });
  await qd.getByLabel('Total amount (₹)').fill('200000');
  await qd.getByLabel('What’s included').fill('Sound, lighting and a 4-hour DJ set.');
  await qd.getByRole('button', { name: 'Send' }).click();
  await expect(qd).toBeHidden();

  // Owner accepts the quotation and pays the deposit milestone (dev adapter) → booking confirmed
  await owner.goto(projectPath);
  await owner.getByRole('tab', { name: 'Vendors' }).click();
  await owner.getByRole('button', { name: 'Accept quotation' }).click();
  await owner.getByRole('button', { name: 'Pay' }).first().click();
  await owner.waitForURL(/\/pay\/dev\//);
  await owner.getByRole('button', { name: 'Simulate successful payment' }).click();
  await owner.getByRole('button', { name: 'Continue' }).click();
  await owner.waitForURL(projectPath);
  const view = await api(owner, 'GET', `weddings${projectPath.replace('/weddings', '')}`);
  const booked = view.vendors.find((v: { vendor: { id: string } }) => v.vendor.id === vendorId);
  expect(booked.booking.status).toBe('confirmed');
  expect(view.milestones.find((m: { label: string }) => m.label === 'Deposit').status).toBe('paid');
  expect(view.budgetSummary.spent).toBeGreaterThan(0);

  // The vendor sees the confirmed booking
  await vendor.reload();
  await expect(vendor.getByRole('cell', { name: /Confirmed/i }).first()).toBeVisible();
  await wo.assertClean();
  for (const c of [ctxO, ctxP, ctxF, ctxV]) await c.close();
});
