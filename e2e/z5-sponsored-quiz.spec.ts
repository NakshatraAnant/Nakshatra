import { expect, test } from '@playwright/test';
import { api, quickUser, seededAccount, signIn, watchErrors } from './helpers';

test('sponsored quiz and challenge: staff build and approve → member plays the disclosed quiz once and joins the challenge, no rewards', async ({ browser }) => {
  const [ca, cm, cu] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const ad = await ca.newPage();
  const mod = await cm.newPage();
  const user = await cu.newPage();
  const w = watchErrors(user);
  const admin = seededAccount('admin');
  await signIn(ad, admin.email, admin.password);
  await api(ad, 'PUT', 'admin/flags/ads', { enabled: true, rolloutPercent: 100 });
  try {
    const { advertiser } = await api(ad, 'POST', 'admin/ads/advertisers', { name: 'Chai Co', website: 'https://example.com', contactEmail: 'ads@example.com' });
    await ad.goto('/admin/ads');
    const form = ad.getByLabel('New campaign');
    await form.getByLabel('Advertiser').selectOption(advertiser.id);
    await form.getByLabel('Campaign name (internal)').fill('Snack trivia');
    await form.getByLabel('Headline').fill('Monsoon snack trivia');
    await form.getByLabel('Link (https)').fill('https://example.com/snacks');
    await form.getByLabel('Shows as').selectOption('quiz');
    await form.getByLabel('Quiz title').fill('Monsoon snacks');
    await form.getByLabel('Question 1 text').fill('Which pairs best with chai?');
    await form.getByLabel('Question 1 answer 1', { exact: true }).fill('Pakoras');
    await form.getByLabel('Question 1 answer 2', { exact: true }).fill('Ice cream');
    await form.getByLabel('Question 2 text').fill('Vada pav is from…');
    await form.getByLabel('Question 2 answer 1', { exact: true }).fill('Mumbai');
    await form.getByLabel('Question 2 answer 2', { exact: true }).fill('Kochi');
    await form.getByRole('button', { name: 'Save draft' }).click();
    const card = ad.getByLabel('Campaign Snack trivia').first();
    await expect(card.getByText('Sponsored quiz', { exact: false })).toBeVisible();
    await card.getByRole('button', { name: 'Submit for review' }).click();

    // A challenge, created through the API.
    const { campaign: quest } = await api(ad, 'POST', 'admin/ads/campaigns', { advertiserId: advertiser.id, name: 'Cook challenge', headline: 'Cook something new', ctaLabel: 'Recipes', destinationUrl: 'https://example.com/recipes', placement: 'quest', content: { title: 'Cook something new', description: 'This week only.', steps: ['Pick a recipe', 'Share a photo drop'] }, startsAt: new Date(Date.now() - 6e4).toISOString(), endsAt: new Date(Date.now() + 7 * 864e5).toISOString() });
    await api(ad, 'POST', `admin/ads/campaigns/${quest.id}/submit`);

    const moderator = seededAccount('moderator');
    await signIn(mod, moderator.email, moderator.password);
    await mod.goto('/admin/ads');
    await mod.getByLabel('Campaign Snack trivia').first().getByRole('button', { name: 'Approve' }).click();
    await expect(mod.getByLabel('Campaign Snack trivia').first().getByText('approved', { exact: true })).toBeVisible();
    await api(mod, 'POST', `admin/ads/campaigns/${quest.id}/review`, { decision: 'approve' });

    await quickUser(user, 'SnackFan');
    await user.goto('/play/quizzes');
    const quiz = user.getByRole('complementary', { name: 'Sponsored quiz: Monsoon snacks' });
    await expect(quiz.getByText('Sponsored · Chai Co')).toBeVisible();
    await quiz.getByRole('radio', { name: 'Pakoras' }).click();
    await quiz.getByRole('radio', { name: 'Kochi' }).click();
    await quiz.getByRole('button', { name: 'Check my answers' }).click();
    await expect(quiz.getByRole('status')).toHaveText('You scored 1 of 2.');
    await expect(quiz.getByText('no points or rewards', { exact: false })).toBeVisible();
    await user.reload();
    await expect(user.getByRole('complementary', { name: 'Sponsored quiz: Monsoon snacks' }).getByText('You scored 1 of 2.')).toBeVisible();

    await user.goto('/progress');
    const challenge = user.getByRole('complementary', { name: 'Sponsored challenge: Cook something new' });
    await challenge.getByRole('button', { name: 'Join the challenge' }).click();
    await challenge.getByRole('button', { name: 'I did it' }).click();
    await expect(challenge.getByText('✓ Done')).toBeVisible();
    await challenge.getByRole('button', { name: 'Hide' }).click();
    await expect(user.getByRole('complementary', { name: 'Sponsored challenge: Cook something new' })).toHaveCount(0);

    await ad.reload();
    await expect(ad.getByText('1 played · average 1', { exact: false })).toBeVisible();
    await w.assertClean();
  } finally {
    await api(ad, 'PUT', 'admin/flags/ads', { enabled: false, rolloutPercent: 100 }).catch(() => undefined);
    await Promise.all([ca.close(), cm.close(), cu.close()]);
  }
});
