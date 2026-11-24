import * as Astronomy from 'astronomy-engine';
import { norm360, type PlanetId } from './constants';
import { centuriesSinceJ2000 } from './time';

/**
 * Astronomical layer. Wraps astronomy-engine (MIT, VSOP87/ELP-based, ~1 arcminute
 * accuracy or better for the bodies used here) and adds Meeus lunar-node formulas.
 * All longitudes returned are geocentric, apparent, referred to the true
 * ecliptic and equinox of date (i.e. tropical).
 */

export type NodeType = 'mean' | 'true';

export interface BodyPosition {
  id: PlanetId;
  /** Tropical apparent ecliptic longitude, degrees [0, 360). */
  longitude: number;
  latitude: number;
  /** Degrees per day; negative means apparent retrograde motion. */
  speed: number;
  retrograde: boolean;
}

const BODY_MAP: Partial<Record<PlanetId, Astronomy.Body>> = {
  sun: Astronomy.Body.Sun,
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
  pluto: Astronomy.Body.Pluto,
};

function rad(d: number) {
  return (d * Math.PI) / 180;
}

/** Tropical apparent longitude/latitude of a body at an instant. */
export function eclipticPosition(id: PlanetId, date: Date, nodeType: NodeType = 'true'): { longitude: number; latitude: number } {
  if (id === 'moon') {
    const m = Astronomy.EclipticGeoMoon(Astronomy.MakeTime(date));
    return { longitude: norm360(m.lon), latitude: m.lat };
  }
  if (id === 'sun') {
    const s = Astronomy.SunPosition(Astronomy.MakeTime(date));
    return { longitude: norm360(s.elon), latitude: s.elat };
  }
  if (id === 'rahu') return { longitude: lunarNode(date, nodeType), latitude: 0 };
  if (id === 'ketu') return { longitude: norm360(lunarNode(date, nodeType) + 180), latitude: 0 };
  const body = BODY_MAP[id];
  if (!body) throw new Error(`Unsupported body ${id}`);
  const vec = Astronomy.GeoVector(body, Astronomy.MakeTime(date), true);
  const ecl = Astronomy.Ecliptic(vec);
  return { longitude: norm360(ecl.elon), latitude: ecl.elat };
}

export function bodyPosition(id: PlanetId, date: Date, nodeType: NodeType = 'true'): BodyPosition {
  const { longitude, latitude } = eclipticPosition(id, date, nodeType);
  // Central difference over ±6 hours gives speed with ample precision for retrograde detection.
  const h = 0.25;
  const before = eclipticPosition(id, new Date(date.getTime() - h * 86400000), nodeType).longitude;
  const after = eclipticPosition(id, new Date(date.getTime() + h * 86400000), nodeType).longitude;
  let delta = after - before;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const speed = delta / (2 * h);
  return { id, longitude, latitude, speed, retrograde: speed < 0 };
}

/** Nutation in longitude (degrees) and true obliquity (degrees) at an instant. */
export function nutationAndObliquity(date: Date): { dpsi: number; trueObliquity: number; meanObliquity: number } {
  const tilt = Astronomy.e_tilt(Astronomy.MakeTime(date));
  return { dpsi: tilt.dpsi / 3600, trueObliquity: tilt.tobl, meanObliquity: tilt.mobl };
}

/**
 * Lunar ascending node, Meeus "Astronomical Algorithms" (2nd ed.) ch. 47.
 * Mean node: eq. 47.7. True node: mean node plus the principal periodic terms
 * (Meeus p. 344). Nutation in longitude is added so the result shares the
 * apparent equinox of date used for the planets.
 */
export function lunarNode(date: Date, type: NodeType): number {
  const T = centuriesSinceJ2000(date);
  const omega = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T ** 4) / 60616000;
  let node = omega;
  if (type === 'true') {
    const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T ** 3) / 545868 - (T ** 4) / 113065000;
    const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T ** 3) / 24490000;
    const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T ** 3) / 69699 - (T ** 4) / 14712000;
    const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T - (T ** 3) / 3526000 + (T ** 4) / 863310000;
    node +=
      -1.4979 * Math.sin(rad(2 * (D - F))) -
      0.15 * Math.sin(rad(M)) -
      0.1226 * Math.sin(rad(2 * D)) +
      0.1176 * Math.sin(rad(2 * F)) -
      0.0801 * Math.sin(rad(2 * (Mp - F)));
  }
  const { dpsi } = nutationAndObliquity(date);
  return norm360(node + dpsi);
}

