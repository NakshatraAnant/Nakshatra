import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type U = Awaited<ReturnType<typeof signup>>;
async function email(u: U) { return (await t.ctx.db.select({ e: s.users.email }).from(s.users).where(eq(s.users.id, u.userId)))[0].e; }

describe('Organisations', () => {
  it('tenant isolation: orgs, members, circles and insights stay inside their own organisation', async () => {
    const staff = await signup(t, 'Org Staff', { birth: false });
    await makeAdmin(t, staff.userId);
    const ownerA = await signup(t, 'Owner A', { birth: false });
    const ownerB = await signup(t, 'Owner B', { birth: false });
    const memberA = await signup(t, 'Member A', { birth: false });
    const outsider = await signup(t, 'Outsider', { birth: false });
    expect((await ownerA.c.req('POST', '/api/v1/admin/orgs', { name: 'Self made', kind: 'company', ownerEmail: await email(ownerA) })).status).toBe(403);
    const a = (await staff.c.post('/api/v1/admin/orgs', { name: 'Acme', kind: 'company', ownerEmail: await email(ownerA), seatLimit: 3 }, 201)).org;
    const b = (await staff.c.post('/api/v1/admin/orgs', { name: 'Beta College', kind: 'college', ownerEmail: await email(ownerB) }, 201)).org;

    const { token } = await ownerA.c.post(`/api/v1/orgs/${a.id}/invites`, {});
    expect((await outsider.c.get(`/api/v1/org-invites/${token}`))).toEqual({ org: { name: 'Acme', kind: 'company' }, requiresDomain: null });
    await memberA.c.post(`/api/v1/org-invites/${token}/accept`);
    expect((await memberA.c.get('/api/v1/orgs')).orgs.map((o: { name: string }) => o.name)).toEqual(['Acme']);

    // Cross-tenant access is indistinguishable from "doesn't exist".
    for (const path of [`/api/v1/orgs/${b.id}`, `/api/v1/orgs/${b.id}/insights`]) expect((await memberA.c.req('GET', path)).status).toBe(404);
    expect((await ownerA.c.req('GET', `/api/v1/orgs/${b.id}/insights`)).status).toBe(404);
    expect((await ownerA.c.req('POST', `/api/v1/orgs/${b.id}/invites`, {})).status).toBe(404);
    expect((await outsider.c.req('GET', `/api/v1/orgs/${a.id}`)).status).toBe(404);

    const { circle } = await ownerA.c.post(`/api/v1/orgs/${a.id}/circles`, { name: 'Acme lunch club' }, 201);
    const bc = (await ownerB.c.post(`/api/v1/orgs/${b.id}/circles`, { name: 'Beta study group' }, 201)).circle;
    expect((await memberA.c.req('POST', `/api/v1/orgs/${b.id}/circles/${bc.id}/join`)).status).toBe(404);
    expect((await memberA.c.req('POST', `/api/v1/orgs/${a.id}/circles/${bc.id}/join`)).status).toBe(404); // B's circle via A's org
    await memberA.c.post(`/api/v1/orgs/${a.id}/circles/${circle.id}/join`);
    expect((await memberA.c.get(`/api/v1/circles/${circle.id}`)).circle.name).toBe('Acme lunch club');
    // A circle invite link can't smuggle an outsider into an org circle.
    const inv = await ownerA.c.post(`/api/v1/circles/${circle.id}/invites`, {});
    expect((await outsider.c.req('POST', `/api/v1/circle-invites/${inv.token}/accept`)).status).toBe(403);

    // Removal from the org removes org-circle membership too.
    await ownerA.c.post(`/api/v1/orgs/${a.id}/members/${memberA.userId}`, { action: 'remove' });
    expect((await memberA.c.req('GET', `/api/v1/circles/${circle.id}`)).status).toBe(404);
    expect((await memberA.c.req('GET', `/api/v1/orgs/${a.id}`)).status).toBe(404);

    // Seats are enforced (3: owner + 2).
    const { token: t2 } = await ownerA.c.post(`/api/v1/orgs/${a.id}/invites`, {});
    const x = await signup(t, 'Seat One', { birth: false });
    const y = await signup(t, 'Seat Two', { birth: false });
    await x.c.post(`/api/v1/org-invites/${t2}/accept`);
    await y.c.post(`/api/v1/org-invites/${t2}/accept`);
    expect((await outsider.c.req('POST', `/api/v1/org-invites/${t2}/accept`)).status).toBe(409);

    await staff.c.patch(`/api/v1/admin/orgs/${a.id}`, { status: 'suspended' });
    expect((await ownerA.c.req('GET', `/api/v1/orgs/${a.id}`)).status).toBe(404);
  });

  it('domain-restricted invites; insights are aggregate-only, opt-in and need five people; members never see each other’s results', async () => {
    const staff = await signup(t, 'Org Staff 2', { birth: false });
    await makeAdmin(t, staff.userId);
    const owner = await signup(t, 'Insight Owner');
    const org = (await staff.c.post('/api/v1/admin/orgs', { name: 'Gamma', kind: 'company', emailDomain: 'gamma.example', ownerEmail: await email(owner) }, 201)).org;
    const { token } = await owner.c.post(`/api/v1/orgs/${org.id}/invites`, { requireDomain: true });
    const wrong = await signup(t, 'Wrong Domain', { birth: false });
    expect((await wrong.c.req('POST', `/api/v1/org-invites/${token}/accept`)).status).toBe(403);

    const { token: open } = await owner.c.post(`/api/v1/orgs/${org.id}/invites`, {});
    const people: U[] = [];
    for (let i = 0; i < 5; i++) {
      const u = await signup(t, `Gamma ${i}`);
      await u.c.post(`/api/v1/org-invites/${open}/accept`);
      await t.ctx.db.insert(s.assessmentResults).values({ userId: u.userId, version: 'personality-v2', answers: {}, scores: { energy: 0.8, compass: 0, voice: 0.2, tempo: -0.4, horizon: 0.1 }, archetypeKey: 'chaos_diplomat', confidence: 'high' } as never);
      people.push(u);
    }
    const detail = await people[0].c.get(`/api/v1/orgs/${org.id}`);
    expect(JSON.stringify(detail)).not.toMatch(/archetype|scores|energy/i);
    expect((await people[0].c.req('GET', `/api/v1/orgs/${org.id}/insights`)).status).toBe(403);

    let ins = await owner.c.get(`/api/v1/orgs/${org.id}/insights`);
    expect(ins.composition).toMatchObject({ counted: 0, needed: 5, dimensions: null }); // nobody opted in
    for (const u of people.slice(0, 4)) await u.c.put(`/api/v1/orgs/${org.id}/aggregate`, { include: true });
    expect((await owner.c.get(`/api/v1/orgs/${org.id}/insights`)).composition.dimensions).toBeNull(); // 4 < 5
    await people[4].c.put(`/api/v1/orgs/${org.id}/aggregate`, { include: true });
    ins = await owner.c.get(`/api/v1/orgs/${org.id}/insights`);
    expect(ins.composition.counted).toBe(5);
    expect(ins.composition.dimensions.find((d: { dimension: string }) => d.dimension === 'energy')).toMatchObject({ average: 0.8, spread: 'aligned' });
    const raw = JSON.stringify(ins);
    for (const u of people) expect(raw).not.toContain(u.userId);
    expect(raw).not.toContain('chaos_diplomat');
    const [row] = await t.ctx.db.select().from(s.orgMembers).where(and(eq(s.orgMembers.orgId, org.id), eq(s.orgMembers.userId, people[0].userId)));
    expect(row.includeInAggregate).toBe(true);
  });
});
