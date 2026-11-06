import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Admin launch readiness and performance', () => {
  it('reports live, honest status rows and measured timings; staff only', async () => {
    const admin = await signup(t, 'Ops Admin', { birth: false });
    await makeAdmin(t, admin.userId);
    const member = await signup(t, 'Ops Member', { birth: false });
    expect((await member.c.req('GET', '/api/v1/admin/launch-readiness')).status).toBe(403);
    expect((await member.c.req('GET', '/api/v1/admin/performance')).status).toBe(403);

    const r = await admin.c.get('/api/v1/admin/launch-readiness');
    const byKey = Object.fromEntries(r.items.map((i: { key: string }) => [i.key, i]));
    expect(byKey.email.status).toBe('red'); // dev mailbox only
    expect(byKey.payments.status).toBe('grey'); // switched off on purpose
    expect(byKey.assessment.status).toBe('green');
    for (const i of r.items) {
      expect(['green', 'amber', 'red', 'grey']).toContain(i.status);
      expect(i.reason.length).toBeGreaterThan(5);
      expect(i.works.length).toBeGreaterThan(5);
    }
    expect(r.summary.red + r.summary.amber + r.summary.green + r.summary.grey).toBe(r.items.length);

    for (let i = 0; i < 5; i++) await member.c.get('/api/v1/auth/me');
    const p = await admin.c.get('/api/v1/admin/performance');
    const me = p.routes.find((x: { route: string }) => x.route === '/api/v1/auth/me');
    expect(me.requests).toBeGreaterThanOrEqual(5);
    expect(me.p95).toBeGreaterThanOrEqual(me.p50);
    expect(JSON.stringify(p)).not.toContain(member.userId);
  });
});
