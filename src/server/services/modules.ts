import { eq, inArray } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { featureFlags, platformSettings } from '../db/schema';
import { stableHash } from '../../content/briefing';
import { MODULES, MODULE_BY_KEY } from '../../shared/modules';
import { AppError } from '../lib/http';

/**
 * Server-side module availability. Flags are read from `feature_flags` and cached for a few seconds
 * (the cache holds only on/off and rollout values — never user data). Admin flag changes clear it.
 */
// No caching under tests, which change flags directly in the database.
const TTL_MS = process.env.NODE_ENV === 'test' || process.env.VITEST ? 0 : 5000;
let cache: { at: number; flags: Map<string, { enabled: boolean; rollout: number }> } | null = null;

export function invalidateModuleCache() { cache = null; }

async function flags(db: Executor) {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags;
  const rows = await db.select().from(featureFlags);
  cache = { at: Date.now(), flags: new Map(rows.map((r) => [r.key, { enabled: r.enabled, rollout: r.rolloutPercent }])) };
  return cache.flags;
}

export async function moduleEnabled(db: Executor, key: string, userId: string | null): Promise<boolean> {
  const def = MODULE_BY_KEY[key];
  if (def?.core) return true;
  const f = (await flags(db)).get(key);
  if (!f) return def?.defaultEnabled ?? false;
  if (!f.enabled) return false;
  if (f.rollout >= 100) return true;
  if (!userId) return false;
  return stableHash(`${key}:${userId}`) % 100 < f.rollout;
}

export async function enabledModules(db: Executor, userId: string | null): Promise<Record<string, boolean>> {
  return Object.fromEntries(await Promise.all(MODULES.map(async (m) => [m.key, await moduleEnabled(db, m.key, userId)] as const)));
}

export async function requireModule(db: Executor, key: string, userId: string | null) {
  if (!(await moduleEnabled(db, key, userId))) throw new AppError(404, 'module_disabled', 'This part of Nakshatra is not available.');
}

/**
 * Launch scope (applied once per database, recorded in platform_settings): creates a flag row for every
 * non-core module and sets legacy modules to their launch default (off). Later admin changes are kept,
 * because this runs only when the marker is missing. Nothing is deleted.
 */
export const LAUNCH_SCOPE_KEY = 'module_launch_scope_v1';

/** Scope "all": every module gets a flag row, enabled unless an admin already set one. */
export async function ensureAllModuleFlags(db: Executor) {
  for (const m of MODULES.filter((x) => !x.core)) await db.insert(featureFlags).values({ key: m.key, description: m.description, enabled: true }).onConflictDoNothing();
  invalidateModuleCache();
}

export async function applyLaunchScope(db: Executor) {
  const [done] = await db.select().from(platformSettings).where(eq(platformSettings.key, LAUNCH_SCOPE_KEY));
  if (done) return false;
  const nonCore = MODULES.filter((m) => !m.core);
  const existing = new Set((await db.select({ key: featureFlags.key }).from(featureFlags).where(inArray(featureFlags.key, nonCore.map((m) => m.key)))).map((r) => r.key));
  for (const m of nonCore) {
    if (existing.has(m.key)) await db.update(featureFlags).set({ enabled: m.defaultEnabled, updatedAt: new Date() }).where(eq(featureFlags.key, m.key));
    else await db.insert(featureFlags).values({ key: m.key, description: m.description, enabled: m.defaultEnabled }).onConflictDoNothing();
  }
  await db.insert(platformSettings).values({ key: LAUNCH_SCOPE_KEY, value: { appliedAt: new Date().toISOString(), disabled: nonCore.filter((m) => !m.defaultEnabled).map((m) => m.key) } as never }).onConflictDoNothing();
  invalidateModuleCache();
  return true;
}
