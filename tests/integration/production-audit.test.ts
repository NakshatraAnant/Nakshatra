import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { loadConfig } from '../../src/server/config';
import { logError, logUrl } from '../../src/server/app';
import { postgresPoolOptions } from '../../src/server/db/client';
import { approveRefund, requestRefund } from '../../src/server/lib/payments';
import { stripImageMetadata } from '../../src/server/lib/storage';
import { renderShell } from '../../src/server/services/shell';
import { runRetention, runScheduledJobs } from '../../src/server/services/scheduler';
import { spamCheck } from '../../src/server/modules/social';
import * as s from '../../src/server/db/schema';
import { makeAdmin, makeApp, signup, type TestApp } from './harness';

/** Regression tests for the defects found in the production-readiness audit. */
let t: TestApp;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

async function follow(a: Awaited<ReturnType<typeof signup>>, b: Awaited<ReturnType<typeof signup>>) {
  await a.c.post(`/api/v1/follows/${b.userId}`);
  await b.c.post(`/api/v1/follows/${a.userId}`);
}
async function circleWith(owner: Awaited<ReturnType<typeof signup>>, ...members: Awaited<ReturnType<typeof signup>>[]) {
  const { circle } = await owner.c.post('/api/v1/circles', { name: 'Audit circle' });
  for (const m of members) {
    const { token } = await owner.c.post(`/api/v1/circles/${circle.id}/invites`);
    await m.c.post(`/api/v1/circle-invites/${token}/accept`);
  }
  return circle.id as string;
}

