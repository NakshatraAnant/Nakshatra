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
/**
 * Hosted PostgreSQL (e.g. Supabase) can expose the public schema through an auto-generated HTTP API.
 * Row level security with no policies denies every role except the table owner — which is the app's
 * own connection, since its migrations create the tables — so app data is never readable through it.
 */
export const ENABLE_RLS_SQL = `do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;`;

/**
 * node-postgres options for a connection string. With a CA certificate the server is verified
 * against it, and any sslmode in the URL is dropped because pg lets URL parameters override `ssl`.
 */
export function postgresPoolOptions(databaseUrl: string, caCert?: string, max = 10) {
  if (!caCert) return { connectionString: databaseUrl, max };
  const url = new URL(databaseUrl);
  for (const p of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(p);
  return { connectionString: url.toString(), max, ssl: { ca: caCert.replace(/\\n/g, '\n'), rejectUnauthorized: true } };
}

export async function openDatabase(opts: { databaseUrl?: string; pgliteDir: string; caCert?: string; poolMax?: number }): Promise<DbHandle> {
  if (opts.databaseUrl) {
    const pg = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.default.Pool(postgresPoolOptions(opts.databaseUrl, opts.caCert, opts.poolMax));
    const db = drizzle(pool, { schema }) as unknown as DB;
    return {
      db,
      kind: 'postgres',
      close: () => pool.end(),
      migrate: async () => {
        await migrate(db as never, { migrationsFolder: MIGRATIONS });
        await pool.query(ENABLE_RLS_SQL);
      },
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
