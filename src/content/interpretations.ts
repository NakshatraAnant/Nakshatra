import { NAKSHATRAS, PLANETS, SIGNS, type PlanetId } from '../astro/constants';
import type { ChartResult } from '../astro/types';
import type { YogaResult } from '../astro/vedic/yogas';
import type { ManglikResult } from '../astro/vedic/doshas';
import { HOUSE_THEMES, NAKSHATRA_CONTENT, PLANET_THEMES, SIGN_CONTENT } from './signs';
import { DASHA_THEMES } from './daily';
import { ordinal } from '../astro/vedic/yogas';
import { LAGNA_TEXT, RASHI_TEXT, SURYA_TEXT } from './vedic';

/**
 * Structured, versioned interpretation engine. Every rule declares its system,
 * the chart factor it applies to, a precedence group (only the highest-importance
 * rule per group is shown, preventing duplicate or contradictory text), the
 * editorial source, caveats, language variants and publication status.
 * Rules are evaluated purely against calculated chart factors.
 */
export const CONTENT_PACK_VERSION = 'editorial-v2';
export const CONTENT_SOURCE = 'Nakshatra editorial team, pack v1 — reflective descriptions of traditional symbolism.';
export const VEDIC_CONTENT_SOURCE = 'Nakshatra editorial team, Vedic pack v2 — Jyotish symbolism of manas, deha and atma with classical dignities.';

export type Condition =
  | { type: 'placement'; body: PlanetId; sign: number }
  | { type: 'ascendant'; sign: number }
  | { type: 'nakshatra'; body: 'moon' | 'ascendant'; index: number }
  | { type: 'house'; body: PlanetId; house: number }
  | { type: 'yoga'; key: string }
  | { type: 'dosha'; key: 'manglik' }
  | { type: 'retrograde'; body: PlanetId }
  | { type: 'dasha'; lord: PlanetId };

export interface InterpretationRule {
  key: string;
  system: 'western' | 'vedic' | 'both';
  condition: Condition;
  group: string;
  importance: 1 | 2 | 3;
  title: { en: string; hi?: string };
  body: { en: string; hi?: string };
  caveat?: string;
  source: string;
  status: 'draft' | 'published' | 'retired';
  version: number;
  factorLabel: string;
}

const P = (id: PlanetId) => PLANETS[id].name;

