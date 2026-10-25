import { and, desc, eq, isNull, or, inArray } from 'drizzle-orm';
import type { Executor } from '../db/client';
import * as s from '../db/schema';
import {
  DEFAULT_VEDIC_CONFIG, DEFAULT_WESTERN_CONFIG, ENGINE_VERSION, NAKSHATRAS, SIGNS, buildChart, normalizeBirth,
  type BirthInput, type ChartConfig, type ChartResult,
} from '../../astro';
import { CONTENT_PACK_VERSION } from '../../content/interpretations';

export type Viewer = 'self' | 'connection' | 'public';
export type FieldVis = 'public' | 'connections' | 'private';

export const DEFAULT_FIELD_VISIBILITY: Record<string, FieldVis> = {
  sunSign: 'public',
  moonSign: 'connections',
  rising: 'connections',
  nakshatra: 'connections',
  bio: 'public',
  interests: 'public',
  badges: 'public',
  level: 'public',
  birthDate: 'private',
  bonds: 'private',
};

/** Fields that can never be made public. */
export const NEVER_PUBLIC = ['birthTime', 'birthPlace', 'coordinates'];

export function fieldVisible(vis: Record<string, FieldVis>, field: string, viewer: Viewer): boolean {
  if (viewer === 'self') return true;
  if (NEVER_PUBLIC.includes(field)) return false;
  const v = vis[field] ?? DEFAULT_FIELD_VISIBILITY[field] ?? 'private';
  return v === 'public' || (v === 'connections' && viewer === 'connection');
}

export async function isBlockedEitherWay(db: Executor, a: string, b: string): Promise<boolean> {
  const rows = await db.select().from(s.blocks).where(or(
    and(eq(s.blocks.blockerId, a), eq(s.blocks.blockedId, b)),
    and(eq(s.blocks.blockerId, b), eq(s.blocks.blockedId, a)),
  ));
  return rows.length > 0;
}

/** Connection = accepted follow in either direction, or an active mutual Bond. */
export async function relationOf(db: Executor, viewerId: string | null, ownerId: string): Promise<Viewer> {
  if (!viewerId) return 'public';
  if (viewerId === ownerId) return 'self';
  const f = await db.select().from(s.follows).where(and(eq(s.follows.status, 'accepted'), or(
    and(eq(s.follows.followerId, viewerId), eq(s.follows.followeeId, ownerId)),
    and(eq(s.follows.followerId, ownerId), eq(s.follows.followeeId, viewerId)),
  )));
  if (f.length) return 'connection';
  const b = await db.select({ id: s.bonds.id }).from(s.bonds).where(and(eq(s.bonds.status, 'active'), isNull(s.bonds.deletedAt), or(
    and(eq(s.bonds.ownerId, viewerId), eq(s.bonds.partnerUserId, ownerId)),
    and(eq(s.bonds.ownerId, ownerId), eq(s.bonds.partnerUserId, viewerId)),
  )));
  return b.length ? 'connection' : 'public';
}

export async function primaryBirth(db: Executor, userId: string) {
  const [bp] = await db.select().from(s.birthProfiles).where(and(eq(s.birthProfiles.userId, userId), eq(s.birthProfiles.isPrimary, true)));
  return bp ?? null;
}

export function birthInputOf(bp: typeof s.birthProfiles.$inferSelect): BirthInput & { placeName: string } {
  return {
    date: bp.birthDate, time: bp.birthTime, timePrecision: bp.timePrecision as BirthInput['timePrecision'],
    latitude: bp.latitude, longitude: bp.longitude, timezone: bp.timezone, placeName: bp.placeName,
  };
}

export const CONFIGS: Record<string, ChartConfig> = {
  vedic_default: DEFAULT_VEDIC_CONFIG,
  vedic_mean_node: { ...DEFAULT_VEDIC_CONFIG, nodeType: 'mean' },
  vedic_equal: { ...DEFAULT_VEDIC_CONFIG, houseSystem: 'equal' },
  western_default: DEFAULT_WESTERN_CONFIG,
  western_whole_sign: { ...DEFAULT_WESTERN_CONFIG, houseSystem: 'whole_sign' },
  western_equal: { ...DEFAULT_WESTERN_CONFIG, houseSystem: 'equal' },
  western_porphyry: { ...DEFAULT_WESTERN_CONFIG, houseSystem: 'porphyry' },
};

