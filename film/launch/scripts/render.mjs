/**
 * Renders the film. Serves the repository to a headless browser, asks the film page for one frame at a time and
 * saves each as a PNG; ffmpeg then joins frames and score into the master.
 *
 *   node film/launch/scripts/render.mjs stills 0 2 4.6 ...   preview stills at those seconds (half size)
 *   node film/launch/scripts/render.mjs frames [from to]     full-size frames (seconds; default the whole film)
 *   node film/launch/scripts/render.mjs encode               frames + score → out/nakshatra-launch-30s.mp4
 *
 * Set WORKERS=n to split a frame range across n browser pages.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, resolve, normalize } from 'node:path';
import { ROOT, SHOOT, launchBrowser } from './lib.mjs';

const REPO = resolve(ROOT, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const [, , mode = 'stills', ...args] = process.argv;
const FRAMES = resolve(SHOOT, 'frames');
const OUT = resolve(ROOT, 'out');
const pad = (n) => String(n).padStart(4, '0');

function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = resolve(REPO, `.${path}`);
    // Only the film, its footage, the official artwork and three.js are ever served.
    const allowed = ['film/launch/', 'public/visual/', 'node_modules/three/'].some((p) => file.startsWith(resolve(REPO, p)));
    if (!allowed || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function openFilm(browser, port, scale) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/favicon|404/.test(m.text())) console.error(`[${m.type()}]`, m.text().slice(0, 300)); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) console.error(`missing: ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${port}/film/launch/src/index.html?scale=${scale}`);
  await page.evaluate(() => window.__film.ready);
  return page;
}
const shoot = async (page, frame, path) => { await page.evaluate((f) => window.__film.render(f), frame); await page.screenshot({ path, clip: { x: 0, y: 0, width: 1080, height: 1920 } }); };

if (mode === 'encode') {
  mkdirSync(OUT, { recursive: true });
  const audio = resolve(OUT, 'nakshatra-launch-score.wav');
  const master = resolve(OUT, 'nakshatra-launch-30s.mp4');
  const input = ['-framerate', '30', '-i', resolve(FRAMES, '%04d.png')];
  const video = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', '-r', '30'];
  const sound = existsSync(audio) ? ['-i', audio, '-c:a', 'aac', '-b:a', '256k', '-shortest'] : [];
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...input, ...sound, ...video, master], { stdio: 'inherit' });
  console.log(`✓ ${master}${sound.length ? '' : ' (no score found — picture only)'}`);
} else {
  const server = await serve();
  const { port } = server.address();
  const browser = await launchBrowser();
  if (mode === 'stills') {
    const dir = resolve(SHOOT, 'preview'); mkdirSync(dir, { recursive: true });
    const page = await openFilm(browser, port, 0.5);
    for (const s of args.map(Number)) { const t0 = Date.now(); await shoot(page, Math.round(s * 30), resolve(dir, `t${s.toFixed(2).padStart(5, '0')}.png`)); console.log(`t=${s}s  ${Date.now() - t0} ms`); }
  } else {
    mkdirSync(FRAMES, { recursive: true });
    const from = Math.round((Number(args[0] ?? 0)) * 30), to = Math.round((Number(args[1] ?? 30)) * 30);
    const workers = Number(process.env.WORKERS ?? 3), t0 = Date.now();
    let next = from, done = 0;
    await Promise.all(Array.from({ length: workers }, async () => {
      const page = await openFilm(browser, port, 1);
      while (next < to) { const f = next++; await shoot(page, f, resolve(FRAMES, `${pad(f)}.png`)); if (++done % 30 === 0) console.log(`${done}/${to - from} frames  ${((Date.now() - t0) / done / 1000).toFixed(2)} s/frame`); }
    }));
    console.log(`✓ frames ${from}–${to - 1} in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  await browser.close();
  server.close();
}
