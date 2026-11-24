/**
 * Starts an isolated server for Playwright: fresh embedded database under .data/e2e,
 * reference + sample data seeded, built web app served from dist/web.
 * Never touches the development database or .data/dev-credentials.json.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pino from 'pino';

const root = resolve(process.cwd(), '.data/e2e');
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
if (!existsSync(resolve(process.cwd(), process.env.WEB_DIST_DIR ?? 'dist/web', 'index.html'))) {
  console.error('dist/web is missing. Run `npm run build:web` before the e2e suite.');
  process.exit(1);
}

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.E2E_PORT ?? '4410';
process.env.HOST = '127.0.0.1';
process.env.APP_ORIGIN = `http://127.0.0.1:${process.env.PORT}`;
process.env.PGLITE_DIR = resolve(root, 'pglite');
process.env.UPLOAD_DIR = resolve(root, 'uploads');
process.env.PAYMENT_PROVIDER = 'dev_simulator';
process.env.MAIL_TRANSPORT = 'dev_mailbox';
process.env.LOG_LEVEL = 'warn';
// Same module configuration as a real launch unless the legacy journeys are being run.
process.env.MODULE_SCOPE = process.env.E2E_MODULE_SCOPE === 'all' ? 'all' : 'launch';
delete process.env.DATABASE_URL;

const { loadConfig } = await import('../src/server/config');
const { buildApp } = await import('../src/server/app');
const { seedDemoData } = await import('../src/server/db/seed');

const config = loadConfig();
const { app, ctx } = await buildApp(config);
const creds = await seedDemoData({ db: ctx.db, config, log: pino({ level: 'warn' }) });
// Test-only accounts for this throwaway database; read by e2e/helpers.ts.
writeFileSync(resolve(root, 'credentials.json'), JSON.stringify(creds, null, 2));
await app.listen({ port: config.PORT, host: config.HOST });
console.info(`e2e server ready on ${config.APP_ORIGIN}`);
