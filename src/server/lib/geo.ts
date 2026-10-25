import { createRequire } from 'node:module';
import { IANAZone } from 'luxon';

/**
 * Offline location resolution. City data: GeoNames "cities1000" via the
 * `all-the-cities` package (GeoNames data is CC BY 4.0 — attribution shown in the UI).
 * Time zones: `geo-tz` (timezone-boundary-builder polygons, ODbL), which returns the
 * IANA zone whose historical rules are then applied by the astrology engine.
 */
const require = createRequire(import.meta.url);

interface City { cityId: number; name: string; altName: string; country: string; adminCode: string; population: number; loc: { coordinates: [number, number] } }
interface Indexed { city: City; key: string; alt: string }

let index: Indexed[] | null = null;
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function normalise(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function getIndex(): Indexed[] {
  if (!index) {
    const cities = require('all-the-cities') as City[];
    index = cities.map((city) => ({ city, key: normalise(city.name), alt: normalise(city.altName ?? '') }));
  }
  return index;
}

export function timezoneFor(lat: number, lon: number): string {
  const { find } = require('geo-tz') as { find: (lat: number, lon: number) => string[] };
  const zones = find(lat, lon).filter((z) => IANAZone.isValidZone(z));
  return zones[0] ?? 'UTC';
}

export interface PlaceResult {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
  label: string;
}

export function searchPlaces(query: string, limit = 8): PlaceResult[] {
  const q = normalise(query.split(',')[0]);
  if (q.length < 2) return [];
  const countryHint = normalise(query.split(',')[1] ?? '');
  const hits = getIndex()
    .filter((c) => c.key.startsWith(q) || (c.alt && c.alt.split(' ').some((w) => w.startsWith(q))))
    .filter((c) => !countryHint || c.city.country.toLowerCase() === countryHint || normalise(regionNames.of(c.city.country) ?? '').startsWith(countryHint))
    .sort((a, b) => (Number(b.key === q) - Number(a.key === q)) || b.city.population - a.city.population)
    .slice(0, limit);
  return hits.map(({ city }) => {
    const [lon, lat] = city.loc.coordinates;
    const country = regionNames.of(city.country) ?? city.country;
    return {
      id: String(city.cityId), name: city.name, country, countryCode: city.country,
      latitude: lat, longitude: lon, timezone: timezoneFor(lat, lon), population: city.population,
      label: `${city.name}, ${country}`,
    };
  });
}

export function placeById(id: string): PlaceResult | null {
  const hit = getIndex().find((c) => String(c.city.cityId) === id);
  if (!hit) return null;
  const [lon, lat] = hit.city.loc.coordinates;
  const country = regionNames.of(hit.city.country) ?? hit.city.country;
  return { id, name: hit.city.name, country, countryCode: hit.city.country, latitude: lat, longitude: lon, timezone: timezoneFor(lat, lon), population: hit.city.population, label: `${hit.city.name}, ${country}` };
}

/** Rounds coordinates to ~5 km before storage for dating/matchmaking (precise location is never stored). */
export function coarsen(v: number): number {
  return Math.round(v * 20) / 20;
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
