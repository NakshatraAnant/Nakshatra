/**
 * The shoot. Signs in to the LOCAL app as the film's lead member and records:
 *
 *   plates/   the product's own 3D scenes, full frame, frame by frame on a virtual clock (30 fps)
 *   screens/  the seven product screens of the reveal, as short real recordings at phone size (780×1688, 30 fps)
 *   stills/   one real Thought Drop card and the cast's real avatars (as the product draws them)
 *
 * Nothing is mocked: every pixel comes from the running application. For a plate, the scene's own container is
 * enlarged to fill the frame and the rest of the page is hidden — that is the only change made to the page.
 *
 * Usage: node film/launch/scripts/capture.mjs [plates|screens|stills] [name…]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP, ROOT, SHOOT, launchBrowser, sleep } from './lib.mjs';

const acc = JSON.parse(readFileSync(resolve(SHOOT, 'accounts.json'), 'utf8'));
const [, , only, ...names] = process.argv;
const want = (group, name) => (!only || only === group) && (!names.length || names.includes(name));
const FPS = 30;
const dir = (...p) => { const d = resolve(SHOOT, ...p); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); return d; };
const pad = (n) => String(n).padStart(4, '0');

const browser = await launchBrowser();

/* One real sign-in; every page after it reuses the session. */
const login = await browser.newContext({ colorScheme: 'dark' });
{
  const page = await login.newPage();
  await page.goto(`${APP}/signin`);
  await page.getByLabel('Email').fill(acc.cast.lead.email);
  await page.getByLabel('Password').fill(acc.cast.lead.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(home|today|onboarding)/);
  await page.close();
}
const storageState = await login.storageState();
await login.close();

