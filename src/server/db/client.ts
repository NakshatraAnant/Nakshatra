import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type Executor = DB | Tx;

export interface DbHandle {
  db: DB;
  kind: 'pglite' | 'postgres';
  close: () => Promise<void>;
  migrate: () => Promise<void>;
  /** Raw SQL for health checks and backups. */
  ping: () => Promise<boolean>;
}

const MIGRATIONS = resolve(process.cwd(), 'drizzle');

/**
 * Opens the database. With DATABASE_URL a pooled node-postgres connection is used;
 * otherwise an embedded PGlite (WASM PostgreSQL) database is opened at `pgliteDir`
 * (or in memory when pgliteDir === ':memory:'), so the app runs with no external services.
 */
export async function openDatabase(opts: { databaseUrl?: string; pgliteDir: string }): Promise<DbHandle> {
  if (opts.databaseUrl) {
    const pg = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.default.Pool({ connectionString: opts.databaseUrl, max: 10 });
    const db = drizzle(pool, { schema }) as unknown as DB;
    return {
      db,
      kind: 'postgres',
      close: () => pool.end(),
      migrate: () => migrate(db as never, { migrationsFolder: MIGRATIONS }),
      ping: async () => (await pool.query('select 1')).rowCount === 1,
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  let client: InstanceType<typeof PGlite>;
  if (opts.pgliteDir === ':memory:') {
    client = new PGlite();
  } else {
    const dir = resolve(process.cwd(), opts.pgliteDir);
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as DB;
  return {
    db,
    kind: 'pglite',
    close: () => client.close(),
    migrate: () => migrate(db as never, { migrationsFolder: MIGRATIONS }),
    ping: async () => (await client.query('select 1 as ok')).rows.length === 1,
  };
}

export { schema };
