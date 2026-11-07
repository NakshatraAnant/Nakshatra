import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../../src/server/db/schema';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Circle market', () => {
  it('listing → interest → seller accepts one → private thread; circle-only; blocks; prohibited items; moderators remove', async () => {
    const seller = await signup(t, 'Market Seller', { birth: false });
    const { circle } = await seller.c.post('/api/v1/circles', { name: 'Hostel market' });
    const join = async (n: string) => { const u = await signup(t, n, { birth: false }); await t.ctx.db.insert(s.groupMembers).values({ groupId: circle.id, userId: u.userId, role: 'member', status: 'active' }); return u; };
    const buyer = await join('Market Buyer');
    const second = await join('Market Second');
    const outsider = await signup(t, 'Market Outsider', { birth: false });
    const base = `/api/v1/circles/${circle.id}/listings`;

    expect((await seller.c.req('POST', base, { kind: 'sell', title: 'Desk lamp' })).status).toBe(400); // price needed
    expect((await seller.c.req('POST', base, { kind: 'sell', title: 'Leftover beer', pricePaise: 10000 })).status).toBe(400);
    expect((await outsider.c.req('POST', base, { kind: 'free', title: 'Old chair' })).status).toBe(404);
    const { listing } = await seller.c.post(base, { kind: 'sell', title: 'Desk lamp', description: 'Warm light, works', pricePaise: 45000, condition: 'good' }, 201);
    await seller.c.post(base, { kind: 'free', title: 'Box of novels', pricePaise: 999 }, 201);

    const list = await buyer.c.get(base);
    expect(list.listings.map((l: { title: string }) => l.title)).toEqual(['Box of novels', 'Desk lamp']);
    expect(list.listings.find((l: { title: string }) => l.title === 'Box of novels').pricePaise).toBeNull(); // free means free
    expect(list.safety.length).toBeGreaterThan(2);
    expect((await outsider.c.req('GET', base)).status).toBe(404);
    expect((await outsider.c.req('GET', `${base}/${listing.id}`)).status).toBe(404);

    await buyer.c.post(`${base}/${listing.id}/interest`, { note: 'Can I pick it up tomorrow?' });
    await second.c.post(`${base}/${listing.id}/interest`, { note: 'Interested!' });
    expect((await seller.c.req('POST', `${base}/${listing.id}/interest`, {})).status).toBe(400);
    const sv = await seller.c.get(`${base}/${listing.id}`);
    expect(sv.interests.map((i: { name: string; note: string }) => `${i.name}:${i.note}`)).toEqual(['Market Buyer:Can I pick it up tomorrow?', 'Market Second:Interested!']);
    const bv = await buyer.c.get(`${base}/${listing.id}`);
    expect(bv.interests).toBeNull(); // only the seller sees who's interested
    expect(bv.myInterest).toMatchObject({ status: 'pending' });
    expect((await buyer.c.req('POST', `${base}/${listing.id}/messages`, { body: 'Hi!' })).status).toBe(403); // not accepted yet

    await seller.c.post(`${base}/${listing.id}/interests/${buyer.userId}`, { decision: 'accept' });
    expect((await seller.c.req('POST', `${base}/${listing.id}/interests/${second.userId}`, { decision: 'accept' })).status).toBe(409);
    expect(JSON.stringify(await buyer.c.get('/api/v1/notifications'))).toContain('was accepted');
    await buyer.c.post(`${base}/${listing.id}/messages`, { body: 'Great — 5 pm at the hostel gate?' });
    await seller.c.post(`${base}/${listing.id}/messages`, { body: 'Done, see you then.' });
    expect((await second.c.req('POST', `${base}/${listing.id}/messages`, { body: 'me?' })).status).toBe(403);
    const thread = (await buyer.c.get(`${base}/${listing.id}`)).thread;
    expect(thread.messages.map((m: { body: string; mine: boolean }) => `${m.mine}:${m.body}`)).toEqual(['true:Great — 5 pm at the hostel gate?', 'false:Done, see you then.']);
    expect((await second.c.get(`${base}/${listing.id}`)).thread).toBeNull();
    expect((await buyer.c.get(base)).listings.find((l: { id: string }) => l.id === listing.id).status).toBe('reserved');

    await seller.c.patch(`${base}/${listing.id}`, { status: 'closed' });
    expect((await second.c.get(base)).listings.map((l: { id: string }) => l.id)).not.toContain(listing.id);

    // Blocks hide listings both ways; circle moderators can remove anything.
    const another = (await seller.c.post(base, { kind: 'swap', title: 'Chess set' }, 201)).listing;
    await second.c.post(`/api/v1/blocks/${seller.userId}`);
    expect((await second.c.req('GET', `${base}/${another.id}`)).status).toBe(404);
    expect((await buyer.c.req('POST', `${base}/${another.id}/remove`, {})).status).toBe(403);
    const spam = (await buyer.c.post(base, { kind: 'sell', title: 'Totally real phone', pricePaise: 100 }, 201)).listing;
    expect((await second.c.req('POST', '/api/v1/reports', { targetType: 'listing', targetId: spam.id, reason: 'scam' })).status).toBe(200);
    await seller.c.post(`${base}/${spam.id}/remove`, { reason: 'Looks like a scam' }); // seller is circle owner
    expect((await second.c.get(base)).listings.map((l: { id: string }) => l.id)).not.toContain(spam.id);
    expect(JSON.stringify(await buyer.c.get('/api/v1/notifications'))).toContain('A moderator removed your listing');
  });
});