async function open(viewport, deviceScaleFactor, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, colorScheme: 'dark', storageState, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript({ path: resolve(ROOT, 'scripts/clock.js') });
  // Ultra is the product's own top graphics level (Theme Studio → 3D graphics); the intro has its own shot.
  await ctx.addInitScript(() => { try { localStorage.setItem('nk_intro_seen', '1'); localStorage.setItem('nk_graphics', 'ultra'); } catch { /* storage unavailable */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  return { ctx, page };
}
const step = (page, ms) => page.evaluate((m) => window.__clock.step(m), ms);

/* ------------------------------------------------------------------ plates */

const STAGE_CSS = `
  html, body { background: #000 !important; }
  body * { visibility: hidden !important; }
  [data-film-stage], [data-film-stage] * { visibility: visible !important; }
  [data-film-anc] { transform: none !important; filter: none !important; contain: none !important; overflow: visible !important; backdrop-filter: none !important; perspective: none !important; clip-path: none !important; opacity: 1 !important; }
  [data-film-stage] { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 2147483000 !important; background: #000 !important; border: 0 !important; border-radius: 0 !important; max-width: none !important; max-height: none !important; margin: 0 !important; aspect-ratio: auto !important; }
  [data-film-hide] { display: none !important; }
`;

/**
 * prepare(page)  optional clicks to reach the scene (runs on the live page, before the clock is frozen)
 * stage          selector of the element that fills the frame
 * early          freeze the clock as soon as the page exists, so an entrance animation is recorded from its start
 * hide           selectors inside the stage to leave out (buttons that sit over a scene)
 */
const PLATES = {
  identity: { url: '/identity', stage: '[data-testid="reveal-theatre"]', early: true, seconds: 9.2, hide: [] },
  avatar: { url: '/avatar', stage: '[aria-roledescription="3D scene"]', seconds: 4 },
  arena: { url: `/play/tournaments/${acc.tournamentId}`, stage: '[aria-roledescription="3D scene"]', early: true, seconds: 4 },
  season: { url: '/progress', stage: '[aria-roledescription="3D scene"][aria-label*="milestones"]', early: true, seconds: 4, size: [600, 400] },
  gallery: { url: '/progress', stage: '[aria-roledescription="3D scene"][aria-label*="medallions"]', seconds: 4 },
  hub: { url: '/play', stage: '[aria-roledescription="3D scene"]', seconds: 4, size: [540, 540] },
  people: { url: '/explore', stage: '[aria-roledescription="3D scene"]', seconds: 4, early: true, size: [540, 540] },
  circle: { url: `/circles/${acc.circleId}`, stage: '[aria-roledescription="3D scene"]', seconds: 4, early: true, prepare: async (page) => { await page.getByRole('tab', { name: /Members/ }).or(page.getByRole('button', { name: /Members/ })).first().click(); } },
};

async function shootPlate(name, spec) {
  const out = dir('plates', name);
  // Each scene is framed the way it was composed: tall for a figure, square or wide for a ring or a path.
  const [vw, vh] = spec.size ?? [540, 675];
  const { ctx, page } = await open({ width: vw, height: vh }, 2, false);
  await page.goto(APP + spec.url, { waitUntil: 'domcontentloaded' });
  if (spec.early && !spec.prepare) await page.evaluate(() => window.__clock.freeze());
  if (spec.prepare) { await page.waitForLoadState('networkidle'); await spec.prepare(page); if (spec.early) await page.evaluate(() => window.__clock.freeze()); }
  // With the clock held, frames still have to be pumped for the app to mount; they advance no time.
  const pump = async (ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await page.evaluate(() => window.__clock.frozen)) await step(page, 0); await sleep(60); } };
  const stage = page.locator(spec.stage).first();
  for (let i = 0; i < 80 && !(await stage.count()); i++) { await pump(250); if (i % 8 === 7) await page.evaluate(() => window.scrollBy(0, 400)); }
  if (!(await stage.count())) { console.log(`✗ ${name}: scene not found at ${spec.url}`); await ctx.close(); return; }
  await stage.evaluate((el, hide) => {
    el.setAttribute('data-film-stage', '');
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) p.setAttribute('data-film-anc', '');
    for (const sel of hide) el.querySelectorAll(sel).forEach((h) => h.setAttribute('data-film-hide', ''));
  }, spec.hide ?? []);
  await page.addStyleTag({ content: STAGE_CSS });
  // If an ancestor still anchors fixed positioning (a container query, a will-change), cancel its offset exactly.
  await stage.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (Math.abs(r.x) > 0.5 || Math.abs(r.y) > 0.5) el.style.setProperty('translate', `${-r.x}px ${-r.y}px`, 'important');
  });
  await page.waitForSelector(`${spec.stage} canvas`, { timeout: 20000 }).catch(() => undefined);
  await pump(1500);
  await page.evaluate(() => window.__clock.freeze());
  await step(page, 0);
  const frames = Math.round(spec.seconds * FPS);
  const label = await stage.getAttribute('aria-label').catch(() => null);
  for (let f = 0; f < frames; f++) {
    await page.screenshot({ path: resolve(out, `${pad(f)}.png`) });
    await step(page, 1000 / FPS);
  }
  writeFileSync(resolve(out, 'meta.json'), JSON.stringify({ name, url: spec.url, frames, fps: FPS, width: vw * 2, height: vh * 2, label }, null, 2));
  console.log(`✓ plate ${name}: ${frames} frames`);
  await ctx.close();
}

/* ----------------------------------------------------------------- screens */

