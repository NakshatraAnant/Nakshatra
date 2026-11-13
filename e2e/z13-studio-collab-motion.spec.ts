import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

async function takeAssessment(page: import('@playwright/test').Page) {
  const { questions } = await api(page, 'GET', 'personality/questions');
  await api(page, 'POST', 'personality/assessment', { answers: Object.fromEntries((questions as { id: string }[]).map((q, i) => [q.id, [5, 2, 4, 1, 5, 3, 4, 2, 5, 1][i % 10]])) });
}

test('universe studio: preview first, save persists, reset returns to defaults; visitors see it on the profile', async ({ page, browser }) => {
  const w = watchErrors(page);
  const { handle } = await quickUser(page, 'Worldmaker');
  await takeAssessment(page);
  await page.goto('/theme');
  const studio = page.getByLabel('Universe Studio');
  await expect(page.getByTestId('universe-status')).toHaveText('Saved.');
  await studio.getByRole('radiogroup', { name: 'Environment' }).getByRole('radio', { name: 'Aurora' }).click();
  await studio.getByRole('radiogroup', { name: 'In the sky' }).getByRole('radio', { name: 'Ringed planet' }).click();
  // Preview only: nothing is stored yet.
  await expect(page.getByTestId('universe-status')).toHaveText('Previewing — not saved yet.');
  expect((await api(page, 'GET', 'auth/me')).user.profile.appearance.world ?? null).not.toMatchObject({ backdrop: 'aurora' });
  await page.waitForTimeout(1200);
  await studio.screenshot({ path: 'test-results/shot-universe-studio.png' });
  await studio.getByRole('button', { name: 'Save universe' }).click();
  await expect(page.getByTestId('universe-status')).toHaveText('Saved.');
  expect((await api(page, 'GET', 'auth/me')).user.profile.appearance.world).toMatchObject({ backdrop: 'aurora', celestial: 'ringed' });
  await page.reload();
  await expect(page.getByLabel('Universe Studio').getByRole('radio', { name: 'Aurora' })).toHaveAttribute('aria-checked', 'true');

  // Their universe travels with their public identity world; an unknown key is refused by the server.
  await api(page, 'PATCH', 'profile', { visibility: 'public' });
  const ctx = await browser.newContext();
  const visitor = await ctx.newPage();
  await quickUser(visitor, 'Stargazer');
  expect((await api(visitor, 'GET', 'identity/u/' + handle)).universe).toMatchObject({ backdrop: 'aurora', celestial: 'ringed' });
  await ctx.close();
  const bad = await page.request.patch('/api/v1/profile', { data: { appearance: { accent: 'ember', textSize: 'standard', corners: 'soft', world: { backdrop: 'hacked', lighting: 'warm', celestial: 'none', decoration: 'none', particles: 'archetype' } } }, headers: { 'x-csrf-token': (await page.context().cookies()).find((c) => c.name === 'nk_csrf')?.value ?? '' } });
  expect(bad.status()).toBe(400);

  await page.getByLabel('Universe Studio').getByRole('button', { name: 'Reset to defaults' }).click();
  await page.getByLabel('Universe Studio').getByRole('button', { name: 'Save universe' }).click();
  await expect(page.getByTestId('universe-status')).toHaveText('Saved.');
  expect((await api(page, 'GET', 'auth/me')).user.profile.appearance.world).toMatchObject({ backdrop: 'nebula', celestial: 'none' });
  await w.assertClean();
});

test('assessment atmosphere follows real progress and survives a resume', async ({ page }) => {
  const w = watchErrors(page);
  await page.addInitScript(() => { try { localStorage.setItem('nk_intro_seen', '1'); } catch { /* ignore */ } });
  await page.goto('/personality');
  const sky = page.getByTestId('assessment-atmosphere');
  await expect(sky).toHaveAttribute('data-progress', '0');
  await expect(sky.locator('[data-dimension="energy"]')).toHaveAttribute('data-glow', '0.00');
  // The first statement belongs to "energy": one of its four is now answered.
  await page.locator('#assessment fieldset').first().getByRole('radio').nth(4).check({ force: true });
  await expect(sky).toHaveAttribute('data-progress', '1');
  await expect(sky.locator('[data-dimension="energy"]')).toHaveAttribute('data-glow', '0.25');
  await expect(sky.locator('[data-dimension="voice"]')).toHaveAttribute('data-glow', '0.00');
  await page.reload();
  await expect(page.getByText('Picked up where you left off.')).toBeVisible();
  await expect(page.getByTestId('assessment-atmosphere')).toHaveAttribute('data-progress', '1');
  await expect(page.getByTestId('assessment-atmosphere').locator('[data-dimension="energy"]')).toHaveAttribute('data-glow', '0.25');
  await w.assertClean();
});

