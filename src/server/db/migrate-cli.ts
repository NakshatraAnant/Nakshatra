import { loadConfig } from '../config';
import { refuseIfLocalServerRunning } from './guard';
import { openDatabase } from './client';

const config = loadConfig();
await refuseIfLocalServerRunning(Boolean(config.DATABASE_URL));
const db = await openDatabase({ databaseUrl: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR, caCert: config.DATABASE_CA_CERT, poolMax: config.DATABASE_POOL_MAX, schemaName: config.DATABASE_SCHEMA });
await db.migrate();
console.log(`Migrations applied (${db.kind}).`);
await db.close();
