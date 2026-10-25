import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError, type ZodType } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Please sign in to continue.') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have permission to do that.') => new AppError(403, 'forbidden', msg);
/** Used for both "missing" and "not yours" so identifiers cannot be probed. */
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found.`);
export const conflict = (msg: string, details?: unknown) => new AppError(409, 'conflict', msg, details);
export const unavailable = (msg: string) => new AppError(503, 'integration_unavailable', msg);

export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError(400, 'validation_error', 'Some fields need attention.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export function errorPayload(err: unknown): { status: number; body: { error: { code: string; message: string; details?: unknown } } } {
  if (err instanceof AppError) return { status: err.status, body: { error: { code: err.code, message: err.message, details: err.details } } };
  if (err instanceof ZodError) return { status: 400, body: { error: { code: 'validation_error', message: 'Invalid input.', details: err.issues } } };
  const fe = err as { statusCode?: number; code?: string; message?: string; validation?: unknown };
  if (fe.statusCode && fe.statusCode < 500) {
    return { status: fe.statusCode, body: { error: { code: fe.code ?? 'request_error', message: fe.message ?? 'Request error' } } };
  }
  return { status: 500, body: { error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' } } };
}

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/** Cursor = base64url(JSON [isoDate, id]) for stable keyset pagination. */
export function encodeCursor(date: Date | string, id: string): string {
  return Buffer.from(JSON.stringify([new Date(date).toISOString(), id])).toString('base64url');
}
export function decodeCursor(cursor?: string): { date: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [d, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return { date: new Date(d), id };
  } catch {
    throw badRequest('Invalid cursor');
  }
}

export function page<T extends { id: string }>(rows: T[], limit: number, dateKey: keyof T): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last[dateKey] as unknown as Date, last.id) : null };
}

export type Req = FastifyRequest;
export type Rep = FastifyReply;

export const Uuid = z.uuid();
export const IdParam = z.object({ id: z.uuid() });