/** from/to are scroll positions: a number, or a function run in the page that returns one. */
const top = (sel, offset) => `(() => { const el = ${sel}; return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - ${offset}) : 0; })()`;
const byText = (tag, text) => `[...document.querySelectorAll('${tag}')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))`;
const SCREENS = {
  home: { label: 'Home', url: '/home', from: '0', to: '260' },
  identity: { label: 'Identity Studio', url: '/identity', from: '0', to: '70', prepare: async (page) => { await page.getByRole('button', { name: 'Skip' }).click({ timeout: 4000 }).catch(() => undefined); } },
  archetype: { label: 'Your archetype', url: '/identity', from: top(`document.querySelector('[data-testid="reveal-theatre"]')`, 120), to: top(`document.querySelector('[data-testid="reveal-theatre"]')`, -210), prepare: async (page) => { await page.getByRole('button', { name: 'Skip' }).click({ timeout: 4000 }).catch(() => undefined); } },
  discover: { label: 'Discover', url: '/explore', from: '0', to: top(byText('h2', 'People'), 110) },
  circles: { label: 'Circles', url: '/circles', from: '0', to: '170' },
  thoughts: { label: 'Thought Drops', url: '/thoughts', from: top(byText('button', 'For you'), 150), to: top(byText('button', 'For you'), -150) },
  play: { label: 'Play', url: '/play', from: '0', to: '240' },
};
const SCREEN_SECONDS = 1.4;

async function shootScreen(name, spec) {
  const out = dir('screens', name);
  const { ctx, page } = await open({ width: 390, height: 844 }, 2, true);
  await page.goto(APP + spec.url);
  await page.waitForLoadState('networkidle');
  await sleep(1500);
  if (spec.prepare) await spec.prepare(page);
  // Let lazily mounted sections exist before measuring scroll targets.
  await page.evaluate(async () => { for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 4000); y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); } window.scrollTo(0, 0); });
  await sleep(1200);
  const from = await page.evaluate(spec.from), to = await page.evaluate(spec.to);
  await page.evaluate((y) => window.scrollTo(0, y), from);
  await sleep(1200);
  await page.evaluate(() => window.__clock.freeze());
  const frames = Math.round(SCREEN_SECONDS * FPS);
  for (let f = 0; f < frames; f++) {
    const k = f / (frames - 1), e = k * k * (3 - 2 * k);
    await page.evaluate((y) => window.scrollTo(0, y), from + (to - from) * e);
    await step(page, 1000 / FPS);
    await page.screenshot({ path: resolve(out, `${pad(f)}.png`) });
  }
  writeFileSync(resolve(out, 'meta.json'), JSON.stringify({ name, label: spec.label, url: spec.url, frames, fps: FPS, width: 780, height: 1688 }, null, 2));
  console.log(`✓ screen ${name}: ${frames} frames (scroll ${Math.round(from)} → ${Math.round(to)})`);
  await ctx.close();
}

/* ------------------------------------------------------------------ stills */

async function shootStills() {
  const out = dir('stills');
  const { ctx, page } = await open({ width: 430, height: 900 }, 3, true);
  // The lead's own Thought Drop, exactly as its page shows it.
  await page.goto(`${APP}/thoughts/${acc.postId}`);
  await page.waitForLoadState('networkidle');
  await sleep(1500);
  const card = page.locator('article').first();
  await card.screenshot({ path: resolve(out, 'thought-drop.png') });
  const radius = await card.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
  const box = await card.boundingBox();
  // The cast's avatars: the same SVG the product serves as each member's picture.
  const cast = [];
  for (const [key, m] of Object.entries(acc.cast)) {
    const res = await page.request.get(`${APP}/api/v1/avatars/${m.userId}`);
    if (res.ok()) { writeFileSync(resolve(out, `avatar-${key}.svg`), await res.text()); cast.push({ key, name: m.name, avatar: `avatar-${key}.svg` }); }
  }
  writeFileSync(resolve(out, 'meta.json'), JSON.stringify({ thoughtDrop: { file: 'thought-drop.png', cssWidth: box.width, cssHeight: box.height, radius, scale: 3 }, cast }, null, 2));
  console.log(`✓ stills: thought drop ${Math.round(box.width)}×${Math.round(box.height)}, ${cast.length} avatars`);
  await ctx.close();
}

for (const [name, spec] of Object.entries(PLATES)) if (want('plates', name)) await shootPlate(name, spec);
for (const [name, spec] of Object.entries(SCREENS)) if (want('screens', name)) await shootScreen(name, spec);
if (want('stills', names[0] ?? '')) await shootStills();
await browser.close();
