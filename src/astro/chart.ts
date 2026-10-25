import {
  DEBILITATION, ENGINE_VERSION, EXALTATION, NAKSHATRAS, NAVAGRAHA, PLANETS, SIGNS, WESTERN_BODIES,
  degreeInSign, formatDms, nakshatraOf, norm360, signOf, type PlanetId,
} from './constants';
import { bodyPosition } from './ephemeris';
import { computeHouses, houseOf } from './houses';
import { AYANAMSAS, trueAyanamsa } from './ayanamsa';
import { normalizeBirth, type BirthInput } from './time';
import { HOUSE_SYSTEM_LABELS } from './houses';
import type { ChartConfig, ChartPoint, ChartResult, Placement, Reliability } from './types';

export function dignityOf(id: PlanetId, sign: number): Placement['dignity'] {
  if (EXALTATION[id] === sign) return 'exalted';
  if (DEBILITATION[id] === sign) return 'debilitated';
  if (['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'].includes(id) && SIGNS[sign].ruler === id) return 'own';
  if (id === 'mars' && sign === 7) return 'own';
  if (id === 'saturn' && sign === 10) return 'own';
  if (id === 'jupiter' && sign === 11) return 'own';
  if (id === 'venus' && sign === 6) return 'own';
  if (id === 'mercury' && sign === 2) return 'own';
  return null;
}

function point(longitude: number, sidereal: boolean): ChartPoint {
  const s = signOf(longitude);
  const p: ChartPoint = {
    longitude,
    sign: s,
    signName: sidereal ? `${SIGNS[s].vedic} (${SIGNS[s].name})` : SIGNS[s].name,
    degreeInSign: degreeInSign(longitude),
    dms: formatDms(degreeInSign(longitude)),
  };
  if (sidereal) {
    const n = nakshatraOf(longitude);
    p.nakshatra = { index: n.index, name: NAKSHATRAS[n.index].name, pada: n.pada, lord: NAKSHATRAS[n.index].lord };
  }
  return p;
}

interface RawState {
  ayan: number;
  positions: { id: PlanetId; tropical: number; latitude: number; speed: number; retrograde: boolean }[];
  ascTropical: number;
  mcTropical: number;
  cusps: number[];
  houseSystemUsed: ChartConfig['houseSystem'];
  houseWarnings: string[];
}

function rawState(utc: Date, lat: number, lon: number, config: ChartConfig): RawState {
  const bodies = config.system === 'vedic' ? NAVAGRAHA : WESTERN_BODIES;
  const ayan = config.system === 'vedic' ? trueAyanamsa(utc, config.ayanamsa ?? 'lahiri') : 0;
  const positions = bodies.map((id) => {
    const p = bodyPosition(id, utc, config.nodeType);
    return { id, tropical: p.longitude, latitude: p.latitude, speed: p.speed, retrograde: p.retrograde };
  });
  const houses = computeHouses(utc, lat, lon, config.houseSystem);
  return {
    ayan,
    positions,
    ascTropical: houses.angles.ascendant,
    mcTropical: houses.angles.midheaven,
    cusps: houses.cusps,
    houseSystemUsed: houses.system,
    houseWarnings: houses.warnings,
  };
}

/**
 * Builds a natal chart. Pipeline: normalise birth data → astronomical positions →
 * zodiac conversion (sidereal for Vedic) → houses → placements → reliability analysis.
 */
