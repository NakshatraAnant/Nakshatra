import { eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { platformSettings } from '../db/schema';

/**
 * Baseline text screening. This is a conservative rules filter, not a guarantee:
 * it blocks a configurable list of harassment phrases and personal contact details
 * in pseudonymous or game contexts, and everything else relies on reporting and
 * human review in Admin → Moderation.
 *
 * Extra terms can be configured without a code change in platform setting
 * `moderation_terms` = { "block": ["…"] }.
 */
export const DEFAULT_BLOCKED_PHRASES = ['kill yourself', 'kys', 'go die', 'nobody would miss you', 'i will find you', 'leak your address'];

const PHONE = /(?:\+?\d[\s-]?){10,13}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export interface ScreenResult { ok: boolean; reason?: string }

export async function blockedPhrases(db: Executor): Promise<string[]> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, 'moderation_terms'));
  const extra = ((row?.value as { block?: unknown } | undefined)?.block);
  return [...DEFAULT_BLOCKED_PHRASES, ...(Array.isArray(extra) ? extra.filter((x): x is string => typeof x === 'string') : [])];
}

export function screenText(text: string, phrases: string[], opts: { protectIdentity?: boolean } = {}): ScreenResult {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s@.+-]/gu, ' ').replace(/\s+/g, ' ')} `;
  for (const p of phrases) if (t.includes(` ${p.toLowerCase()} `)) return { ok: false, reason: 'This text looks like harassment, which is not allowed on Nakshatra.' };
  if (opts.protectIdentity && (PHONE.test(text) || EMAIL.test(text))) return { ok: false, reason: 'Please don’t share phone numbers or email addresses here.' };
  return { ok: true };
}
