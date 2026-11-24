import type { PlanetId } from './constants';
import type { NodeType } from './ephemeris';
import type { HouseSystem } from './houses';
import type { AyanamsaId } from './ayanamsa';
import type { TimePrecision } from './time';

export type AstroSystem = 'vedic' | 'western';

export interface ChartConfig {
  system: AstroSystem;
  houseSystem: HouseSystem;
  nodeType: NodeType;
  /** Vedic only. */
  ayanamsa?: AyanamsaId;
}

export const DEFAULT_VEDIC_CONFIG: ChartConfig = { system: 'vedic', houseSystem: 'whole_sign', nodeType: 'true', ayanamsa: 'lahiri' };
export const DEFAULT_WESTERN_CONFIG: ChartConfig = { system: 'western', houseSystem: 'placidus', nodeType: 'true' };

export type Reliability = 'reliable' | 'uncertain' | 'unknown';

export interface Placement {
  id: PlanetId;
  name: string;
  /** Longitude in the chart's zodiac (sidereal for Vedic, tropical for Western). */
  longitude: number;
  tropicalLongitude: number;
  latitude: number;
  sign: number;
  signName: string;
  degreeInSign: number;
  dms: string;
  house: number | null;
  retrograde: boolean;
  speed: number;
  nakshatra?: { index: number; name: string; pada: number; lord: PlanetId };
  dignity?: 'exalted' | 'debilitated' | 'own' | null;
}

export interface ChartPoint {
  longitude: number;
  sign: number;
  signName: string;
  degreeInSign: number;
  dms: string;
  nakshatra?: { index: number; name: string; pada: number; lord: PlanetId };
}

export interface ChartInputMeta {
  date: string;
  time: string | null;
  timePrecision: TimePrecision;
  latitude: number;
  longitude: number;
  timezone: string;
  placeName?: string;
}

export interface ChartResult {
  engineVersion: string;
  system: AstroSystem;
  config: ChartConfig;
  input: ChartInputMeta;
  utc: string;
  utcOffsetMinutes: number;
  timeAssumed: boolean;
  uncertaintyMinutes: number;
  ayanamsa: number | null;
  ascendant: ChartPoint | null;
  midheaven: ChartPoint | null;
  houseSystemUsed: HouseSystem | null;
  cusps: number[] | null;
  placements: Placement[];
  reliability: {
    ascendant: Reliability;
    houses: Reliability;
    moonSign: Reliability;
    moonNakshatra: Reliability;
  };
  warnings: string[];
  methodology: string[];
}
