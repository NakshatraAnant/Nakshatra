import pino from 'pino';
import { loadConfig } from '../config';
import { refuseIfLocalServerRunning } from './guard';
import { openDatabase } from './client';
import { seedDemoData, seedReferenceData, writeDevCredentials } from './seed';

const config = loadConfig();
await refuseIfLocalServerRunning(Boolean(config.DATABASE_URL));
const handle = await openDatabase({ databaseUrl: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR, caCert: config.DATABASE_CA_CERT, poolMax: config.DATABASE_POOL_MAX, schemaName: config.DATABASE_SCHEMA });
await handle.migrate();
const ctx = { db: handle.db, config, log: pino({ level: 'warn' }) };
await seedReferenceData(ctx);
if (config.SEED_DEMO_DATA === 'true' && !config.isProd) {
  const creds = await seedDemoData(ctx);
  const file = writeDevCredentials(creds);
  console.log(creds.length ? `Seeded demo data. New development credentials were written to ${file}` : 'Demo data already present.');
} else {
  console.log('Reference data seeded (demo data skipped).');
}
await handle.close();
