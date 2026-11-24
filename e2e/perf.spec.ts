import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { api, quickUser } from './helpers';

/**
 * 3D frame-time measurement (run with E2E_PERF=1 npx playwright test). Not part of the normal suite: it needs full
 * motion and a GPU, and its numbers describe the machine it runs on. For each page with a scene it records the
 * GPU renderer, frames over four seconds of continuous animation, the slowest frames, and the bytes the page
 * downloaded. Results go to test-results/perf.json.
 */
const PAGES: [string, string][] = [
  ['/identity', 'Reveal theatre + dimension explorer'],
  ['/home', 'Home identity world'],
  ['/progress', 'Season path + achievement gallery'],
  ['/play', 'Game hub'],
  ['/year', 'Year film (closed)'],
];

test('3D scenes: frame times and download size on this machine', async ({ page }) => {
  test.setTimeout(300_000);
  const { handle } = await quickUser(page, 'Perfwatch');
  const { questions } = await api(page, 'GET', 'personality/questions');
  await api(page, 'POST', 'personality/assessment', { answers: Object.fromEntries((questions as { id: string }[]).map((q, i) => [q.id, [5, 2, 4, 1, 5, 3, 4, 2, 5, 1][i % 10]])) });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return 'no WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });
  const rows: Record<string, unknown>[] = [];
  for (const [path, what] of [...PAGES, ['/u/' + handle, 'Profile world'] as [string, string]]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const canvases = await page.locator('canvas').count();
    const r = await page.evaluate(async () => {
      const deltas: number[] = [];
      let last = performance.now();
      await new Promise<void>((done) => {
        const end = last + 4000;
        const tick = (t: number) => { deltas.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else done(); };
        requestAnimationFrame(tick);
      });
      const sorted = [...deltas].sort((a, b) => a - b);
      const bytes = performance.getEntriesByType('resource').reduce((n, e) => n + ((e as PerformanceResourceTiming).transferSize || 0), 0);
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return {
        fps: Math.round((deltas.length / 4) * 10) / 10,
        medianMs: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
        p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
        worstMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
        kb: Math.round(((nav?.transferSize ?? 0) + bytes) / 1024),
      };
    });
    rows.push({ path: path.startsWith('/u/') ? '/u/:handle' : path, what, canvases, ...r });
  }
  writeFileSync('test-results/perf.json', JSON.stringify({ measuredAt: new Date().toISOString(), renderer, viewport: '1366x900', rows }, null, 2));
  console.info(JSON.stringify({ renderer, rows }, null, 2));
  expect(rows.length).toBe(PAGES.length + 1);
});

/**
 * Phone-class emulation: a phone-sized screen at phone pixel density, with the CPU slowed 4× through the DevTools
 * protocol. It is an approximation of a mid-range phone, not a measurement on one. Results: test-results/perf-phone.json.
 * Each page gets a fresh tab (as a person arriving at it would), and a page that stops producing frames within 20 s
 * is recorded as a stall instead of hanging the run.
 */
test('3D scenes: frame times under phone-class emulation (4× slower CPU, 412×915 at 2.6×)', async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  const setup = await ctx.newPage();
  await quickUser(setup, 'Phonewatch');
  const { questions } = await api(setup, 'GET', 'personality/questions');
  await api(setup, 'POST', 'personality/assessment', { answers: Object.fromEntries((questions as { id: string }[]).map((q, i) => [q.id, [5, 2, 4, 1, 5, 3, 4, 2, 5, 1][i % 10]])) });
  await setup.close();
  const rows: Record<string, unknown>[] = [];
  for (const [path, what] of PAGES) {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const sceneQuality = await page.locator('[data-scene-quality]').first().getAttribute('data-scene-quality', { timeout: 1500 }).catch(() => null);
    const measured = page.evaluate(async () => {
      const deltas: number[] = [];
      let last = performance.now();
      await new Promise<void>((done) => {
        const end = last + 4000;
        const tick = (t: number) => { deltas.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else done(); };
        requestAnimationFrame(tick);
      });
      const sorted = [...deltas].sort((a, b) => a - b);
      return { fps: Math.round((deltas.length / 4) * 10) / 10, medianMs: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10, p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10, worstMs: Math.round(sorted[sorted.length - 1] * 10) / 10 };
    });
    const r = await Promise.race([measured, new Promise<{ stalled: true }>((res) => setTimeout(() => res({ stalled: true }), 20_000))]);
    rows.push({ path, what, sceneQuality, ...r });
    await page.close().catch(() => undefined);
    console.info(`phone ${path} done at ${new Date().toISOString()}`);
    // Saved after every page, so a slow machine still leaves the pages it finished.
    writeFileSync('test-results/perf-phone.json', JSON.stringify({ measuredAt: new Date().toISOString(), emulation: '4x CPU slowdown, 412x915 @2.6x, touch', rows }, null, 2));
  }
  console.info(JSON.stringify(rows, null, 2));
  expect(rows.length).toBe(PAGES.length);
  await ctx.close();
});
