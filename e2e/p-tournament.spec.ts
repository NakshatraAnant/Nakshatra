import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('tournament: host invites a friend → friend joins, plays a timed run → standings + history; season board loads', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const wa = watchErrors(a);
  const wb = watchErrors(b);
  const host = await quickUser(a, 'CupHost');
  await quickUser(b, 'CupPlayer');
  await api(a, 'PATCH', 'profile', { visibility: 'public' });
  await api(b, 'POST', `follows/${host.userId}`);

  await a.goto('/play');
  await a.getByRole('link', { name: 'Tournaments' }).click();
  await a.getByRole('link', { name: 'Host a tournament' }).first().click();
  await a.getByLabel('Title').fill('Monsoon cup');
  const qs = [['Rainiest month?', 'July', 'March'], ['Chai or coffee?', 'Chai', 'Coffee'], ['Best snack?', 'Pakora', 'Salad']];
  for (const [i, [text, right, wrong]] of qs.entries()) {
    await a.getByLabel(`Question ${i + 1} text`).fill(text);
    await a.getByLabel(`Question ${i + 1} answer 1`).fill(right);
    await a.getByLabel(`Question ${i + 1} answer 2`).fill(wrong);
  }
  await a.getByRole('radio', { name: 'Friends I invite' }).click();
  await a.getByRole('checkbox', { name: 'CupPlayer' }).check();
  await a.getByRole('button', { name: 'Start tournament' }).click();
  await a.waitForURL(/\/play\/tournaments\/[0-9a-f-]{36}$/);
  const url = a.url();
  await expect(a.getByText('You wrote the questions', { exact: false })).toBeVisible();

  await b.goto(url);
  await b.getByRole('button', { name: 'Join' }).click();
  await b.getByRole('button', { name: 'Start' }).click();
  await expect(b.getByRole('timer', { name: 'Time left' })).toBeVisible();
  for (const [, [, right]] of qs.entries()) await b.getByRole('radio', { name: right }).check();
  await b.waitForTimeout(4000); // a human-paced run (instant answers are held for review)
  await b.getByRole('button', { name: 'Submit answers' }).click();
  const runCard = b.getByLabel('Your run');
  await expect(runCard.getByText('3 / 3')).toBeVisible();
  await expect(runCard.getByText('Currently #1')).toBeVisible();
  await expect(b.getByLabel('Standings').getByText('You')).toBeVisible();

  await b.goto('/play/tournaments');
  await expect(b.getByText('Monsoon cup').first()).toBeVisible();
  await expect(b.getByText('#1 of 1', { exact: false })).toBeVisible();

  await a.reload();
  await expect(a.getByLabel('Standings').getByText('CupPlayer')).toBeVisible();

  await b.goto('/play/leaderboard');
  await expect(b.getByRole('heading', { name: 'Season leaderboard' })).toBeVisible();
  await expect(b.getByText(/You’re #\d+ of \d+/)).toBeVisible();
  await wa.assertClean();
  await wb.assertClean();
  await Promise.all([ctxA.close(), ctxB.close()]);
});
