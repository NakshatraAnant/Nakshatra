import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../lib/context';
import { CLIENT_EVENTS, track } from '../lib/context';
import { notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import {
  ARCHETYPE_VERSION, NAKSHATRAS, PLANETS, SIGNS, buildChart, deriveArchetype, detectYogas, manglik,
  type ChartResult,
} from '../../astro';
import { interpret, type Interpretation } from '../../content/interpretations';
import { ARCHETYPES, ARCHETYPE_DISCLAIMER, ELEMENT_MEANING, MODALITY_MEANING } from '../../content/archetypes';
import { CONFIGS, currentChart } from '../services/identity';
import { activeRules } from '../services/content';
import { resolveBirth } from './profile';

const pickBody = (list: Interpretation[], group: string) => {
  const i = list.find((x) => x.group === group);
  return i ? { title: i.title, body: i.body, caveat: i.caveat ?? null, factor: i.factor } : null;
};

/**
 * Everything the Cosmic ID needs, derived from the two calculated charts.
 * The sigil carries sidereal longitudes for the in-app artwork only; share cards
 * omit them so a published card cannot be used to reconstruct a birth moment.
 */
export function cosmicIdentity(vedic: ChartResult, western: ChartResult) {
  const arch = deriveArchetype(vedic);
  const content = ARCHETYPES[arch.key];
  const vp = (id: string) => vedic.placements.find((p) => p.id === id)!;
  const wp = (id: string) => western.placements.find((p) => p.id === id)!;
  const moonNak = vp('moon').nakshatra!;
  const vi = interpret({ chart: vedic, yogas: detectYogas(vedic), manglik: manglik(vedic) }, 'en', activeRules());
  const wi = interpret({ chart: western }, 'en', activeRules());
  return {
    archetype: {
      ...arch,
      name: content.name,
      essence: content.essence,
      portrait: content.portrait,
      gifts: content.gifts,
      growthEdge: content.growthEdge,
      inBonds: content.inBonds,
      palette: content.palette,
      blendName: arch.blend ? ARCHETYPES[arch.blend].name : null,
      elementMeaning: ELEMENT_MEANING[arch.element],
      modalityMeaning: MODALITY_MEANING[arch.modality],
      disclaimer: ARCHETYPE_DISCLAIMER,
    },
    layers: {
      rashi: { value: SIGNS[vp('moon').sign].vedic, english: SIGNS[vp('moon').sign].name, reliability: vedic.reliability.moonSign, text: pickBody(vi, 'rashi') },
      nakshatra: { value: NAKSHATRAS[moonNak.index].name, pada: moonNak.pada, lord: PLANETS[moonNak.lord].vedic, deity: NAKSHATRAS[moonNak.index].deity, symbol: NAKSHATRAS[moonNak.index].symbol, reliability: vedic.reliability.moonNakshatra, text: pickBody(vi, 'janma_nakshatra') },
      lagna: vedic.ascendant ? { value: SIGNS[vedic.ascendant.sign].vedic, english: SIGNS[vedic.ascendant.sign].name, reliability: vedic.reliability.ascendant, text: pickBody(vi, 'lagna') } : null,
      surya: { value: SIGNS[vp('sun').sign].vedic, english: SIGNS[vp('sun').sign].name, text: pickBody(vi, 'vedic_sun') },
      westernSun: { value: SIGNS[wp('sun').sign].name, text: pickBody(wi, 'sun_sign') },
      westernMoon: { value: SIGNS[wp('moon').sign].name, reliability: western.reliability.moonSign, text: pickBody(wi, 'moon_sign') },
      westernRising: western.ascendant ? { value: SIGNS[western.ascendant.sign].name, reliability: western.reliability.ascendant, text: pickBody(wi, 'ascendant') } : null,
    },
    sigil: {
      moonNakshatra: moonNak.index,
      moonSign: vp('moon').sign,
      ascendant: vedic.ascendant ? { longitude: vedic.ascendant.longitude, sign: vedic.ascendant.sign } : null,
      bodies: vedic.placements.filter((p) => p.id in PLANETS).map((p) => ({ id: p.id, glyph: PLANETS[p.id].glyph, abbr: PLANETS[p.id].abbr, longitude: p.longitude })),
    },
    timeKnown: !vedic.timeAssumed,
    warnings: [...new Set([...vedic.warnings, ...western.warnings])],
    methodology: [`Archetype ${ARCHETYPE_VERSION}: ${arch.method}`, ...vedic.methodology.slice(0, 3)],
  };
}

const SAMPLE_BIRTH = { date: '1996-01-14', time: '06:40', latitude: 26.9124, longitude: 75.7873, timezone: 'Asia/Kolkata' };
const SAMPLE_LABEL = 'Sample Cosmic ID for a fictional person born 14 January 1996, 06:40, Jaipur';


export async function discoverRoutes(app: FastifyInstance, ctx: Ctx) {
  /**
   * Account-free Cosmic ID. Calculates in memory and returns the result; nothing about
   * the birth moment is stored or logged. Same validation and 18+ rule as saved profiles.
   */
  app.post('/api/v1/discover/cosmic-id', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { place, body } = resolveBirth(req.body);
    const input = { date: body.date, time: body.time, timePrecision: body.timePrecision, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone };
    const result = cosmicIdentity(buildChart(input, CONFIGS.vedic_default), buildChart(input, CONFIGS.western_default));
    await track(ctx.db, null, 'cosmic_id_previewed', { timeKnown: result.timeKnown });
    return result;
  });

  /** A labelled sample (fictional person) so the landing page shows real output before asking for anything. Not tracked. */
  app.get('/api/v1/discover/sample', async () => {
    const input = { ...SAMPLE_BIRTH, timePrecision: 'exact' as const };
    return { label: SAMPLE_LABEL, identity: cosmicIdentity(buildChart(input, CONFIGS.vedic_default), buildChart(input, CONFIGS.western_default)) };
  });

  app.get('/api/v1/cosmic-id/me', async (req) => {
    const a = requireAuth(req);
    const [v, w] = await Promise.all([currentChart(ctx.db, a.userId, 'vedic_default'), currentChart(ctx.db, a.userId, 'western_default')]);
    if (!v || !w) throw notFound('Birth profile');
    return cosmicIdentity(v.result, w.result);
  });

  app.post('/api/v1/cosmic-id/shared', async (req) => {
    const a = requireAuth(req);
    const { format } = parse(z.object({ format: z.enum(['story', 'square']) }), req.body);
    await track(ctx.db, a.userId, 'cosmic_id_shared', { format });
    return { ok: true };
  });

  app.post('/api/v1/discover/events', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    // Aggregate funnel events. No properties are accepted; the member id is attached only for a signed-in member
    // (so "first" steps can be counted once per person). Anonymous visitors stay anonymous.
    const { name } = parse(z.object({ name: z.enum(CLIENT_EVENTS) }), req.body);
    const uid = req.auth && !req.auth.mfaPending ? req.auth.userId : null;
    await track(ctx.db, uid, name);
    return { ok: true };
  });
}