function buildRules(): InterpretationRule[] {
  const rules: InterpretationRule[] = [];
  const base = { source: CONTENT_SOURCE, status: 'published' as const, version: 1 };

  SIGNS.forEach((s, i) => {
    const c = SIGN_CONTENT[i];
    rules.push({ ...base, key: `western.sun.${s.name.toLowerCase()}`, system: 'western', condition: { type: 'placement', body: 'sun', sign: i }, group: 'sun_sign', importance: 3, title: { en: `Sun in ${s.name}`, hi: `सूर्य ${s.hi} में` }, body: { en: c.identity }, factorLabel: `Tropical Sun in ${s.name}` });
    rules.push({ ...base, key: `western.moon.${s.name.toLowerCase()}`, system: 'western', condition: { type: 'placement', body: 'moon', sign: i }, group: 'moon_sign', importance: 3, title: { en: `Moon in ${s.name}`, hi: `चंद्र ${s.hi} में` }, body: { en: c.emotion }, factorLabel: `Tropical Moon in ${s.name}` });
    rules.push({ ...base, key: `western.asc.${s.name.toLowerCase()}`, system: 'western', condition: { type: 'ascendant', sign: i }, group: 'ascendant', importance: 3, title: { en: `${s.name} rising` }, body: { en: c.approach }, caveat: 'The Ascendant depends on an accurate birth time.', factorLabel: `Ascendant in ${s.name}` });
    // Vedic layers use their own pack (v2) so they never repeat the tropical text.
    const v2 = { ...base, source: VEDIC_CONTENT_SOURCE, version: 2 };
    rules.push({ ...v2, key: `vedic.rashi.${s.vedic.toLowerCase()}`, system: 'vedic', condition: { type: 'placement', body: 'moon', sign: i }, group: 'rashi', importance: 3, title: { en: `${s.vedic} Rashi (Moon in ${s.name})`, hi: `${s.hi} राशि` }, body: { en: RASHI_TEXT[i] }, factorLabel: `Sidereal Moon in ${s.vedic}` });
    rules.push({ ...v2, key: `vedic.lagna.${s.vedic.toLowerCase()}`, system: 'vedic', condition: { type: 'ascendant', sign: i }, group: 'lagna', importance: 3, title: { en: `${s.vedic} Lagna`, hi: `${s.hi} लग्न` }, body: { en: LAGNA_TEXT[i] }, caveat: 'The Lagna depends on an accurate birth time.', factorLabel: `Sidereal Ascendant in ${s.vedic}` });
    rules.push({ ...v2, key: `vedic.sun.${s.vedic.toLowerCase()}`, system: 'vedic', condition: { type: 'placement', body: 'sun', sign: i }, group: 'vedic_sun', importance: 2, title: { en: `Surya in ${s.vedic}`, hi: `सूर्य ${s.hi} में` }, body: { en: SURYA_TEXT[i] }, factorLabel: `Sidereal Sun in ${s.vedic}` });
  });

  NAKSHATRAS.forEach((n, i) => {
    rules.push({
      ...base, key: `vedic.nakshatra.${n.name.toLowerCase().replace(/\s+/g, '_')}`, system: 'vedic',
      condition: { type: 'nakshatra', body: 'moon', index: i }, group: 'janma_nakshatra', importance: 3,
      title: { en: `Janma Nakshatra: ${n.name}`, hi: `जन्म नक्षत्र: ${n.hi}` },
      body: { en: `${NAKSHATRA_CONTENT[i]} Deity: ${n.deity}. Symbol: ${n.symbol}. Dasha lord: ${P(n.lord)}.` },
      factorLabel: `Moon in ${n.name}`,
    });
  });

  // Planet-in-house rules are composed from authored planet and house fragments.
  (Object.keys(PLANET_THEMES) as PlanetId[]).forEach((id) => {
    HOUSE_THEMES.forEach((h, i) => {
      rules.push({
        ...base, key: `both.house.${id}.${i + 1}`, system: 'both', condition: { type: 'house', body: id, house: i + 1 },
        group: `house_${id}`, importance: 1,
        title: { en: `${P(id)} in the ${ordinal(i + 1)} house` },
        body: { en: `${P(id)} represents ${PLANET_THEMES[id].theme}. In the ${ordinal(i + 1)} house — ${h.theme} — it traditionally ${PLANET_THEMES[id].verb} this area of life.` },
        caveat: 'House placements depend on an accurate birth time and on the house system used.',
        factorLabel: `${P(id)} in house ${i + 1}`,
      });
    });
  });

  (['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as PlanetId[]).forEach((id) => {
    rules.push({
      ...base, key: `both.retrograde.${id}`, system: 'both', condition: { type: 'retrograde', body: id }, group: `retro_${id}`, importance: 1,
      title: { en: `${P(id)} retrograde at birth` },
      body: { en: `${P(id)} appeared to move backwards at your birth (an Earth-perspective effect). Traditionally this is read as ${PLANET_THEMES[id].theme} turned inward — revisited, refined and made personal.` },
      factorLabel: `${P(id)} retrograde`,
    });
  });

  const YOGA_TEXT: Record<string, string> = {
    gajakesari: 'Traditionally associated with good counsel, reputation and the support of teachers.',
    budhaditya: 'Traditionally associated with intelligence applied with confidence.',
    chandra_mangala: 'Traditionally associated with emotional drive and enterprising energy.',
    sunapha: 'Traditionally associated with self-made resources and initiative.',
    anapha: 'Traditionally associated with a composed presence and personal integrity.',
    durudhara: 'Traditionally associated with being supported on both sides — resources and companionship.',
    kemadruma: 'Traditionally read as a call to build one’s own support systems. Classical texts list many cancellations; it is not a verdict.',
    vesi: 'Traditionally associated with steadiness and truthfulness.',
    vasi: 'Traditionally associated with skill and generosity.',
    ubhayachari: 'Traditionally associated with balanced capabilities.',
    ruchaka: 'Traditionally associated with courage and leadership.',
    bhadra: 'Traditionally associated with intellect and eloquence.',
    hamsa: 'Traditionally associated with wisdom and ethical outlook.',
    malavya: 'Traditionally associated with refinement, art and comfort.',
    shasha: 'Traditionally associated with discipline and organisational ability.',
    yogakaraka: 'A single planet ruling both a kendra and a trikona is traditionally considered especially supportive for the chart.',
    raja_conjunction: 'Association of kendra and trikona lords is the classic form of Raja yoga, traditionally linked with achievement.',
    viparita_raja: 'Traditionally read as resilience — strength that emerges from difficulty.',
  };
  for (const [key, text] of Object.entries(YOGA_TEXT)) {
    rules.push({
      ...base, key: `vedic.yoga.${key}`, system: 'vedic', condition: { type: 'yoga', key }, group: `yoga_${key}`, importance: 2,
      title: { en: key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) }, body: { en: text },
      caveat: 'Yogas are evaluated from their classical rule only; strength and cancellations are not assessed.',
      factorLabel: `Yoga: ${key}`,
    });
  }

  rules.push({
    ...base, key: 'vedic.dosha.manglik', system: 'vedic', condition: { type: 'dosha', key: 'manglik' }, group: 'manglik', importance: 2,
    title: { en: 'Manglik (Kuja) placement' },
    body: { en: 'Mars occupies one of the houses listed by the Manglik rule. In tradition this is considered mainly in marriage matching, where it is often balanced when both partners share it. It says nothing about a person’s worth or character.' },
    caveat: 'Traditions list many cancellations; consult a practitioner if this matters to you.',
    factorLabel: 'Manglik rule met',
  });

  for (const [lord, text] of Object.entries(DASHA_THEMES)) {
    rules.push({
      ...base, key: `vedic.dasha.${lord}`, system: 'vedic', condition: { type: 'dasha', lord: lord as PlanetId }, group: 'current_dasha', importance: 2,
      title: { en: `${P(lord as PlanetId)} Mahadasha` }, body: { en: text },
      caveat: 'Dashas describe traditional life chapters, not specific events.',
      factorLabel: `Current mahadasha lord ${P(lord as PlanetId)}`,
    });
  }
  return rules;
}

