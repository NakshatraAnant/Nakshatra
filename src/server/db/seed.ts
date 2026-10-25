import { and, eq, inArray, sql } from 'drizzle-orm';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as s from './schema';
import type { Ctx } from '../lib/context';
import { hashPassword, randomToken } from '../lib/crypto';
import { CONFIGS, calculateAndStore } from '../services/identity';
import { INTERPRETATION_RULES } from '../../content/interpretations';
import { DAILY_LESSONS } from '../../content/daily';
import { refreshRules } from '../services/content';
import { normalizeBirth } from '../../astro';
import { NOTIFICATION_CATEGORIES } from '../lib/notify';

/**
 * Reference data required for the platform to operate (idempotent, all environments):
 * calculation configurations, interpretation content v1, subscription plans, flags,
 * notification templates and platform settings.
 */
export async function seedReferenceData(ctx: Ctx) {
  const db = ctx.db;
  for (const [key, c] of Object.entries(CONFIGS)) {
    await db.insert(s.calculationConfigs).values({ key, system: c.system, config: c as unknown as Record<string, unknown>, label: key.replace(/_/g, ' '), isDefault: key.endsWith('_default') }).onConflictDoNothing();
  }
  const existing = await db.select({ k: s.interpretationContent.ruleKey, v: s.interpretationContent.version }).from(s.interpretationContent);
  const latest = new Map<string, number>();
  for (const e of existing) latest.set(e.k, Math.max(e.v, latest.get(e.k) ?? 0));
  // A rule is installed when it is new, or when the code ships a newer version than any stored one.
  // Admin edits create higher versions, so they are never overwritten by an older code pack.
  const missing = INTERPRETATION_RULES.filter((r) => (latest.get(r.key) ?? 0) < r.version);
  const superseded = missing.filter((r) => latest.has(r.key)).map((r) => r.key);
  if (superseded.length) await db.update(s.interpretationContent).set({ status: 'retired' }).where(and(inArray(s.interpretationContent.ruleKey, superseded), eq(s.interpretationContent.status, 'published')));
  for (let i = 0; i < missing.length; i += 200) {
    await db.insert(s.interpretationContent).values(missing.slice(i, i + 200).map((r) => ({
      ruleKey: r.key, version: r.version, system: r.system, groupKey: r.group, condition: r.condition as unknown as Record<string, unknown>, importance: r.importance,
      titleEn: r.title.en, bodyEn: r.body.en, titleHi: r.title.hi ?? null, bodyHi: r.body.hi ?? null, caveat: r.caveat ?? null, source: r.source, factorLabel: r.factorLabel, status: r.status,
    }))).onConflictDoNothing();
  }
  await refreshRules(db);

  await db.insert(s.subscriptionPlans).values([
    { key: 'plus_monthly', name: 'Nakshatra+ Monthly', description: 'Included reports, exclusive Cosmic ID themes and frames, and advanced chart tools.', pricePaise: 19900, intervalMonths: 1, benefits: ['Complete Vedic and Western reports included', 'Eclipse theme and gilded frame', 'Unlimited chart snapshots'] },
    { key: 'plus_yearly', name: 'Nakshatra+ Yearly', description: 'Everything in Nakshatra+ Monthly, billed yearly.', pricePaise: 199900, intervalMonths: 12, benefits: ['Everything in monthly', 'Two months free compared with monthly'] },
  ]).onConflictDoNothing();

  await db.insert(s.featureFlags).values([
    { key: 'dating', description: 'Astrology-optional dating module', enabled: true },
    { key: 'matchmaking', description: 'Marriage matchmaking and Family Bridge', enabled: true },
    { key: 'weddings', description: 'Wedding planning and vendor marketplace', enabled: true },
    { key: 'experts', description: 'Expert consultations marketplace', enabled: true },
    { key: 'three_d', description: '3D experiences (falls back to 2D when disabled)', enabled: true },
    { key: 'stories', description: 'Temporary 24-hour stories', enabled: true },
    { key: 'circles', description: 'Private circles, invites and circle rituals', enabled: true },
    { key: 'play', description: 'Social games (turn-based engine)', enabled: true },
  ]).onConflictDoNothing();

  // Platform offers (real products in every environment; admins can change prices or archive them).
  // Payment capture still depends on the configured provider; without one, checkout shows the dev/test state.
  const offers = [
    { slug: 'cosmetic-card-styles', title: 'Identity Card Styles: Eclipse Ink & Saffron Foil', description: 'Two premium identity-card styles for your share cards and profile. Cosmetic only — it never affects points, levels or how you appear in feeds.', category: 'cosmetic', digitalAsset: { cosmetics: ['card_eclipse_ink', 'card_saffron_foil'] }, variant: { sku: 'cosmetic-card-styles-1', name: 'Style pack', price: 2900 } },
    { slug: 'report-identity-expanded', title: 'Expanded Identity Report', description: 'Your archetype in depth: strengths, blind spots, friendships and one small experiment for each of your five dimensions, built from your own answers.', category: 'report', digitalAsset: { reportTemplate: 'identity_expanded' }, variant: { sku: 'report-identity-expanded-1', name: 'Digital report', price: 9900 } },
  ];
  for (const o of offers) {
    const [ex] = await db.select({ id: s.products.id }).from(s.products).where(eq(s.products.slug, o.slug));
    if (ex) continue;
    const [row] = await db.insert(s.products).values({ slug: o.slug, title: o.title, description: o.description, category: o.category, fulfilment: 'digital', digitalAsset: o.digitalAsset, status: 'active', isSample: false }).returning();
    await db.insert(s.productVariants).values({ productId: row.id, sku: o.variant.sku, name: o.variant.name, pricePaise: o.variant.price, stock: null });
  }
  await db.insert(s.experiments).values([{ key: 'onboarding_copy', description: 'Onboarding headline variant', variants: ['control', 'identity_first'], active: false }]).onConflictDoNothing();

  await db.insert(s.notificationTemplates).values([
    { key: 'bond_invite', category: 'bonds', titleTemplate: '{name} invited you to a Bond', bodyTemplate: 'Compare charts and explore your connection — only if you choose to.' },
    { key: 'booking_confirmed', category: 'bookings', titleTemplate: 'Your consultation is confirmed', bodyTemplate: '{service} on {date}' },
    { key: 'order_confirmed', category: 'orders', titleTemplate: 'Order {number} confirmed', bodyTemplate: 'Thank you for your order.' },
    { key: 'security_signin', category: 'security', titleTemplate: 'New sign-in to your account', bodyTemplate: 'If this wasn’t you, revoke the session in Settings → Security.' },
  ]).onConflictDoNothing();

  await db.insert(s.platformSettings).values([
    { key: 'expert_commission_percent', value: 20 },
    { key: 'creator_revenue_share_percent', value: 70 },
  ]).onConflictDoNothing();
}