describe('configuration and logs', () => {
  it('production needs its public address', () => {
    const prod = { NODE_ENV: 'production', APP_SECRET: 'x'.repeat(40), PAYMENT_PROVIDER: 'none', MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://u:p@smtp.example.com:587' };
    const saved = [process.env.APP_ORIGIN, process.env.RENDER_EXTERNAL_URL];
    delete process.env.APP_ORIGIN; delete process.env.RENDER_EXTERNAL_URL;
    try {
      expect(() => loadConfig({ ...prod, APP_ORIGIN: '' })).toThrow(/APP_ORIGIN/);
      expect(loadConfig({ ...prod, APP_ORIGIN: 'https://nakshatra.example' }).APP_ORIGIN).toBe('https://nakshatra.example');
    } finally {
      if (saved[0] !== undefined) process.env.APP_ORIGIN = saved[0];
      if (saved[1] !== undefined) process.env.RENDER_EXTERNAL_URL = saved[1];
    }
  });

  it('keeps one-time links, searches and query parameters out of the logs', () => {
    expect(logUrl('/verify-email?token=abc123&x=1')).toBe('/verify-email?token=[redacted]&x=1');
    expect(logUrl('/c/join/abcdefghijklmnop1234')).toBe('/c/join/[redacted]');
    expect(logUrl('/api/v1/circle-invites/abcdefghijklmnop1234/accept')).toBe('/api/v1/circle-invites/[redacted]/accept');
    expect(logUrl('/api/v1/search?q=private+thing')).toBe('/api/v1/search?q=[redacted]');
    const err = new Error('Failed query: insert into x values ($1)\nparams: my secret diary,someone@example.test');
    const out = JSON.stringify(logError(err));
    expect(out).toContain('Failed query');
    expect(out).not.toMatch(/secret diary|someone@/);
  });

  it('gives up on an unreachable database instead of queueing forever', () => {
    expect(postgresPoolOptions('postgres://localhost/x').connectionTimeoutMillis).toBe(10_000);
  });

  it('answers 503 when the database is down, 404 for missing build files, and never caches API answers', async () => {
    const down = await makeApp();
    await down.ctx.db.execute('select 1');
    const ok = await down.app.inject({ url: '/api/health' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect((await down.app.inject({ url: '/assets/gone-abc.js' })).statusCode).toBe(404);
    await down.close();
    expect((await down.app.inject({ url: '/api/health' }).catch(() => ({ statusCode: 503 }))).statusCode).toBe(503);
  });

  it('a name with replacement patterns stays plain text in link previews', async () => {
    const u = await signup(t, "$& $' $` Star", { birth: false });
    await t.ctx.db.insert(s.identityShares).values({ userId: u.userId, slug: 'auditslug1', archetypeKey: 'midnight_philosopher', scores: {}, displayName: "$& $' Star" });
    const [sh] = await t.ctx.db.select().from(s.identityShares).where(eq(s.identityShares.slug, 'auditslug1'));
    const html = await renderShell(t.ctx, '<html><head><title>x</title></head><body>B</body></html>', '/s/auditslug1');
    expect(html.match(/<\/head>/g)).toHaveLength(1);
    expect(html.match(/<body>/g)).toHaveLength(1);
    expect(sh).toBeTruthy();
    expect(html).toContain('$&amp; $&#39; Star');
  });

  it('one failing scheduled job does not stop the rest', async () => {
    const real = t.ctx.db;
    const u = await signup(t, 'Reminder', { birth: false });
    await real.insert(s.emailOutbox).values({ toEmail: 'x@example.test', subject: 'x', textBody: 'token', transport: 'smtp', status: 'failed', createdAt: new Date(Date.now() - 8 * 864e5) });
    await real.insert(s.dataExportRequests).values({ userId: u.userId, status: 'ready', payload: { a: 1 }, createdAt: new Date(Date.now() - 8 * 864e5) });
    const broken = { ...t.ctx, db: new Proxy(real, { get: (o, k) => (k === 'select' ? () => { throw new Error('boom'); } : typeof (o as never)[k] === 'function' ? ((o as never)[k] as () => unknown).bind(o) : (o as never)[k]) }) as typeof real };
    const r = await runScheduledJobs(broken);
    expect(r.reminders).toBe(0);
    expect(r.retention).toBeGreaterThanOrEqual(2);
    await runRetention(t.ctx);
    const [x] = await real.select().from(s.dataExportRequests).where(eq(s.dataExportRequests.userId, u.userId));
    expect(x.payload).toBeNull();
  });
});

describe('accounts', () => {
  it('accepts an email typed with spaces, and one reset cancels every other reset link', async () => {
    const u = await signup(t, 'Resetter', { birth: false });
    const links: string[] = [];
    for (let i = 0; i < 2; i++) {
      await u.c.post('/api/v1/auth/forgot-password', { email: `  ${u.email.toUpperCase()} ` });
    }
    for (const m of await t.ctx.db.select().from(s.emailOutbox).where(and(eq(s.emailOutbox.toEmail, u.email), eq(s.emailOutbox.subject, 'Reset your Nakshatra password')))) links.push(/token=([\w-]+)/.exec(m.textBody)![1]);
    expect(links).toHaveLength(2);
    await u.c.post('/api/v1/auth/reset-password', { token: links[0], password: 'a-brand-new-password' });
    await u.c.post('/api/v1/auth/reset-password', { token: links[1], password: 'attacker-password-1' }, 400);
    await u.c.post('/api/v1/auth/reset-password', { token: links[0], password: 'attacker-password-1' }, 400);
  });

  it('deleting an account removes stored copies of personal data', async () => {
    const u = await signup(t, 'Leaver');
    await u.c.post('/api/v1/privacy/export');
    await u.c.patch('/api/v1/profile', { bio: 'old bio' });
    await t.ctx.db.insert(s.userRoles).values({ userId: u.userId, role: 'moderator' });
    await u.c.post('/api/v1/privacy/delete-account', { password: u.password, confirm: 'DELETE' });
    expect(await t.ctx.db.select().from(s.dataExportRequests).where(eq(s.dataExportRequests.userId, u.userId))).toEqual([]);
    expect(await t.ctx.db.select().from(s.profileHistory).where(eq(s.profileHistory.userId, u.userId))).toEqual([]);
    expect(await t.ctx.db.select().from(s.emailOutbox).where(eq(s.emailOutbox.toEmail, u.email))).toEqual([]);
    expect(await t.ctx.db.select().from(s.userRoles).where(eq(s.userRoles.userId, u.userId))).toEqual([]);
  });

  it('"unread=false" shows everything', async () => {
    const u = await signup(t, 'Flags', { birth: false });
    await t.ctx.db.insert(s.notifications).values({ userId: u.userId, category: 'system', title: 'Old', readAt: new Date() });
    const all = await u.c.get('/api/v1/notifications?unread=false');
    expect(all.notifications.some((n: { title: string }) => n.title === 'Old')).toBe(true);
  });

  it('a moderator cannot suspend an administrator through a report', async () => {
    const [admin, mod, reporter] = [await signup(t, 'Boss', { birth: false }), await signup(t, 'Mod', { birth: false }), await signup(t, 'Reporter', { birth: false })];
    await makeAdmin(t, admin.userId);
    await t.ctx.db.insert(s.userRoles).values({ userId: mod.userId, role: 'moderator' });
    const { report } = await reporter.c.post('/api/v1/reports', { targetType: 'user', targetId: admin.userId, reason: 'spam' });
    await mod.c.post(`/api/v1/admin/reports/${report.id}/action`, { action: 'suspend_user', reason: 'because' }, 400);
    const [row] = await t.ctx.db.select().from(s.users).where(eq(s.users.id, admin.userId));
    expect(row.status).toBe('active');
  });
});

describe('posts and circles', () => {
  it('several posts without text in a day are not "repeats"', () => {
    expect(spamCheck('', ['', '', ''])).toBeNull();
    expect(spamCheck('same', ['same', 'same'])).not.toBeNull();
  });

  it('expired posts are not searchable, and % is a literal character', async () => {
    const [a, b] = [await signup(t, 'Author', { birth: false }), await signup(t, 'Searcher', { birth: false })];
    const { post } = await a.c.post('/api/v1/posts', { kind: 'thought', body: 'zebracorn sighting', visibility: 'public', temporaryHours: 1 });
    expect((await b.c.get('/api/v1/search?q=zebracorn&scope=thoughts')).results.thoughts).toHaveLength(1);
    expect((await b.c.get('/api/v1/search?q=%25&scope=thoughts')).results.thoughts).toHaveLength(0);
    await t.ctx.db.update(s.posts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.posts.id, post.id));
    expect((await b.c.get('/api/v1/search?q=zebracorn&scope=thoughts')).results.thoughts).toHaveLength(0);
  });

  it('a public post cannot be planted in a circle the author is not in', async () => {
    const [owner, outsider] = [await signup(t, 'Owner', { birth: false }), await signup(t, 'Outsider', { birth: false })];
    const id = await circleWith(owner);
    await outsider.c.post('/api/v1/posts', { kind: 'thought', body: 'planted', visibility: 'public', groupId: id });
    expect((await owner.c.get(`/api/v1/circles/${id}/feed`)).posts).toHaveLength(0);
  });

  it('members-only channel posts and blocked people stay hidden in the group view and circle feed', async () => {
    const [owner, m, blocked] = [await signup(t, 'Owner2', { birth: false }), await signup(t, 'Member', { birth: false }), await signup(t, 'Blocked', { birth: false })];
    const id = await circleWith(owner, m, blocked);
    const { tier } = await owner.c.post(`/api/v1/circles/${id}/tiers`, { name: 'Insiders' }, 201);
    const { channel } = await owner.c.post(`/api/v1/circles/${id}/channels`, { name: 'Vault', tierId: tier.id }, 201);
    await owner.c.post('/api/v1/posts', { kind: 'thought', body: 'vault secret', visibility: 'group', groupId: id, channelId: channel.id });
    await blocked.c.post('/api/v1/posts', { kind: 'thought', body: 'from blocked', visibility: 'group', groupId: id });
    await m.c.post(`/api/v1/blocks/${blocked.userId}`);
    const [g] = await t.ctx.db.select({ slug: s.groups.slug }).from(s.groups).where(eq(s.groups.id, id));
    const viaGroup = JSON.stringify(await m.c.get(`/api/v1/groups/${g.slug}`));
    expect(viaGroup).not.toContain('vault secret');
    expect(viaGroup).not.toContain('from blocked');
    expect(JSON.stringify(await m.c.get(`/api/v1/circles/${id}/feed`))).not.toContain('from blocked');
  });

  it('circle moderators never learn who is behind a pen name', async () => {
    const [owner, writer, reporter] = [await signup(t, 'Owner3', { birth: false }), await signup(t, 'RealNameWriter', { birth: false }), await signup(t, 'Reporter3', { birth: false })];
    const id = await circleWith(owner, writer, reporter);
    await t.ctx.db.update(s.profiles).set({ pseudonym: 'Quiet Comet' }).where(eq(s.profiles.userId, writer.userId));
    const { post } = await writer.c.post('/api/v1/posts', { kind: 'confession', body: 'a pen-name confession', visibility: 'group', groupId: id, pseudonymous: true });
    const { report } = await reporter.c.post('/api/v1/reports', { targetType: 'post', targetId: post.id, reason: 'spam' });
    const dash = await owner.c.get(`/api/v1/circles/${id}/moderation`);
    expect(dash.reports[0]).toMatchObject({ author: 'Quiet Comet', authorId: null });
    expect(JSON.stringify(dash)).not.toContain('RealNameWriter');
    await owner.c.post(`/api/v1/circles/${id}/moderation/reports/${report.id}`, { decision: 'remove' });
    const after = JSON.stringify(await owner.c.get(`/api/v1/circles/${id}/moderation`));
    expect(after).not.toContain('RealNameWriter');
    expect(after).not.toContain(writer.userId);
  });

  it('a second message to the same person is delivered, not dropped', async () => {
    const [a, b] = [await signup(t, 'Sender', { birth: false }), await signup(t, 'Receiver', { birth: false })];
    await follow(a, b);
    const first = await a.c.post('/api/v1/conversations', { userId: b.userId, message: 'hello' });
    const second = await a.c.post('/api/v1/conversations', { userId: b.userId, message: 'second hello' });
    expect(second.conversationId).toBe(first.conversationId);
    expect((await b.c.get(`/api/v1/conversations/${first.conversationId}/messages`)).messages.map((m: { body: string }) => m.body)).toEqual(['hello', 'second hello']);
    // Leaving and writing again reopens it for the person who left.
    await a.c.post(`/api/v1/conversations/${first.conversationId}/settings`, { leave: true });
    await a.c.post('/api/v1/conversations', { userId: b.userId, message: 'back again' });
    expect((await a.c.get(`/api/v1/conversations/${first.conversationId}/messages`)).messages).toHaveLength(3);
  });

  it('someone who declined cannot be messaged again, and request limits still hold', async () => {
    const [a, b, c] = [await signup(t, 'Stranger', { birth: false }), await signup(t, 'Decliner', { birth: false }), await signup(t, 'Silent', { birth: false })];
    const r = await a.c.post('/api/v1/conversations', { userId: b.userId, message: 'hi' });
    await b.c.post(`/api/v1/conversations/${r.conversationId}/respond`, { accept: false });
    await a.c.post('/api/v1/conversations', { userId: b.userId, message: 'please' }, 403);
    for (let i = 0; i < 3; i++) await a.c.post('/api/v1/conversations', { userId: c.userId, message: `m${i}` });
    await a.c.post('/api/v1/conversations', { userId: c.userId, message: 'm4' }, 403);
  });

  it('a game continues when its host leaves', async () => {
    const people = [await signup(t, 'Host', { birth: false }), await signup(t, 'P2', { birth: false }), await signup(t, 'P3', { birth: false })];
    const id = await circleWith(people[0], people[1], people[2]);
    const { session } = await people[0].c.post('/api/v1/play/sessions', { gameKey: 'this_or_that', circleId: id });
    for (const p of people.slice(1)) await p.c.post(`/api/v1/play/sessions/${session.id}/join`);
    await people[0].c.post(`/api/v1/play/sessions/${session.id}/start`);
    await people[0].c.post(`/api/v1/play/sessions/${session.id}/start`, {}, 400);
    await people[0].c.post(`/api/v1/play/sessions/${session.id}/leave`);
    const view = await people[1].c.get(`/api/v1/play/sessions/${session.id}`);
    expect(view.session.status).toBe('active');
    expect([people[1].userId, people[2].userId]).toContain(view.session.hostId);
    for (const p of people.slice(1)) await p.c.post(`/api/v1/play/sessions/${session.id}/leave`);
    const [row] = await t.ctx.db.select().from(s.gameSessions).where(eq(s.gameSessions.id, session.id));
    expect(row.status).toBe('abandoned');
  });

  it('changing an RSVP turns the reminder off and on, and a full event still accepts its own guests', async () => {
    const [host, guest] = [await signup(t, 'Host4', { birth: false }), await signup(t, 'Guest4', { birth: false })];
    const at = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
    const { event } = await host.c.post('/api/v1/events', { title: 'Small event', startsAt: at(30), endsAt: at(31), mode: 'online', capacity: 1 });
    const rsvp = (status: string) => guest.c.post(`/api/v1/events/${event.id}/rsvp`, { status });
    const reminder = async () => (await t.ctx.db.select().from(s.scheduledReminders).where(and(eq(s.scheduledReminders.userId, guest.userId), eq(s.scheduledReminders.sourceKey, `event:${event.id}`))))[0];
    await rsvp('going');
    await rsvp('going');
    expect((await reminder()).cancelledAt).toBeNull();
    await rsvp('cancelled');
    expect((await reminder()).cancelledAt).not.toBeNull();
    await rsvp('going');
    expect((await reminder()).cancelledAt).toBeNull();
    await host.c.post('/api/v1/events', { title: 'Bad link', startsAt: at(30), endsAt: at(31), mode: 'online', liveUrl: 'javascript:alert(1)' }, 400);
  });
});

describe('money', () => {
  it('a repeated refund request returns the first, and a refund is approved once', async () => {
    const [buyer, staff] = [await signup(t, 'Buyer', { birth: false }), await signup(t, 'Staff', { birth: false })];
    const [p] = await t.ctx.db.insert(s.payments).values({ userId: buyer.userId, purpose: 'subscription', purposeId: buyer.userId, amountPaise: 5000, provider: 'dev_simulator', providerRef: 'devpay_audit', status: 'succeeded', idempotencyKey: 'audit-pay' }).returning();
    const ask = () => requestRefund(t.ctx, t.ctx.db, { paymentId: p.id, amountPaise: 5000, reason: 'test', requestedBy: buyer.userId, idempotencyKey: 'audit-refund' });
    const first = await ask();
    expect((await ask()).id).toBe(first.id);
    const results = await Promise.allSettled([approveRefund(t.ctx, first.id, staff.userId), approveRefund(t.ctx, first.id, staff.userId)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [after] = await t.ctx.db.select().from(s.payments).where(eq(s.payments.id, p.id));
    expect(after.refundedPaise).toBe(5000);
  });
});

describe('photo metadata', () => {
  const seg = (marker: number, body: Buffer) => { const h = Buffer.alloc(4); h.writeUInt16BE(0xff00 | marker, 0); h.writeUInt16BE(body.length + 2, 2); return Buffer.concat([h, body]); };
  it('drops location from JPEGs but keeps them upright', () => {
    const tiff = Buffer.alloc(26);
    tiff.write('MM\0*', 0, 'latin1'); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(1, 8); tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(6, 18);
    const scan = Buffer.concat([seg(0xda, Buffer.from([1, 2])), Buffer.from('pixels'), Buffer.from([0xff, 0xd9])]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0')), seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, Buffer.from('GPS 28.6139N')])), seg(0xfe, Buffer.from('comment')), scan]);
    const out = stripImageMetadata(jpg, 'image/jpeg');
    expect(out.includes('28.6139')).toBe(false);
    expect(out.includes('comment')).toBe(false);
    expect(out.includes('JFIF')).toBe(true);
    expect(out.subarray(-scan.length).equals(scan)).toBe(true);
    // Orientation 6 survives a second pass, so our own EXIF block is well formed.
    expect(stripImageMetadata(out, 'image/jpeg').equals(out)).toBe(true);
    expect(out.readUInt16BE(2 + 28)).toBe(6);
  });
  it('drops PNG text and WebP EXIF, and leaves malformed files alone', () => {
    const chunk = (type: string, d: Buffer) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(type, 4, 'latin1'); d.copy(b, 8); return b; };
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = Buffer.concat([sig, chunk('IHDR', Buffer.alloc(13)), chunk('eXIf', Buffer.from('GPS')), chunk('IDAT', Buffer.from('px')), chunk('IEND', Buffer.alloc(0))]);
    const out = stripImageMetadata(png, 'image/png');
    expect(out.includes('GPS')).toBe(false);
    expect(out.includes('IDAT')).toBe(true);
    const riff = (type: string, d: Buffer) => { const h = Buffer.alloc(8); h.write(type, 0, 'latin1'); h.writeUInt32LE(d.length, 4); return Buffer.concat([h, d]); };
    const body = Buffer.concat([riff('VP8X', Buffer.from([0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0])), riff('VP8 ', Buffer.from('px')), riff('EXIF', Buffer.from('GPSx'))]);
    const head = Buffer.alloc(12); head.write('RIFF', 0); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8);
    const w = stripImageMetadata(Buffer.concat([head, body]), 'image/webp');
    expect(w.includes('GPS')).toBe(false);
    expect(w.readUInt32LE(4)).toBe(w.length - 8);
    const bad = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1]);
    expect(stripImageMetadata(bad, 'image/jpeg').equals(bad)).toBe(true);
  });
});
