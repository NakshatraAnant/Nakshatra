import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('circle spaces: channels → weekly event + RSVP → report reviewed and member paused from the moderation tab', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const wa = watchErrors(a);
  const wb = watchErrors(b);
  await quickUser(a, 'CircleHost');
  await quickUser(b, 'CircleGuest');
  const { circle } = await api(a, 'POST', 'circles', { name: 'Monsoon readers' });
  const { token } = await api(a, 'POST', `circles/${circle.id}/invites`, {});
  await api(b, 'POST', `circle-invites/${token}/accept`);

  // Channels
  await a.goto(`/circles/${circle.id}`);
  await a.getByRole('button', { name: 'Manage channels' }).click();
  await a.getByLabel('Channel name').fill('Books');
  await a.getByLabel('Channel description').fill('What we are reading');
  await a.getByRole('button', { name: 'Add channel' }).click();
  await a.getByRole('button', { name: 'Done' }).click();
  await a.getByRole('button', { name: '# Books' }).click();
  await expect(a.getByText('What we are reading')).toBeVisible();
  await a.getByPlaceholder('Something on your mind.').fill('Starting Gitanjali this week.');
  await a.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(a.getByText('Starting Gitanjali this week.')).toBeVisible();
  await a.getByRole('button', { name: '# General' }).click();
  await expect(a.getByText('Starting Gitanjali this week.')).toHaveCount(0);

  // Weekly event
  await a.getByRole('tab', { name: 'Events' }).click();
  await a.getByRole('button', { name: 'Schedule an event' }).click();
  await a.getByLabel('Event title').fill('Sunday book club');
  const start = new Date(Date.now() + 2 * 864e5);
  const local = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await a.getByLabel('Starts').fill(local);
  await a.getByLabel('Repeats').selectOption('weekly');
  await a.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(a.getByRole('listitem', { name: /Sunday book club/ })).toHaveCount(6);

  await b.goto(`/circles/${circle.id}?tab=events`);
  const first = b.getByRole('listitem', { name: /Sunday book club/ }).first();
  await expect(first.getByText('every week', { exact: false })).toBeVisible();
  await first.getByRole('button', { name: 'I’m going' }).click();
  await expect(first.getByRole('button', { name: '✓ Going' })).toBeVisible();
  await expect(first.getByText('1 going', { exact: false })).toBeVisible();

  // Moderation: a reported post, removed; the author paused from posting here.
  const { post } = await api(b, 'POST', 'posts', { kind: 'thought', body: 'This circle is boring and so are you', visibility: 'group', groupId: circle.id });
  await api(a, 'POST', 'reports', { targetType: 'post', targetId: post.id, reason: 'harassment' });
  await a.goto(`/circles/${circle.id}?tab=moderation`);
  const reports = a.getByLabel('Reports');
  await expect(reports.getByText('This circle is boring', { exact: false })).toBeVisible();
  await reports.getByLabel('Pause CircleGuest').selectOption('24');
  await reports.getByRole('button', { name: 'Pause CircleGuest' }).click();
  await reports.getByRole('button', { name: 'Remove' }).click();
  await expect(reports.getByText('Nothing to review.')).toBeVisible();
  await expect(a.getByLabel('Paused and banned').getByText('CircleGuest', { exact: false })).toBeVisible();
  await expect(a.getByLabel('Moderation log').getByText('post removed', { exact: false })).toBeVisible();

  await expect(api(b, 'POST', 'posts', { kind: 'thought', body: 'Let me back', visibility: 'group', groupId: circle.id })).rejects.toThrow(/403/);
  await wa.assertClean();
  await wb.assertClean();
  await Promise.all([ctxA.close(), ctxB.close()]);
});
