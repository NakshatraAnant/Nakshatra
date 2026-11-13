import { expect, test, type Page } from '@playwright/test';
import { api, PASSWORD, quickUser, uniqueEmail, verifyEmail, watchErrors, skipIntro } from './helpers';

async function answerAll(page: Page, finishLabel: string) {
  for (let step = 0; step < 4; step++) {
    const groups = page.getByRole('radiogroup');
    await expect(groups.first()).toBeVisible();
    const n = await groups.count();
    for (let i = 0; i < n; i++) await groups.nth(i).getByText(i % 2 ? 'Agree' : 'Disagree', { exact: true }).click();
    if (step < 3) await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.getByRole('button', { name: finishLabel }).click();
}

test('Journey K: archetype preview → save → circle → invite → Thought Drop → full game → points and offers', async ({ page, browser }) => {
  test.setTimeout(400_000);
  const w = watchErrors(page);

  // Account-free archetype.
  await page.goto('/');
  await skipIntro(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover your kind of person');
  await page.getByRole('link', { name: 'Find your archetype — no account' }).first().click();
  await page.waitForURL(/\/personality/);
  await answerAll(page, 'See my archetype');
  await expect(page.getByText('This preview is not saved')).toBeVisible();
  const archetype = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
  expect(archetype).toMatch(/^The /);
  await expect(page.getByRole('heading', { name: 'Why this result' })).toBeVisible();

  // Save → signup → onboarding keeps the answers → identity.
  await page.getByRole('button', { name: 'Save my archetype' }).click();
  await page.waitForURL(/\/signup\?from=personality/);
  await expect(page.getByRole('heading', { name: 'Save your archetype' })).toBeVisible();
  const email = uniqueEmail('social');
  await page.getByLabel('Your name').fill('Kiran');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByText('I am 18 or older.').click();
  await page.getByText('I accept the').click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Save your archetype' })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Save my archetype' }).click();
  await expect(page.getByRole('heading', { name: 'What are you into?' })).toBeVisible();
  await page.getByRole('button', { name: /Skip — choose later/ }).click();
  await page.waitForURL(/\/identity/);
  await expect(page.getByRole('heading', { name: archetype })).toBeVisible();
  const me = (await api(page, 'GET', 'auth/me')).user;
  expect(me.hasBirthProfile).toBe(false);
  expect(me.hasAssessment).toBe(true);
  // Paid card styles are clearly labelled and locked.
  await expect(page.getByRole('list', { name: 'Card styles' }).getByRole('button', { name: /Eclipse Ink/ })).toBeDisabled();
  await verifyEmail(page, email);

  // Create a circle and an invite link.
  await page.goto('/circles');
  await page.getByRole('button', { name: 'New circle' }).click();
  await page.getByLabel('Circle name').fill('Hostel 4B');
  await page.getByRole('button', { name: 'Create circle' }).click();
  await page.waitForURL(/\/circles\/[0-9a-f-]+/);
  const circleUrl = page.url().replace(/\?.*$/, '');
  await page.getByRole('tab', { name: /Members/ }).click();
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const link = await page.getByLabel('Invite link').inputValue();
  expect(link).toMatch(/\/c\/join\/[A-Za-z0-9_-]{20,}$/);

  // A friend joins with the link.
  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await quickUser(friend, 'Ravi');
  await friend.goto(new URL(link).pathname);
  await expect(friend.getByRole('heading', { name: 'Hostel 4B' })).toBeVisible();
  await friend.getByRole('button', { name: 'Join Hostel 4B' }).click();
  await friend.waitForURL(/\/circles\/[0-9a-f-]+$/);

  // Thought Drop inside the circle.
  await friend.getByPlaceholder('Something on your mind.').fill('Who is up for chai at 6?');
  await friend.getByRole('button', { name: 'Preview' }).click();
  await expect(friend.getByLabel('Preview').getByText('not posted yet', { exact: false })).toBeVisible();
  await friend.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(friend.getByText('Who is up for chai at 6?')).toBeVisible();
  await page.goto(circleUrl);
  await expect(page.getByText('Who is up for chai at 6?')).toBeVisible();

  // A full two-player game.
  await page.getByRole('tab', { name: 'Play' }).click();
  await page.getByRole('button', { name: /This or That — Circle Edition/ }).click();
  await page.getByRole('button', { name: 'Open lobby' }).click();
  await page.waitForURL(/\/play\/[0-9a-f-]+$/);
  await friend.goto(new URL(page.url()).pathname);
  await friend.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText('Ravi')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Start game' }).click();
  for (let round = 1; round <= 6; round++) {
    for (const p of [page, friend]) {
      await expect(p.getByText(`Round ${round} of 6`)).toBeVisible({ timeout: 20_000 });
      await p.getByRole('radio').first().click();
      await p.getByRole('button', { name: 'Lock in' }).click();
    }
  }
  await expect(page.getByRole('heading', { name: /Circle twins: / })).toBeVisible({ timeout: 20_000 });
  await expect(friend.getByRole('heading', { name: /Circle twins: / })).toBeVisible({ timeout: 20_000 });

  // Points come from real actions (assessment + game), and the offer page is transparent.
  const journey = await api(page, 'GET', 'journey');
  expect(journey.xp).toBeGreaterThanOrEqual(70);
  expect(journey.history.map((h: { rule: string }) => h.rule)).toEqual(expect.arrayContaining(['assessment_completed', 'game_completed']));
  await page.goto('/shop/p/cosmetic-card-styles');
  await expect(page.getByText('₹29').first()).toBeVisible();
  await expect(page.getByText(/Cosmetic only/)).toBeVisible();
  await w.assertClean();
  await friendCtx.close();
});

test('social pages have no horizontal overflow on a 360 px phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  await quickUser(page, 'Narrow');
  for (const path of ['/home', '/identity', '/thoughts', '/circles', '/play', '/invite', '/personality']) {
    await page.goto(path);
    await page.getByRole('heading').first().waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});
