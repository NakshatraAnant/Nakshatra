import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../config';
import { refuseIfLocalServerRunning } from './guard';

/**
 * Backup: for the embedded database, writes a PGlite data-directory dump (tar) to ./backups.
 * For external PostgreSQL use pg_dump (documented in docs/LOCAL_SETUP.md).
 */
const config = loadConfig();
await refuseIfLocalServerRunning(Boolean(config.DATABASE_URL));
if (config.DATABASE_URL) {
  console.log('External PostgreSQL detected. Use: pg_dump "$DATABASE_URL" -Fc -f backups/nakshatra.dump');
  process.exit(0);
}
const { PGlite } = await import('@electric-sql/pglite');
const db = new PGlite(resolve(process.cwd(), config.PGLITE_DIR));
await db.waitReady;
const blob = await db.dumpDataDir('none');
mkdirSync(resolve(process.cwd(), 'backups'), { recursive: true });
const file = resolve(process.cwd(), 'backups', `pglite-${new Date().toISOString().replace(/[:.]/g, '-')}.tar`);
await writeFile(file, Buffer.from(await blob.arrayBuffer()));
await db.close();
console.log(`Backup written to ${file}. Restore: stop the app, move the old ${config.PGLITE_DIR} aside and run npm run db:restore -- ${file}`);