/** Calculates and stores a chart (current, non-snapshot) for a birth profile + config. */
export async function calculateAndStore(db: Executor, userId: string, bp: typeof s.birthProfiles.$inferSelect, configKey: string): Promise<{ id: string; result: ChartResult }> {
  const config = CONFIGS[configKey];
  if (!config) throw new Error(`Unknown config ${configKey}`);
  const result = buildChart(birthInputOf(bp), config);
  const [row] = await db.insert(s.charts).values({
    userId, birthProfileId: bp.id, system: config.system, configKey, config: config as unknown as Record<string, unknown>,
    engineVersion: ENGINE_VERSION, contentVersion: CONTENT_PACK_VERSION, result: result as unknown as Record<string, unknown>,
  }).returning({ id: s.charts.id });
  await db.insert(s.chartPlacements).values(result.placements.map((p) => ({
    chartId: row.id, body: p.id, longitude: p.longitude, sign: p.sign, house: p.house, nakshatra: p.nakshatra?.index ?? null, pada: p.nakshatra?.pada ?? null, retrograde: p.retrograde,
  })));
  return { id: row.id, result };
}

/** Latest stored (non-snapshot) chart for a user and config; recalculates if engine version changed. */
export async function currentChart(db: Executor, userId: string, configKey = 'vedic_default'): Promise<{ id: string; result: ChartResult } | null> {
  const bp = await primaryBirth(db, userId);
  if (!bp) return null;
  const [row] = await db.select().from(s.charts)
    .where(and(eq(s.charts.birthProfileId, bp.id), eq(s.charts.configKey, configKey), eq(s.charts.isSnapshot, false)))
    .orderBy(desc(s.charts.createdAt)).limit(1);
  if (row && row.engineVersion === ENGINE_VERSION && Date.parse((row.result as unknown as ChartResult).utc) === bp.birthUtc.getTime()) {
    return { id: row.id, result: row.result as unknown as ChartResult };
  }
  return calculateAndStore(db, userId, bp, configKey);
}

export interface BigThree {
  western: { sun: string; moon: string; rising: string | null };
  vedic: { rashi: string; lagna: string | null; nakshatra: string; pada: number; sunSign: string };
  reliability: ChartResult['reliability'];
}

export function bigThreeFrom(western: ChartResult, vedic: ChartResult): BigThree {
  const w = (id: string) => western.placements.find((p) => p.id === id)!;
  const v = (id: string) => vedic.placements.find((p) => p.id === id)!;
  return {
    western: { sun: SIGNS[w('sun').sign].name, moon: SIGNS[w('moon').sign].name, rising: western.ascendant ? SIGNS[western.ascendant.sign].name : null },
    vedic: {
      rashi: SIGNS[v('moon').sign].vedic,
      lagna: vedic.ascendant ? SIGNS[vedic.ascendant.sign].vedic : null,
      nakshatra: NAKSHATRAS[v('moon').nakshatra!.index].name,
      pada: v('moon').nakshatra!.pada,
      sunSign: SIGNS[v('sun').sign].vedic,
    },
    reliability: vedic.reliability,
  };
}

export async function bigThreeFor(db: Executor, userId: string): Promise<BigThree | null> {
  const [w, v] = await Promise.all([currentChart(db, userId, 'western_default'), currentChart(db, userId, 'vedic_default')]);
  if (!w || !v) return null;
  return bigThreeFrom(w.result, v.result);
}

/** Highest active chart-share scope granted from grantor to grantee. */
export async function grantedScope(db: Executor, grantorId: string, granteeId: string): Promise<'none' | 'big_three' | 'chart' | 'birth_details'> {
  const rows = await db.select({ scope: s.chartShareGrants.scope }).from(s.chartShareGrants)
    .where(and(eq(s.chartShareGrants.grantorId, grantorId), eq(s.chartShareGrants.granteeId, granteeId), isNull(s.chartShareGrants.revokedAt)));
  const order = ['none', 'big_three', 'chart', 'birth_details'] as const;
  return rows.reduce<(typeof order)[number]>((best, r) => (order.indexOf(r.scope as never) > order.indexOf(best) ? (r.scope as never) : best), 'none');
}

export function ageOn(birthDate: string, on = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = on.getUTCFullYear() - y;
  if (on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d)) age--;
  return age;
}

export async function displayNames(db: Executor, ids: string[]): Promise<Map<string, { handle: string; displayName: string; avatarUrl: string | null }>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ userId: s.profiles.userId, handle: s.profiles.handle, displayName: s.profiles.displayName, avatarUrl: s.profiles.avatarUrl })
    .from(s.profiles).where(inArray(s.profiles.userId, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.userId, r]));
}

export { normalizeBirth };
