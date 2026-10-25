import { eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { interpretationContent } from '../db/schema';
import { INTERPRETATION_RULES, type InterpretationRule, type Condition } from '../../content/interpretations';

/**
 * Published interpretation rules are read from the database (admin-editable,
 * versioned) and cached in memory. The code pack seeds version 1 of every rule.
 */
let cache: InterpretationRule[] = INTERPRETATION_RULES;

export function activeRules(): InterpretationRule[] {
  return cache;
}

export async function refreshRules(db: Executor): Promise<void> {
  const rows = await db.select().from(interpretationContent).where(eq(interpretationContent.status, 'published'));
  if (!rows.length) return;
  cache = rows.map((r) => ({
    key: r.ruleKey,
    system: r.system as InterpretationRule['system'],
    condition: r.condition as Condition,
    group: r.groupKey,
    importance: r.importance as 1 | 2 | 3,
    title: { en: r.titleEn, hi: r.titleHi ?? undefined },
    body: { en: r.bodyEn, hi: r.bodyHi ?? undefined },
    caveat: r.caveat ?? undefined,
    source: r.source,
    status: 'published',
    version: r.version,
    factorLabel: r.factorLabel,
  }));
}
