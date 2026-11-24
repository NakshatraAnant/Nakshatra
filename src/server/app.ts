import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
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
import { DatabaseStorage } from './lib/storage';
import { applyLaunchScope, ensureAllModuleFlags, moduleEnabled } from './services/modules';
import { renderShell } from './services/shell';
import { moduleForApiPath } from '../shared/modules';
import { recordRequest } from './services/metrics';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: Ctx;
  dbHandle: DbHandle;
}

const REDACT = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', 'body.password', '*.password', '*.token'];

/** Errors as logged. A failed query quotes its parameters (message text, emails, tokens), so those are cut off. */
export function logError(err: Error & { code?: unknown; cause?: unknown }): { type: string; message: string; stack: string; code?: string; cause?: string } {
  const cut = (v: string | undefined) => (v ?? '').replace(/\nparams:[\s\S]*?(?=\n\s+at |$)/, '\nparams: [redacted]');
  const cause = err.cause as { message?: string; code?: string } | undefined;
  return { type: err.name, message: cut(err.message), stack: cut(err.stack), code: typeof err.code === 'string' ? err.code : cause?.code, cause: cause?.message };
}

/** Request addresses as logged: one-time links (email, invite, gift tokens) and typed searches never reach the logs. */
export function logUrl(url: string): string {
  const [path, query] = url.split('?', 2);
  const safe = path.replace(/\/(c\/join|org\/join|membership\/join|weddings\/join|circle-invites|org-invites|gifts\/claim|by-token|link|rsvp|invite|family\/accept|accept)\/[A-Za-z0-9_-]{12,}/g, '/$1/[redacted]');
  if (!query) return safe;
  return `${safe}?${query.replace(/(^|&)(token|code|q|email|to)=[^&]*/gi, '$1$2=[redacted]')}`;
}

