/**
 * Scene 04 footage: the real Nakshatra assessment, recorded frame by frame from the running app.
 *
 *   node film/video-09/scripts/capture-app.mjs [appUrl]      (default http://127.0.0.1:4410, the e2e server)
 *
 * Nothing here draws UI. The script drives the product's own /personality page in a phone-sized viewport and
 * photographs it. Time inside the page is stepped by hand (requestAnimationFrame, performance.now and every
 * CSS animation), so each film frame is exact and the 8.4 s reveal can be played at 4x without dropped frames.
 * Writes film/video-09/footage/app-0000.jpg … and meta.json (frame count, tap positions for the film's tap ring).
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.argv[2] ?? 'http://127.0.0.1:4410';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../footage');
const VIEW = { width: 400, height: 780 };
const FPS = 30;
// An example answer sheet. Scored by the product (personality-v2), not by this script.
const ANSWERS = { q1: 1, q2: 4, q3: 4, q4: 4, q5: 5, q6: 5, q7: 2, q8: 2, q9: 3, q10: 1, q11: 2, q12: 4, q13: 3, q14: 4, q15: 5, q16: 5, q17: 3, q18: 3, q19: 3, q20: 2 };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  try { localStorage.setItem('nk_graphics', 'ultra'); } catch { /* ignore */ }
  let now = 0;
  let id = 0;
  const cbs = new Map();
  const epoch = Date.now();
  performance.now = () => 5000 + now;
  Date.now = () => epoch + now;
  window.requestAnimationFrame = (cb) => { cbs.set(++id, cb); return id; };
  window.cancelAnimationFrame = (i) => { cbs.delete(i); };
  const tracked = new Map();
  const adopt = () => { for (const a of document.getAnimations()) if (!tracked.has(a)) { a.pause(); tracked.set(a, 0); try { a.currentTime = 0; } catch { /* finished */ } } };
  setInterval(adopt, 2);
  window.__step = (dt) => {
    now += dt;
    const run = [...cbs.values()];
    cbs.clear();
    for (const cb of run) { try { cb(5000 + now); } catch (e) { console.error(e); } }
    adopt();
    for (const [a, t] of tracked) { if (a.playState === 'idle') { tracked.delete(a); continue; } tracked.set(a, t + dt); try { a.currentTime = t + dt; } catch { tracked.delete(a); } }
  };
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto(`${APP}/personality`, { waitUntil: 'networkidle' });
await page.waitForSelector('[role=radiogroup]');
await page.evaluate(() => document.fonts.ready);

const real = (ms) => new Promise((r) => setTimeout(r, ms));
let frame = 0;
const taps = [];
const step = async (ms, sub = 1) => { for (let i = 0; i < sub; i++) { await page.evaluate((d) => window.__step(d), ms / sub); await real(12); } };
const shoot = async () => { await page.screenshot({ path: `${OUT}/app-${String(frame).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 90 }); frame++; };
/** Advance the page by one film frame (or `speed` frames' worth of app time) and photograph it. */
const tick = async (n = 1, speed = 1) => { for (let i = 0; i < n; i++) { await step((1000 / FPS) * speed, Math.ceil(speed)); await shoot(); } };
const scrollTo = (y) => page.evaluate((v) => window.scrollTo(0, v), y);
const scrollY = () => page.evaluate(() => window.scrollY);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const glide = async (to, n) => { const from = await scrollY(); for (let i = 1; i <= n; i++) { await scrollTo(from + (to - from) * ease(i / n)); await tick(); } };
const topOf = (sel, nth = 0) => page.evaluate(([s, n]) => document.querySelectorAll(s)[n].getBoundingClientRect().top + window.scrollY, [sel, nth]);
/** Tap a real control: record where it is on screen for the film's tap ring, then click it. */
const tap = async (locator) => {
  const box = await locator.boundingBox();
  taps.push({ t: frame / FPS, x: (box.x + box.width / 2) / VIEW.width, y: (box.y + box.height / 2) / VIEW.height });
  await locator.evaluate((el) => el.click());
  await real(60);
};
const option = (qIndexOnPage, value) => page.getByRole('radiogroup').nth(qIndexOnPage).locator('label').nth(value - 1);
const answerQuietly = async (qIndexOnPage, value) => { await option(qIndexOnPage, value).locator('input').evaluate((el) => el.click()); await real(30); };

// A. The five dimensions, then down to the statements.
const introY = Math.max(0, (await topOf('svg[viewBox]', 0).catch(() => 0)) - 150);
await scrollTo(Math.max(0, (await topOf('h1')) - 90));
await step(2000, 40);
await tick(12);
const cardY = (await topOf('#assessment')) - 78;
void introY;
await glide(cardY, 16);
await tick(3);
// B. First statements answered.
await tap(option(0, ANSWERS.q1)); await tick(13);
await tap(option(1, ANSWERS.q2)); await tick(11);
await tap(option(2, ANSWERS.q3)); await tick(11);
// C. Cut to the last page with one statement to go.
for (const i of [3, 4]) await answerQuietly(i, ANSWERS[`q${i + 1}`]);
for (let p = 1; p < 4; p++) {
  await page.getByRole('button', { name: 'Next' }).evaluate((el) => el.click());
  await real(120);
  for (let i = 0; i < 5; i++) { const q = p * 5 + i + 1; if (q < 20) await answerQuietly(i, ANSWERS[`q${q}`]); }
}
await step(1200, 24);
const lastY = (await page.getByRole('radiogroup').nth(4).evaluate((el) => el.getBoundingClientRect().top + window.scrollY)) - 470;
await scrollTo(lastY);
await step(100, 2);
await tick(5);
await tap(option(4, ANSWERS.q20)); await tick(11);
const reveal = page.waitForSelector('[data-testid=reveal-theatre]', { timeout: 30000 });
await tap(page.getByRole('button', { name: 'See my archetype' }));
await tick(4);
await reveal;
await real(1200); // scene modules load in real time; page time is still stopped
const exampleFrom = frame / FPS;
// D. The product's own seven-chapter reveal, at 4x.
await scrollTo((await topOf('[data-testid=reveal-theatre]')) - 96);
await step(0);
await tick(64, 4);
// E. Down to the name, signature and traits.
const nameY = (await topOf('#persona-name')) - 500;
await glide(nameY, 14);
await tick(180 - frame > 0 ? 180 - frame : 0);

const result = await page.evaluate(() => ({ name: document.getElementById('persona-name')?.textContent, stage: document.querySelector('[data-testid=reveal-theatre]')?.getAttribute('data-reveal-stage'), quality: document.querySelector('[data-scene-quality]')?.getAttribute('data-scene-quality') }));
writeFileSync(`${OUT}/meta.json`, JSON.stringify({ frames: frame, fps: FPS, taps, exampleFrom, result }, null, 2));
console.log(`captured ${frame} frames`, JSON.stringify(result), 'taps', taps.map((t) => t.t.toFixed(2)).join(','));
await browser.close();
