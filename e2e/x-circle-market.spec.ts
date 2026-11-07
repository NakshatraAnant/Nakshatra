import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('circle market: list → member shows interest → seller accepts → they message; prohibited items refused', async ({ browser }) => {
  const [ca, cb] = await Promise.all([browser.newContext(), browser.newContext()]);
  const seller = await ca.newPage();
  const buyer = await cb.newPage();
  const ws = watchErrors(seller);
  const wb = watchErrors(buyer);
  await quickUser(seller, 'LampSeller');
  await quickUser(buyer, 'LampBuyer');
  const { circle } = await api(seller, 'POST', 'circles', { name: 'Block B' });
  const { token } = await api(seller, 'POST', `circles/${circle.id}/invites`, {});
  await api(buyer, 'POST', `circle-invites/${token}/accept`);

  await seller.goto(`/circles/${circle.id}?tab=market`);
  await seller.getByRole('button', { name: 'List something' }).click();
  const form = seller.getByLabel('New listing');
  await form.getByLabel('What is it?').fill('Leftover beer crate');
  await form.getByLabel('Price in ₹').fill('200');
  await form.getByRole('button', { name: 'Post listing' }).click();
  await expect(seller.getByText('Listings for alcohol aren’t allowed', { exact: false })).toBeVisible();
  await form.getByLabel('What is it?').fill('Desk lamp');
  await form.getByLabel('Price in ₹').fill('450');
  await form.getByLabel('Details (optional)').fill('Warm light, works perfectly');
  await form.getByRole('button', { name: 'Post listing' }).click();
  await expect(seller.getByLabel('Listing: Desk lamp')).toBeVisible();

  await buyer.goto(`/circles/${circle.id}?tab=market`);
  await buyer.getByLabel('Listing: Desk lamp').click();
  await expect(buyer.getByText('₹450', { exact: false })).toBeVisible();
  await expect(buyer.getByLabel('Safety').getByText(/Meet in a busy public place/)).toBeVisible();
  await buyer.getByLabel('Note to the seller (optional)').fill('Could I pick it up at 5?');
  await buyer.getByRole('button', { name: 'I’m interested' }).click();
  await expect(buyer.getByText('You’re interested.', { exact: false })).toBeVisible();

  await seller.getByLabel('Listing: Desk lamp').click();
  const who = seller.getByLabel('Interested members');
  await expect(who.getByText('Could I pick it up at 5?', { exact: false })).toBeVisible();
  await who.getByRole('button', { name: 'Accept' }).click();
  await seller.getByLabel('Message', { exact: true }).fill('Yes — hostel gate at 5.');
  await seller.getByRole('button', { name: 'Send' }).click();

  await buyer.reload();
  await expect(buyer.getByText('The seller accepted', { exact: false })).toBeVisible();
  await expect(buyer.getByLabel('Messages').getByText('Yes — hostel gate at 5.')).toBeVisible();
  await buyer.getByLabel('Message', { exact: true }).fill('See you there!');
  await buyer.getByRole('button', { name: 'Send' }).click();
  await expect(buyer.getByLabel('Messages').getByText('See you there!')).toBeVisible();
  await ws.assertClean();
  await wb.assertClean();
  await Promise.all([ca.close(), cb.close()]);
});
