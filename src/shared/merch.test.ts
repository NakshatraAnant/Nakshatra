import { describe, expect, it } from 'vitest';
import { COD_STATUSES, COD_TRANSITIONS, canTransition, codPaymentStatus, inventoryEffect, normalisePhone, shippingFor, COD_RULES } from './merch';

describe('COD state machine', () => {
  it('every transition targets a known status and terminal states have none', () => {
    for (const [from, tos] of Object.entries(COD_TRANSITIONS)) {
      expect(COD_STATUSES).toContain(from);
      for (const to of Object.keys(tos)) expect(COD_STATUSES).toContain(to);
    }
    for (const t of ['cancelled', 'rto', 'refunded'] as const) expect(Object.keys(COD_TRANSITIONS[t])).toEqual([]);
  });
  it('customers cannot move fulfilment forward; staff cannot place or request returns for them', () => {
    expect(canTransition('pending_confirmation', 'confirmed', 'customer')).toBe(false);
    expect(canTransition('packed', 'dispatched', 'customer')).toBe(false);
    expect(canTransition('draft', 'pending_confirmation', 'staff')).toBe(false);
    expect(canTransition('delivered', 'return_requested', 'staff')).toBe(false);
    expect(canTransition('dispatched', 'cancelled', 'customer')).toBe(false);
    expect(canTransition('confirmed', 'cancelled', 'customer')).toBe(true);
  });
  it('only delivery makes an order paid', () => {
    for (const s of COD_STATUSES) if (s !== 'refunded') expect(codPaymentStatus(s, false)).not.toBe('collected');
    expect(codPaymentStatus('delivered', true)).toBe('collected');
    expect(codPaymentStatus('rto', false)).toBe('not_collected');
  });
  it('inventory effects', () => {
    expect(inventoryEffect('draft', 'pending_confirmation')).toBe('reserve');
    expect(inventoryEffect('packed', 'cancelled')).toBe('release');
    expect(inventoryEffect('draft', 'cancelled')).toBeNull();
    expect(inventoryEffect('packed', 'dispatched')).toBe('deduct');
    expect(inventoryEffect('dispatched', 'rto')).toBe('restock');
    expect(inventoryEffect('return_requested', 'returned')).toBe('restock');
  });
  it('phone numbers and shipping', () => {
    expect(normalisePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalisePhone('09876543210')).toBe('9876543210');
    expect(normalisePhone('5876543210')).toBeNull();
    expect(normalisePhone('98765')).toBeNull();
    expect(shippingFor(COD_RULES.freeShippingFromPaise)).toBe(0);
    expect(shippingFor(COD_RULES.freeShippingFromPaise - 1)).toBe(COD_RULES.shippingPaise);
  });
});
