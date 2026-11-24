import { describe, expect, it } from 'vitest';
import { REVENUE_MODELS, commission, revenueShare, sponsoredDisclosure } from './monetisation';

describe('monetisation contracts', () => {
  it('lists exactly 50 distinct revenue models, each with a status', () => {
    expect(REVENUE_MODELS).toHaveLength(50);
    expect(new Set(REVENUE_MODELS.map((m) => m.key)).size).toBe(50);
    expect(REVENUE_MODELS.map((m) => m.id)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('commission is integer paise, clamped and never above gross', () => {
    expect(commission(9900, { key: 'std', percentBps: 1500, fixedPaise: 0 })).toBe(1485);
    expect(commission(100, { key: 'min', percentBps: 1000, fixedPaise: 0, minPaise: 500 })).toBe(100);
    expect(commission(1_000_000, { key: 'cap', percentBps: 2000, fixedPaise: 300, maxPaise: 50_000 })).toBe(50_000);
    expect(() => commission(10.5, { key: 'x', percentBps: 1, fixedPaise: 0 })).toThrow();
  });

  it('revenue share sums exactly to the net amount', () => {
    const r = revenueShare(9999, [{ party: 'creator', bps: 7000 }, { party: 'platform', bps: 3000 }]);
    expect(r.creator + r.platform).toBe(9999);
    expect(() => revenueShare(100, [{ party: 'a', bps: 5000 }])).toThrow();
  });

  it('sponsored content is always labelled and never profile-targeted', () => {
    expect(sponsoredDisclosure({ sponsor: 'Chai Co', surface: 'quest', startsOn: '2027-01-01', endsOn: '2027-01-31', targeting: 'none' })).toBe('Sponsored by Chai Co');
    expect(() => sponsoredDisclosure({ sponsor: 'X', surface: 'thought', startsOn: '', endsOn: '', targeting: 'personality' as never })).toThrow();
  });
});
