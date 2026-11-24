import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/server/config';
import { ENABLE_RLS_SQL, postgresPoolOptions } from '../../src/server/db/client';

const SECRET = 'x'.repeat(40);
const PROD = { NODE_ENV: 'production', APP_SECRET: SECRET, PAYMENT_PROVIDER: 'none', MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://u:p@smtp.example.com:587' } as const;

describe('hosted deployment config', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('uses the CA certificate and drops URL sslmode so verification cannot be overridden', () => {
    const o = postgresPoolOptions('postgresql://u:p@pooler.example.com:5432/postgres?sslmode=require', '-----BEGIN CERTIFICATE-----\\nAAA\\n-----END CERTIFICATE-----', 4);
    expect(o.connectionString).not.toContain('sslmode');
    expect(o.ssl).toEqual({ ca: '-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----', rejectUnauthorized: true });
    expect(o.max).toBe(4);
  });

  it('leaves the connection string untouched without a CA certificate', () => {
    const url = 'postgresql://u:p@db.example.com:5432/postgres?sslmode=require';
    expect(postgresPoolOptions(url)).toEqual({ connectionString: url, max: 10, connectionTimeoutMillis: 10_000 });
  });

  it('takes APP_ORIGIN from RENDER_EXTERNAL_URL unless set explicitly', () => {
    // A local .env may set APP_ORIGIN; this case is about an environment where it is unset.
    vi.stubEnv('APP_ORIGIN', '');
    expect(loadConfig({ ...PROD, RENDER_EXTERNAL_URL: 'https://nakshatra.onrender.com' } as never).APP_ORIGIN).toBe('https://nakshatra.onrender.com');
    expect(loadConfig({ ...PROD, RENDER_EXTERNAL_URL: 'https://nakshatra.onrender.com', APP_ORIGIN: 'https://www.example.com' } as never).APP_ORIGIN).toBe('https://www.example.com');
  });

  it('still refuses production without a secret or with the dev mailbox', () => {
    expect(() => loadConfig({ ...PROD, APP_SECRET: '' } as never)).toThrow(/APP_SECRET/);
    expect(() => loadConfig({ ...PROD, MAIL_TRANSPORT: 'dev_mailbox' } as never)).toThrow(/dev_mailbox/);
  });
});

describe('row level security lock-down', () => {
  it('enables RLS on public tables; the owner keeps access, other roles see nothing', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite();
    await pg.exec(`create table public.private_notes (id int primary key, body text); insert into private_notes values (1, 'secret');
      create role anon nologin; grant select on public.private_notes to anon;`);
    await pg.exec(ENABLE_RLS_SQL);
    await pg.exec(ENABLE_RLS_SQL); // idempotent
    const rls = await pg.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where relname = 'private_notes'`);
    expect(rls.rows[0].relrowsecurity).toBe(true);
    await pg.exec(`insert into private_notes values (2, 'still writable')`);
    expect((await pg.query('select * from private_notes')).rows).toHaveLength(2);
    await pg.exec('set role anon');
    expect((await pg.query('select * from private_notes')).rows).toHaveLength(0);
    await pg.close();
  });
});

describe('database file storage', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  it('persists uploads in PostgreSQL, serves only public files publicly, and enforces type and size', async () => {
    const { openDatabase } = await import('../../src/server/db/client');
    const { DatabaseStorage, IMAGE_TYPES } = await import('../../src/server/lib/storage');
    const h = await openDatabase({ pgliteDir: ':memory:' });
    await h.migrate();
    const store = new DatabaseStorage(h.db, 1024);
    const pub = await store.save(PNG, { allowed: IMAGE_TYPES, isPrivate: false, maxBytes: 5 * 1048576 });
    const priv = await store.save(PNG, { allowed: IMAGE_TYPES, isPrivate: true, maxBytes: 5 * 1048576 });
    expect(pub.path).toMatch(/^public\/[A-Za-z0-9_-]+\.png$/);
    expect((await store.read(pub.path)).equals(PNG)).toBe(true);
    expect((await store.readPublic(pub.path.slice('public/'.length)))?.mime).toBe('image/png');
    expect(await store.readPublic(priv.path.slice('private/'.length))).toBeNull();
    expect(await store.readPublic('../private/x.png')).toBeNull();
    await expect(store.save(Buffer.concat([PNG, Buffer.alloc(2048)]), { allowed: IMAGE_TYPES, isPrivate: false, maxBytes: 5 * 1048576 })).rejects.toThrow(/too large/);
    await expect(store.save(Buffer.from('%PDF-1.4 hello'), { allowed: IMAGE_TYPES, isPrivate: false, maxBytes: 5 * 1048576 })).rejects.toThrow(/Unsupported/);
    await h.close();
  });
});
