import * as Astronomy from 'astronomy-engine';
import type { Executor } from '../db/client';
import {
  ENGINE_VERSION, PLANETS, SIGNS, activeDasha, ashtakavarga, chartPatterns, divisionalChart, elementSummary, natalAspects,
  bodiesFromPlacements, placement, positionsAt, retrogradePeriods, sadeSati, vimshottari, DEFAULT_VEDIC_CONFIG, type PlanetId,
} from '../../astro';
import { CONTENT_PACK_VERSION, interpret } from '../../content/interpretations';
import { DASHA_THEMES } from '../../content/daily';
import { detectYogas, manglik } from '../../astro';
import { currentChart } from './identity';
import { activeRules } from './content';
import { desc, eq } from 'drizzle-orm';
import { assessmentResults } from '../db/schema';
import { DIMENSIONS, DIMENSION_INFO, PERSONA_ARCHETYPES, PERSONA_BY_KEY, type Vector } from '../../shared/personality';
import { DIMENSION_DEPTH, IDENTITY_REPORT_VERSION } from '../../content/identityReport';

/**
 * alreadyFree lists what a signed-in member can already read in the app, so the shop never sells
 * free content as if it were new; adds lists what the document genuinely adds.
 */
export interface ReportTemplate { key: string; title: string; description: string; includedInPlus: boolean; alreadyFree: string; adds: string }

export const REPORT_TEMPLATES: Record<string, ReportTemplate> = {
  natal_vedic_full: { key: 'natal_vedic_full', title: 'Complete Vedic Birth Chart Report', description: 'Placements, nakshatras, yogas, doshas, divisional charts, ashtakavarga and your Vimshottari dasha timeline — each with its calculation method.', includedInPlus: true, alreadyFree: 'Placements, interpretations, yogas, Manglik, divisional charts and the dasha timeline are all viewable free in Chart.', adds: 'One printable document that gathers them with the ashtakavarga totals and the method behind each item.' },
  western_natal: { key: 'western_natal', title: 'Western Natal Chart Report', description: 'Tropical placements, houses, aspects, chart patterns and element balance.', includedInPlus: true, alreadyFree: 'Placements, interpretations, aspects and element balance are viewable free in Chart.', adds: 'One printable document with chart patterns and the top 20 aspects listed with orbs.' },
  identity_expanded: { key: 'identity_expanded', title: 'Expanded Identity Report', description: 'Your archetype in depth: every dimension with strengths, blind spots, how it shows up with friends, and one small experiment each — plus the archetypes you sit closest to.', includedInPlus: false, alreadyFree: 'Your archetype, signature line, three traits, five dimension scores and the two strongest tendencies are free in Identity Studio.', adds: 'Twenty written sections (four for each dimension) that the free result never shows, your three nearest archetypes with distances, and a printable layout. Built from your latest assessment.' },
  year_ahead: { key: 'year_ahead', title: 'Your Year Ahead: Calculated Calendar', description: 'Dasha periods, slow-planet sign changes, retrograde periods, eclipses and Sade Sati status for the next 12 months — calculated facts with traditional context, not predictions.', includedInPlus: false, alreadyFree: 'Your current dasha and today’s transits are viewable free in Chart and Today.', adds: 'A 12-month calendar of dasha sub-periods, slow-planet sign changes, retrogrades, eclipses and Sade Sati status. Interpretive text is brief; it is mainly a calculated calendar.' },
};

interface Item { title: string; body: string; factor?: string }
interface Section { heading: string; items: Item[] }
export interface ReportContent { title: string; templateKey: string; engineVersion: string; contentVersion: string; generatedAt: string; sections: Section[]; methodology: string[]; disclaimer: string }

const DISCLAIMER = 'This report presents astronomical calculations and traditional astrological interpretations for reflection and learning. It does not predict events and is not advice on health, finance, law or relationships.';

const IDENTITY_DISCLAIMER = 'This report describes tendencies from your own answers. It is not a psychological assessment, a diagnosis or a prediction, and people change.';