/* ---------------- Development demo data (clearly labelled samples) ---------------- */

interface DevCredential { role: string; email: string; password: string }

async function ensureUser(ctx: Ctx, email: string, displayName: string, roles: string[], creds: DevCredential[], role: string) {
  const [u] = await ctx.db.select().from(s.users).where(sql`lower(${s.users.email}) = ${email}`);
  if (u) return u.id;
  const password = `Dev-${randomToken(9)}`;
  const [row] = await ctx.db.insert(s.users).values({ email, passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), ageConfirmedAt: new Date(), referralCode: `NK${randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, 'Z')}` }).returning();
  await ctx.db.insert(s.profiles).values({ userId: row.id, handle: email.split('@')[0].replace(/[^a-z0-9]/g, ''), displayName, visibility: 'public', interests: ['vedic', 'learning'] });
  await ctx.db.insert(s.notificationSettings).values({ userId: row.id });
  await ctx.db.insert(s.notificationPreferences).values(NOTIFICATION_CATEGORIES.map((category) => ({ userId: row.id, category }))).onConflictDoNothing();
  for (const r of roles) await ctx.db.insert(s.userRoles).values({ userId: row.id, role: r }).onConflictDoNothing();
  creds.push({ role, email, password });
  return row.id;
}

async function ensureBirth(ctx: Ctx, userId: string, date: string, time: string, place: { name: string; lat: number; lon: number; tz: string }) {
  const [bp0] = await ctx.db.select().from(s.birthProfiles).where(and(eq(s.birthProfiles.userId, userId), eq(s.birthProfiles.isPrimary, true)));
  if (bp0) return;
  const n = normalizeBirth({ date, time, timePrecision: 'exact', latitude: place.lat, longitude: place.lon, timezone: place.tz });
  const [bp] = await ctx.db.insert(s.birthProfiles).values({ userId, isPrimary: true, birthDate: date, birthTime: time, timePrecision: 'exact', placeName: place.name, latitude: place.lat, longitude: place.lon, timezone: place.tz, utcOffsetMinutes: n.utcOffsetMinutes, birthUtc: n.utc, locationSource: 'manual' }).returning();
  await calculateAndStore(ctx.db, userId, bp, 'vedic_default');
  await calculateAndStore(ctx.db, userId, bp, 'western_default');
  await ctx.db.update(s.profiles).set({ onboardingCompletedAt: new Date() }).where(eq(s.profiles.userId, userId));
  await ctx.db.insert(s.userLocations).values({ userId, placeName: place.name, latitude: place.lat, longitude: place.lon, timezone: place.tz }).onConflictDoNothing();
}

