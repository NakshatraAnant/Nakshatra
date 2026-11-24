import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../config';
import { refuseIfLocalServerRunning } from './guard';

/** Deletes the disposable embedded development database. Refuses to touch external PostgreSQL. */
const config = loadConfig();
await refuseIfLocalServerRunning(Boolean(config.DATABASE_URL));
if (config.DATABASE_URL) {
  console.error('db:reset only resets the embedded PGlite database. For PostgreSQL, drop and recreate the database manually after taking a backup.');
  process.exit(1);
}
if (config.isProd) {
  console.error('Refusing to reset in production.');
  process.exit(1);
}
const dir = resolve(process.cwd(), config.PGLITE_DIR);
if (!process.argv.includes('--yes')) {
  console.error(`This permanently deletes the development database at ${dir}. Re-run with --yes to confirm.`);
  process.exit(1);
}
if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
rmSync(resolve(process.cwd(), '.data/dev-credentials.json'), { force: true });
console.log('Development database removed. Run `npm run db:seed` to recreate it.');