async function identityReport(db: Executor, userId: string): Promise<ReportContent> {
  const [latest] = await db.select().from(assessmentResults).where(eq(assessmentResults.userId, userId)).orderBy(desc(assessmentResults.createdAt)).limit(1);
  if (!latest) throw new Error('Complete the personality assessment before generating this report');
  const a = PERSONA_BY_KEY[latest.archetypeKey];
  const scores = latest.scores as Vector;
  const nearest = PERSONA_ARCHETYPES.map((p) => ({ p, d: Math.sqrt(DIMENSIONS.reduce((sum, k) => sum + (scores[k] - p.prototype[k]) ** 2, 0)) })).sort((x, y) => x.d - y.d).slice(0, 3);
  const sections: Section[] = [
    { heading: a.name, items: [{ title: a.signature, body: `${a.inCircles} ${a.growth}` }, { title: 'Traits', body: a.traits.join(' · ') }] },
    ...DIMENSIONS.map((d) => {
      const pole = scores[d] >= 0 ? 'high' : 'low';
      const depth = DIMENSION_DEPTH[d][pole];
      const info = DIMENSION_INFO[d];
      const label = pole === 'high' ? info.high : info.low;
      const strength = Math.abs(scores[d]) >= 0.5 ? 'clearly' : Math.abs(scores[d]) >= 0.2 ? 'somewhat' : 'only slightly';
      return { heading: `${info.name}: ${strength} ${label}`, items: [
        { title: 'Strengths', body: depth.strengths }, { title: 'Blind spot', body: depth.blindSpot },
        { title: 'With friends', body: depth.withFriends }, { title: 'Try this', body: depth.tryThis },
      ] };
    }),
    { heading: 'Archetypes you sit closest to', items: nearest.map(({ p, d }) => ({ title: p.name, body: p.signature, factor: `Distance ${d.toFixed(2)} (smaller is closer)` })) },
  ];
  return { title: 'Expanded Identity Report', templateKey: 'identity_expanded', engineVersion: latest.version, contentVersion: IDENTITY_REPORT_VERSION, generatedAt: new Date().toISOString(), sections, methodology: [`Assessment ${latest.version} taken ${latest.createdAt.toISOString().slice(0, 10)}; five dimensions scored −1 to +1 from your answers; nearest-prototype archetype.`], disclaimer: IDENTITY_DISCLAIMER };
}

