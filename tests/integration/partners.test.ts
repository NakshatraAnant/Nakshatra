import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { hmac } from '../../src/server/lib/crypto';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

describe('Partner perks', () => {
  it('disclosed perks; follow gives an opaque ref and reveals the code; signed, idempotent, attributed postbacks; staff approve commission', async () => {
    const staff = await signup(t, 'Partner Staff', { birth: false });
    const member = await signup(t, 'Perk Member', { birth: false });
    await makeAdmin(t, staff.userId);
    expect((await member.c.req('POST', '/api/v1/admin/partners', { name: 'Nope', website: 'https://x.example.com' })).status).toBe(403);
    const { partner, postbackSecret } = await staff.c.post('/api/v1/admin/partners', { name: 'Chai Co', website: 'https://chai.example.com', terms: '8% of order value' }, 201);
    expect(JSON.stringify(await staff.c.get('/api/v1/admin/partners'))).not.toContain(postbackSecret); // shown once only

    expect((await staff.c.req('POST', '/api/v1/admin/partners/offers', { partnerId: partner.id, title: 'Chai for Scorpios', category: 'food', url: 'https://chai.example.com/s', startsAt: inDays(-1), endsAt: inDays(10) })).status).toBe(400);
    const { offer } = await staff.c.post('/api/v1/admin/partners/offers', { partnerId: partner.id, title: '20% off masala chai', category: 'food', url: 'https://chai.example.com/sale?utm_source=nk', code: 'NAKSHATRA20', startsAt: inDays(-1), endsAt: inDays(10) }, 201);
    expect((await member.c.get('/api/v1/perks')).perks.map((p: { id: string }) => p.id)).not.toContain(offer.id); // still a draft
    await staff.c.post(`/api/v1/admin/partners/offers/${offer.id}/status`, { status: 'live' });

    const list = await member.c.get('/api/v1/perks');
    expect(list.disclosure).toMatch(/may earn a commission/);
    expect(list.perks.find((p: { id: string }) => p.id === offer.id)).toMatchObject({ partner: 'Chai Co', hasCode: true, code: null });
    const go = await member.c.post(`/api/v1/perks/${offer.id}/go`);
    expect(go.code).toBe('NAKSHATRA20');
    const url = new URL(go.url);
    const ref = url.searchParams.get('subid')!;
    expect(url.searchParams.get('utm_source')).toBe('nk');
    expect(go.url).not.toContain(member.userId);
    expect((await member.c.get('/api/v1/perks')).perks.find((p: { id: string }) => p.id === offer.id).code).toBe('NAKSHATRA20');

    const send = (body: object, secret = postbackSecret) => {
      const raw = JSON.stringify(body);
      return t.app.inject({ method: 'POST', url: `/api/v1/partners/postback/${partner.id}`, payload: raw, headers: { 'content-type': 'application/json', 'x-nakshatra-signature': hmac(secret, raw) } });
    };
    expect((await send({ externalId: 'ord-1', clickRef: ref, orderPaise: 50000, commissionPaise: 4000 }, 'wrong-secret')).statusCode).toBe(401);
    const ok = await send({ externalId: 'ord-1', clickRef: ref, orderPaise: 50000, commissionPaise: 4000, status: 'approved' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ attributed: true });
    expect((await send({ externalId: 'ord-1', clickRef: ref, orderPaise: 50000, commissionPaise: 4000 })).json()).toMatchObject({ duplicate: true });
    const [conv] = await t.ctx.db.select().from(s.affiliateConversions).where(eq(s.affiliateConversions.externalId, 'ord-1'));
    expect(conv.status).toBe('pending'); // partners can't self-approve

    const admin = await staff.c.get('/api/v1/admin/partners');
    expect(admin.offers.find((o: { id: string }) => o.id === offer.id)).toMatchObject({ clicks: 1, people: 1 });
    await staff.c.post(`/api/v1/admin/partners/conversions/${conv.id}`, { decision: 'approved' });
    await send({ externalId: 'ord-1', orderPaise: 50000, commissionPaise: 4000, status: 'reversed' });
    const [after] = await t.ctx.db.select().from(s.affiliateConversions).where(eq(s.affiliateConversions.id, conv.id));
    expect(after.status).toBe('reversed');

    await staff.c.post(`/api/v1/admin/partners/${partner.id}/status`, { status: 'paused' });
    expect((await member.c.get('/api/v1/perks')).perks).toEqual([]);
    expect((await member.c.req('POST', `/api/v1/perks/${offer.id}/go`)).status).toBe(404);
  });
});
