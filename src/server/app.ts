import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { appendFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { AppConfig } from './config';
import { integrationStatus } from './config';
import { openDatabase, type DbHandle } from './db/client';
import type { Ctx } from './lib/context';
import { CSRF_COOKIE, SESSION_COOKIE, resolveSession } from './lib/auth';
import { randomToken, safeEqual } from './lib/crypto';
import { AppError, errorPayload } from './lib/http';
import { registerModules } from './modules';
import { seedReferenceData } from './db/seed';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: Ctx;
  dbHandle: DbHandle;
}

const REDACT = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', 'body.password', '*.password', '*.token'];

export async function buildApp(config: AppConfig, opts: { dbHandle?: DbHandle; logger?: boolean } = {}): Promise<BuiltApp> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.LOG_LEVEL, redact: { paths: REDACT, censor: '[redacted]' } },
    bodyLimit: 1024 * 1024,
    trustProxy: config.TRUST_PROXY > 0 ? (_addr: string, hop: number) => hop < config.TRUST_PROXY : false,
    genReqId: () => randomToken(8),
    // Keep idle keep-alive sockets open longer than common proxy/client idle timeouts (60 s), so a client never
    // reuses a socket the server is closing (which surfaces as ECONNRESET on the next request).
    keepAliveTimeout: 65_000,
  });
  const dbHandle = opts.dbHandle ?? (await openDatabase({ databaseUrl: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR, caCert: config.DATABASE_CA_CERT, poolMax: config.DATABASE_POOL_MAX }));
  await dbHandle.migrate();
  const ctx: Ctx = { db: dbHandle.db, config, log: app.log };
  await seedReferenceData(ctx);

  await app.register(cookie);
  // Razorpay Checkout loads its script and iframe from razorpay.com; allowed only when that provider is configured.
  const rzp = config.PAYMENT_PROVIDER === 'razorpay';
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...(rzp ? ['https://checkout.razorpay.com'] : [])],
        frameSrc: rzp ? ['https://api.razorpay.com', 'https://checkout.razorpay.com'] : ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", ...(rzp ? ['https://*.razorpay.com'] : [])],
        mediaSrc: ["'self'", 'blob:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', allowList: config.NODE_ENV === 'test' ? () => true : undefined });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1048576, files: 1 } });

  // Raw body for webhook signature verification.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new AppError(400, 'bad_json', 'Malformed JSON body'), undefined);
    }
  });

  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req, reply) => {
    // Double-submit CSRF: every client gets a random CSRF cookie; unsafe API calls must echo it in a header.
    let csrf = req.cookies[CSRF_COOKIE];
    if (!csrf) {
      csrf = randomToken(18);
      reply.setCookie(CSRF_COOKIE, csrf, { httpOnly: false, sameSite: 'lax', secure: config.isProd, path: '/' });
      req.cookies[CSRF_COOKIE] = csrf;
    }
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const exempt = req.url.startsWith('/api/v1/payments/webhook/');
    if (unsafe && req.url.startsWith('/api/') && !exempt) {
      const header = String(req.headers['x-csrf-token'] ?? '');
      if (!header || !safeEqual(header, csrf)) throw new AppError(403, 'csrf_failed', 'Your session security token is missing or stale. Refresh the page and try again.');
    }
    req.auth = await resolveSession(ctx.db, req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err, req, reply) => {
    const { status, body } = errorPayload(err);
    if (status >= 500) {
      req.log.error({ err }, 'unhandled error');
      // Tests run with logging silenced; keep unexpected failures inspectable.
      if (config.NODE_ENV === 'test') appendFileSync(resolve('.data/test-errors.log'), `${(err as Error).stack}\n`);
    } else req.log.info({ code: body.error.code, status }, 'request rejected');
    reply.code(status).send(body);
  });

  app.get('/api/health', async () => {
    const dbOk = await dbHandle.ping().catch(() => false);
    return { status: dbOk ? 'ok' : 'degraded', database: dbHandle.kind, dbOk, time: new Date().toISOString() };
  });
  app.get('/api/v1/integrations', async () => ({ integrations: integrationStatus(config), aiFeatures: 'none' }));

  await registerModules(app, ctx);

  const uploadDir = resolve(config.UPLOAD_DIR, 'public');
  mkdirSync(uploadDir, { recursive: true });
  await app.register(fastifyStatic, { root: uploadDir, prefix: '/uploads/public/', decorateReply: false });

  const webDist = resolve(process.cwd(), 'dist/web');
  if (existsSync(join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return reply.sendFile('index.html', webDist);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } }));
  }

  return { app, ctx, dbHandle };
}
