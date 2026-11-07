/**
 * Circle market (market-v1): members of a circle list things for each other — sell, swap, give away or ask for.
 * Nakshatra never handles money here: there is no checkout, and the price is what the seller asks.
 * Members show interest; the seller accepts one person, and only then can the two of them message on that listing.
 * Listings stay inside the circle, blocks hide them both ways, and circle moderators can remove any listing.
 */
export const LISTING_KINDS = ['sell', 'swap', 'free', 'wanted'] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];
export const LISTING_KIND_LABEL: Record<ListingKind, string> = { sell: 'For sale', swap: 'Swap', free: 'Free', wanted: 'Wanted' };
export const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
export const MARKET_RULES = { maxActivePerMember: 10, title: 80, description: 600, note: 200, message: 500, maxPhotos: 4, maxPricePaise: 10_000_000 } as const;

/** Things that can't be listed between members (legal, safety or platform reasons). */
const PROHIBITED: [string, string][] = [
  ['weapon', 'weapons'], ['gun', 'weapons'], ['sword', 'weapons'], ['ammunition', 'weapons'], ['airsoft', 'weapons'],
  ['drug', 'drugs'], ['weed', 'drugs'], ['ganja', 'drugs'], ['cannabis', 'drugs'], ['vape', 'tobacco and vapes'], ['cigarette', 'tobacco and vapes'], ['tobacco', 'tobacco and vapes'],
  ['alcohol', 'alcohol'], ['whisky', 'alcohol'], ['vodka', 'alcohol'], ['beer', 'alcohol'], ['wine', 'alcohol'],
  ['medicine', 'medicines'], ['prescription', 'medicines'], ['tablets', 'medicines'], ['injection', 'medicines'],
  ['puppy', 'animals'], ['kitten', 'animals'], ['pet for sale', 'animals'],
  ['gemstone', 'astrological remedies'], ['rudraksha', 'astrological remedies'], ['yantra', 'astrological remedies'],
  ['aadhaar', 'identity documents'], ['pan card', 'identity documents'], ['sim card', 'identity documents'],
  ['ticket resale', 'event tickets'], ['exam paper', 'academic dishonesty'], ['assignment writing', 'academic dishonesty'],
];

/** Returns the category a listing falls into if it isn't allowed, otherwise null. */
export function prohibitedCategory(text: string): string | null {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ')} `;
  for (const [w, cat] of PROHIBITED) if (t.includes(` ${w} `) || t.includes(` ${w}s `)) return cat;
  return null;
}

export const SAFETY_TIPS = [
  'Meet in a busy public place, in daylight, and tell a friend where you’re going.',
  'Check the item before you pay. Nakshatra doesn’t handle payments and can’t refund them.',
  'Never share OTPs, bank details or ID documents.',
  'If something feels off, walk away and report the listing.',
];
