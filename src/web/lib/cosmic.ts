import { post } from './api';
import type { Precision } from '../components/BirthForm';
import type { Place } from '../components/PlaceSearch';

/** Response of POST /discover/cosmic-id and GET /cosmic-id/me (see src/server/modules/discover.ts). */
export interface LayerText { title: string; body: string; caveat: string | null; factor: string }
export interface CosmicIdentity {
  archetype: {
    key: string; name: string; element: 'fire' | 'earth' | 'air' | 'water'; modality: 'cardinal' | 'fixed' | 'mutable';
    essence: string; portrait: string; gifts: string[]; growthEdge: string; inBonds: string;
    palette: { ink: string; glow: string; accent: string };
    blend: string | null; blendName: string | null;
    elements: Record<string, number>; modalities: Record<string, number>;
    includesAscendant: boolean; method: string; elementMeaning: string; modalityMeaning: string; disclaimer: string;
  };
  layers: {
    rashi: { value: string; english: string; reliability: string; text: LayerText | null };
    nakshatra: { value: string; pada: number; lord: string; deity: string; symbol: string; reliability: string; text: LayerText | null };
    lagna: { value: string; english: string; reliability: string; text: LayerText | null } | null;
    surya: { value: string; english: string; text: LayerText | null };
    westernSun: { value: string; text: LayerText | null };
    westernMoon: { value: string; reliability: string; text: LayerText | null };
    westernRising: { value: string; reliability: string; text: LayerText | null } | null;
  };
  sigil: { moonNakshatra: number; moonSign: number; ascendant: { longitude: number; sign: number } | null; bodies: { id: string; glyph: string; abbr: string; longitude: number }[] };
  timeKnown: boolean;
  warnings: string[];
  methodology: string[];
}

/** Funnel events (aggregate; the server attaches the member only when signed in). Failures never affect the page. */
export type FunnelEvent = 'landing_viewed' | 'cosmic_id_card_downloaded' | 'cosmic_id_preview_signup_clicked' | 'assessment_started' | 'result_viewed' | 'share_card_created' | 'preview_signup_clicked' | 'offer_viewed' | 'intro_viewed' | 'intro_skipped' | 'intro_completed' | 'reveal_completed' | 'identity_studio_opened';
export function publicEvent(name: FunnelEvent) {
  void post('discover/events', { name }).catch(() => undefined);
}

/** Birth details carried from the account-free preview into onboarding, in this tab only. */
const PENDING_KEY = 'nk_pending_birth';
export interface PendingBirth {
  date: string; time: string | null; timePrecision: Precision;
  place?: Place; manual?: { name: string; latitude: number; longitude: number };
}
export function savePendingBirth(v: PendingBirth) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}
export function takePendingBirth(): PendingBirth | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingBirth) : null;
  } catch { return null; }
}
export function clearPendingBirth() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
}

export type CardFormat = 'story' | 'square';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Renders a share card (1080×1920 for Stories/Status, 1080×1080 for feeds) from a
 * non-precise sigil SVG. Shows archetype, essence and the three Vedic layers —
 * never birth date, time, place or planetary positions.
 */
export async function renderShareCard(svg: SVGSVGElement, id: CosmicIdentity, format: CardFormat): Promise<Blob> {
  const W = 1080;
  const H = format === 'story' ? 1920 : 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const { ink, glow, accent } = id.archetype.palette;
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.7);
  g.addColorStop(0, `${glow}40`);
  g.addColorStop(1, `${ink}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('data-animate');
  clone.setAttribute('width', '900');
  clone.setAttribute('height', '900');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not draw the sigil.')); img.src = url; });
    const s = format === 'story' ? 860 : 560;
    const top = format === 'story' ? 250 : 70;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, top + s / 2, s / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, (W - s) / 2, top, s, s);
    ctx.restore();

    try { await document.fonts?.ready; } catch { /* fonts API unavailable */ }
    const serif = "'Instrument Serif', Georgia, serif";
    const sans = "'Hanken Grotesk', system-ui, sans-serif";
    ctx.textAlign = 'center';
    let y = format === 'story' ? 1230 : 700;
    ctx.fillStyle = accent;
    ctx.font = `600 30px ${sans}`;
    ctx.fillText('MY COSMIC ID', W / 2, y);
    y += format === 'story' ? 110 : 90;
    ctx.fillStyle = '#f6f1e6';
    ctx.font = `500 ${format === 'story' ? 112 : 92}px ${serif}`;
    ctx.fillText(id.archetype.name, W / 2, y);
    y += format === 'story' ? 80 : 64;
    ctx.font = `italic 400 ${format === 'story' ? 46 : 38}px ${serif}`;
    ctx.fillStyle = '#e6dfcd';
    for (const line of wrap(ctx, id.archetype.essence, 860).slice(0, 2)) { ctx.fillText(line, W / 2, y); y += format === 'story' ? 58 : 48; }
    y += format === 'story' ? 50 : 24;
    ctx.font = `500 34px ${sans}`;
    ctx.fillStyle = glow;
    const facts = [`${id.layers.rashi.value} Rashi`, id.layers.nakshatra.value, id.layers.lagna ? `${id.layers.lagna.value} Lagna` : null].filter(Boolean).join('  ·  ');
    ctx.fillText(facts, W / 2, y);
    ctx.font = `400 28px ${sans}`;
    ctx.fillStyle = '#a9a6bd';
    ctx.fillText('Calculated, not generated — discover yours on Nakshatra', W / 2, H - (format === 'story' ? 120 : 60));
  } finally {
    URL.revokeObjectURL(url);
  }
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image.'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Uses the native share sheet with the image when supported (mobile WhatsApp / Instagram), else downloads. */
export async function shareOrDownload(blob: Blob, filename: string, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // Native sharing only on touch devices; on desktop a direct download is what people expect.
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}
