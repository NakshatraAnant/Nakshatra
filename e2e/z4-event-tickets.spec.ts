import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('paid circle event: owner sets a ticket price → guest pays (development simulator) → host cancels → ticket refunded automatically', async ({ browser }) => {
  const [ca, cb] = await Promise.all([browser.newContext(), browser.newContext()]);
  const host = await ca.newPage();
  const guest = await cb.newPage();
  const wh = watchErrors(host);
  const wg = watchErrors(guest);
  await quickUser(host, 'SupperHost');
  await quickUser(guest, 'SupperGuest');
  const { circle } = await api(host, 'POST', 'circles', { name: 'Supper society' });
  const { token } = await api(host, 'POST', `circles/${circle.id}/invites`, {});
  await api(guest, 'POST', `circle-invites/${token}/accept`);

  await host.goto(`/circles/${circle.id}?tab=events`);
  await host.getByRole('button', { name: 'Schedule an event' }).click();
  const form = host.getByLabel('New event');
  await form.getByLabel('Event title').fill('Biryani night');
  const when = new Date(Date.now() + 3 * 864e5);
  when.setMinutes(0, 0, 0);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await form.getByLabel('Starts').fill(local);
  await form.getByLabel('Ticket price in ₹ (optional)').fill('299');
  await form.getByRole('button', { name: 'Schedule' }).click();
  await expect(host.getByText('ticket ₹299', { exact: false })).toBeVisible();

  await guest.goto(`/circles/${circle.id}?tab=events`);
  await expect(guest.getByText('If the host cancels, every ticket is refunded automatically.')).toBeVisible();
  await guest.getByRole('button', { name: 'Get ticket — ₹299' }).click();
  await guest.waitForURL(/\/pay\/dev\//);
  await guest.getByRole('button', { name: 'Simulate successful payment' }).click();
  await guest.getByRole('button', { name: 'Continue' }).click();
  await guest.waitForURL(new RegExp(`/circles/${circle.id}`));
  await expect(guest.getByText('✓ Ticket')).toBeVisible();

  await host.reload();
  await expect(host.getByText('1 going', { exact: false })).toBeVisible();
  await host.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(host.getByText('1 ticket refunded automatically', { exact: false })).toBeVisible();

  await guest.reload();
  await expect(guest.getByText('Cancelled')).toBeVisible();
  await expect(guest.getByText('Your ticket was refunded.')).toBeVisible();
  await wh.assertClean();
  await wg.assertClean();
  await Promise.all([ca.close(), cb.close()]);
});
