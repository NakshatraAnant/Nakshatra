import { and, eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { analyticsEvents } from '../db/schema';
import { track } from '../lib/context';

/**
 * Records `first_meaningful_action` once per member: the first Thought Drop, ritual
 * answer, game round or circle join. Used for activation rate and time-to-value.
 */
export async function recordFirstAction(db: Executor, userId: string, kind: 'thought' | 'ritual' | 'game' | 'circle'): Promise<void> {
  const [existing] = await db.select({ id: analyticsEvents.id }).from(analyticsEvents).where(and(eq(analyticsEvents.userId, userId), eq(analyticsEvents.name, 'first_meaningful_action'))).limit(1);
  if (!existing) await track(db, userId, 'first_meaningful_action', { kind });
}
