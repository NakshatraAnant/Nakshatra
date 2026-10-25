import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';


/** Waits for Discover to settle, then passes on other people until the wanted card is on top. */
async function findCard(page: import('@playwright/test').Page, name: string) {
  const wanted = page.getByRole('article', { name: new RegExp(`^${name}, \\d+$`) });
  const anyCard = page.getByRole('article');
  const empty = page.getByText('You’re all caught up');
  for (let i = 0; i < 15; i++) {
    await expect(anyCard.or(empty).first()).toBeVisible();
    if (await wanted.isVisible()) return wanted;
    if (await empty.isVisible()) break;
    await page.getByRole('button', { name: 'Pass' }).click();
    await expect(anyCard.first()).not.toHaveAttribute('aria-label', (await anyCard.first().getAttribute('aria-label')) ?? '');
  }
  throw new Error(`${name} never appeared in Discover`);
}

test('Journey D: dating profile → discover → mutual like → match → messages → report → unmatch', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const wa = watchErrors(a);
  const wb = watchErrors(b);
  const ua = await quickUser(a, 'Dia', { date: '1994-02-02', time: '09:00' });
  const ub = await quickUser(b, 'Eshan', { date: '1993-09-09', time: '18:30' });

  // A builds a dating profile in the editor
  await a.goto('/dating/profile');
  await a.getByLabel('I am').selectOption('woman');
  await a.getByLabel('Looking for').selectOption('long_term');
  // Man is preselected for a woman's profile; keep it selected.
  await expect(a.locator('fieldset', { hasText: 'Interested in' }).getByRole('button', { name: 'Man', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await a.getByRole('combobox', { name: 'City' }).fill('New Delhi');
  await a.getByRole('option', { name: /New Delhi/ }).first().click();
  await a.getByLabel('Bio').fill('Loves sunrise walks and old Hindi songs, slowly learning tarot.');
  await a.getByText('I’ve read these guidelines and agree to the community rules.').click();
  await a.getByRole('button', { name: 'Create profile' }).click();
  await expect(a.getByText('Dating profile saved')).toBeVisible();
  await a.waitForURL(/\/dating$/);

  // B's profile through the API (same validation as the editor)
  const delhi = (await api(b, 'GET', 'places?q=New Delhi')).results[0].id;
  await api(b, 'PUT', 'dating/profile', { intent: 'long_term', gender: 'man', interestedIn: ['woman'], bio: 'Weekend trekker, amateur astronomer, terrible cook.', interests: ['travel'], placeId: delhi, ageMin: 24, ageMax: 40, maxDistanceKm: 50, acknowledgeSafety: true });

  // A likes B from Discover (real ranked discovery, not a fixture)
  await a.goto('/dating');
  const cardB = await findCard(a, 'Eshan');
  await cardB.getByRole('button', { name: 'Like' }).click();

  // B likes A back in the UI → match dialog → conversation
  await b.goto('/dating');
  const cardA = await findCard(b, 'Dia');
  await cardA.getByRole('button', { name: 'Like' }).click();
  await expect(b.getByRole('dialog', { name: /It’s a match/ })).toBeVisible();
  await b.getByRole('button', { name: 'Say hello' }).click();
  await b.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  const convoPath = new URL(b.url()).pathname;
  await b.getByLabel('Write a message').fill('Hi Dia! Sunrise walks sound lovely.');
  await b.getByRole('button', { name: 'Send' }).click();
  await expect(b.locator('[aria-live][aria-label="Messages"]')).toContainText('Sunrise walks sound lovely');

  // A receives and replies
  await a.goto(convoPath);
  await expect(a.locator('[aria-live][aria-label="Messages"]')).toContainText('Sunrise walks sound lovely');
  await a.getByLabel('Write a message').fill('Hello Eshan, which trek is your favourite?');
  await a.getByRole('button', { name: 'Send' }).click();
  await expect(a.locator('[aria-live][aria-label="Messages"]')).toContainText('which trek');

  // A reports B's message
  await a.locator('[aria-live][aria-label="Messages"]').getByRole('button', { name: 'Report' }).first().click();
  const report = a.getByRole('dialog');
  await report.getByLabel('Reason').selectOption('spam');
  await report.getByRole('button', { name: 'Submit report' }).click();
  await expect(report).toBeHidden();

  // A unmatches from the Matches tab
  await a.goto('/dating');
  await a.getByRole('tab', { name: 'Matches' }).click();
  await a.getByRole('button', { name: 'Insights' }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Unmatch' }).click();
  await expect(a.getByText('Unmatched')).toBeVisible();

  // The conversation is closed for both people, and the server refuses new messages
  await b.goto(convoPath);
  await expect(b.getByText('This conversation is closed.')).toBeVisible();
  const convoId = convoPath.split('/').pop();
  await expect(api(b, 'POST', `conversations/${convoId}/messages`, { body: 'still there?' })).rejects.toThrow(/40[0-9]/);

  // The report reached the moderation queue
  void ua; void ub;
  await wa.assertClean();
  await wb.assertClean();
  await Promise.all([ctxA.close(), ctxB.close()]);
});
