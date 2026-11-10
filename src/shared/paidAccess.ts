import { commission, type CommissionRule } from './monetisation';

/**
 * Paid circle tiers and paid creator unlocks (paid-access-v1).
 *
 *  - Both go through the payment boundary: access is granted only by a verified payment event. With payments off,
 *    nothing can be bought — nothing is faked. Simulated payments only exist outside production.
 *  - A circle tier purchase is a fixed-length pass (no auto-renew). Buying again extends from the current expiry.
 *  - The owner's / creator's share is written to the held ledger. Payouts are not built (KYC, payout provider, tax).
 *  - A refund removes the access it paid for and reverses the ledger line.
 *  - Paid circle event tickets: if the host cancels the event, every ticket is refunded in full automatically.
 *    Members can't cancel a paid ticket themselves.
 */
export const PAID_RULES = {
  tierMinPaise: 1900,
  tierMaxPaise: 199900,
  passDays: 30,
  unlockMinPaise: 1900,
  unlockMaxPaise: 499900,
  unlockContentMax: 3000,
  ticketMinPaise: 1900,
  ticketMaxPaise: 499900,
  /** An unpaid ticket holds a place for this long. */
  ticketHoldMinutes: 30,
} as const;

export const CIRCLE_TIER_FEE: CommissionRule = { key: 'circle_tier', percentBps: 1500, fixedPaise: 0 };
export const UNLOCK_FEE: CommissionRule = { key: 'creator_unlock', percentBps: 1500, fixedPaise: 0 };
export const TICKET_FEE: CommissionRule = { key: 'event_ticket', percentBps: 1500, fixedPaise: 0 };

export function paidSplit(grossPaise: number, rule: CommissionRule) {
  const feePaise = commission(grossPaise, rule);
  return { grossPaise, feePaise, netPaise: grossPaise - feePaise };
}

/** A pass starts now, or when the member's current pass for the same tier ends if that is later. */
export function passWindow(now: Date, currentExpiry: Date | null, days: number = PAID_RULES.passDays): { startsAt: Date; expiresAt: Date } {
  const startsAt = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return { startsAt, expiresAt: new Date(startsAt.getTime() + days * 864e5) };
}

export const rupeesLabel = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
