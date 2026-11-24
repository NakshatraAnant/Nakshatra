import { describe, expect, it } from 'vitest';
import { CREATOR_RULES, safeLink, tipSplit } from './creator';

describe('creator rules', () => {
  it('splits tips in whole paise with a 10% platform fee that always sums to the gross', () => {
    expect(tipSplit(10000)).toEqual({ grossPaise: 10000, feePaise: 1000, netPaise: 9000 });
    for (const g of [1000, 1234, 9999, 500000]) { const x = tipSplit(g); expect(x.feePaise + x.netPaise).toBe(g); expect(Number.isInteger(x.feePaise)).toBe(true); }
    expect(tipSplit(1234).feePaise).toBe(123);
  });

  it('accepts only https links without credentials', () => {
    expect(safeLink('https://example.com/a')).toBe('https://example.com/a');
    expect(safeLink('http://example.com')).toBeNull();
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('https://user:pw@example.com')).toBeNull();
    expect(safeLink('https://localhost')).toBeNull();
    expect(safeLink('not a url')).toBeNull();
  });

  it('payouts stay off', () => { expect(CREATOR_RULES.payoutsAvailable).toBe(false); });
});
