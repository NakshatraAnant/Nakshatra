import { describe, expect, it } from 'vitest';
import { CIRCLE_TIER_FEE, UNLOCK_FEE, paidSplit, passWindow, rupeesLabel } from './paidAccess';

describe('paid access rules', () => {
  it('splits in whole paise with the platform fee rounded down', () => {
    expect(paidSplit(9900, CIRCLE_TIER_FEE)).toEqual({ grossPaise: 9900, feePaise: 1485, netPaise: 8415 });
    expect(paidSplit(1999, UNLOCK_FEE)).toEqual({ grossPaise: 1999, feePaise: 299, netPaise: 1700 });
  });

  it('starts a pass now, or extends from a later current expiry', () => {
    const now = new Date('2026-11-11T10:00:00Z');
    expect(passWindow(now, null)).toEqual({ startsAt: now, expiresAt: new Date('2026-12-11T10:00:00Z') });
    const later = new Date('2026-11-20T10:00:00Z');
    expect(passWindow(now, later).startsAt).toEqual(later);
    expect(passWindow(now, new Date('2026-11-01T00:00:00Z')).startsAt).toEqual(now);
  });

  it('formats rupees', () => {
    expect(rupeesLabel(9900)).toBe('₹99');
    expect(rupeesLabel(1950)).toBe('₹19.50');
  });
});
