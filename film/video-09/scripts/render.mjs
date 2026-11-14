/**
 * Renders the film to an image sequence and encodes it with the soundtrack.
 *
 *   npx vite --config film/video-09/vite.config.ts          (leave running)
 *   node film/video-09/scripts/render.mjs [--scale 1] [--workers 3] [--from 0] [--to 30] [--fps 30] [--name nakshatra-video-09]
 *
 * Each worker is its own headless page; the film is a pure function of time, so frames can be drawn in any
 * order on any worker. Frames go to film/video-09/frames (not committed); the encode goes to film/video-09/out.
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const scale = Number(arg('scale', 1)), workers = Number(arg('workers', 3)), fps = Number(arg('fps', 30));
const from = Math.round(Number(arg('from', 0)) * fps), to = Math.round(Number(arg('to', 30)) * fps);
const name = arg('name', 'nakshatra-video-09');
const framesDir = resolve(root, 'frames');
mkdirSync(framesDir, { recursive: true });
mkdirSync(resolve(root, 'out'), { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const started = Date.now();
let next = from, done = 0;
const total = to - from;
async function work(id) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error(`[worker ${id}]`, e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:5190/?scale=${scale}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.film, null, { timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  for (;;) {
    const f = next++;
    if (f >= to) break;
    await page.evaluate((t) => window.film.render(t), f / fps);
    await page.screenshot({ path: `${framesDir}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 97 });
    done++;
    if (done % 30 === 0) { const el = (Date.now() - started) / 1000; console.log(`${done}/${total} frames  ${(el / done).toFixed(2)} s/frame  about ${Math.round((el / done) * (total - done))} s left`); }
  }
  await page.close();
}
await Promise.all(Array.from({ length: workers }, (_, i) => work(i)));
await browser.close();
console.log(`frames done in ${Math.round((Date.now() - started) / 1000)} s`);

if (from === 0 && to === 30 * fps) {
  const audio = resolve(root, 'out/audio.wav');
  const args = ['-y', '-v', 'error', '-framerate', String(fps), '-i', `${framesDir}/%05d.jpg`];
  if (existsSync(audio)) args.push('-i', audio);
  args.push('-c:v', 'libx264', '-preset', 'slow', '-b:v', '5500k', '-maxrate', '9000k', '-bufsize', '18000k', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart');
  if (existsSync(audio)) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  args.push(resolve(root, `out/${name}.mp4`));
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  console.log(r.status === 0 ? `encoded out/${name}.mp4` : 'encode failed');
}