const DELHI = { name: 'New Delhi, India', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' };
const MUMBAI = { name: 'Mumbai, India', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' };
const CHENNAI = { name: 'Chennai, India', lat: 13.0827, lon: 80.2707, tz: 'Asia/Kolkata' };

export async function seedDemoData(ctx: Ctx): Promise<DevCredential[]> {
  if (ctx.config.isProd) throw new Error('Demo data is never seeded in production.');
  const creds: DevCredential[] = [];
  const adminId = await ensureUser(ctx, 'admin@nakshatra.local', 'Nakshatra Admin', ['admin'], creds, 'admin');
  const modId = await ensureUser(ctx, 'moderator@nakshatra.local', 'Moderator (dev)', ['moderator', 'support'], creds, 'moderator');
  // Every account onboards with a birth profile (unknown time allowed); sample staff get sample data so they can sign in directly.
  await ensureBirth(ctx, adminId, '1985-01-26', '09:00', DELHI);
  await ensureBirth(ctx, modId, '1990-08-15', '12:00', MUMBAI);

  // Sample experts — labelled as sample profiles in every listing.
  const experts = [
    { email: 'sample.expert1@nakshatra.local', name: 'Sample Expert — Vedic (dev data)', headline: 'Sample profile for local testing: Vedic chart readings', spec: ['vedic', 'kp'], langs: ['English', 'Hindi'], years: 12, price: 49900 },
    { email: 'sample.expert2@nakshatra.local', name: 'Sample Expert — Tarot (dev data)', headline: 'Sample profile for local testing: tarot and numerology', spec: ['tarot', 'numerology'], langs: ['English', 'Tamil'], years: 6, price: 29900 },
  ];
  for (const e of experts) {
    const id = await ensureUser(ctx, e.email, e.name, ['expert'], creds, 'sample expert');
    await ensureBirth(ctx, id, '1978-04-14', '06:30', CHENNAI);
    const [ex] = await ctx.db.select().from(s.expertProfiles).where(eq(s.expertProfiles.userId, id));
    if (!ex) {
      await ctx.db.insert(s.expertProfiles).values({ userId: id, displayName: e.name, headline: e.headline, bio: 'This is development sample data. It is not a real practitioner and has no real credentials, reviews or availability outside your local environment.', specializations: e.spec, languages: e.langs, yearsExperience: e.years, verificationStatus: 'verified', verifiedAt: new Date(), isSample: true });
      await ctx.db.insert(s.expertServices).values([
        { expertId: id, mode: 'chat', title: '30-minute chat consultation', description: 'Text consultation inside Nakshatra messages.', durationMinutes: 30, pricePaise: e.price },
        { expertId: id, mode: 'video', title: '45-minute video consultation', description: 'Requires a configured video provider.', durationMinutes: 45, pricePaise: e.price * 2 },
      ]);
      await ctx.db.insert(s.availabilityRules).values([1, 2, 3, 4, 5, 6].map((weekday) => ({ expertId: id, weekday, startTime: '10:00', endTime: '18:00' })));
    }
  }

  // Free sample course built from authored lesson content.
  const [course0] = await ctx.db.select().from(s.courses).where(eq(s.courses.slug, 'foundations-of-astrology-sample'));
  if (!course0) {
    const [c] = await ctx.db.insert(s.courses).values({ creatorId: adminId, slug: 'foundations-of-astrology-sample', title: 'Foundations of Astrology', subtitle: 'Zodiacs, nakshatras, houses and the Panchang — in plain language', description: 'A free introductory course written by the Nakshatra editorial team. Development sample course.', level: 'beginner', topics: ['vedic', 'western', 'learning', 'panchang'], status: 'published', publishedAt: new Date(), isSample: true, passPercent: 60 }).returning();
    const [ch1] = await ctx.db.insert(s.courseChapters).values({ courseId: c.id, title: 'The sky and its maps', position: 0 }).returning();
    const [ch2] = await ctx.db.insert(s.courseChapters).values({ courseId: c.id, title: 'Time and the Panchang', position: 1 }).returning();
    let pos = 0;
    for (const l of DAILY_LESSONS.slice(0, 8)) {
      const chapter = ['tithi', 'panchang', 'dashas'].includes(l.key) ? ch2 : ch1;
      const [row] = await ctx.db.insert(s.lessons).values({ courseId: c.id, chapterId: chapter.id, title: l.title, kind: 'text', body: l.body, durationMinutes: 4, position: pos, isPreview: pos === 0 }).returning();
      if (l.quiz) await ctx.db.insert(s.quizzes).values({ lessonId: row.id, questions: [l.quiz] });
      pos++;
    }
  }
  const [course1] = await ctx.db.select().from(s.courses).where(eq(s.courses.slug, 'reading-your-western-chart-sample'));
  if (!course1) {
    const [c] = await ctx.db.insert(s.courses).values({ creatorId: adminId, slug: 'reading-your-western-chart-sample', title: 'Reading Your Western Chart', subtitle: 'Planets, signs, houses and aspects step by step', description: 'A paid sample course for testing checkout and entitlements in development.', level: 'intermediate', topics: ['western', 'learning', 'transits'], pricePaise: 49900, status: 'published', publishedAt: new Date(), isSample: true }).returning();
    const [ch] = await ctx.db.insert(s.courseChapters).values({ courseId: c.id, title: 'Core techniques', position: 0 }).returning();
    for (const [i, l] of DAILY_LESSONS.filter((x) => ['aspects', 'retrograde', 'elements', 'houses'].includes(x.key)).entries()) {
      await ctx.db.insert(s.lessons).values({ courseId: c.id, chapterId: ch.id, title: l.title, kind: 'text', body: l.body, durationMinutes: 5, position: i, isPreview: i === 0 });
    }
    const [p] = await ctx.db.insert(s.products).values({ slug: 'course-reading-your-western-chart-sample', title: 'Course: Reading Your Western Chart', description: 'Full access to the course. Development sample product.', category: 'digital_course', fulfilment: 'digital', digitalAsset: { courseId: c.id }, status: 'active', isSample: true }).returning();
    await ctx.db.insert(s.productVariants).values({ productId: p.id, sku: 'course-western-sample', name: 'Full course access', pricePaise: 49900, stock: null });
  }

  // Sample catalogue. Reports are real (generated from your chart); physical items are sample listings.
  const products: { slug: string; title: string; description: string; category: string; fulfilment: string; digitalAsset?: Record<string, unknown>; variants: { name: string; price: number; stock: number | null }[]; materials?: string; dimensions?: string; certification?: string }[] = [
    { slug: 'report-complete-vedic', title: 'Complete Vedic Birth Chart Report', description: 'Generated from your calculated chart: placements, nakshatras, yogas, doshas, divisional charts, ashtakavarga and dasha timeline — with the method behind each.', category: 'report', fulfilment: 'digital', digitalAsset: { reportTemplate: 'natal_vedic_full' }, variants: [{ name: 'Digital report', price: 29900, stock: null }] },
    { slug: 'report-year-ahead', title: 'Your Year Ahead: Calculated Calendar', description: 'Dasha periods, slow-planet sign changes, retrogrades, eclipses and Sade Sati status for the next 12 months.', category: 'report', fulfilment: 'digital', digitalAsset: { reportTemplate: 'year_ahead' }, variants: [{ name: 'Digital report', price: 39900, stock: null }] },
    { slug: 'report-western-natal', title: 'Western Natal Chart Report', description: 'Tropical placements, houses, aspects, patterns and element balance.', category: 'report', fulfilment: 'digital', digitalAsset: { reportTemplate: 'western_natal' }, variants: [{ name: 'Digital report', price: 24900, stock: null }] },
    { slug: 'sample-puja-diya-set', title: 'Brass Diya Set (sample listing)', description: 'Development sample listing for testing physical checkout. Not real merchandise.', category: 'ritual_supplies', fulfilment: 'physical', materials: 'Listed as brass (sample data)', dimensions: 'Sample data', variants: [{ name: 'Set of 2', price: 59900, stock: 12 }, { name: 'Set of 5', price: 129900, stock: 4 }] },
    { slug: 'sample-rudraksha-mala', title: '108-Bead Mala (sample listing)', description: 'Development sample listing. No certification has been provided, so none is shown.', category: 'rudraksha', fulfilment: 'physical', variants: [{ name: 'Standard', price: 49900, stock: 20 }] },
    { slug: 'sample-panchang-guide-ebook', title: 'Panchang Field Guide (sample eBook)', description: 'Development sample digital product for testing digital delivery.', category: 'book', fulfilment: 'digital', variants: [{ name: 'eBook', price: 19900, stock: null }] },
  ];
  for (const p of products) {
    const [ex] = await ctx.db.select().from(s.products).where(eq(s.products.slug, p.slug));
    if (ex) continue;
    const [row] = await ctx.db.insert(s.products).values({ slug: p.slug, title: p.title, description: p.description, category: p.category, fulfilment: p.fulfilment, digitalAsset: p.digitalAsset ?? null, materials: p.materials, dimensions: p.dimensions, certification: p.certification, status: 'active', isSample: !p.slug.startsWith('report-') }).returning();
    await ctx.db.insert(s.productVariants).values(p.variants.map((v, i) => ({ productId: row.id, sku: `${p.slug}-${i}`, name: v.name, pricePaise: v.price, stock: v.stock })));
  }
  await ctx.db.insert(s.discounts).values({ code: 'DEVTEST10', kind: 'percent', value: 10, minOrderPaise: 0 }).onConflictDoNothing();

  // Sample vendors.
  const vendorOwner = await ensureUser(ctx, 'sample.vendor@nakshatra.local', 'Sample Vendor (dev data)', ['vendor'], creds, 'sample vendor');
  await ensureBirth(ctx, vendorOwner, '1982-11-03', '18:45', MUMBAI);
  const vendorRows = [
    { name: 'Sample Pandit Services (dev data)', category: 'pandit', city: 'New Delhi, India', from: 1100000 },
    { name: 'Sample Banquet Hall (dev data)', category: 'venue', city: 'Mumbai, India', from: 25000000 },
    { name: 'Sample Photography Studio (dev data)', category: 'photographer', city: 'Chennai, India', from: 8000000 },
  ];
  for (const v of vendorRows) {
    const [ex] = await ctx.db.select().from(s.vendors).where(eq(s.vendors.name, v.name));
    if (!ex) await ctx.db.insert(s.vendors).values({ ownerId: vendorOwner, name: v.name, category: v.category, city: v.city, description: 'Development sample vendor for local testing. Not a real business.', priceFromPaise: v.from, verificationStatus: 'verified', isSample: true });
  }

  // Demo community members (labelled) so the social graph is explorable locally.
  const demo = [
    { email: 'asha.demo@nakshatra.local', name: 'Asha (demo)', date: '1994-03-21', time: '07:15', place: DELHI },
    { email: 'rohan.demo@nakshatra.local', name: 'Rohan (demo)', date: '1991-11-08', time: '22:40', place: MUMBAI },
    { email: 'meera.demo@nakshatra.local', name: 'Meera (demo)', date: '1997-07-30', time: '13:05', place: CHENNAI },
  ];
  for (const d of demo) {
    const id = await ensureUser(ctx, d.email, d.name, [], creds, 'demo member');
    await ensureBirth(ctx, id, d.date, d.time, d.place);
  }
  const [g] = await ctx.db.select().from(s.groups).where(eq(s.groups.slug, 'nakshatra-learners'));
  if (!g) {
    const [grp] = await ctx.db.insert(s.groups).values({ slug: 'nakshatra-learners', name: 'Nakshatra Learners', description: 'A community for people learning the 27 nakshatras together.', visibility: 'public', ownerId: adminId, tags: ['nakshatras', 'learning'] }).returning();
    await ctx.db.insert(s.groupMembers).values({ groupId: grp.id, userId: adminId, role: 'owner', status: 'active' });
  }
  return creds;
}

export function writeDevCredentials(creds: DevCredential[]) {
  if (!creds.length) return null;
  const dir = resolve(process.cwd(), '.data');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'dev-credentials.json');
  const prior: DevCredential[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const merged = [...prior.filter((p) => !creds.some((c) => c.email === p.email)), ...creds];
  writeFileSync(file, JSON.stringify(merged, null, 2));
  return file;
}
