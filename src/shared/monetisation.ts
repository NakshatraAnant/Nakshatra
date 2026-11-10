/**
 * Monetisation foundation (monetisation-v1).
 *
 * One commercial model for every revenue stream: catalogue products/variants (existing tables
 * `products`, `product_variants`), subscription plans (`subscription_plans`, `subscriptions`),
 * entitlements (`entitlements`, server-checked), payments/refunds (`payments`, `payment_events`, `refunds`,
 * provider-agnostic, signed webhooks), gifts (`gift_claims`) and discounts (`discounts`). This file adds the
 * pure contracts that were missing: revenue models and their launch status, commission and revenue-share
 * maths (integer paise, deterministic rounding), and sponsored-content disclosure.
 *
 * Nothing here moves money. Live payments require PAYMENTS_ENABLED=true (config.ts).
 */

export type LaunchStatus = 'ready' | 'infrastructure' | 'future' | 'not_at_scale';
export type RevenueGroup = 'subscription' | 'identity_products' | 'digital_goods' | 'creator' | 'community' | 'brand' | 'partnership' | 'b2b';

export interface RevenueModel {
  id: number;
  key: string;
  group: RevenueGroup;
  name: string;
  offer: string;
  buyer: string;
  mechanism: 'subscription' | 'one_time' | 'commission' | 'revenue_share' | 'sponsorship' | 'advertising' | 'licence';
  integration: string;
  entities: string;
  entitlement: string;
  flow: string;
  operations: string;
  risks: string;
  dependencies: string;
  status: LaunchStatus;
}

const M = (id: number, key: string, group: RevenueGroup, name: string, mechanism: RevenueModel['mechanism'], status: LaunchStatus, d: Omit<RevenueModel, 'id' | 'key' | 'group' | 'name' | 'mechanism' | 'status'>): RevenueModel => ({ id, key, group, name, mechanism, status, ...d });

const SUB = 'subscription_plans + subscriptions + entitlements(kind=subscription, expiresAt)';
const PROD = 'products + product_variants + entitlements(kind=product)';
const PAY = 'Payment provider with PAYMENTS_ENABLED=true; refund policy published';