export async function generateReport(db: Executor, userId: string, templateKey: string): Promise<ReportContent> {
  if (templateKey === 'identity_expanded') return identityReport(db, userId);
  const v = await currentChart(db, userId, 'vedic_default');
  const w = await currentChart(db, userId, 'western_default');
  if (!v || !w) throw new Error('Birth profile required for reports');
  const sections: Section[] = [];
  const now = new Date();
  const base = { templateKey, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_PACK_VERSION, generatedAt: now.toISOString(), disclaimer: DISCLAIMER };

  if (templateKey === 'natal_vedic_full') {
    const chart = v.result;
    sections.push({ heading: 'Placements (sidereal, Lahiri)', items: chart.placements.map((p) => ({ title: `${p.name} in ${p.signName} ${p.dms}`, body: `Nakshatra ${p.nakshatra?.name} pada ${p.nakshatra?.pada}${p.house ? `, house ${p.house}` : ''}${p.retrograde ? ', retrograde' : ''}${p.dignity ? `, ${p.dignity}` : ''}.`, factor: 'Calculated' })) });
    const yogas = detectYogas(chart);
    const m = manglik(chart);
    const dasha = vimshottari(placement(chart, 'moon').longitude, new Date(chart.utc), 2);
    const active = activeDasha(dasha, now);
    sections.push({ heading: 'Interpretations', items: interpret({ chart, yogas, manglik: m, currentDashaLord: active[0]?.lord }, 'en', activeRules()).map((i) => ({ title: i.title, body: i.caveat ? `${i.body} (${i.caveat})` : i.body, factor: i.factor })) });
    sections.push({ heading: 'Yogas evaluated', items: yogas.map((y) => ({ title: `${y.name}: ${y.present ? 'present' : 'not present'}`, body: `${y.rule} ${y.factors.join('; ')}.`, factor: y.caveat })) });
    sections.push({ heading: 'Manglik analysis', items: [{ title: m.present ? 'The Manglik rule is met' : 'The Manglik rule is not met', body: `${m.convention} From Lagna: ${m.fromLagna.house ?? 'n/a'}; from Moon: ${m.fromMoon.house}; from Venus: ${m.fromVenus.house}. ${m.traditionalExceptions.join(' ')} ${m.note}` }] });
    const d9 = divisionalChart(chart, 'D9');
    const d10 = divisionalChart(chart, 'D10');
    sections.push({ heading: 'Divisional charts', items: [d9, d10].map((d) => ({ title: `${d.varga} ${d.name} — ${d.theme}`, body: d.placements.map((p) => `${PLANETS[p.id as PlanetId].vedic}: ${SIGNS[p.sign].vedic}`).join(', ') + (d.timeSensitive ? ' (sensitive to birth-time accuracy)' : ''), factor: 'Parashara varga rules' })) });
    const av = ashtakavarga(chart);
    if (av.available) sections.push({ heading: 'Sarvashtakavarga', items: [{ title: `Total ${av.totals.sarva} bindus`, body: av.sarva.map((n, i) => `${SIGNS[i].vedic} ${n}`).join(' · '), factor: 'Parashara ashtakavarga tables' }] });
    sections.push({ heading: 'Vimshottari dasha timeline', items: dasha.mahadashas.filter((d) => Date.parse(d.end) > Date.parse(chart.utc)).slice(0, 9).map((d) => ({ title: `${PLANETS[d.lord].vedic} mahadasha: ${d.start.slice(0, 10)} → ${d.end.slice(0, 10)}`, body: DASHA_THEMES[d.lord] })) });
    return { ...base, title: REPORT_TEMPLATES[templateKey].title, sections, methodology: chart.methodology };
  }

  if (templateKey === 'western_natal') {
    const chart = w.result;
    sections.push({ heading: 'Placements (tropical)', items: chart.placements.map((p) => ({ title: `${p.name} in ${p.signName} ${p.dms}`, body: `${p.house ? `House ${p.house}` : 'House unknown (no birth time)'}${p.retrograde ? ', retrograde' : ''}.` })) });
    sections.push({ heading: 'Interpretations', items: interpret({ chart }, 'en', activeRules()).map((i) => ({ title: i.title, body: i.body, factor: i.factor })) });
    const aspects = natalAspects(bodiesFromPlacements(chart.placements, { asc: chart.ascendant?.longitude, mc: chart.midheaven?.longitude }));
    sections.push({ heading: 'Major aspects', items: aspects.slice(0, 20).map((a) => ({ title: `${a.a} ${a.type} ${a.b}`, body: `Orb ${a.orb.toFixed(2)}°, ${a.nature}${a.applying === null ? '' : a.applying ? ', applying' : ', separating'}.` })) });
    const pats = chartPatterns(chart.placements);
    sections.push({ heading: 'Chart patterns', items: pats.length ? pats.map((p) => ({ title: p.type.replace('_', ' '), body: p.description })) : [{ title: 'No major patterns', body: 'No grand trine, T-square, grand cross, yod or stellium was detected.' }] });
    const el = elementSummary(chart.placements, chart.ascendant?.longitude ?? null);
    sections.push({ heading: 'Element and modality balance', items: [{ title: `Dominant: ${el.dominantElement} / ${el.dominantModality}`, body: `${Object.entries(el.elements).map(([k, n]) => `${k} ${n}`).join(', ')}. ${el.method}` }] });
    return { ...base, title: REPORT_TEMPLATES[templateKey].title, sections, methodology: chart.methodology };
  }

  if (templateKey === 'year_ahead') {
    const end = new Date(now.getTime() + 365 * 86400000);
    const chart = v.result;
    const dasha = vimshottari(placement(chart, 'moon').longitude, new Date(chart.utc), 2);
    const periods = dasha.mahadashas.flatMap((md) => (md.sub ?? []).map((ad) => ({ md, ad }))).filter(({ ad }) => Date.parse(ad.end) > now.getTime() && Date.parse(ad.start) < end.getTime());
    sections.push({ heading: 'Dasha periods this year', items: periods.map(({ md, ad }) => ({ title: `${PLANETS[md.lord].vedic}–${PLANETS[ad.lord].vedic}: ${ad.start.slice(0, 10)} → ${ad.end.slice(0, 10)}`, body: DASHA_THEMES[ad.lord] })) });
    const ingress: Item[] = [];
    const slow: PlanetId[] = ['jupiter', 'saturn', 'rahu'];
    const signsAt = (t: number) => {
      const pos = positionsAt(new Date(t), DEFAULT_VEDIC_CONFIG);
      return slow.map((id) => pos.find((p) => p.id === id)!.sign);
    };
    let prev = signsAt(now.getTime());
    for (let t = now.getTime() + 2 * 86400000; t < end.getTime(); t += 2 * 86400000) {
      const cur = signsAt(t);
      cur.forEach((sign, i) => {
        if (sign !== prev[i]) ingress.push({ title: `${PLANETS[slow[i]].vedic} enters ${SIGNS[sign].vedic} around ${new Date(t).toISOString().slice(0, 10)}`, body: 'Sidereal sign change (calculated, ±2 days).', factor: 'Gochar' });
      });
      prev = cur;
    }
    sections.push({ heading: 'Slow-planet sign changes', items: ingress.length ? ingress : [{ title: 'No sign changes', body: 'Jupiter, Saturn and Rahu stay in their current signs for the whole period.' }] });
    const retro = (['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as PlanetId[]).flatMap((id) => retrogradePeriods(id, now, end).map((r) => ({ title: `${PLANETS[id].name} retrograde: ${r.stationRetrograde.slice(0, 10)} → ${r.stationDirect?.slice(0, 10) ?? 'after this period'}`, body: 'Apparent backward motion seen from Earth; traditionally read as a time for review.' })));
    sections.push({ heading: 'Retrograde periods', items: retro });
    const eclipses: Item[] = [];
    let le = Astronomy.SearchLunarEclipse(Astronomy.MakeTime(now));
    while (le.peak.date < end) {
      eclipses.push({ title: `Lunar eclipse (${le.kind}) ${le.peak.date.toISOString().slice(0, 10)}`, body: 'Calculated with astronomy-engine; visibility depends on your location.' });
      le = Astronomy.NextLunarEclipse(le.peak);
    }
    let se = Astronomy.SearchGlobalSolarEclipse(Astronomy.MakeTime(now));
    while (se.peak.date < end) {
      eclipses.push({ title: `Solar eclipse (${se.kind}) ${se.peak.date.toISOString().slice(0, 10)}`, body: 'Global solar eclipse; visible only from parts of Earth.' });
      se = Astronomy.NextGlobalSolarEclipse(se.peak);
    }
    sections.push({ heading: 'Eclipses', items: eclipses.sort((a, b) => a.title.localeCompare(b.title)) });
    const natalMoon = placement(chart, 'moon').sign;
    const ss = sadeSati(natalMoon, positionsAt(now, DEFAULT_VEDIC_CONFIG).find((p) => p.id === 'saturn')!.sign);
    sections.push({ heading: 'Sade Sati status', items: [{ title: ss.phase ? `Sade Sati: ${ss.phase} phase` : ss.dhaiya ? `Dhaiya: ${ss.dhaiya}` : 'Sade Sati not active', body: `${ss.description} ${ss.rule}` }] });
    return { ...base, title: REPORT_TEMPLATES[templateKey].title, sections, methodology: [...chart.methodology, 'Eclipses: astronomy-engine SearchLunarEclipse / SearchGlobalSolarEclipse.'] };
  }
  throw new Error(`Unknown report template ${templateKey}`);
}
