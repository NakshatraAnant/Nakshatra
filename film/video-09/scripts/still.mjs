// Review stills: node scripts/still.mjs <outDir> <query> <t1,t2,...> [scale]
import { chromium } from 'playwright';
const [outDir, query = '', times = '0', scale = '0.5'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 600)));
await page.goto(`http://127.0.0.1:5190/?scale=${scale}&${query}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.film, null, { timeout: 120000 });
await page.evaluate(() => window.film.ready);
await page.evaluate(() => document.fonts.ready);
for (const t of times.split(',').map(Number)) {
  const t0 = Date.now();
  await page.evaluate((x) => window.film.render(x), t);
  const name = `${outDir}/t${t.toFixed(2).padStart(5, '0')}.jpg`;
  await page.screenshot({ path: name, type: 'jpeg', quality: 88 });
  console.log(name, `${Date.now() - t0}ms`);
}
await browser.close();