export const REVENUE_MODELS: RevenueModel[] = [
  M(1, 'plus_monthly', 'subscription', 'Nakshatra Plus monthly', 'subscription', 'infrastructure', { offer: 'Monthly membership: extra card styles, expanded reports, season premium track', buyer: 'Engaged member', integration: 'Settings → Subscription; premium previews', entities: SUB, entitlement: 'Active while subscription entitlement not expired/revoked', flow: 'Plan page → checkout → webhook → entitlement', operations: 'Renewal reminders (manual renewal today), cancellations', risks: 'Chargebacks, card testing', dependencies: `${PAY}; benefits redesigned for the identity product (current plan text is astrology-era)` }),
  M(2, 'plus_annual', 'subscription', 'Nakshatra Plus annual', 'subscription', 'infrastructure', { offer: 'Yearly membership at a discount', buyer: 'Committed member', integration: 'Same as monthly', entities: SUB, entitlement: 'Same as monthly, 12-month period', flow: 'As monthly', operations: 'Pro-rata refunds policy', risks: 'Refund disputes', dependencies: PAY }),
  M(3, 'duo_plan', 'subscription', 'Buddy / duo plan', 'subscription', 'infrastructure', { offer: 'Two members share one plan', buyer: 'Friends, couples', integration: 'Plan + invite link (reuse circle invite pattern)', entities: `${SUB} + plan seats table`, entitlement: 'Seat holder gets subscription entitlement sourced from owner subscription', flow: 'Buy → invite second seat → claim (gift_claims pattern)', operations: 'Seat transfer rules', risks: 'Seat reselling', dependencies: 'Seats model not built' }),
  M(4, 'student_plan', 'subscription', 'Student plan', 'subscription', 'infrastructure', { offer: 'Discounted Plus for verified students', buyer: 'Students', integration: 'Plan + eligibility check', entities: `${SUB} + verification_requests`, entitlement: 'As Plus, gated by verified student status', flow: 'Verify → discounted plan', operations: 'Manual or partner verification', risks: 'Eligibility fraud', dependencies: 'Student verification provider' }),
  M(5, 'founding_pass', 'subscription', 'Founding Member Pass', 'one_time', 'infrastructure', { offer: 'One-time supporter pass with a permanent cosmetic badge', buyer: 'Early adopters', integration: 'Shop product with cosmetic collectible', entities: PROD + ' + collectibles(unlock purchase)', entitlement: 'Permanent product entitlement → badge', flow: 'Shop → checkout → entitlement → badge', operations: 'Clear "no extra power" wording', risks: 'Expectation management', dependencies: PAY }),
  M(6, 'expanded_identity_report', 'identity_products', 'Expanded Identity Report', 'one_time', 'ready', { offer: '₹99 report: twenty sections across five dimensions (price verified in db/seed.ts)', buyer: 'Member with a saved assessment', integration: 'Shop, Identity Studio, gifting', entities: `${PROD} + report_documents + gift_claims`, entitlement: 'Product entitlement; document generated on purchase or later from Library', flow: 'Product → checkout (simulator in test) → library', operations: 'Content review', risks: 'Refund abuse after reading', dependencies: 'Payments only; product fully built and tested in simulator mode' }),
  M(7, 'archetype_packs', 'identity_products', 'Archetype Expansion Packs', 'one_time', 'future', { offer: 'Deeper content per archetype pair or theme', buyer: 'Curious members', integration: 'Identity Studio upsell', entities: PROD + ' + content packs', entitlement: 'Product entitlement unlocks content keys', flow: 'Preview → buy → unlock', operations: 'Content writing', risks: 'Low perceived value', dependencies: 'Content not written' }),
  M(8, 'compatibility_report', 'identity_products', 'Compatibility Report', 'one_time', 'future', { offer: 'Two-person report built from both people’s shared data, with consent', buyer: 'Friends, partners', integration: 'Common Ground card upsell', entities: PROD + ' + consent record from both people', entitlement: 'Buyer entitlement; requires the other person’s consent', flow: 'Common ground → request consent → buy', operations: 'Consent handling', risks: 'Using someone’s data without consent', dependencies: 'Two-party consent flow' }),
  M(9, 'relationship_bundle', 'identity_products', 'Relationship Insights Bundle', 'one_time', 'future', { offer: 'Bundle of compatibility + conversation guides', buyer: 'Pairs', integration: 'Bundle of products', entities: PROD + ' (bundle variant)', entitlement: 'Multiple product entitlements', flow: 'As above', operations: 'As above', risks: 'As above', dependencies: 'Model 8' }),
  M(10, 'evolution_report', 'identity_products', 'Identity Evolution Report', 'one_time', 'infrastructure', { offer: 'Printable report of your timeline across retakes', buyer: 'Members with 2+ results', integration: 'Identity timeline (built)', entities: PROD + ' + report_documents', entitlement: 'Product entitlement', flow: 'Timeline → buy → generate', operations: 'Template', risks: 'Low', dependencies: 'Report template not written; timeline data exists' }),
  M(11, 'guided_programmes', 'identity_products', 'Guided Identity Programmes', 'one_time', 'future', { offer: 'Multi-week guided programmes', buyer: 'Self-improvement seekers', integration: 'Quests engine (multi-step quests built)', entities: 'quests + product entitlement', entitlement: 'Entitlement unlocks programme quest set', flow: 'Buy → programme quests appear', operations: 'Content', risks: 'Wellness claims', dependencies: 'Content; claims review' }),
  M(12, 'workbooks', 'identity_products', 'Digital Reflection Workbooks', 'one_time', 'future', { offer: 'Downloadable workbooks', buyer: 'Members', integration: 'Library', entities: PROD + ' + uploads (private)', entitlement: 'Product entitlement gates download', flow: 'Shop → library download', operations: 'Design', risks: 'Piracy', dependencies: 'Private file delivery route' }),
  M(13, 'audio', 'identity_products', 'Premium Audio Collections', 'one_time', 'future', { offer: 'Audio reflections', buyer: 'Members', integration: 'Library', entities: PROD + ' + media uploads', entitlement: 'As workbooks', flow: 'As workbooks', operations: 'Production', risks: 'Low', dependencies: 'Audio content' }),
  M(14, 'quiz_collections', 'identity_products', 'Premium Quiz Collections', 'one_time', 'future', { offer: 'Extra mini-assessments', buyer: 'Members', integration: 'Mini-assessment engine (not built)', entities: PROD + ' + quiz definitions', entitlement: 'Product entitlement', flow: 'Preview first question → buy', operations: 'Content', risks: 'Psychometric overclaiming', dependencies: 'Mini assessment engine' }),
  M(15, 'card_packs', 'identity_products', 'Personalised Share Card Packs', 'one_time', 'ready', { offer: '₹29 card style pack (Eclipse Ink & Saffron Foil; price verified in db/seed.ts)', buyer: 'Sharers', integration: 'Identity Studio card styles', entities: PROD + ' + collectibles(unlock purchase)', entitlement: 'Product entitlement unlocks card styles server-side', flow: 'Studio preview → shop → unlock', operations: 'Art', risks: 'Low', dependencies: 'Payments only' }),
  M(16, 'theme_store', 'digital_goods', 'Profile Theme Store', 'one_time', 'infrastructure', { offer: 'Profile themes', buyer: 'Members', integration: 'Collectibles (kind theme)', entities: PROD + ' + collectibles', entitlement: 'Purchase unlock type', flow: 'Store → unlock', operations: 'Art', risks: 'Low', dependencies: PAY }),
  M(17, 'avatar_cosmetics', 'digital_goods', 'Avatar Cosmetics', 'one_time', 'future', { offer: 'Avatar frames/accessories', buyer: 'Members', integration: 'Avatar creator (not built)', entities: 'collectibles(kind frame)', entitlement: 'Purchase unlock', flow: 'Store', operations: 'Art', risks: 'Low', dependencies: 'Avatar creator' }),
  M(18, 'animated_effects', 'digital_goods', 'Animated Profile Effects', 'one_time', 'future', { offer: 'Subtle animated profile effects', buyer: 'Members', integration: 'Profile', entities: 'collectibles', entitlement: 'Purchase unlock; must respect reduced motion', flow: 'Store', operations: 'Performance budget', risks: 'Accessibility', dependencies: 'Effect renderer' }),
  M(19, 'reaction_packs', 'digital_goods', 'Reaction and Sticker Packs', 'one_time', 'future', { offer: 'Extra reaction sets', buyer: 'Members', integration: 'Reactions (fixed enum today)', entities: 'reaction pack catalogue + entitlements', entitlement: 'Purchase unlock', flow: 'Store', operations: 'Moderation of stickers', risks: 'Offensive art', dependencies: 'Reaction model change' }),
  M(20, 'virtual_gifts', 'digital_goods', 'Virtual Gifts', 'one_time', 'infrastructure', { offer: 'Gift a digital item to a friend', buyer: 'Members', integration: 'gift_claims (built, verified-email claim)', entities: 'orders(isGift) + gift_claims + entitlements(sourceType gift_claim)', entitlement: 'Recipient only, after verified claim', flow: 'Checkout as gift → email link → claim', operations: 'Refund/expiry handled', risks: 'Gift card fraud', dependencies: PAY }),
  M(21, 'seasonal_pass', 'digital_goods', 'Seasonal Pass', 'one_time', 'infrastructure', { offer: 'Premium season track', buyer: 'Active members', integration: 'Season engine (premiumTrack defined, disabled)', entities: 'season_claims(track premium) + product entitlement', entitlement: 'Entitlement enables premium milestones', flow: 'Season page → buy pass → claim premium rewards', operations: 'Season content', risks: 'Pay-to-win perception (cosmetic only)', dependencies: PAY }),
  M(22, 'game_expansion', 'digital_goods', 'Game Expansion Pass', 'one_time', 'future', { offer: 'Extra prompt banks / games', buyer: 'Circles that play', integration: 'Game engine prompt banks', entities: 'entitlements gating prompt bank ids', entitlement: 'Host entitlement unlocks banks for the session', flow: 'Lobby → pick pack', operations: 'Content', risks: 'Splitting circles by payment', dependencies: 'Prompt bank gating' }),
  M(23, 'game_bundles', 'digital_goods', 'Themed Game Bundles', 'one_time', 'future', { offer: 'Holiday/themed bundles', buyer: 'Circles', integration: 'As 22', entities: 'As 22', entitlement: 'As 22', flow: 'As 22', operations: 'Content', risks: 'As 22', dependencies: 'Model 22' }),
  M(24, 'creator_memberships', 'creator', 'Creator Memberships', 'revenue_share', 'not_at_scale', { offer: 'Members subscribe to a creator', buyer: 'Fans', integration: 'Creator profiles (legacy creator role exists)', entities: SUB + ' + payouts', entitlement: 'Subscription entitlement scoped to creator', flow: 'Creator page → subscribe', operations: 'Payouts, KYC, tax', risks: 'Fraud, content moderation', dependencies: 'Creator programme, payouts, KYC' }),
  M(25, 'paid_unlocks', 'creator', 'Single Paid Content Unlocks', 'revenue_share', 'infrastructure', { offer: 'Unlock one premium post', buyer: 'Fans', integration: 'Thought Drops', entities: PROD + ' per post', entitlement: 'Product entitlement per post', flow: 'Locked post → buy', operations: 'As 24', risks: 'Spam selling', dependencies: 'As 24' }),
  M(26, 'creator_bundles', 'creator', 'Creator Digital Bundles', 'revenue_share', 'not_at_scale', { offer: 'Creator-made bundles', buyer: 'Fans', integration: 'Seller studio (legacy marketplace, disabled)', entities: 'products(sellerId) + commission rule', entitlement: 'Product entitlement', flow: 'Storefront', operations: 'As 24', risks: 'IP disputes', dependencies: 'Marketplace module' }),
  M(27, 'newsletter', 'creator', 'Paid Creator Newsletter', 'revenue_share', 'not_at_scale', { offer: 'Paid email newsletter', buyer: 'Fans', integration: 'Email outbox', entities: SUB, entitlement: 'Subscription', flow: 'Subscribe', operations: 'Deliverability', risks: 'Spam complaints', dependencies: 'Bulk email provider' }),
  M(28, 'ticketed_sessions', 'creator', 'Ticketed Creator Sessions', 'commission', 'not_at_scale', { offer: 'Paid live sessions', buyer: 'Fans', integration: 'Events (privacy fixed)', entities: 'events(pricePaise) + entitlements(kind event)', entitlement: 'Event entitlement reveals live link', flow: 'Event → ticket', operations: 'Video provider', risks: 'No-shows, refunds', dependencies: 'Video provider' }),
  M(29, 'workshops', 'creator', 'Creator Workshops and Courses', 'commission', 'not_at_scale', { offer: 'Courses', buyer: 'Learners', integration: 'Legacy LMS (disabled)', entities: 'courses + enrollments', entitlement: 'Course entitlement', flow: 'Course page', operations: 'Content quality', risks: 'Low-quality courses', dependencies: 'Learning module' }),
  M(30, 'tips', 'creator', 'Creator Tips and Support', 'commission', 'infrastructure', { offer: 'Tip a creator (10% platform fee)', buyer: 'Fans', integration: 'Creator pages (/creators/:handle)', entities: 'creator_tips + payments(purpose creator_tip) + creator_ledger (held)', entitlement: 'None', flow: 'Tip box → payment → verified event → held ledger line', operations: 'Moderation suspends pages; refunds reverse the ledger', risks: 'Money laundering (daily cap, no self-tips)', dependencies: 'PAYMENTS_ENABLED, then payouts + KYC before any withdrawal' }),
  M(31, 'creator_store_commission', 'creator', 'Creator Store Commission', 'commission', 'not_at_scale', { offer: 'Commission on creator store sales', buyer: 'Fans (platform earns commission)', integration: 'Seller studio', entities: 'order_items(sellerId) + CommissionRule', entitlement: 'As product', flow: 'Storefront', operations: 'Payouts', risks: 'Fraud', dependencies: 'Marketplace' }),
  M(32, 'asset_marketplace', 'creator', 'Digital Asset Marketplace Commission', 'commission', 'not_at_scale', { offer: 'Creator-made card styles/themes', buyer: 'Members', integration: 'Collectibles', entities: 'products(sellerId) + collectibles', entitlement: 'Purchase unlock', flow: 'Marketplace', operations: 'Review queue', risks: 'IP', dependencies: 'Marketplace + review' }),
  M(33, 'circle_membership_share', 'community', 'Circle Membership Revenue Share', 'revenue_share', 'infrastructure', { offer: 'Paid membership circles', buyer: 'Circle members', integration: 'Circles (private by design)', entities: 'groups + subscriptions scoped to circle + revenue share', entitlement: 'Membership gated by entitlement', flow: 'Invite → pay → join', operations: 'Disputes', risks: 'Turns friend circles transactional', dependencies: 'Product decision' }),
  M(34, 'circle_pro', 'community', 'Circle Pro Subscription', 'subscription', 'future', { offer: 'Larger circles, more games, custom themes', buyer: 'Circle owners', integration: 'Circle limits (MAX_OWNED_CIRCLES, invite caps)', entities: SUB + ' scoped to circle owner', entitlement: 'Owner entitlement raises limits', flow: 'Circle settings → upgrade', operations: 'Limits config', risks: 'Low', dependencies: PAY }),
  M(35, 'event_ticketing_fee', 'community', 'Circle Event Ticketing Fee', 'commission', 'infrastructure', { offer: 'Fee on paid circle events', buyer: 'Attendees', integration: 'Events', entities: 'events + payments + CommissionRule', entitlement: 'Event entitlement', flow: 'RSVP with payment', operations: 'Refunds', risks: 'Event fraud', dependencies: 'Paid events' }),
  M(36, 'sponsored_circles', 'brand', 'Sponsored Circles', 'sponsorship', 'not_at_scale', { offer: 'Brand-hosted public circles', buyer: 'Brands', integration: 'Would need public circles (not in product)', entities: 'SponsoredPlacement contract', entitlement: 'n/a', flow: 'Disclosed brand circle', operations: 'Sales, review', risks: 'Trust; conflicts with private circles', dependencies: 'Audience scale' }),
  M(37, 'sponsored_quizzes', 'brand', 'Sponsored Quizzes', 'sponsorship', 'not_at_scale', { offer: 'Brand-themed mini quiz', buyer: 'Brands', integration: 'Mini assessments', entities: 'SponsoredPlacement', entitlement: 'n/a', flow: 'Disclosed quiz', operations: 'Review', risks: 'Data use — must not share answers', dependencies: 'Mini assessments; scale' }),
  M(38, 'sponsored_quests', 'brand', 'Sponsored Quests', 'sponsorship', 'not_at_scale', { offer: 'Brand quest with cosmetic reward', buyer: 'Brands', integration: 'Quest engine', entities: 'quests + SponsoredPlacement', entitlement: 'Cosmetic collectible', flow: 'Disclosed quest', operations: 'Review', risks: 'Manipulative incentives', dependencies: 'Scale' }),
  M(39, 'sponsored_seasons', 'brand', 'Sponsored Seasonal Events', 'sponsorship', 'not_at_scale', { offer: 'Season presented by a brand', buyer: 'Brands', integration: 'Season engine', entities: 'SEASONS + SponsoredPlacement', entitlement: 'n/a', flow: 'Disclosed', operations: 'Sales', risks: 'Brand safety', dependencies: 'Scale' }),
  M(40, 'sponsored_games', 'brand', 'Sponsored Games', 'sponsorship', 'not_at_scale', { offer: 'Branded prompt bank', buyer: 'Brands', integration: 'Game prompt banks', entities: 'prompt banks + SponsoredPlacement', entitlement: 'n/a', flow: 'Disclosed in lobby', operations: 'Review', risks: 'Annoyance', dependencies: 'Scale' }),
  M(41, 'sponsored_thoughts', 'brand', 'Sponsored Thought Drops', 'advertising', 'infrastructure', { offer: 'Disclosed brand posts in feed', buyer: 'Brands', integration: 'Feed ranking', entities: 'posts + SponsoredPlacement', entitlement: 'n/a', flow: 'Labelled "Sponsored"', operations: 'Ad review', risks: 'Feed trust', dependencies: 'Scale' }),
  M(42, 'promoted_discovery', 'brand', 'Promoted Discovery Placement', 'advertising', 'not_at_scale', { offer: 'Promoted placement in discovery', buyer: 'Creators/brands', integration: 'Discovery (not built)', entities: 'SponsoredPlacement', entitlement: 'n/a', flow: 'Labelled', operations: 'Review', risks: 'Pay-to-rank', dependencies: 'People discovery' }),
  M(43, 'contextual_ads', 'brand', 'Contextual Advertising', 'advertising', 'infrastructure', { offer: 'Context-only ads (no profiling)', buyer: 'Advertisers', integration: 'Feed/Shop', entities: 'SponsoredPlacement', entitlement: 'n/a', flow: 'Labelled', operations: 'Ad ops', risks: 'Privacy promise — never personality targeting', dependencies: 'Scale; policy' }),
  M(44, 'rewarded_ads', 'brand', 'Rewarded Advertising', 'advertising', 'not_at_scale', { offer: 'Watch ad for cosmetic', buyer: 'Advertisers', integration: 'Rewards', entities: 'SponsoredPlacement + collectibles', entitlement: 'Cosmetic', flow: 'Opt-in only', operations: 'Ad network', risks: 'Cheapens product; farming', dependencies: 'Ad network (not appropriate now)' }),
  M(45, 'affiliate', 'partnership', 'Affiliate Commerce', 'commission', 'infrastructure', { offer: 'Disclosed affiliate recommendations', buyer: 'Members (partner pays)', integration: 'Content', entities: 'CommissionRule + products.commercialDisclosure', entitlement: 'n/a', flow: 'Disclosed links', operations: 'Partner tracking', risks: 'Undisclosed promotion', dependencies: 'Partners' }),
  M(46, 'partner_offers', 'partnership', 'Partner Lead/Offer Commission', 'commission', 'infrastructure', { offer: 'Opt-in partner offers', buyer: 'Partners', integration: 'Shop', entities: 'CommissionRule', entitlement: 'n/a', flow: 'Opt-in', operations: 'Partner management', risks: 'Data sharing — must be opt-in', dependencies: 'Partners, consent' }),
  M(47, 'merch', 'partnership', 'Physical Merchandise', 'one_time', 'infrastructure', { offer: 'Archetype merch', buyer: 'Fans', integration: 'Legacy physical commerce (disabled)', entities: 'products(fulfilment physical) + shipments', entitlement: 'n/a', flow: 'Shop', operations: 'Fulfilment', risks: 'Inventory', dependencies: 'Marketplace module, logistics' }),
  M(48, 'print_on_demand', 'partnership', 'Print-on-Demand Identity Products', 'commission', 'future', { offer: 'Print your card on products', buyer: 'Members', integration: 'Share card renderer', entities: 'products + POD partner', entitlement: 'n/a', flow: 'Card → print', operations: 'Partner API', risks: 'Quality', dependencies: 'POD partner' }),
  M(49, 'campus', 'b2b', 'Campus and University Packages', 'licence', 'future', { offer: 'Orientation circles, icebreaker games for cohorts', buyer: 'Universities', integration: 'Circles + games', entities: 'organisation + seats (not built)', entitlement: 'Org-scoped entitlements', flow: 'Sales-led', operations: 'Contracts, data processing agreements', risks: 'Student privacy', dependencies: 'Org accounts' }),
  M(50, 'white_label', 'b2b', 'B2B White-label Identity Products', 'licence', 'not_at_scale', { offer: 'Licensed assessment + cards', buyer: 'Companies', integration: 'Assessment engine', entities: 'licence contracts', entitlement: 'n/a', flow: 'Sales-led', operations: 'Support, SLAs', risks: 'Psychometric claims in HR contexts', dependencies: 'Validation; legal' }),
];

