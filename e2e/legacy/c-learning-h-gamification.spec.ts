import { expect, test } from '@playwright/test';
import { DAILY_LESSONS } from '../../src/content/daily';
import { api, quickUser, watchErrors } from '../helpers';

test('Journey C + H: enroll → complete lesson → pass quiz → achievement → XP awarded once → progress persists', async ({ page }) => {
  const w = watchErrors(page);
  await quickUser(page, 'Kavya');

  // Browse and enroll
  await page.goto('/learn');
  await page.getByRole('link', { name: /Foundations of Astrology/ }).first().click();
  await page.waitForURL(/\/learn\/foundations-of-astrology-sample/);
  await page.getByRole('button', { name: 'Enroll for free' }).click();
  await page.getByRole('link', { name: 'Start' }).click();
  await page.waitForURL(/\/learn\/lesson\//);
  const lessonUrl = page.url();
  const lessonId = lessonUrl.split('/').pop()!;

  // Complete the lesson
  // Wait for the lesson view itself; right after navigation the course page heading can still be on screen.
  await expect(page.getByRole('button', { name: 'Mark lesson complete' })).toBeVisible();
  const title = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();

  // Pass the quiz using the authored answer key for this lesson
  const lesson = DAILY_LESSONS.find((l) => l.title === title);
  expect(lesson?.quiz, `seeded lesson "${title}" should have a quiz`).toBeTruthy();
  const quiz = lesson!.quiz!;
  await page.getByRole('group', { name: new RegExp(quiz.question.replace(/[?]/g, '\\?')) }).getByLabel(quiz.options[quiz.answer]).check();
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByText(/You scored 100% — passed!/)).toBeVisible();

  // Achievement unlocked and XP history shows each award once
  await page.goto('/journey/rewards');
  const first = page.getByRole('button', { name: /First Lesson/ });
  await expect(first).toContainText('Earned');
  await page.getByRole('tab', { name: 'XP history' }).click();
  const history = page.getByRole('listitem').filter({ hasText: 'Completed a lesson' });
  await expect(history).toHaveCount(1);
  await expect(page.getByRole('listitem').filter({ hasText: 'Passed a quiz' })).toHaveCount(1);

  // Repeating the same action must not award again (idempotent ledger)
  await api(page, 'POST', `lessons/${lessonId}/complete`).catch(() => undefined);
  await page.reload();
  await page.getByRole('tab', { name: 'XP history' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Completed a lesson' })).toHaveCount(1);
  const rewards = await api(page, 'GET', 'journey');
  expect(rewards.achievements.filter((a: { key: string; awardedAt: string | null }) => a.key === 'first_lesson' && a.awardedAt)).toHaveLength(1);

  // Progress persists across reloads
  await page.goto('/learn/foundations-of-astrology-sample');
  await expect(page.getByText(/^1\/\d+ lessons$/)).toBeVisible();
  await page.goto(lessonUrl);
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  await w.assertClean();
});
