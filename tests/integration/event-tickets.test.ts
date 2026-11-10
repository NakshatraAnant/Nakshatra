import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '../../src/server/db/schema';
import { makeApp, signup, type TestApp } from './harness';

let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const key = () => `k-${crypto.randomUUID()}`;
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

describe('Paid circle event tickets', () => {
  it('going only after payment; capacity; host cancels → every ticket refunded automatically; late payments refunded', async () => {
    const owner = await signup(t, 'Ticket Host', { birth: false });
    const { circle } = await owner.c.post('/api/v1/circles', { name: 'Supper club' });
    const join = async (n: string, role = 'member') => { const u = await signup(t, n, { birth: false }); await t.ctx.db.insert(s.groupMembers).values({ groupId: circle.id, userId: u.userId, role, status: 'active' }); return u; };
    const a = await join('Ticket A');
    const b = await join('Ticket B');
    const c = await join('Ticket C');
    const mod = await join('Ticket Mod', 'moderator');

    const base = { title: 'Biryani night', startsAt: inDays(3), mode: 'in_person', location: 'My place', capacity: 2 };
    expect((await mod.c.req('POST', `/api/v1/circles/${circle.id}/events`, { ...base, ticketPricePaise: 29900 })).status).toBe(403);
    expect((await owner.c.req('POST', `/api/v1/circles/${circle.id}/events`, { ...base, ticketPricePaise: 29900, repeat: 'weekly' })).status).toBe(400);
    const { eventId } = await owner.c.post(`/api/v1/circles/${circle.id}/events`, { ...base, ticketPricePaise: 29900 }, 201);

    const list = async (u: typeof a) => (await u.c.get(`/api/v1/circles/${circle.id}/events`)).events.find((e: { id: string }) => e.id === eventId);
    expect(await list(a)).toMatchObject({ pricePaise: 29900, myTicket: null, going: 0 });
    expect((await a.c.req('POST', `/api/v1/events/${eventId}/rsvp`, { status: 'going' })).status).toBe(400); // no free RSVP
    expect((await owner.c.req('POST', `/api/v1/circles/${circle.id}/events/${eventId}/ticket`, { idempotencyKey: key() })).status).toBe(400);

    const buy = async (u: typeof a) => (await u.c.post(`/api/v1/circles/${circle.id}/events/${eventId}/ticket`, { idempotencyKey: key() })).checkout.paymentId as string;
    const pay = (u: typeof a, id: string) => u.c.post(`/api/v1/payments/dev/${id}/simulate`, { outcome: 'succeeded' });
    const pa = await buy(a);
    expect((await list(a)).myRsvp).toBeNull(); // nothing until paid
    await pay(a, pa);
    expect(await list(a)).toMatchObject({ myTicket: 'paid', myRsvp: 'going', going: 1 });
    expect((await a.c.req('POST', `/api/v1/circles/${circle.id}/events/${eventId}/ticket`, { idempotencyKey: key() })).status).toBe(409);

    // B holds the last place while paying; C can't take it.
    const pb = await buy(b);
    expect((await c.c.req('POST', `/api/v1/circles/${circle.id}/events/${eventId}/ticket`, { idempotencyKey: key() })).status).toBe(409);
    await pay(b, pb);
    expect((await list(b)).going).toBe(2);

    // Host's held share.
    const ledger = await t.ctx.db.select().from(s.creatorLedger).where(eq(s.creatorLedger.creatorId, owner.userId));
    expect(ledger.filter((l) => l.kind === 'event_ticket').map((l) => l.netPaise)).toEqual([25415, 25415]);

    // Cancel → both tickets refunded automatically, going cleared, ledger reversed.
    const r = await owner.c.post(`/api/v1/circles/${circle.id}/events/${eventId}/cancel`);
    expect(r.ticketsRefunded).toBe(2);
    const tickets = await t.ctx.db.select().from(s.eventTickets).where(eq(s.eventTickets.eventId, eventId));
    expect(tickets.map((x) => x.status).sort()).toEqual(['refunded', 'refunded']);
    const payments = await t.ctx.db.select().from(s.payments).where(eq(s.payments.purpose, 'event_ticket'));
    expect(payments.every((p) => p.status === 'refunded')).toBe(true);
    const after = await t.ctx.db.select().from(s.creatorLedger).where(eq(s.creatorLedger.creatorId, owner.userId));
    expect(after.reduce((sum, l) => sum + l.netPaise, 0)).toBe(0);
    expect(JSON.stringify(await a.c.get('/api/v1/notifications'))).toContain('Refunded: Biryani night');

    // A payment that lands after cancellation is refunded too.
    const { eventId: second } = await owner.c.post(`/api/v1/circles/${circle.id}/events`, { ...base, title: 'Dosa morning', ticketPricePaise: 9900 }, 201);
    const late = (await c.c.post(`/api/v1/circles/${circle.id}/events/${second}/ticket`, { idempotencyKey: key() })).checkout.paymentId;
    await owner.c.post(`/api/v1/circles/${circle.id}/events/${second}/cancel`);
    await pay(c, late);
    const [lt] = await t.ctx.db.select().from(s.eventTickets).where(eq(s.eventTickets.eventId, second));
    expect(lt.status).toBe('refund_due');
    const { refundDueTickets } = await import('../../src/server/services/eventTickets');
    expect(await refundDueTickets(t.ctx)).toBe(1);
    const [lt2] = await t.ctx.db.select().from(s.eventTickets).where(eq(s.eventTickets.eventId, second));
    expect(lt2.status).toBe('refunded');
    expect((await c.c.post('/api/v1/privacy/export', {})).data.eventTickets[0]).toMatchObject({ status: 'refunded' });
  });

  it('tickets can’t be bought when payments are off', async () => {
    const off = await makeApp({ PAYMENT_PROVIDER: 'none' });
    try {
      const owner = await signup(off, 'Offline Host', { birth: false });
      const fan = await signup(off, 'Offline Guest', { birth: false });
      const { circle } = await owner.c.post('/api/v1/circles', { name: 'Offline club' });
      await off.ctx.db.insert(s.groupMembers).values({ groupId: circle.id, userId: fan.userId, role: 'member', status: 'active' });
      const { eventId } = await owner.c.post(`/api/v1/circles/${circle.id}/events`, { title: 'Offline night', startsAt: inDays(2), mode: 'online', ticketPricePaise: 4900 }, 201);
      expect((await fan.c.get(`/api/v1/circles/${circle.id}/events`)).ticketsAvailable).toBe(false);
      expect((await fan.c.req('POST', `/api/v1/circles/${circle.id}/events/${eventId}/ticket`, { idempotencyKey: key() })).status).toBe(400);
    } finally { await off.close(); }
  });
});
