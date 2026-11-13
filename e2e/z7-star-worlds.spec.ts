import { expect, test } from '@playwright/test';
import { api, quickUser, watchErrors } from './helpers';

test('star worlds: a circle as a world of its members, and discovery as a constellation of opted-in people', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const w = watchErrors(a);
  await quickUser(a, 'Asteria');
  await quickUser(b, 'Borealis');

  // Circle world: the owner finds their own star from the list.
  const { circle } = await api(a, 'POST', 'circles', { name: 'Night Owls', theme: 'jade' });
  await a.goto('/circles/' + circle.id + '?tab=members');
  const world = a.getByLabel('Circle world');
  await expect(world).toBeVisible();
  await expect(world.getByText('of 1 have joined in', { exact: false })).toBeVisible();
  const me = world.getByRole('button', { name: /Asteria/ });
  await me.click();
  await expect(me).toHaveAttribute('aria-pressed', 'true');
  await expect(world.getByRole('status')).toContainText('Owner');
  await a.waitForTimeout(1500);
  await world.screenshot({ path: 'test-results/shot-circle-world.png' });

  // Discovery: only opted-in people appear, and the panel states exactly what is shared.
  await api(a, 'PUT', 'people/settings', { discoverable: true, intents: ['game_partners'] });
  await a.goto('/explore');
  await expect(a.getByLabel('People constellation').getByRole('button', { name: 'Borealis' })).toHaveCount(0);
  await api(b, 'PUT', 'people/settings', { discoverable: true, intents: ['game_partners'] });
  await a.reload();
  const sky = a.getByLabel('People constellation');
  await expect(sky).toBeVisible();
  await sky.getByRole('button', { name: 'Borealis' }).click();
  await expect(sky.getByRole('status')).toContainText('You both said: Game partners.');
  await expect(sky.getByRole('link', { name: /View Borealis/ })).toBeVisible();
  await a.waitForTimeout(1500);
  await sky.screenshot({ path: 'test-results/shot-constellation.png' });

  // Two ways to look: the constellation, the familiar list, or both.
  const view = a.getByRole('radiogroup', { name: 'View' });
  await view.getByRole('radio', { name: 'List' }).click();
  await expect(a.getByLabel('People constellation')).toHaveCount(0);
  await expect(a.getByRole('listitem').filter({ hasText: 'Borealis' })).toBeVisible();
  await view.getByRole('radio', { name: 'Constellation' }).click();
  await expect(a.getByLabel('People constellation')).toBeVisible();
  await expect(a.getByRole('listitem').filter({ hasText: 'Borealis' })).toHaveCount(0);
  await a.reload();
  await expect(a.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Constellation' })).toHaveAttribute('aria-checked', 'true');
  await a.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Both' }).click();

  // A blocked person disappears from the constellation.
  const bId = (await api(b, 'GET', 'auth/me')).user.id;
  await api(a, 'POST', 'blocks/' + bId);
  await a.reload();
  await a.waitForLoadState('networkidle');
  await expect(a.getByRole('button', { name: 'Borealis' })).toHaveCount(0);

  await a.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/circles/' + circle.id + '?tab=members', '/explore']) {
    await a.goto(path);
    await a.waitForLoadState('networkidle');
    expect(await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path + ' overflows at 360px').toBeLessThanOrEqual(1);
  }
  await w.assertClean();
  await ctxA.close();
  await ctxB.close();
});