export const INTERPRETATION_RULES: InterpretationRule[] = buildRules();

export interface EvaluationContext {
  chart: ChartResult;
  yogas?: YogaResult[];
  manglik?: ManglikResult;
  currentDashaLord?: PlanetId;
}

export interface Interpretation {
  key: string;
  version: number;
  group: string;
  importance: number;
  title: string;
  body: string;
  caveat?: string;
  factor: string;
  source: string;
  translated: boolean;
}

function matches(rule: InterpretationRule, ctx: EvaluationContext): boolean {
  const { chart } = ctx;
  if (rule.system !== 'both' && rule.system !== chart.system) return false;
  const c = rule.condition;
  const pl = (id: PlanetId) => chart.placements.find((p) => p.id === id);
  switch (c.type) {
    case 'placement': return pl(c.body)?.sign === c.sign;
    case 'ascendant': return chart.ascendant?.sign === c.sign;
    case 'nakshatra': return c.body === 'moon' ? pl('moon')?.nakshatra?.index === c.index : chart.ascendant?.nakshatra?.index === c.index;
    case 'house': return pl(c.body)?.house === c.house;
    case 'retrograde': return Boolean(pl(c.body)?.retrograde);
    case 'yoga': return Boolean(ctx.yogas?.find((y) => y.key === c.key && y.present));
    case 'dosha': return Boolean(ctx.manglik?.present);
    case 'dasha': return ctx.currentDashaLord === c.lord;
  }
}

/**
 * Evaluates rules. Precedence: within a group only the highest-importance, then
 * highest-version rule is returned. Output is sorted by importance then key, so
 * the same chart always yields the same ordered list.
 */
export function interpret(ctx: EvaluationContext, locale: 'en' | 'hi' = 'en', rules: InterpretationRule[] = INTERPRETATION_RULES): Interpretation[] {
  const best = new Map<string, InterpretationRule>();
  for (const r of rules) {
    if (r.status !== 'published' || !matches(r, ctx)) continue;
    const cur = best.get(r.group);
    if (!cur || r.importance > cur.importance || (r.importance === cur.importance && r.version > cur.version)) best.set(r.group, r);
  }
  return [...best.values()]
    .sort((a, b) => b.importance - a.importance || a.key.localeCompare(b.key))
    .map((r) => {
      const title = (locale === 'hi' && r.title.hi) || r.title.en;
      const body = (locale === 'hi' && r.body.hi) || r.body.en;
      return {
        key: r.key, version: r.version, group: r.group, importance: r.importance, title, body, caveat: r.caveat,
        factor: r.factorLabel, source: r.source, translated: locale === 'en' || Boolean(r.body.hi),
      };
    });
}