test('collaborative drop: start, invite, accept, write a line, publish once; circle environment is chosen by admins only', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const w = watchErrors(a);
  await quickUser(a, 'Opener');
  const friend = await quickUser(b, 'Closer');
  await api(b, 'PATCH', 'profile', { visibility: 'public' });
  await api(a, 'POST', 'follows/' + friend.userId);

  await a.goto('/create/together');
  await a.getByLabel('Your opening').fill('Best small joy this week?');
  await a.getByRole('button', { name: 'Start and invite people' }).click();
  await a.waitForURL(/\/create\/together\/[0-9a-f-]{36}$/);
  const url = new URL(a.url()).pathname;
  await a.getByLabel('Invite someone you’re connected with').selectOption({ label: `Closer (@${friend.handle})` });
  await a.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(a.getByLabel('Collaborators').getByText('Invited — not answered yet')).toBeVisible();
  await expect(a.getByRole('button', { name: 'Publish' })).toBeDisabled();

  await b.goto(url);
  await b.getByRole('button', { name: 'Accept' }).click();
  await b.getByRole('textbox', { name: /Your line/ }).fill('Chai on the terrace.');
  await b.getByRole('button', { name: 'Save my line' }).click();
  await expect(b.getByLabel('The drop so far')).toContainText('Chai on the terrace.');
  await expect(b.getByRole('button', { name: 'Publish' })).toHaveCount(0);

  await a.reload();
  await expect(a.getByLabel('The drop so far')).toContainText('— with Closer');
  await a.getByRole('button', { name: 'Publish' }).click();
  await a.waitForURL(/\/thoughts\/[0-9a-f-]{36}$/);
  await expect(a.getByText('Chai on the terrace.', { exact: false }).first()).toBeVisible();
  // The collaborator sees it published, and it cannot be published again.
  await b.reload();
  await expect(b.getByText('This drop is live.')).toBeVisible();
  const again = await a.request.post('/api/v1' + url.replace('/create/together', '/collabs') + '/publish', { headers: { 'x-csrf-token': (await ctxA.cookies()).find((c) => c.name === 'nk_csrf')?.value ?? '' } });
  expect(again.status()).toBe(409);

  // Circle environment: saved by the admin, shown to members, refused from a non-admin member.
  const { circle } = await api(a, 'POST', 'circles', { name: 'Garden club' });
  await a.goto('/circles/' + circle.id + '?tab=members');
  await expect(a.locator('[data-environment]')).toHaveAttribute('data-environment', 'observatory');
  await api(a, 'PATCH', 'circles/' + circle.id, { environment: 'garden' });
  await a.reload();
  await expect(a.locator('[data-environment]')).toHaveAttribute('data-environment', 'garden');
  await expect(a.getByLabel('Circle world').getByText('Celestial Garden', { exact: false })).toBeVisible();
  await a.waitForTimeout(1200);
  await a.getByLabel('Circle world').screenshot({ path: 'test-results/shot-circle-garden.png' });
  const outsider = await b.request.patch('/api/v1/circles/' + circle.id, { data: { environment: 'studio' }, headers: { 'x-csrf-token': (await ctxB.cookies()).find((c) => c.name === 'nk_csrf')?.value ?? '' } });
  expect([403, 404]).toContain(outsider.status());
  await w.assertClean();
  await Promise.all([ctxA.close(), ctxB.close()]);
});

test('reduced motion: scenes arrive finished, nothing plays itself, and every control still works', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const w = watchErrors(page);
  expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  // No film by itself on a first visit.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('cinematic-intro')).toHaveCount(0);

  await quickUser(page, 'Calm');
  await takeAssessment(page);
  await api(page, 'POST', 'posts', { kind: 'thought', body: 'A calm drop', visibility: 'public' });

  // The reveal is not replayed chapter by chapter: scenes draw on demand rather than continuously.
  await page.goto('/identity');
  const theatre = page.getByTestId('reveal-theatre');
  await expect(theatre).toBeVisible();
  await expect(theatre.locator('[data-scene-level]').first()).toBeVisible();
  // The year film waits on each moment: no Pause control because nothing advances by itself.
  await page.goto('/year');
  await page.getByLabel('Year film').getByRole('button', { name: 'Play' }).click();
  const film = page.getByRole('region', { name: 'Year film' });
  await expect(film.locator('[data-film-beat]')).toHaveAttribute('data-film-beat', '0');
  await expect(film.getByRole('button', { name: 'Pause' })).toHaveCount(0);
  await page.waitForTimeout(4200);
  await expect(film.locator('[data-film-beat]')).toHaveAttribute('data-film-beat', '0');
  await film.getByRole('button', { name: 'Next moment' }).click();
  await expect(film.locator('[data-film-beat]')).toHaveAttribute('data-film-beat', '1');
  // CSS motion is off: the reaction burst never shows, the reaction still registers.
  await page.goto('/thoughts');
  const love = page.getByRole('article').filter({ hasText: 'A calm drop' }).first().getByRole('button', { name: /^Love/ });
  await love.click();
  await expect(love).toHaveAttribute('aria-pressed', 'true');
  expect(await love.locator('.react-burst').evaluate((el) => getComputedStyle(el).display)).toBe('none');
  await w.assertClean();
  await ctx.close();
});