/** Mean lunar node without nutation — exposed for reference-test comparison with Meeus. */
export function meanLunarNodeMeeus(date: Date): number {
  const T = centuriesSinceJ2000(date);
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T ** 4) / 60616000);
}

/** Greenwich apparent sidereal time in degrees. */
export function greenwichApparentSiderealDeg(date: Date): number {
  return norm360(Astronomy.SiderealTime(Astronomy.MakeTime(date)) * 15);
}

/** Moon phase angle (Moon − Sun elongation in ecliptic longitude), degrees [0, 360). */
export function moonPhaseAngle(date: Date): number {
  return norm360(Astronomy.MoonPhase(Astronomy.MakeTime(date)));
}

export function illuminatedFraction(date: Date): number {
  return Astronomy.Illumination(Astronomy.Body.Moon, Astronomy.MakeTime(date)).phase_fraction;
}

export interface RiseSet {
  sunrise: Date | null;
  sunset: Date | null;
  moonrise: Date | null;
  moonset: Date | null;
}

/** Rise/set times for the civil day that starts at `dayStartUtc` (local midnight expressed in UTC). */
export function riseSet(dayStartUtc: Date, latitude: number, longitude: number): RiseSet {
  const obs = new Astronomy.Observer(latitude, longitude, 0);
  const t = Astronomy.MakeTime(dayStartUtc);
  const find = (body: Astronomy.Body, dir: 1 | -1) => {
    const r = Astronomy.SearchRiseSet(body, obs, dir, t, 1);
    return r ? r.date : null;
  };
  return {
    sunrise: find(Astronomy.Body.Sun, 1),
    sunset: find(Astronomy.Body.Sun, -1),
    moonrise: find(Astronomy.Body.Moon, 1),
    moonset: find(Astronomy.Body.Moon, -1),
  };
}

/** Next instant after `start` at which the Moon reaches the given phase angle (0 new, 90, 180 full, 270). */
export function nextMoonPhase(start: Date, targetPhase: number, limitDays = 40): Date | null {
  const r = Astronomy.SearchMoonPhase(targetPhase, Astronomy.MakeTime(start), limitDays);
  return r ? r.date : null;
}

/** Next instant after `start` at which the Sun reaches a tropical ecliptic longitude. */
export function nextSunLongitude(start: Date, targetLongitude: number, limitDays = 400): Date | null {
  const r = Astronomy.SearchSunLongitude(norm360(targetLongitude), Astronomy.MakeTime(start), limitDays);
  return r ? r.date : null;
}

/**
 * Generic forward search: finds the first instant in [start, start+limitDays] at which
 * f(t) crosses `target` (angles, modulo 360) moving forward. Uses coarse stepping then bisection.
 */
export function searchAngleCrossing(
  f: (d: Date) => number,
  target: number,
  start: Date,
  limitDays: number,
  stepHours = 6,
): Date | null {
  const stepMs = stepHours * 3600000;
  let t0 = start.getTime();
  let d0 = angleDelta(f(new Date(t0)), target);
  const end = t0 + limitDays * 86400000;
  while (t0 < end) {
    const t1 = t0 + stepMs;
    const d1 = angleDelta(f(new Date(t1)), target);
    if (d0 < 0 && d1 >= 0 && d1 - d0 < 180) {
      let lo = t0;
      let hi = t1;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (angleDelta(f(new Date(mid)), target) < 0) lo = mid;
        else hi = mid;
      }
      return new Date(hi);
    }
    t0 = t1;
    d0 = d1;
  }
  return null;
}

function angleDelta(value: number, target: number): number {
  let d = norm360(value - target);
  if (d > 180) d -= 360;
  return d;
}