export async function buildApp(config: AppConfig, opts: { dbHandle?: DbHandle; logger?: boolean } = {}): Promise<BuiltApp> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.LOG_LEVEL, redact: { paths: REDACT, censor: '[redacted]' }, serializers: { req: (r: FastifyRequest) => ({ method: r.method, url: logUrl(r.url), remoteAddress: r.ip }), err: logError } },
    bodyLimit: 1024 * 1024,
    trustProxy: config.TRUST_PROXY > 0 ? (_addr: string, hop: number) => hop < config.TRUST_PROXY : false,
    genReqId: () => randomToken(8),
    // Keep idle keep-alive sockets open longer than common proxy/client idle timeouts (60 s), so a client never
    // reuses a socket the server is closing (which surfaces as ECONNRESET on the next request).
    keepAliveTimeout: 65_000,
  });
  const dbHandle = opts.dbHandle ?? (await openDatabase({ databaseUrl: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR, caCert: config.DATABASE_CA_CERT, poolMax: config.DATABASE_POOL_MAX, schemaName: config.DATABASE_SCHEMA }));
  await dbHandle.migrate();
  const ctx: Ctx = { db: dbHandle.db, config, log: app.log };
  await seedReferenceData(ctx);
  // Launch scope: legacy modules start switched off (once per database; admins can switch them back on).
  if (config.MODULE_SCOPE === 'launch') await applyLaunchScope(ctx.db);
  else await ensureAllModuleFlags(ctx.db);

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
    let parsed: unknown;
    try {
      parsed = JSON.parse(body as string);
    } catch {
      return done(new AppError(400, 'bad_json', 'Malformed JSON body'), undefined);
    }
    // PostgreSQL text cannot hold NUL; refuse it here rather than fail inside a query.
    if ((body as string).includes('\\u0000')) return done(new AppError(400, 'bad_json', 'Text contains characters that are not allowed.'), undefined);
    done(null, parsed);
  });

  app.decorateRequest('auth', null);
  // Request timing by route pattern (shown in Admin → Performance).
  app.addHook('onResponse', async (req, reply) => {
    recordRequest(req.routeOptions?.url ?? (req.url.startsWith('/api/') ? 'api:unmatched' : 'static'), reply.elapsedTime, reply.statusCode);
  });
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.includes('%00')) throw new AppError(400, 'bad_request', 'That address is not valid.');
    // Personal data never belongs in a browser or shared cache; routes serving cacheable files set their own header.
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
    // Double-submit CSRF: every client gets a random CSRF cookie; unsafe API calls must echo it in a header.
    let csrf = req.cookies[CSRF_COOKIE];
    if (!csrf) {
      csrf = randomToken(18);
      reply.setCookie(CSRF_COOKIE, csrf, { httpOnly: false, sameSite: 'lax', secure: config.isProd, path: '/' });
      req.cookies[CSRF_COOKIE] = csrf;
    }
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    // Server-to-server endpoints authenticate with their own signatures instead of the browser CSRF token.
    const exempt = req.url.startsWith('/api/v1/payments/webhook/') || req.url.startsWith('/api/v1/partners/postback/');
    if (unsafe && req.url.startsWith('/api/') && !exempt) {
      const header = String(req.headers['x-csrf-token'] ?? '');
      if (!header || !safeEqual(header, csrf)) throw new AppError(403, 'csrf_failed', 'Your session security token is missing or stale. Refresh the page and try again.');
    }
    // Sessions are resolved only for API calls; static files and uploads never need them.
    if (!req.url.startsWith('/api/')) return;
    req.auth = await resolveSession(ctx.db, req.cookies[SESSION_COOKIE]);
    // Server-side module enforcement: a disabled module's API does not exist for clients.
    const mod = moduleForApiPath(req.url);
    if (mod && !(await moduleEnabled(ctx.db, mod.key, req.auth?.userId ?? null))) throw new AppError(404, 'module_disabled', 'This part of Nakshatra is not available.');
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

  app.get('/api/health', async (_req, reply) => {
    const dbOk = await dbHandle.ping().catch(() => false);
    // 503 lets the host's health check see that the database is unreachable.
    if (!dbOk) reply.code(503);
    return { status: dbOk ? 'ok' : 'degraded', database: dbHandle.kind, dbOk, time: new Date().toISOString() };
  });
  app.get('/api/v1/integrations', async () => ({ integrations: integrationStatus(config), aiFeatures: 'none' }));

  await registerModules(app, ctx);

  if (config.STORAGE_DRIVER === 'database') {
    const files = new DatabaseStorage(dbHandle.db, config.DATABASE_FILE_MAX_MB * 1048576);
    app.get('/uploads/public/:name', async (req, reply) => {
      const f = await files.readPublic((req.params as { name: string }).name);
      if (!f) throw new AppError(404, 'not_found', 'File not found');
      // Names are random and never reused, so public files can be cached indefinitely.
      return reply.header('content-type', f.mime).header('cache-control', 'public, max-age=31536000, immutable').send(f.data);
    });
  } else {
    const uploadDir = resolve(config.UPLOAD_DIR, 'public');
    mkdirSync(uploadDir, { recursive: true });
    await app.register(fastifyStatic, { root: uploadDir, prefix: '/uploads/public/', decorateReply: false });
  }

  // WEB_DIST_DIR lets browser tests serve an isolated build without touching dist/web.
  const webDist = resolve(process.cwd(), process.env.WEB_DIST_DIR ?? 'dist/web');
  if (existsSync(join(webDist, 'index.html'))) {
    // index: false so every page (including /) goes through the meta-rendering fallback below.
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false, index: false, maxAge: '1h', setHeaders: (res, path) => { if (/[\\/]assets[\\/]/.test(path)) res.header('cache-control', 'public, max-age=31536000, immutable'); } });
    const shell = readFileSync(join(webDist, 'index.html'), 'utf8');
    app.setNotFoundHandler(async (req, reply) => {
      // A missing build file (an old tab after a deploy) must be a 404, not the HTML shell.
      if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/') || req.url.startsWith('/assets/')) return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
      const html = await renderShell(ctx, shell, req.url);
      return reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-cache').send(html);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } }));
  }

  return { app, ctx, dbHandle };
}