export function buildChart(input: BirthInput & { placeName?: string }, config: ChartConfig): ChartResult {
  const birth = normalizeBirth(input);
  const sidereal = config.system === 'vedic';
  const st = rawState(birth.utc, input.latitude, input.longitude, config);
  const toZ = (trop: number) => (sidereal ? norm360(trop - st.ayan) : trop);
  // Whole-sign houses depend on the zodiac: they start at the beginning of the Ascendant's sign *in the chart's
  // zodiac*. Shifting tropical whole-sign cusps by the ayanamsa would put sidereal house boundaries mid-sign.
  // Other systems' cusps are ecliptic points, so converting them with toZ is correct.
  const cusps = config.houseSystem === 'whole_sign'
    ? Array.from({ length: 12 }, (_, i) => norm360(Math.floor(toZ(st.ascTropical) / 30) * 30 + 30 * i))
    : st.cusps.map(toZ);
  const knownTime = !birth.timeAssumed;

  const placements: Placement[] = st.positions.map((p) => {
    const l = toZ(p.tropical);
    const s = signOf(l);
    const pl: Placement = {
      id: p.id,
      name: sidereal ? PLANETS[p.id].vedic : PLANETS[p.id].name,
      longitude: l,
      tropicalLongitude: p.tropical,
      latitude: p.latitude,
      sign: s,
      signName: sidereal ? SIGNS[s].vedic : SIGNS[s].name,
      degreeInSign: degreeInSign(l),
      dms: formatDms(degreeInSign(l)),
      house: knownTime ? houseOf(l, cusps) : null,
      retrograde: p.id === 'rahu' || p.id === 'ketu' ? p.speed < 0 : p.retrograde,
      speed: p.speed,
      dignity: dignityOf(p.id, s),
    };
    if (sidereal) {
      const n = nakshatraOf(l);
      pl.nakshatra = { index: n.index, name: NAKSHATRAS[n.index].name, pada: n.pada, lord: NAKSHATRAS[n.index].lord };
    }
    return pl;
  });

  // Reliability: recompute at the edges of the stated uncertainty window and compare.
  const u = birth.uncertaintyMinutes;
  const edges = [-u, u].map((m) => rawState(new Date(birth.utc.getTime() + m * 60000), input.latitude, input.longitude, config));
  const centerAsc = signOf(toZ(st.ascTropical));
  const moonC = st.positions.find((p) => p.id === 'moon')!;
  const moonCenter = toZ(moonC.tropical);
  const rel = (same: boolean): Reliability => (same ? 'reliable' : 'uncertain');
  const ascStable = edges.every((e) => signOf(sidereal ? norm360(e.ascTropical - e.ayan) : e.ascTropical) === centerAsc);
  const moonEdge = edges.map((e) => {
    const m = e.positions.find((p) => p.id === 'moon')!;
    return sidereal ? norm360(m.tropical - e.ayan) : m.tropical;
  });
  const moonSignStable = moonEdge.every((m) => signOf(m) === signOf(moonCenter));
  const nakStable = moonEdge.every((m) => nakshatraOf(m).index === nakshatraOf(moonCenter).index);

  const warnings = [...birth.warnings, ...st.houseWarnings];
  if (!ascStable && knownTime) warnings.push(`The Ascendant sign changes within ±${u} minutes of the stated time; treat it as uncertain.`);
  if (!moonSignStable) warnings.push(`The Moon changes sign within ±${u} minutes of the stated time.`);
  if (sidereal && !nakStable) warnings.push(`The Moon changes nakshatra within ±${u} minutes of the stated time.`);

  const methodology = [
    `Nakshatra engine ${ENGINE_VERSION}; ephemeris: astronomy-engine 2.1 (VSOP87 / ELP-based, apparent geocentric positions, true equinox of date).`,
    sidereal
      ? `Sidereal zodiac, ${AYANAMSAS[config.ayanamsa ?? 'lahiri'].label} ayanamsa = ${formatDms(st.ayan)} (mean ayanamsa + nutation).`
      : 'Tropical zodiac (equinox-based).',
    `Houses: ${HOUSE_SYSTEM_LABELS[st.houseSystemUsed]}${st.houseSystemUsed !== config.houseSystem ? ` (fallback from ${HOUSE_SYSTEM_LABELS[config.houseSystem]})` : ''}.`,
    `Lunar nodes: ${config.nodeType} node (Meeus ch. 47).`,
    `Birth time converted to UTC with the IANA time-zone rules in force at ${input.timezone} on ${input.date} (UTC offset ${(birth.utcOffsetMinutes / 60).toFixed(2)} h).`,
  ];

  return {
    engineVersion: ENGINE_VERSION,
    system: config.system,
    config,
    input: {
      date: input.date, time: input.time, timePrecision: input.timePrecision,
      latitude: input.latitude, longitude: input.longitude, timezone: input.timezone, placeName: input.placeName,
    },
    utc: birth.utc.toISOString(),
    utcOffsetMinutes: birth.utcOffsetMinutes,
    timeAssumed: birth.timeAssumed,
    uncertaintyMinutes: u,
    ayanamsa: sidereal ? st.ayan : null,
    ascendant: knownTime ? point(toZ(st.ascTropical), sidereal) : null,
    midheaven: knownTime ? point(toZ(st.mcTropical), sidereal) : null,
    houseSystemUsed: knownTime ? st.houseSystemUsed : null,
    cusps: knownTime ? cusps : null,
    placements,
    reliability: {
      ascendant: knownTime ? rel(ascStable) : 'unknown',
      houses: knownTime ? rel(ascStable) : 'unknown',
      moonSign: rel(moonSignStable),
      moonNakshatra: sidereal ? rel(nakStable) : 'unknown',
    },
    warnings,
    methodology,
  };
}

export function placement(chart: ChartResult, id: PlanetId): Placement {
  const p = chart.placements.find((x) => x.id === id);
  if (!p) throw new Error(`Placement ${id} not in chart`);
  return p;
}

/** Positions of all bodies at an arbitrary instant (for transits), in the given zodiac. */
export function positionsAt(date: Date, config: ChartConfig): { id: PlanetId; longitude: number; sign: number; retrograde: boolean; speed: number }[] {
  const bodies = config.system === 'vedic' ? NAVAGRAHA : WESTERN_BODIES;
  const ayan = config.system === 'vedic' ? trueAyanamsa(date, config.ayanamsa ?? 'lahiri') : 0;
  return bodies.map((id) => {
    const p = bodyPosition(id, date, config.nodeType);
    const l = norm360(p.longitude - ayan);
    return { id, longitude: l, sign: signOf(l), retrograde: p.retrograde, speed: p.speed };
  });
}
