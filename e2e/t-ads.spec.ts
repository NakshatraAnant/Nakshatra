import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from './helpers';

test('sponsored cards: admin drafts → second staff member approves → member sees a labelled card with why-this-ad and can hide it', async ({ browser }) => {
  const [ca, cm, cu] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const ad = await ca.newPage();
  const mod = await cm.newPage();
  const user = await cu.newPage();
  const w = watchErrors(user);
  const admin = seededAccount('admin');
  await signIn(ad, admin.email, admin.password);
  await api(ad, 'PUT', 'admin/flags/ads', { enabled: true, rolloutPercent: 100 });
  try {
    await ad.goto('/admin/ads');
    await ad.getByLabel('Advertiser name').fill('Bean Co');
    await ad.getByLabel('Advertiser website').fill('https://example.com');
    await ad.getByLabel('Advertiser contact email').fill('ads@example.com');
    await ad.getByRole('button', { name: 'Add advertiser' }).click();
    const form = ad.getByLabel('New campaign');
    await form.getByLabel('Campaign name (internal)').fill('Coffee launch');
    await form.getByLabel('Headline').fill('Made for introverts');
    await expect(form.getByText(/sensitive or identity topic/)).toBeVisible();
    await form.getByLabel('Headline').fill('Fresh filter coffee, delivered');
    await form.getByLabel('Link (https)').fill('https://example.com/coffee');
    await form.getByRole('button', { name: 'Save draft' }).click();
    const card = ad.getByLabel('Campaign Coffee launch').first();
    await card.getByRole('button', { name: 'Submit for review' }).click();
    await expect(card.getByText('Waiting for another staff member to review.')).toBeVisible();

    const moderator = seededAccount('moderator');
    await signIn(mod, moderator.email, moderator.password);
    await mod.goto('/admin/ads');
    const review = mod.getByLabel('Campaign Coffee launch').first();
    await review.getByRole('button', { name: 'Approve' }).click();
    await expect(review.getByText('approved', { exact: true })).toBeVisible();

    await quickUser(user, 'FeedReader');
    for (let i = 1; i <= 7; i++) await api(user, 'POST', 'posts', { kind: 'thought', body: `Note number ${i} about my week`, visibility: 'public' });
    await user.goto('/thoughts');
    const sponsored = user.getByRole('complementary', { name: /Sponsored: Fresh filter coffee/ });
    await expect(sponsored.getByText('Sponsored · Bean Co')).toBeVisible();
    await expect(sponsored.getByRole('link', { name: /Learn more/ })).toHaveAttribute('rel', /sponsored/);
    await sponsored.getByRole('button', { name: 'Why am I seeing this?' }).click();
    await expect(sponsored.getByText(/never based on your profile/)).toBeVisible();
    await sponsored.getByRole('button', { name: 'Hide ad' }).click();
    await expect(user.getByText('Ad hidden. You won’t see it again.')).toBeVisible();
    await user.reload();
    await expect(user.getByText('Note number 1 about my week')).toBeVisible();
    await expect(user.getByText('Sponsored · Bean Co')).toHaveCount(0);
    await w.assertClean();
  } finally {
    await api(ad, 'PUT', 'admin/flags/ads', { enabled: false, rolloutPercent: 100 });
    await Promise.all([ca.close(), cm.close(), cu.close()]);
  }
});
