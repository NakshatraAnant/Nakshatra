import { DIMENSIONS, DIMENSION_INFO, type Dimension, type Vector } from './personality';

/**
 * Organisations (orgs-v1): workspaces for teams, colleges and communities, set up by Nakshatra staff.
 *
 * Tenant isolation: an organisation's members, invites, circles and insights are visible only to its own active
 * members (and its circles only to members who joined them). Removing someone from an organisation removes them
 * from its circles.
 *
 * Employers and admins never see an individual's personality result. The only personality view is an opt-in team
 * aggregate: per-dimension average and spread across members who chose to be counted, shown only when at least
 * ORG_RULES.minAggregate have opted in. It is for team conversations, never for hiring, evaluation or ranking.
 */
export const ORG_RULES = { minAggregate: 5, inviteDays: 14, maxInviteUses: 200, maxSeats: 5000 } as const;
export const ORG_KINDS = ['company', 'college', 'community'] as const;

export interface TeamDimension { dimension: Dimension; name: string; average: number; spread: 'aligned' | 'mixed' | 'wide'; lean: string }

/** Aggregate only; returns null below the threshold so small groups never expose anyone. */
export function teamComposition(vectors: Vector[]): TeamDimension[] | null {
  if (vectors.length < ORG_RULES.minAggregate) return null;
  return DIMENSIONS.map((d) => {
    const xs = vectors.map((v) => v[d]);
    const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((t, x) => t + (x - mean) ** 2, 0) / xs.length);
    const info = DIMENSION_INFO[d];
    return {
      dimension: d, name: info.name, average: Math.round(mean * 10) / 10,
      spread: sd < 0.25 ? 'aligned' : sd < 0.5 ? 'mixed' : 'wide',
      lean: Math.abs(mean) < 0.15 ? `Balanced between ${info.low.toLowerCase()} and ${info.high.toLowerCase()}` : mean > 0 ? `Leans ${info.high.toLowerCase()}` : `Leans ${info.low.toLowerCase()}`,
    };
  });
}

/** An invite can require the member's verified email to be on the organisation's domain. */
export function emailOnDomain(email: string, domain: string | null): boolean {
  if (!domain) return true;
  const at = email.toLowerCase().split('@')[1] ?? '';
  const d = domain.toLowerCase().replace(/^@/, '');
  return at === d || at.endsWith(`.${d}`);
}
