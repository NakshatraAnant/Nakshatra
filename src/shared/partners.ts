/**
 * Partner perks and affiliate links (partners-v1).
 *
 *  - Perks are member offers from partner brands, listed on one page (/perks) and nowhere else. They never appear
 *    in identity, assessment, Cosmic ID or compatibility results, and they are never targeted at anyone.
 *  - Every perk carries the disclosure below. Members follow a perk through Nakshatra, so the partner receives an
 *    opaque click reference (never a member id, name or email).
 *  - Conversions arrive from the partner as signed server-to-server postbacks; commission is recorded as pending
 *    until staff approve it. This is revenue to Nakshatra; members are not paid.
 */
export const PERK_CATEGORIES = ['food', 'books', 'music', 'travel', 'learning', 'wellbeing', 'tech', 'fashion', 'games', 'experiences'] as const;
export type PerkCategory = (typeof PERK_CATEGORIES)[number];
export const PERK_DISCLOSURE = 'Partner offer · Nakshatra may earn a commission if you buy. It never affects your results or what we recommend.';
export const PARTNER_RULES = { maxClickAgeDays: 30, title: 70, description: 280, code: 30 } as const;

/** Adds the click reference (and the partner's own fixed parameters) to the offer URL. */
export function trackedUrl(offerUrl: string, clickRef: string, subIdParam = 'subid'): string {
  const u = new URL(offerUrl);
  if (u.protocol !== 'https:') throw new Error('Offer links must be https');
  u.searchParams.set(subIdParam, clickRef);
  return u.toString();
}

/** Postback body sent by a partner. Amounts in paise. */
export interface Postback { externalId: string; clickRef?: string; orderPaise: number; commissionPaise: number; status?: 'pending' | 'approved' | 'reversed' }

export function validPostback(p: Postback): string | null {
  if (!p.externalId || p.externalId.length > 100) return 'externalId is required (≤100 chars).';
  if (!Number.isInteger(p.orderPaise) || p.orderPaise < 0) return 'orderPaise must be a whole number of paise.';
  if (!Number.isInteger(p.commissionPaise) || p.commissionPaise < 0 || p.commissionPaise > p.orderPaise) return 'commissionPaise must be between 0 and orderPaise.';
  return null;
}
