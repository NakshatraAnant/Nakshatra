import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve, normalize } from 'node:path';
import { eq } from 'drizzle-orm';
import { randomToken } from './crypto';
import { badRequest, notFound } from './http';
import type { Ctx } from './context';
import type { DB } from '../db/client';
import { storedFiles } from '../db/schema';

/**
 * Local file storage for uploads. Files are validated by magic bytes (not by the
 * client-supplied type), renamed to random names, and stored outside the web root.
 * Public files are served via /uploads/public; private files only via authorised API routes.
 */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  // Audio-only MP4 (Safari's voice recordings) must be checked before the generic MP4 signature.
  { mime: 'audio/mp4', ext: 'm4a', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' && ['M4A ', 'M4B '].includes(b.subarray(8, 12).toString('ascii')) },
  { mime: 'video/mp4', ext: 'mp4', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  // WebM/Matroska (Chrome/Firefox MediaRecorder) and Ogg (Firefox). Accepted only where audio is allowed.
  { mime: 'audio/webm', ext: 'webm', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  { mime: 'audio/ogg', ext: 'ogg', test: (b) => b.subarray(0, 4).toString('ascii') === 'OggS' },
  { mime: 'audio/mpeg', ext: 'mp3', test: (b) => b.subarray(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
];

export function detectType(buf: Buffer, allowed: string[]): { mime: string; ext: string } {
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig || !allowed.includes(sig.mime)) throw badRequest(`Unsupported file type. Allowed: ${allowed.join(', ')}`);
  return sig;
}

type SaveOpts = { allowed: string[]; isPrivate: boolean; maxBytes: number };
type Saved = { path: string; mime: string; bytes: number };

export interface FileStorage {
  save(buf: Buffer, opts: SaveOpts): Promise<Saved>;
  read(relPath: string): Promise<Buffer>;
}

/** Shared validation: non-empty, within size, type detected from content, random name. */
function prepare(buf: Buffer, opts: SaveOpts) {
  if (buf.length === 0) throw badRequest('Empty file');
  if (buf.length > opts.maxBytes) throw badRequest(`File too large (max ${Math.round(opts.maxBytes / 1048576)} MB)`);
  const { mime, ext } = detectType(buf, opts.allowed);
  const dir = opts.isPrivate ? 'private' : 'public';
  return { mime, dir, name: `${randomToken(16)}.${ext}` };
}

export class LocalStorage implements FileStorage {
  constructor(private root: string) {}

  async save(buf: Buffer, opts: SaveOpts): Promise<Saved> {
    const { mime, dir, name } = prepare(buf, opts);
    await mkdir(join(resolve(this.root), dir), { recursive: true });
    await writeFile(join(resolve(this.root), dir, name), buf);
    return { path: `${dir}/${name}`, mime, bytes: buf.length };
  }

  async read(relPath: string): Promise<Buffer> {
    const full = resolve(this.root, normalize(relPath));
    if (!full.startsWith(resolve(this.root))) throw badRequest('Invalid path');
    return readFile(full);
  }

  get publicDir(): string {
    return join(resolve(this.root), 'public');
  }
}

/**
 * Stores file bytes in PostgreSQL, for hosts whose disk is wiped on restart. Same validation and
 * naming as LocalStorage; a lower per-file cap keeps the database inside small free-tier quotas.
 */
export class DatabaseStorage implements FileStorage {
  constructor(private db: DB, private maxFileBytes: number) {}

  async save(buf: Buffer, opts: SaveOpts): Promise<Saved> {
    const { mime, dir, name } = prepare(buf, { ...opts, maxBytes: Math.min(opts.maxBytes, this.maxFileBytes) });
    const path = `${dir}/${name}`;
    await this.db.insert(storedFiles).values({ path, mime, bytes: buf.length, isPrivate: opts.isPrivate, data: buf });
    return { path, mime, bytes: buf.length };
  }

  async read(relPath: string): Promise<Buffer> {
    const [f] = await this.db.select({ data: storedFiles.data }).from(storedFiles).where(eq(storedFiles.path, relPath));
    if (!f) throw notFound('File');
    return Buffer.from(f.data);
  }

  /** Public files only, for the /uploads/public route. */
  async readPublic(name: string): Promise<{ data: Buffer; mime: string } | null> {
    if (!/^[A-Za-z0-9_-]+.[a-z0-9]+$/.test(name)) return null;
    const [f] = await this.db.select({ data: storedFiles.data, mime: storedFiles.mime, isPrivate: storedFiles.isPrivate }).from(storedFiles).where(eq(storedFiles.path, `public/${name}`));
    return f && !f.isPrivate ? { data: Buffer.from(f.data), mime: f.mime } : null;
  }
}

export function createStorage(ctx: Ctx): FileStorage {
  return ctx.config.STORAGE_DRIVER === 'database'
    ? new DatabaseStorage(ctx.db, ctx.config.DATABASE_FILE_MAX_MB * 1048576)
    : new LocalStorage(ctx.config.UPLOAD_DIR);
}

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];
export const MEDIA_TYPES = ['audio/mpeg', 'video/mp4'];
export const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];
/** Voice notes: up to 60 seconds; at typical voice bitrates that is well under this cap. */
export const VOICE_MAX_BYTES = 1.5 * 1048576;
