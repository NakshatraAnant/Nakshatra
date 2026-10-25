import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

/** Schema names the app may own: plain lower-case identifiers, so they never need escaping. */
export const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Hosted PostgreSQL (e.g. Supabase) can expose tables through an auto-generated HTTP API.
 * Row level security with no policies denies every role except the table owner — which is the app's
 * own connection, since its migrations create the tables — so app data is never readable through it.
 * Applies to the app's schema (the first on the search path).
 */
export const ENABLE_RLS_SQL = `do $$
declare t record;
begin
  for t in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = current_schema() and c.relkind = 'r' and not c.relrowsecurity and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('alter table %I.%I enable row level security', t.nspname, t.relname);
  end loop;
end $$;`;

/**
 * For a dedicated app schema: no role but its owner (the app's connection) may use it. Supabase's API
 * roles are revoked explicitly where they exist; on plain PostgreSQL only PUBLIC applies.
 */
export const REVOKE_SCHEMA_ACCESS_SQL = `do $$
declare r text;
begin
  execute format('revoke all on schema %I from public', current_schema());
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema %I from %I', current_schema(), r);
      execute format('revoke all on all tables in schema %I from %I', current_schema(), r);
      execute format('revoke all on all sequences in schema %I from %I', current_schema(), r);
      execute format('revoke all on all functions in schema %I from %I', current_schema(), r);
    end if;
  end loop;
end $$;`;

/**
 * drizzle-kit writes foreign keys as REFERENCES "public"."table", which would point an app installed in
 * another schema at whatever lives in public. This copies the migrations with that qualifier retargeted
 * (table/index DDL is unqualified and follows the search path), leaving the committed files untouched.
 */
export function migrationsFor(schemaName?: string): string {
  if (!schemaName) return MIGRATIONS;
  if (!SCHEMA_NAME.test(schemaName)) throw new Error(`Invalid database schema name: ${schemaName}`);
  const out = join(tmpdir(), `nakshatra-migrations-${schemaName}-${process.pid}`);
  mkdirSync(join(out, 'meta'), { recursive: true });
  writeFileSync(join(out, 'meta', '_journal.json'), readFileSync(join(MIGRATIONS, 'meta', '_journal.json')));
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
    writeFileSync(join(out, f), readFileSync(join(MIGRATIONS, f), 'utf8').replaceAll('"public".', `"${schemaName}".`));
  }
  return out;
}

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

/**
 * Opens the database. With DATABASE_URL a pooled node-postgres connection is used;
 * otherwise an embedded PGlite (WASM PostgreSQL) database is opened at `pgliteDir`
 * (or in memory when pgliteDir === ':memory:'), so the app runs with no external services.
 *
 * With `schemaName` every connection's search path is that schema alone, so unqualified queries
 * and DDL never resolve to tables another application keeps in public; migration bookkeeping lives
 * there too. Without it, behaviour is unchanged (public schema, drizzle bookkeeping schema).
 */
export async function openDatabase(opts: { databaseUrl?: string; pgliteDir: string; caCert?: string; poolMax?: number; schemaName?: string }): Promise<DbHandle> {
  const schemaName = opts.schemaName;
  if (schemaName && !SCHEMA_NAME.test(schemaName)) throw new Error(`Invalid database schema name: ${schemaName}`);
  const migrateOpts = { migrationsFolder: migrationsFor(schemaName), ...(schemaName ? { migrationsSchema: schemaName } : {}) };
  if (opts.databaseUrl) {
    const pg = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.default.Pool(postgresPoolOptions(opts.databaseUrl, opts.caCert, opts.poolMax));
    // Queued before any other query on each new connection. If it fails the connection is discarded
    // rather than left on the default path, where unqualified names could reach another app's tables.
    if (schemaName) pool.on('connect', (c) => { c.query(`set search_path to "${schemaName}"`).catch((err: Error) => c.emit('error', err)); });
    const db = drizzle(pool, { schema }) as unknown as DB;
    return {
      db,
      kind: 'postgres',
      close: () => pool.end(),
      migrate: async () => {
        if (schemaName) await pool.query(`create schema if not exists "${schemaName}"`);
        await migrate(db as never, migrateOpts);
        await pool.query(ENABLE_RLS_SQL);
        if (schemaName) await pool.query(REVOKE_SCHEMA_ACCESS_SQL);
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
  // PGlite has a single connection, so one statement sets the path for its lifetime.
  if (schemaName) await client.exec(`create schema if not exists "${schemaName}"; set search_path to "${schemaName}";`);
  const db = drizzle(client, { schema }) as unknown as DB;
  return {
    db,
    kind: 'pglite',
    close: () => client.close(),
    migrate: async () => {
      await migrate(db as never, migrateOpts);
      if (schemaName) await client.exec(`${ENABLE_RLS_SQL}\n${REVOKE_SCHEMA_ACCESS_SQL}`);
    },
    ping: async () => (await client.query('select 1 as ok')).rows.length === 1,
  };
}

export { schema };
