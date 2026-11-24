import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('quiz builder: make a trivia quiz → friend takes it → sees review → author sees totals only', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const w = watchErrors(a);
  await quickUser(a, 'Quizzy');
  await quickUser(b, 'Guesser');
  await a.goto('/play');
  await a.getByRole('link', { name: 'Member quizzes' }).click();
  await a.getByRole('link', { name: 'Make a quiz' }).first().click();
  await a.getByLabel('Title').fill('How well do you know Quizzy?');
  await a.getByLabel('Question 1 text').fill('Favourite snack?');
  await a.getByLabel('Question 1 answer 1').fill('Samosa');
  await a.getByLabel('Question 1 answer 2').fill('Chips');
  await a.getByLabel('Question 2 text').fill('Morning or night?');
  await a.getByLabel('Question 2 answer 1').fill('Morning');
  await a.getByLabel('Question 2 answer 2').fill('Night');
  await a.getByRole('radio', { name: 'Question 2: answer 2 is correct' }).check();
  await a.getByRole('button', { name: 'Publish quiz' }).click();
  await a.waitForURL(/\/play\/quizzes\/[0-9a-f-]{36}$/);
  const url = a.url();
  await expect(a.getByText('0 people have taken it.')).toBeVisible();

  await b.goto(url);
  await b.getByRole('radio', { name: 'Samosa' }).check();
  await b.getByRole('radio', { name: 'Morning' }).check();
  await b.getByRole('button', { name: 'See my result' }).click();
  const result = b.getByLabel('Your result');
  await expect(result.getByRole('heading', { name: '1 / 2' })).toBeVisible();
  await expect(result.getByText('You said Morning · answer: Night')).toBeVisible();

  await a.reload();
  await expect(a.getByText('1 person has taken it. Average 1 of 2.')).toBeVisible();
  await w.assertClean();
  await Promise.all([ctxA.close(), ctxB.close()]);
});

test('membership: Duo through the (development) payment simulator → invite link → partner joins → benefits shared', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const w = watchErrors(a);
  await quickUser(a, 'DuoOwner');
  await quickUser(b, 'DuoPartner');
  await a.goto('/membership');
  await a.getByRole('button', { name: 'Choose Duo' }).click();
  await a.waitForURL(/\/pay\/dev\//);
  await expect(a.getByText(/development/i).first()).toBeVisible();
  await a.getByRole('button', { name: 'Simulate successful payment' }).click();
  await a.getByRole('button', { name: 'Continue' }).click();
  await a.goto('/membership');
  await expect(a.getByText('Status: Active', { exact: false })).toBeVisible();
  await a.getByRole('button', { name: 'Create invite link' }).click();
  const link = await a.getByRole('textbox', { name: /Send this link/ }).inputValue();

  expect((await api(b, 'GET', 'membership')).plus.active).toBe(false);
  await b.goto(new URL(link).pathname);
  await b.getByRole('button', { name: 'Join' }).click();
  await b.waitForURL(/\/membership$/);
  await expect(b.getByText('Shared with you by DuoOwner', { exact: false })).toBeVisible();

  await a.reload();
  await expect(a.getByLabel('Duo seat').getByText('DuoPartner')).toBeVisible();
  await a.getByLabel('Duo seat').getByRole('button', { name: 'Remove' }).click();
  await expect.poll(async () => (await api(b, 'GET', 'membership')).plus.active).toBe(false);
  await w.assertClean();
  await Promise.all([ctxA.close(), ctxB.close()]);
});
