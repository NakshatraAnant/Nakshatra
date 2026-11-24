/**
 * Cash-on-delivery merch orders. Money is collected only by the courier at the door: an order is UNPAID
 * until delivery is recorded, and Nakshatra never shows a payment as successful before that.
 * Tracking references are entered by staff from the real courier — never generated.
 */
export const COD_STATUSES = [
  'draft', 'pending_confirmation', 'confirmed', 'processing', 'packed', 'dispatched', 'out_for_delivery',
  'delivered', 'cancelled', 'return_requested', 'returned', 'rto', 'refunded',
] as const;
export type CodStatus = (typeof COD_STATUSES)[number];

export const COD_LABEL: Record<CodStatus, string> = {
  draft: 'Draft', pending_confirmation: 'Pending confirmation', confirmed: 'Confirmed', processing: 'Processing', packed: 'Packed',
  dispatched: 'Dispatched', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled',
  return_requested: 'Return requested', returned: 'Returned', rto: 'Returned to origin (not delivered)', refunded: 'Refunded',
};

type Actor = 'customer' | 'staff' | 'system';
/** Allowed transitions and who may make them. */
export const COD_TRANSITIONS: Record<CodStatus, Partial<Record<CodStatus, Actor[]>>> = {
  draft: { pending_confirmation: ['customer'], cancelled: ['customer', 'system'] },
  pending_confirmation: { confirmed: ['staff'], cancelled: ['customer', 'staff'] },
  confirmed: { processing: ['staff'], cancelled: ['customer', 'staff'] },
  processing: { packed: ['staff'], cancelled: ['staff'] },
  packed: { dispatched: ['staff'], cancelled: ['staff'] },
  dispatched: { out_for_delivery: ['staff'], delivered: ['staff'], rto: ['staff'] },
  out_for_delivery: { delivered: ['staff'], rto: ['staff'] },
  delivered: { return_requested: ['customer'] },
  return_requested: { returned: ['staff'], delivered: ['staff'] },
  returned: { refunded: ['staff'] },
  cancelled: {}, rto: {}, refunded: {},
};

export function canTransition(from: CodStatus, to: CodStatus, actor: Actor): boolean {
  return COD_TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

/** Inventory effect of entering a status: reserve on placing, release on cancel before dispatch, deduct on dispatch, restock on RTO/return. */
export function inventoryEffect(from: CodStatus, to: CodStatus): 'reserve' | 'release' | 'deduct' | 'restock' | null {
  if (to === 'pending_confirmation') return 'reserve';
  if (to === 'cancelled' && ['pending_confirmation', 'confirmed', 'processing', 'packed'].includes(from)) return 'release';
  if (to === 'dispatched') return 'deduct';
  if (to === 'rto' || to === 'returned') return 'restock';
  return null;
}

/** Payment state shown to customers and staff. Only delivery (cash collected) makes an order paid. */
export function codPaymentStatus(status: CodStatus, collected: boolean): 'not_due' | 'due_on_delivery' | 'collected' | 'refunded' | 'not_collected' {
  if (status === 'refunded') return 'refunded';
  if (collected) return 'collected';
  if (status === 'draft' || status === 'cancelled') return 'not_due';
  if (status === 'rto') return 'not_collected';
  return 'due_on_delivery';
}

export const COD_RULES = {
  /** COD orders above this are refused (courier cash limits and fraud risk). */
  maxOrderPaise: 500000,
  maxQuantityPerItem: 5,
  /** Open (placed, not finished) COD orders one member may have at once. */
  maxOpenOrders: 3,
  freeShippingFromPaise: 99900,
  shippingPaise: 4900,
  returnWindowDays: 7,
} as const;

export const OPEN_COD_STATUSES: CodStatus[] = ['pending_confirmation', 'confirmed', 'processing', 'packed', 'dispatched', 'out_for_delivery'];

export function shippingFor(subtotalPaise: number) {
  return subtotalPaise >= COD_RULES.freeShippingFromPaise ? 0 : COD_RULES.shippingPaise;
}

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const;

/** Indian mobile numbers: 10 digits starting 6–9, optional +91 / 0 prefix and spaces. Returns the 10 digits or null. */
export function normalisePhone(input: string): string | null {
  const d = input.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
export const PIN_RE = /^[1-9]\d{5}$/;
