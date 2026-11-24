import { createServer, type Server, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Client, makeApp, type TestApp } from './harness';
import * as s from '../../src/server/db/schema';
import { deliverOutbox, setMailTransport } from '../../src/server/lib/notify';

/**
 * Minimal SMTP server (RFC 5321 subset, no TLS/auth) so the real nodemailer client and the app's
 * outbox → delivery → retry logic are exercised end to end without any external service.
 */
interface Received { from: string; to: string[]; data: string }
function startSmtp(opts: { rejectFirst?: number }) {
  const received: Received[] = [];
  let toReject = opts.rejectFirst ?? 0;
  const server: Server = createServer((sock: Socket) => {
    let mail: Received = { from: '', to: [], data: '' };
    let inData = false;
    let buf = '';
    sock.write('220 test.local ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            if (toReject > 0) { toReject--; sock.write('451 4.3.0 Temporary failure, try later\r\n'); }
            else { received.push(mail); sock.write('250 2.0.0 Queued\r\n'); }
            mail = { from: '', to: [], data: '' };
          } else mail.data += line.replace(/^\.\./, '.') + '\n';
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-test.local\r\n250 8BITMIME\r\n');
        else if (cmd === 'MAIL') { mail.from = line; sock.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { mail.to.push(line); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { inData = true; sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
        else if (cmd === 'QUIT') { sock.end('221 Bye\r\n'); }
        else if (cmd === 'RSET' || cmd === 'NOOP') sock.write('250 OK\r\n');
        else sock.write('502 Not implemented\r\n');
      }
    });
  });
  return new Promise<{ port: number; received: Received[]; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, received, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

let t: TestApp;
let smtp: Awaited<ReturnType<typeof startSmtp>>;
beforeAll(async () => {
  smtp = await startSmtp({ rejectFirst: 1 });
  setMailTransport(null);
  t = await makeApp({ MAIL_TRANSPORT: 'smtp', SMTP_URL: `smtp://127.0.0.1:${smtp.port}`, MAIL_FROM: 'Nakshatra <no-reply@example.test>' });
});
afterAll(async () => { await t.close(); await smtp.close(); });

describe('SMTP delivery', () => {
  it('queues mail, retries a temporary failure and delivers it over SMTP', async () => {
    const c = new Client(t.app);
    const email = `smtp.${Date.now()}@example.test`;
    await c.post('/api/v1/auth/signup', { email, password: 'correct-horse-battery', displayName: 'Mailer', confirmAdult: true, acceptTerms: true }, 201);

    // The first attempt (right after the request, or from the scheduler) is refused with 451; the retry delivers it.
    const read = async () => (await t.ctx.db.select().from(s.emailOutbox).where(eq(s.emailOutbox.toEmail, email)))[0];
    let row = await read();
    for (let i = 0; i < 40 && row.status !== 'sent'; i++) {
      await new Promise((r) => setTimeout(r, 100));
      await deliverOutbox(t.ctx);
      row = await read();
    }
    expect(row.status).toBe('sent');
    expect(row.attempts).toBe(2);
    expect(row.sentAt).not.toBeNull();
    const msg = smtp.received.find((m) => m.to.some((r) => r.includes(email)))!;
    expect(msg.from).toContain('no-reply@example.test');
    expect(msg.data).toMatch(/Subject: .*verify/i);
    // Body is quoted-printable: drop soft line breaks and decode "=3D".
    const decoded = msg.data.replace(/=\n/g, '').replace(/=3D/g, '=');
    expect(decoded).toContain('/verify-email?token=');
  });

  it('gives up after three failed attempts and keeps the error for operators', async () => {
    await t.ctx.db.insert(s.emailOutbox).values({ toEmail: 'nobody@example.test', subject: 'x', textBody: 'y', transport: 'smtp', status: 'failed', attempts: 3, error: 'previous failure' });
    await deliverOutbox(t.ctx);
    const [row] = await t.ctx.db.select().from(s.emailOutbox).where(eq(s.emailOutbox.toEmail, 'nobody@example.test'));
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(3);
  });
});
