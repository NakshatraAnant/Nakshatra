import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../config';
import { refuseIfLocalServerRunning } from './guard';

const config = loadConfig();
await refuseIfLocalServerRunning(Boolean(config.DATABASE_URL));
const file = process.argv[2];
if (config.DATABASE_URL) { console.log('Use pg_restore for external PostgreSQL.'); process.exit(0); }
if (!file) { console.error('Usage: npm run db:restore -- <backup.tar>'); process.exit(1); }
const dir = resolve(process.cwd(), config.PGLITE_DIR);
if (existsSync(dir)) { console.error(`${dir} already exists. Move it aside first (restore never overwrites data).`); process.exit(1); }
const { PGlite } = await import('@electric-sql/pglite');
const db = new PGlite(dir, { loadDataDir: new Blob([await readFile(file)]) });
await db.waitReady;
await db.close();
console.log(`Restored ${file} into ${dir}.`);
