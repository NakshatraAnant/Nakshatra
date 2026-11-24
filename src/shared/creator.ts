import { commission, type CommissionRule } from './monetisation';

/**
 * Creator profiles, storefront foundation and tips (creator-v1).
 *
 * Money rules, deliberately conservative:
 *  - Tips go through the normal payment boundary (verified provider events only). With payments switched off,
 *    tipping is unavailable — nothing is faked.
 *  - Every paid tip writes a "held" line to the creator ledger: gross, platform fee, net. Payouts do not exist yet:
 *    they need identity verification (KYC), a payout provider and tax handling. Held means held.
 *  - Development-simulator tips are labelled simulated and never counted as real earnings.
 *  - Storefront offerings are listings with a "Notify me" interest list until paid offerings are built.
 */
export const CREATOR_RULES = {
  tipMinPaise: 1000,
  tipMaxPaise: 500000,
  /** Total a member can tip across all creators in a rolling day (limits abuse and laundering risk). */
  dailyTipCapPaise: 1000000,
  tipPresetsPaise: [5000, 10000, 25000],
  messageMax: 140,
  headlineMax: 80,
  aboutMax: 1500,
  maxLinks: 5,
  maxCategories: 4,
  maxFeatured: 6,
  maxListedOfferings: 12,
  payoutsAvailable: false,
} as const;

export const TIP_FEE: CommissionRule = { key: 'creator_tip', percentBps: 1000, fixedPaise: 0 };

export const CREATOR_CATEGORIES = ['writing', 'art', 'music', 'astrology', 'wellbeing', 'games', 'comedy', 'education', 'photography', 'community'] as const;
export const OFFERING_KINDS = ['membership', 'digital', 'session', 'workshop', 'newsletter'] as const;
export type OfferingKind = (typeof OFFERING_KINDS)[number];
export const OFFERING_LABEL: Record<OfferingKind, string> = { membership: 'Membership', digital: 'Digital download', session: '1:1 session', workshop: 'Workshop', newsletter: 'Newsletter' };

export function tipSplit(grossPaise: number): { grossPaise: number; feePaise: number; netPaise: number } {
  const feePaise = commission(grossPaise, TIP_FEE);
  return { grossPaise, feePaise, netPaise: grossPaise - feePaise };
}

/** Links must be plain https URLs without credentials; javascript:, data: and http: are refused. */
export function safeLink(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch { return null; }
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
