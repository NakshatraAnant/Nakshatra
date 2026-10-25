import { eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { featureFlags, platformSettings } from '../db/schema';
import { stableHash } from '../../content/briefing';

export async function getSetting<T>(db: Executor, key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
  return row ? (row.value as T) : fallback;
}

export async function setSetting(db: Executor, key: string, value: unknown, by: string | null) {
  await db.insert(platformSettings).values({ key, value: value as never, updatedBy: by }).onConflictDoUpdate({ target: platformSettings.key, set: { value: value as never, updatedAt: new Date(), updatedBy: by } });
}

/** Feature flag with deterministic percentage rollout per user. */
export async function flagEnabled(db: Executor, key: string, userId: string | null): Promise<boolean> {
  const [f] = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
  if (!f || !f.enabled) return false;
  if (f.rolloutPercent >= 100) return true;
  if (!userId) return false;
  return stableHash(`${key}:${userId}`) % 100 < f.rolloutPercent;
}

/** Throws 404 when a feature is switched off, so disabled modules cannot be used through the API either. */
export async function requireFeature(db: Executor, key: string, userId: string | null): Promise<void> {
  if (!(await flagEnabled(db, key, userId))) {
    const { notFound } = await import('../lib/http');
    throw notFound('Feature');
  }
}
