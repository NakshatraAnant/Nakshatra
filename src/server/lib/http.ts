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

const DB_INPUT_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '23503': { status: 404, code: 'not_found', message: 'That no longer exists.' },
  '23505': { status: 409, code: 'conflict', message: 'That was already done. Refresh and try again.' },
  '40001': { status: 409, code: 'conflict', message: 'Someone else changed this at the same moment. Please try again.' },
  '40P01': { status: 409, code: 'conflict', message: 'Someone else changed this at the same moment. Please try again.' },
  '22P02': { status: 400, code: 'bad_request', message: 'Some of the information sent is not valid.' },
  '22021': { status: 400, code: 'bad_request', message: 'Some of the information sent is not valid.' },
  '22003': { status: 400, code: 'bad_request', message: 'A number is out of range.' },
  '22007': { status: 400, code: 'bad_request', message: 'A date is not valid.' },
  '22008': { status: 400, code: 'bad_request', message: 'A date is not valid.' },
};

/** SQLSTATE of a database error, looking through the query wrapper's cause chain. */
function pgCode(err: unknown): string | null {
  for (let x = err as { code?: unknown; cause?: unknown } | undefined, i = 0; x && i < 4; x = x.cause as typeof x, i++) {
    if (typeof x.code === 'string' && /^[0-9A-Z]{5}$/.test(x.code)) return x.code;
  }
  return null;
}

/** For ILIKE searches: typed % and _ are matched literally. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

/** Query-string flag: only "true"/"1" turn it on (z.coerce.boolean treats "false" as true). */
export const QueryFlag = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

export function errorPayload(err: unknown): { status: number; body: { error: { code: string; message: string; details?: unknown } } } {
  if (err instanceof AppError) return { status: err.status, body: { error: { code: err.code, message: err.message, details: err.details } } };
  if (err instanceof ZodError) return { status: 400, body: { error: { code: 'validation_error', message: 'Invalid input.', details: err.issues } } };
  // Input the database refuses is the caller's mistake, not a server fault.
  const db = DB_INPUT_ERRORS[pgCode(err) ?? ''];
  if (db) return { status: db.status, body: { error: { code: db.code, message: db.message } } };
  if ((err as Error)?.message === 'No values to set') return { status: 400, body: { error: { code: 'bad_request', message: 'Nothing to change.' } } };
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
    const date = new Date(d);
    if (Number.isNaN(date.getTime()) || !z.uuid().safeParse(id).success) throw new Error('malformed');
    return { date, id };
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
