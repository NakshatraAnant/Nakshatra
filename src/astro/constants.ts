/**
 * Static reference tables for the astrology engine.
 * Every table here is a convention, not a measurement; the convention used is
 * named alongside each table so it can be cited in docs and the UI.
 */

export const ENGINE_VERSION = '1.0.1';

export type PlanetId =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn'
  | 'uranus' | 'neptune' | 'pluto' | 'rahu' | 'ketu';

export const CLASSICAL_PLANETS: PlanetId[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
export const NAVAGRAHA: PlanetId[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
export const WESTERN_BODIES: PlanetId[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'rahu'];

export const PLANETS: Record<PlanetId, { name: string; hi: string; vedic: string; glyph: string; abbr: string }> = {
  sun: { name: 'Sun', hi: 'सूर्य', vedic: 'Surya', glyph: '☉', abbr: 'Su' },
  moon: { name: 'Moon', hi: 'चंद्र', vedic: 'Chandra', glyph: '☽', abbr: 'Mo' },
  mercury: { name: 'Mercury', hi: 'बुध', vedic: 'Budha', glyph: '☿', abbr: 'Me' },
  venus: { name: 'Venus', hi: 'शुक्र', vedic: 'Shukra', glyph: '♀', abbr: 'Ve' },
  mars: { name: 'Mars', hi: 'मंगल', vedic: 'Mangala', glyph: '♂', abbr: 'Ma' },
  jupiter: { name: 'Jupiter', hi: 'गुरु', vedic: 'Guru', glyph: '♃', abbr: 'Ju' },
  saturn: { name: 'Saturn', hi: 'शनि', vedic: 'Shani', glyph: '♄', abbr: 'Sa' },
  uranus: { name: 'Uranus', hi: 'अरुण', vedic: 'Uranus', glyph: '♅', abbr: 'Ur' },
  neptune: { name: 'Neptune', hi: 'वरुण', vedic: 'Neptune', glyph: '♆', abbr: 'Ne' },
  pluto: { name: 'Pluto', hi: 'यम', vedic: 'Pluto', glyph: '♇', abbr: 'Pl' },
  rahu: { name: 'North Node', hi: 'राहु', vedic: 'Rahu', glyph: '☊', abbr: 'Ra' },
  ketu: { name: 'South Node', hi: 'केतु', vedic: 'Ketu', glyph: '☋', abbr: 'Ke' },
};

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'cardinal' | 'fixed' | 'mutable';

export interface SignInfo {
  index: number;
  name: string;
  vedic: string;
  hi: string;
  glyph: string;
  element: Element;
  modality: Modality;
  /** Traditional (classical) ruler; used by both systems' rulership rules. */
  ruler: PlanetId;
}

export const SIGNS: SignInfo[] = [
  { index: 0, name: 'Aries', vedic: 'Mesha', hi: 'मेष', glyph: '♈', element: 'fire', modality: 'cardinal', ruler: 'mars' },
  { index: 1, name: 'Taurus', vedic: 'Vrishabha', hi: 'वृषभ', glyph: '♉', element: 'earth', modality: 'fixed', ruler: 'venus' },
  { index: 2, name: 'Gemini', vedic: 'Mithuna', hi: 'मिथुन', glyph: '♊', element: 'air', modality: 'mutable', ruler: 'mercury' },
  { index: 3, name: 'Cancer', vedic: 'Karka', hi: 'कर्क', glyph: '♋', element: 'water', modality: 'cardinal', ruler: 'moon' },
  { index: 4, name: 'Leo', vedic: 'Simha', hi: 'सिंह', glyph: '♌', element: 'fire', modality: 'fixed', ruler: 'sun' },
  { index: 5, name: 'Virgo', vedic: 'Kanya', hi: 'कन्या', glyph: '♍', element: 'earth', modality: 'mutable', ruler: 'mercury' },
  { index: 6, name: 'Libra', vedic: 'Tula', hi: 'तुला', glyph: '♎', element: 'air', modality: 'cardinal', ruler: 'venus' },
  { index: 7, name: 'Scorpio', vedic: 'Vrishchika', hi: 'वृश्चिक', glyph: '♏', element: 'water', modality: 'fixed', ruler: 'mars' },
  { index: 8, name: 'Sagittarius', vedic: 'Dhanu', hi: 'धनु', glyph: '♐', element: 'fire', modality: 'mutable', ruler: 'jupiter' },
  { index: 9, name: 'Capricorn', vedic: 'Makara', hi: 'मकर', glyph: '♑', element: 'earth', modality: 'cardinal', ruler: 'saturn' },
  { index: 10, name: 'Aquarius', vedic: 'Kumbha', hi: 'कुंभ', glyph: '♒', element: 'air', modality: 'fixed', ruler: 'saturn' },
  { index: 11, name: 'Pisces', vedic: 'Meena', hi: 'मीन', glyph: '♓', element: 'water', modality: 'mutable', ruler: 'jupiter' },
];

export interface NakshatraInfo {
  index: number;
  name: string;
  hi: string;
  /** Vimshottari dasha lord. */
  lord: PlanetId;
  deity: string;
  symbol: string;
  gana: 'deva' | 'manushya' | 'rakshasa';
  yoni: Yoni;
  nadi: 'adi' | 'madhya' | 'antya';
}

export type Yoni =
  | 'horse' | 'elephant' | 'sheep' | 'serpent' | 'dog' | 'cat' | 'rat'
  | 'cow' | 'buffalo' | 'tiger' | 'deer' | 'monkey' | 'mongoose' | 'lion';

const NADI_CYCLE: NakshatraInfo['nadi'][] = ['adi', 'madhya', 'antya', 'antya', 'madhya', 'adi'];
const DASHA_LORD_CYCLE: PlanetId[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];

const NAK_RAW: [string, string, string, string, NakshatraInfo['gana'], Yoni][] = [
  ['Ashwini', 'अश्विनी', 'Ashvini Kumaras', "Horse's head", 'deva', 'horse'],
  ['Bharani', 'भरणी', 'Yama', 'Yoni', 'manushya', 'elephant'],
  ['Krittika', 'कृत्तिका', 'Agni', 'Razor / flame', 'rakshasa', 'sheep'],
  ['Rohini', 'रोहिणी', 'Brahma', 'Chariot', 'manushya', 'serpent'],
  ['Mrigashira', 'मृगशिरा', 'Soma', "Deer's head", 'deva', 'serpent'],
  ['Ardra', 'आर्द्रा', 'Rudra', 'Teardrop', 'manushya', 'dog'],
  ['Punarvasu', 'पुनर्वसु', 'Aditi', 'Quiver of arrows', 'deva', 'cat'],
  ['Pushya', 'पुष्य', 'Brihaspati', "Cow's udder", 'deva', 'sheep'],
  ['Ashlesha', 'आश्लेषा', 'Nagas', 'Coiled serpent', 'rakshasa', 'cat'],
  ['Magha', 'मघा', 'Pitris', 'Royal throne', 'rakshasa', 'rat'],
  ['Purva Phalguni', 'पूर्व फाल्गुनी', 'Bhaga', 'Front legs of a bed', 'manushya', 'rat'],
  ['Uttara Phalguni', 'उत्तर फाल्गुनी', 'Aryaman', 'Back legs of a bed', 'manushya', 'cow'],
  ['Hasta', 'हस्त', 'Savitr', 'Hand', 'deva', 'buffalo'],
  ['Chitra', 'चित्रा', 'Tvashtar', 'Bright jewel', 'rakshasa', 'tiger'],
  ['Swati', 'स्वाति', 'Vayu', 'Young shoot', 'deva', 'buffalo'],
  ['Vishakha', 'विशाखा', 'Indra-Agni', 'Triumphal arch', 'rakshasa', 'tiger'],
  ['Anuradha', 'अनुराधा', 'Mitra', 'Lotus', 'deva', 'deer'],
  ['Jyeshtha', 'ज्येष्ठा', 'Indra', 'Earring / umbrella', 'rakshasa', 'deer'],
  ['Mula', 'मूल', 'Nirriti', 'Bundle of roots', 'rakshasa', 'dog'],
  ['Purva Ashadha', 'पूर्वाषाढ़ा', 'Apas', 'Fan', 'manushya', 'monkey'],
  ['Uttara Ashadha', 'उत्तराषाढ़ा', 'Vishvedevas', "Elephant's tusk", 'manushya', 'mongoose'],
  ['Shravana', 'श्रवण', 'Vishnu', 'Ear', 'deva', 'monkey'],
  ['Dhanishta', 'धनिष्ठा', 'Vasus', 'Drum', 'rakshasa', 'lion'],
  ['Shatabhisha', 'शतभिषा', 'Varuna', 'Empty circle', 'rakshasa', 'horse'],
  ['Purva Bhadrapada', 'पूर्व भाद्रपद', 'Aja Ekapada', 'Front of a funeral cot', 'manushya', 'lion'],
  ['Uttara Bhadrapada', 'उत्तर भाद्रपद', 'Ahir Budhnya', 'Back of a funeral cot', 'manushya', 'cow'],
  ['Revati', 'रेवती', 'Pushan', 'Fish / drum', 'deva', 'elephant'],
];

export const NAKSHATRAS: NakshatraInfo[] = NAK_RAW.map(([name, hi, deity, symbol, gana, yoni], index) => ({
  index,
  name,
  hi,
  deity,
  symbol,
  gana,
  yoni,
  lord: DASHA_LORD_CYCLE[index % 9],
  nadi: NADI_CYCLE[index % 6],
}));

export const NAKSHATRA_SPAN = 360 / 27; // 13°20'
export const PADA_SPAN = NAKSHATRA_SPAN / 4; // 3°20'

/** Vimshottari dasha years per lord (total 120). */
export const VIMSHOTTARI_YEARS: Record<string, number> = {
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
};
export const VIMSHOTTARI_ORDER: PlanetId[] = DASHA_LORD_CYCLE;

/**
 * Exaltation sign index for classical planets (Parashara). Rahu/Ketu exaltation
 * varies between authors and is intentionally omitted.
 */
export const EXALTATION: Partial<Record<PlanetId, number>> = {
  sun: 0, moon: 1, mars: 9, mercury: 5, jupiter: 3, venus: 11, saturn: 6,
};
export const DEBILITATION: Partial<Record<PlanetId, number>> = {
  sun: 6, moon: 7, mars: 3, mercury: 11, jupiter: 9, venus: 5, saturn: 0,
};

/** Natural (naisargika) friendships, Brihat Parashara Hora Shastra. */
export const NATURAL_RELATIONS: Record<string, { friends: PlanetId[]; neutral: PlanetId[]; enemies: PlanetId[] }> = {
  sun: { friends: ['moon', 'mars', 'jupiter'], neutral: ['mercury'], enemies: ['venus', 'saturn'] },
  moon: { friends: ['sun', 'mercury'], neutral: ['mars', 'jupiter', 'venus', 'saturn'], enemies: [] },
  mars: { friends: ['sun', 'moon', 'jupiter'], neutral: ['venus', 'saturn'], enemies: ['mercury'] },
  mercury: { friends: ['sun', 'venus'], neutral: ['mars', 'jupiter', 'saturn'], enemies: ['moon'] },
  jupiter: { friends: ['sun', 'moon', 'mars'], neutral: ['saturn'], enemies: ['mercury', 'venus'] },
  venus: { friends: ['mercury', 'saturn'], neutral: ['mars', 'jupiter'], enemies: ['sun', 'moon'] },
  saturn: { friends: ['mercury', 'venus'], neutral: ['jupiter'], enemies: ['sun', 'moon', 'mars'] },
};

export const TITHI_NAMES = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami',
  'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];

export const YOGA_NAMES = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula',
  'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyan',
  'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];

export const KARANA_MOVABLE = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'];
export const KARANA_FIXED_END = ['Shakuni', 'Chatushpada', 'Naga'];

export const VARA_NAMES = ['Ravivara', 'Somavara', 'Mangalavara', 'Budhavara', 'Guruvara', 'Shukravara', 'Shanivara'];
export const VARA_LORDS: PlanetId[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

/** Amanta lunar month named by the sidereal sign of the Sun at the opening new moon. */
export const LUNAR_MONTH_BY_SUN_SIGN = [
  'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashwin',
  'Kartika', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna', 'Chaitra',
];

export function norm360(x: number): number {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

/** Smallest signed angular difference a-b in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = norm360(a - b);
  if (d > 180) d -= 360;
  return d;
}

export function signOf(longitude: number): number {
  return Math.floor(norm360(longitude) / 30) % 12;
}

export function degreeInSign(longitude: number): number {
  return norm360(longitude) % 30;
}

export function formatDms(deg: number): string {
  const d = Math.floor(deg);
  const mFloat = (deg - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  const [mm, ss] = s === 60 ? [m + 1, 0] : [m, s];
  return `${d}°${String(mm).padStart(2, '0')}′${String(ss).padStart(2, '0')}″`;
}

export function nakshatraOf(siderealLongitude: number): { index: number; pada: number; fraction: number } {
  const l = norm360(siderealLongitude);
  const index = Math.min(26, Math.floor(l / NAKSHATRA_SPAN));
  const within = l - index * NAKSHATRA_SPAN;
  const pada = Math.min(4, Math.floor(within / PADA_SPAN) + 1);
  return { index, pada, fraction: within / NAKSHATRA_SPAN };
}
