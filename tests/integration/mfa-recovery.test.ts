import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client, makeApp, signup, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { totp } from '../../src/server/lib/crypto';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

async function withMfa(name: string) {
  const u = await signup(t, name, { birth: false });
  const setup = await u.c.post('/api/v1/auth/mfa/setup');
  const enabled = await u.c.post('/api/v1/auth/mfa/enable', { code: totp(setup.secret) });
  return { ...u, secret: setup.secret as string, codes: enabled.recoveryCodes as string[] };
}

describe('MFA recovery codes', () => {
  it('are issued once on enable, stored only as hashes, and each works exactly once', async () => {
    const u = await withMfa('Recovery Ravi');
    expect(u.codes).toHaveLength(10);
    expect(new Set(u.codes).size).toBe(10);
    const rows = await t.ctx.db.select().from(s.mfaRecoveryCodes).where(eq(s.mfaRecoveryCodes.userId, u.userId));
    expect(rows).toHaveLength(10);
    for (const c of u.codes) expect(JSON.stringify(rows)).not.toContain(c.replace('-', ''));
    expect((await u.c.get('/api/v1/auth/mfa/recovery-codes')).remaining).toBe(10);

    // Lost device: sign in with password + recovery code (typed in a different format).
    const lost = new Client(t.app);
    const typed = u.codes[0].toUpperCase().replace('-', ' ');
    const ok = await lost.req('POST', '/api/v1/auth/login', { email: u.email, password: u.password, recoveryCode: typed });
    expect(ok.status).toBe(200);
    expect(ok.body.user.mfaEnabled).toBe(true);
    // Same code again fails, on any device.
    const again = await new Client(t.app).req('POST', '/api/v1/auth/login', { email: u.email, password: u.password, recoveryCode: u.codes[0] });
    expect(again.status).toBe(401);
    expect((await u.c.get('/api/v1/auth/mfa/recovery-codes')).remaining).toBe(9);
    const logs = (await t.ctx.db.select().from(s.auditLogs).where(eq(s.auditLogs.actorId, u.userId))).map((l) => l.action);
    expect(logs).toEqual(expect.arrayContaining(['auth.mfa_recovery_used', 'auth.mfa_failed']));
    const notes = await t.ctx.db.select().from(s.notifications).where(eq(s.notifications.userId, u.userId));
    expect(notes.some((n) => n.title.includes('recovery code was used'))).toBe(true);
  });

  it("one person's code never unlocks another account; a wrong password still fails", async () => {
    const a = await withMfa('Recovery Asha');
    const b = await withMfa('Recovery Bilal');
    expect((await new Client(t.app).req('POST', '/api/v1/auth/login', { email: b.email, password: b.password, recoveryCode: a.codes[1] })).status).toBe(401);
    expect((await new Client(t.app).req('POST', '/api/v1/auth/login', { email: a.email, password: 'not-the-password-1', recoveryCode: a.codes[1] })).status).toBe(401);
    // The failed attempts above did not burn a's code.
    expect((await new Client(t.app).req('POST', '/api/v1/auth/login', { email: a.email, password: a.password, recoveryCode: a.codes[1] })).status).toBe(200);
  });

  it('a pending-MFA session can be completed with a recovery code', async () => {
    const u = await withMfa('Recovery Chen');
    expect((await new Client(t.app).req('POST', '/api/v1/auth/login', { email: u.email, password: u.password })).body.mfaRequired).toBe(true);
    // A session that has not passed the second factor yet.
    const { sha256, randomToken } = await import('../../src/server/lib/crypto');
    const token = randomToken(32);
    await t.ctx.db.insert(s.sessions).values({ userId: u.userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600000), mfaPassed: false });
    const c = new Client(t.app);
    await c.prime();
    c.cookies.set('nk_session', token);
    expect((await c.get('/api/v1/auth/me')).mfaRequired).toBe(true);
    expect((await c.req('POST', '/api/v1/auth/mfa/verify', { code: 'aaaaa-bbbbb' })).status).toBe(401);
    expect((await c.req('POST', '/api/v1/auth/mfa/verify', { code: u.codes[2] })).status).toBe(200);
    expect((await c.get('/api/v1/auth/me')).user.mfaEnabled).toBe(true);
  });

  it('regenerating needs password AND a current authenticator code, and invalidates old codes', async () => {
    const u = await withMfa('Recovery Dara');
    expect((await u.c.req('POST', '/api/v1/auth/mfa/recovery-codes', { password: u.password, code: '000000' })).status).toBe(401);
    expect((await u.c.req('POST', '/api/v1/auth/mfa/recovery-codes', { password: 'wrong-password-12', code: totp(u.secret) })).status).toBe(401);
    // A recovery code is not accepted for regeneration (it must be the live factor).
    expect((await u.c.req('POST', '/api/v1/auth/mfa/recovery-codes', { password: u.password, code: u.codes[0] })).status).toBe(400);
    const fresh = await u.c.post('/api/v1/auth/mfa/recovery-codes', { password: u.password, code: totp(u.secret) });
    expect(fresh.recoveryCodes).toHaveLength(10);
    expect((await new Client(t.app).req('POST', '/api/v1/auth/login', { email: u.email, password: u.password, recoveryCode: u.codes[0] })).status).toBe(401);
    expect((await new Client(t.app).req('POST', '/api/v1/auth/login', { email: u.email, password: u.password, recoveryCode: fresh.recoveryCodes[0] })).status).toBe(200);
  });

  it('a lost authenticator can be removed with password + recovery code, then set up again', async () => {
    const u = await withMfa('Recovery Esi');
    expect((await u.c.req('POST', '/api/v1/auth/mfa/disable', { password: u.password, code: u.codes[3] })).status).toBe(200);
    expect((await u.c.get('/api/v1/auth/me')).user.mfaEnabled).toBe(false);
    expect(await t.ctx.db.select().from(s.mfaRecoveryCodes).where(eq(s.mfaRecoveryCodes.userId, u.userId))).toHaveLength(0);
    const setup = await u.c.post('/api/v1/auth/mfa/setup');
    expect((await u.c.post('/api/v1/auth/mfa/enable', { code: totp(setup.secret) })).recoveryCodes).toHaveLength(10);
  });
});
