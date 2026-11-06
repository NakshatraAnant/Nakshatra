import { describe, expect, it } from 'vitest';
import { trackedUrl, validPostback } from './partners';

describe('partner links and postbacks', () => {
  it('adds only an opaque reference to https links', () => {
    expect(trackedUrl('https://shop.example.com/sale?utm_source=nakshatra', 'abc123')).toBe('https://shop.example.com/sale?utm_source=nakshatra&subid=abc123');
    expect(trackedUrl('https://shop.example.com/', 'abc', 'aff_sub')).toBe('https://shop.example.com/?aff_sub=abc');
    expect(() => trackedUrl('http://shop.example.com/', 'abc')).toThrow();
  });

  it('validates postback amounts', () => {
    expect(validPostback({ externalId: 'o1', orderPaise: 100000, commissionPaise: 8000 })).toBeNull();
    expect(validPostback({ externalId: '', orderPaise: 1, commissionPaise: 0 })).toMatch(/externalId/);
    expect(validPostback({ externalId: 'o1', orderPaise: 100, commissionPaise: 200 })).toMatch(/commission/);
    expect(validPostback({ externalId: 'o1', orderPaise: 10.5, commissionPaise: 0 })).toMatch(/orderPaise/);
  });
});
