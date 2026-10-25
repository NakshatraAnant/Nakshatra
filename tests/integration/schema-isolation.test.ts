import { describe, expect, it } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { is } from 'drizzle-orm';
import { PgTable as PgTableClass } from 'drizzle-orm/pg-core';
import { openDatabase } from '../../src/server/db/client';
import * as schema from '../../src/server/db/schema';
import { LEGACY_PUBLIC_TABLES } from './harness';

const APP_TABLES = (Object.values(schema) as unknown[]).filter((v) => is(v, PgTableClass)).map((t) => getTableConfig(t as PgTable).name).sort();

describe('app isolated in its own schema next to clashing public tables', () => {
  it('creates and uses every app table in the app schema and leaves public untouched', async () => {
    const h = await openDatabase({ pgliteDir: ':memory:', schemaName: 'nakshatra' });
    const q = async <T = Record<string, unknown>>(text: string) => ((await h.db.execute(text as never)) as unknown as { rows: T[] }).rows;
    const run = async (text: string) => { for (const st of text.split(';').map((x) => x.trim()).filter(Boolean)) await q(st); };
    await run(`create role anon nologin; create role authenticated nologin; ${LEGACY_PUBLIC_TABLES}
      grant usage on schema public to anon; grant select on all tables in schema public to anon;`);
    const publicBefore = await q<{ table_name: string; columns: string }>(`select table_name, string_agg(column_name || ':' || data_type, ',' order by ordinal_position) columns
      from information_schema.columns where table_schema = 'public' group by table_name order by table_name`);

    await h.migrate();
    await h.migrate(); // a restart re-runs this: must be a no-op

    // Every Drizzle table exists in nakshatra; nothing new appeared in public; no separate drizzle schema.
    const appTables = (await q<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'nakshatra' and table_type = 'BASE TABLE'`)).map((r) => r.table_name);
    expect(APP_TABLES.filter((t) => !appTables.includes(t))).toEqual([]);
    expect(appTables).toContain('__drizzle_migrations');
    expect(APP_TABLES).toEqual(expect.arrayContaining(['profiles', 'products', 'referrals', 'analytics_events', 'audit_logs', 'users']));
    const publicAfter = await q(`select table_name, string_agg(column_name || ':' || data_type, ',' order by ordinal_position) columns
      from information_schema.columns where table_schema = 'public' group by table_name order by table_name`);
    expect(publicAfter).toEqual(publicBefore);
    expect(await q(`select 1 from information_schema.schemata where schema_name = 'drizzle'`)).toHaveLength(0);

    // Legacy rows are intact.
    const legacy = await q<{ n: number }>(`select (select count(*) from public.profiles) + (select count(*) from public.products) + (select count(*) from public.referrals)
      + (select count(*) from public.analytics_events) + (select count(*) from public.audit_logs) + (select count(*) from public.users) as n`);
    expect(Number(legacy[0].n)).toBe(6);

    // Foreign keys and indexes stay inside nakshatra.
    const strayFks = await q(`select conname from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace tn on tn.oid = t.relnamespace
      join pg_class r on r.oid = c.confrelid join pg_namespace rn on rn.oid = r.relnamespace where c.contype = 'f' and tn.nspname = 'nakshatra' and rn.nspname <> 'nakshatra'`);
    expect(strayFks).toEqual([]);
    expect(Number((await q<{ n: number }>(`select count(*) n from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace where c.contype = 'f' and n.nspname = 'nakshatra'`))[0].n)).toBeGreaterThan(100);
    const strayIdx = await q(`select i.relname from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class t on t.oid = x.indrelid
      join pg_namespace tn on tn.oid = t.relnamespace join pg_namespace inn on inn.oid = i.relnamespace where tn.nspname = 'nakshatra' and inn.nspname <> 'nakshatra'`);
    expect(strayIdx).toEqual([]);

    // Unqualified app queries resolve to nakshatra, never the legacy table of the same name.
    // (public.users has one legacy row and different columns; nakshatra.users is empty.)
    expect(await q(`select id, email from users`)).toHaveLength(0);
    expect(await q(`select 1 from public.users where legacy = 'legacy'`)).toHaveLength(1);

    // Row level security on every app table; API roles cannot even reach the schema.
    expect(await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nakshatra' and c.relkind = 'r' and not c.relrowsecurity`)).toEqual([]);
    for (const role of ['anon', 'authenticated']) {
      const priv = await q<{ ok: boolean }>(`select has_schema_privilege('${role}', 'nakshatra', 'USAGE') as ok`);
      expect(priv[0].ok).toBe(false);
    }
    await q('set role anon');
    const denied = await q('select * from nakshatra.users').then(() => null, (e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
    expect(denied).toMatch(/permission denied for schema nakshatra/);
    await q('reset role');
    await h.close();
  });

  it('rejects schema names that would need quoting', async () => {
    await expect(openDatabase({ pgliteDir: ':memory:', schemaName: 'Bad"Name' })).rejects.toThrow(/Invalid database schema name/);
  });
});