/* ---------------- Contracts ---------------- */

export interface CommissionRule { key: string; percentBps: number; fixedPaise: number; minPaise?: number; maxPaise?: number }

/** Platform commission in paise: basis points + fixed fee, clamped, never more than the gross. */
export function commission(grossPaise: number, rule: CommissionRule): number {
  if (!Number.isInteger(grossPaise) || grossPaise < 0) throw new Error('gross must be a non-negative integer (paise)');
  let fee = Math.floor((grossPaise * rule.percentBps) / 10000) + rule.fixedPaise;
  if (rule.minPaise !== undefined) fee = Math.max(fee, rule.minPaise);
  if (rule.maxPaise !== undefined) fee = Math.min(fee, rule.maxPaise);
  return Math.min(Math.max(0, fee), grossPaise);
}

/** Splits net revenue between parties by basis points; rounding remainder goes to the first party. Sums exactly to net. */
export function revenueShare(netPaise: number, shares: { party: string; bps: number }[]): Record<string, number> {
  const total = shares.reduce((t, s) => t + s.bps, 0);
  if (total !== 10000) throw new Error('shares must total 10000 bps');
  const out: Record<string, number> = {};
  let allocated = 0;
  for (const s of shares) { out[s.party] = Math.floor((netPaise * s.bps) / 10000); allocated += out[s.party]; }
  out[shares[0].party] += netPaise - allocated;
  return out;
}

export interface SponsoredPlacement { sponsor: string; surface: 'circle' | 'quiz' | 'quest' | 'season' | 'game' | 'thought' | 'discovery' | 'context'; startsOn: string; endsOn: string; targeting: 'none' | 'contextual' }

/** Every sponsored surface carries this label. Targeting by personality, pen names or private data is not allowed. */
export function sponsoredDisclosure(p: SponsoredPlacement): string {
  if ((p.targeting as string) !== 'none' && p.targeting !== 'contextual') throw new Error('Only untargeted or contextual sponsorship is allowed');
  return `Sponsored by ${p.sponsor}`;
}
