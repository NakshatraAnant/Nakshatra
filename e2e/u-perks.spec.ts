import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from './helpers';

test('partner perks: staff add a partner and offer → member sees the disclosure, gets the code and a tracked link (no member id)', async ({ browser }) => {
  const [ca, cu] = await Promise.all([browser.newContext(), browser.newContext()]);
  const ad = await ca.newPage();
  const user = await cu.newPage();
  const w = watchErrors(user);
  const admin = seededAccount('admin');
  await signIn(ad, admin.email, admin.password);
  await api(ad, 'PUT', 'admin/flags/partners', { enabled: true, rolloutPercent: 100 });
  try {
    await ad.goto('/admin/partners');
    await ad.getByLabel('Partner name').fill('Chai Co');
    await ad.getByLabel('Partner website').fill('https://chai.example.com');
    await ad.getByRole('button', { name: 'Add partner' }).click();
    await expect(ad.getByText('Postback secret — shown once')).toBeVisible();
    const form = ad.getByLabel('New offer');
    await form.getByLabel('Offer title').fill('20% off masala chai');
    await form.getByLabel('Offer link (https)').fill('https://chai.example.com/sale');
    await form.getByLabel('Discount code (optional)').fill('NAKSHATRA20');
    await form.getByRole('button', { name: 'Save offer' }).click();
    await ad.getByLabel('Offer 20% off masala chai').first().getByRole('button', { name: 'Go live' }).click();
    await expect(ad.getByLabel('Offer 20% off masala chai').first().getByText('live', { exact: false })).toBeVisible();

    const me = await quickUser(user, 'PerkFan');
    await user.goto('/perks');
    await expect(user.getByText(/may earn a commission/)).toBeVisible();
    const perk = user.getByLabel('Perk: 20% off masala chai');
    await expect(perk.getByText('Partner offer · Chai Co')).toBeVisible();
    await perk.getByRole('button', { name: 'Get code' }).click();
    await expect(perk.getByLabel('Discount code')).toHaveText('NAKSHATRA20');
    const link = perk.getByRole('link', { name: /Continue to Chai Co/ });
    await expect(link).toHaveAttribute('rel', /sponsored/);
    const href = (await link.getAttribute('href'))!;
    expect(new URL(href).searchParams.get('subid')).toMatch(/^[A-Za-z0-9]{8,}$/);
    expect(href).not.toContain(me.userId);

    await ad.reload();
    await expect(ad.getByLabel('Offer 20% off masala chai').first().getByText('1 follows by 1 people', { exact: false })).toBeVisible();
    await w.assertClean();
  } finally {
    await api(ad, 'PUT', 'admin/flags/partners', { enabled: false, rolloutPercent: 100 });
    await Promise.all([ca.close(), cu.close()]);
  }
});
