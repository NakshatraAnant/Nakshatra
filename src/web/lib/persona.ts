import { hashSeed } from '../../shared/hash';

/** Shapes returned by /identity/me and /personality endpoints (see src/server/modules/studio.ts). */
export interface Dim { key: string; name: string; low: string; high: string; score: number }
export interface Persona {
  key: string; name: string; signature: string; traits: string[]; inCircles: string; growth: string;
  secondary: { key: string; name: string } | null; confidence: 'high' | 'medium' | 'low' | 'inconclusive'; version: string; takenAt: string;
  quality?: { level: 'good' | 'low' | 'insufficient'; flags: string[]; message: string | null } | null;
  dimensions: Dim[]; explanation: string[];
}

/**
 * Identity-card styles. Earned styles unlock through participation; Eclipse Ink and
 * Saffron Foil come from the paid cosmetic pack. Colours are literal so cards rasterise.
 */
export const CARD_STYLES: Record<string, { ink: string; glow: string; accent: string; label: string }> = {
  classic: { ink: '#0b0c1f', glow: '#8d7bd8', accent: '#d9b26f', label: 'Classic' },
  dusk: { ink: '#140b1f', glow: '#c98a96', accent: '#ecd29d', label: 'Dusk' },
  aurora: { ink: '#061317', glow: '#5fd1b5', accent: '#c9b8ff', label: 'Aurora' },
  table: { ink: '#0f0a06', glow: '#e9a23b', accent: '#7fb69a', label: 'Game Night' },
  eclipse_ink: { ink: '#020204', glow: '#3a3f5c', accent: '#f3e4c0', label: 'Eclipse Ink' },
  saffron_foil: { ink: '#1b0d02', glow: '#ff9933', accent: '#ffe7a3', label: 'Saffron Foil' },
};

/** Each archetype gets a stable hue pair so its sigil is recognisable everywhere. */
export function personaPalette(key: string, style = 'classic') {
  const base = CARD_STYLES[style] ?? CARD_STYLES.classic;
  const h = hashSeed(key) % 360;
  return { ...base, hue: `hsl(${h} 70% 68%)`, hue2: `hsl(${(h + 140) % 360} 65% 62%)` };
}

export const PENDING_ANSWERS_KEY = 'nk_pending_answers';
export function savePendingAnswers(a: Record<string, number>) { try { sessionStorage.setItem(PENDING_ANSWERS_KEY, JSON.stringify(a)); } catch { /* storage unavailable */ } }
export function takePendingAnswers(): Record<string, number> | null {
  try { const raw = sessionStorage.getItem(PENDING_ANSWERS_KEY); return raw ? JSON.parse(raw) as Record<string, number> : null; } catch { return null; }
}
export function clearPendingAnswers() { try { sessionStorage.removeItem(PENDING_ANSWERS_KEY); } catch { /* storage unavailable */ } }

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []; let line = '';
  for (const w of text.split(' ')) { const n = line ? `${line} ${w}` : w; if (ctx.measureText(n).width > max && line) { out.push(line); line = w; } else line = n; }
  if (line) out.push(line);
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const img = new Image(); img.decoding = 'async'; img.onload = () => res(img); img.onerror = () => rej(new Error('Could not load the card artwork.')); img.src = src; });
}

/**
 * Draws the 5:7 identity card (750×1050 artboard, component-specifications.md) at
 * the given scale: the archetype's own card art for the classic style, or a card-style
 * frame with the archetype sigil composited at (375, 400), 350px. Name in y 620–730,
 * traits in y 770–960 — all live text, nothing baked into the artwork.
 */
async function drawIdentityCard(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, art: { card: string; frame: string | null; sigil: string; accent: string }, p: { name: string; signature: string; traits: string[] }) {
  const k = (n: number) => n * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.drawImage(await loadImage(art.frame ?? art.card), 0, 0, k(750), k(1050));
  if (art.frame) ctx.drawImage(await loadImage(art.sigil), k(375 - 175), k(400 - 175), k(350), k(350));
  try { await document.fonts?.ready; } catch { /* fonts API unavailable */ }
  const serif = "'Instrument Serif', Georgia, serif"; const mono = "'JetBrains Mono', ui-monospace, monospace";
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ece1';
  // Long archetype names shrink to stay inside the 620–730 band.
  let size = 64;
  ctx.font = `400 ${k(size)}px ${serif}`;
  let lines = wrap(ctx, p.name, k(640));
  while (lines.length > 2 && size > 40) { size -= 4; ctx.font = `400 ${k(size)}px ${serif}`; lines = wrap(ctx, p.name, k(640)); }
  const nameTop = lines.length > 1 ? 640 : 680;
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, k(375), k(nameTop + i * size * 1.02)));
  ctx.font = `italic 400 ${k(28)}px ${serif}`;
  ctx.fillStyle = '#e4dccc';
  wrap(ctx, p.signature, k(600)).slice(0, 2).forEach((l, i) => ctx.fillText(l, k(375), k(800 + i * 36)));
  ctx.font = `500 ${k(18)}px ${mono}`;
  ctx.fillStyle = art.accent;
  p.traits.slice(0, 3).forEach((tr, i) => ctx.fillText(tr.toUpperCase(), k(375), k(890 + i * 30)));
  ctx.restore();
}

/**
 * Persona share card: 1080×1920 story (the full identity card) or 1080×1080 square
 * (the card beside the archetype name). Contains the archetype, signature line and
 * traits — never email, handle, pen name or birth details. Rendered from real data.
 */
export async function renderPersonaCard(art: { card: string; frame: string | null; sigil: string; accent: string }, p: { name: string; signature: string; traits: string[]; labels?: string[] }, format: 'story' | 'square'): Promise<Blob> {
  const W = 1080; const H = format === 'story' ? 1920 : 1080;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0a0c12'; ctx.fillRect(0, 0, W, H);
  const sans = "'Hanken Grotesk', system-ui, sans-serif"; const mono = "'JetBrains Mono', ui-monospace, monospace";
  if (format === 'story') {
    const scale = 920 / 750;
    await drawIdentityCard(ctx, (W - 920) / 2, 210, scale, art, p);
    ctx.textAlign = 'center';
    ctx.font = `500 26px ${mono}`; ctx.fillStyle = '#9a958b';
    ctx.fillText('MY ARCHETYPE ON NAKSHATRA', W / 2, 140);
    if (p.labels?.length) { ctx.font = `400 28px ${sans}`; ctx.fillStyle = '#cfc8bb'; ctx.fillText(p.labels.slice(0, 3).join('  ·  '), W / 2, 210 + 1050 * scale + 70); }
    ctx.font = `400 28px ${sans}`; ctx.fillStyle = '#9a958b';
    ctx.fillText('Find your kind of person — Nakshatra', W / 2, H - 90);
  } else {
    const scale = 1000 / 1050;
    await drawIdentityCard(ctx, (W - 750 * scale) / 2, 40, scale, art, p);
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image.'))), 'image/png'));
}
