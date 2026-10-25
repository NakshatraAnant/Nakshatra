(function (saveFile) {
const N = { man: [] };
N.f = x => +(+x).toFixed(2);
N.rng = seed => { let s = (seed * 2654435761) >>> 0 || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
N.oklch = (l, c, h) => {
  const hr = h * Math.PI / 180, a = c * Math.cos(hr), b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b, m_ = l - 0.1055613458 * a - 0.0638541728 * b, s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, bl = -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S;
  const f = x => { x = Math.max(0, Math.min(1, x)); x = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; return Math.round(x * 255).toString(16).padStart(2, '0'); };
  return '#' + f(r) + f(g) + f(bl);
};
N.C = { ink950: '#0A0C12', ink900: '#0F121A', ink800: '#161A25', ink700: '#212635', line: '#2F3546', bone: '#F2ECE1', bone2: '#E4DCCC', paper: '#F6F1E8', mute: '#9A958B', inkText: '#14161D' };
N.C.ember = N.oklch(0.74, 0.15, 52); N.C.emberDeep = N.oklch(0.56, 0.15, 45);
N.C.indigo = N.oklch(0.42, 0.12, 275); N.C.dusk = N.oklch(0.27, 0.06, 270); N.C.violet = N.oklch(0.5, 0.14, 300); N.C.tide = N.oklch(0.6, 0.09, 220);
N.acc = h => N.oklch(0.78, 0.12, h); N.accDeep = h => N.oklch(0.52, 0.13, h);
N.svg = (w, h, body, defs = '', bg = null) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${defs ? `<defs>${defs}</defs>` : ''}${bg ? `<rect data-bg="1" width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;
N.rad = d => d * Math.PI / 180;
N.p = (r, d, cx = 0, cy = 0) => [N.f(cx + r * Math.cos(N.rad(d))), N.f(cy + r * Math.sin(N.rad(d)))];
N.pts = a => a.map(p => p.join(',')).join(' ');
N.ngon = (n, r, rot = -90) => Array.from({ length: n }, (_, i) => N.p(r, rot + 360 * i / n));
N.starP = (n, r, ri, rot = -90) => Array.from({ length: 2 * n }, (_, i) => N.p(i % 2 ? ri : r, rot + 180 * i / n));
N.st = (col, sw, o = {}) => `stroke="${col}" stroke-width="${N.f(sw)}"${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}" stroke-linecap="round"` : ''}`;
N.arcD = (r, a0, a1, cx = 0, cy = 0) => { const [x0, y0] = N.p(r, a0, cx, cy), [x1, y1] = N.p(r, a1, cx, cy); return `M${x0},${y0}A${r},${r} 0 ${(a1 - a0) > 180 ? 1 : 0} 1 ${x1},${y1}`; };
N.sparkleD = (cx, cy, R, k = 0.14) => { cx = N.f(cx); cy = N.f(cy); const a = N.f(R * k); R = N.f(R); return `M${cx},${N.f(cy - R)}Q${N.f(cx + a)},${N.f(cy - a)} ${N.f(cx + R)},${cy}Q${N.f(cx + a)},${N.f(cy + a)} ${cx},${N.f(cy + R)}Q${N.f(cx - a)},${N.f(cy + a)} ${N.f(cx - R)},${cy}Q${N.f(cx - a)},${N.f(cy - a)} ${cx},${N.f(cy - R)}Z`; };
N.grainDef = (id = 'gr', op = 0.07, freq = 0.8, v = 1) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 ${op} 0"/></filter>`;
N.grain = (w, h, id = 'gr') => `<rect width="${w}" height="${h}" fill="#000" filter="url(#${id})"/>`;
N.glowDef = (id, c, op = 0.3) => `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${op}"/><stop offset="0.55" stop-color="${c}" stop-opacity="${N.f(op * 0.28)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
N.glow = (cx, cy, r, id) => `<circle cx="${N.f(cx)}" cy="${N.f(cy)}" r="${N.f(r)}" fill="url(#${id})"/>`;
N.blurDef = (id, s) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`;
N.vgDef = (id, c = '#000', op = 0.7) => `<radialGradient id="${id}" cx=".5" cy=".5" r=".75"><stop offset=".45" stop-color="${c}" stop-opacity="0"/><stop offset="1" stop-color="${c}" stop-opacity="${op}"/></radialGradient>`;
N.stars = (w, h, n, seed, o = {}) => {
  const R = N.rng(seed); let s = ''; const col = o.col || N.C.bone;
  for (let i = 0; i < n; i++) {
    let x = R() * w, y = R() * h; const m = R() ** (o.pow || 3);
    if (o.avoid && Math.hypot(x - o.avoid[0], y - o.avoid[1]) < o.avoid[2]) continue;
    const r = N.f((o.min || 0.5) + m * (o.max || 2)); const op = N.f(0.12 + m * 0.7);
    s += `<circle cx="${N.f(x)}" cy="${N.f(y)}" r="${r}" fill="${col}" opacity="${op}"/>`;
    if (m > 0.88 && o.spark !== false) s += `<path d="${N.sparkleD(x, y, r * 5)}" fill="${col}" opacity="${N.f(op * 0.8)}"/>`;
  }
  return s;
};
N.layer = (L, col, sw) => {
  const c = L.col || col, w = (L.sw || 1) * sw, o = { op: L.op, dash: L.dash };
  const S = () => N.st(c, w, o);
  const OP = L.op != null ? ` opacity="${L.op}"` : '';
  const F = L.fill ? `fill="${c}"${OP}` : null;
  let out = '';
  switch (L.t) {
    case 'ring': out = `<circle cx="${L.cx || 0}" cy="${L.cy || 0}" r="${L.r}" ${F || S()}/>`; break;
    case 'rings': for (let r = L.r0; r <= L.r1; r += L.step) out += `<circle r="${r}" ${N.st(c, w, { op: L.op ?? N.f(0.25 + 0.75 * (r - L.r0) / ((L.r1 - L.r0) || 1)), dash: L.dash })}/>`; break;
    case 'arcs': { const seg = 360 / L.n; for (let i = 0; i < L.n; i++) { const a0 = (L.rot || 0) + i * seg + L.gap / 2, a1 = (L.rot || 0) + (i + 1) * seg - L.gap / 2; out += `<path d="${N.arcD(L.r, a0, a1)}" ${S()} stroke-linecap="round"/>`; } break; }
    case 'poly': out = `<polygon points="${N.pts(N.ngon(L.n, L.r, L.rot ?? -90))}" ${F || S()} stroke-linejoin="round"/>`; break;
    case 'nested': for (let i = 0; i < L.count; i++) { const r = L.r * (1 - i / L.count); out += `<polygon points="${N.pts(N.ngon(L.n, r, (L.rot ?? -90) + i * (L.twist || 0)))}" ${S()} stroke-linejoin="round"/>`; } break;
    case 'star': out = `<polygon points="${N.pts(N.starP(L.n, L.r, L.ri, L.rot ?? -90))}" ${F || S()} stroke-linejoin="round"/>`; break;
    case 'rays': { let d = ''; for (let i = 0; i < L.n; i++) { const a = (L.rot ?? -90) + 360 * i / L.n; const r1 = L.alt && i % L.alt ? L.r0 + (L.r1 - L.r0) * 0.5 : L.r1; const [x0, y0] = N.p(L.r0, a), [x1, y1] = N.p(r1, a); d += `M${x0},${y0}L${x1},${y1}`; } out = `<path d="${d}" ${S()} stroke-linecap="round"/>`; break; }
    case 'dots': for (let i = 0; i < L.n; i++) { const [x, y] = N.p(L.r, (L.rot ?? -90) + (L.span || 360) * i / (L.span ? L.n - 1 : L.n)); out += `<circle cx="${x}" cy="${y}" r="${L.d}" fill="${c}"${OP}/>`; } break;
    case 'spiral': { let d = ''; const steps = 220; for (let i = 0; i <= steps; i++) { const t = i / steps, a = (L.rot || 0) + t * L.turns * 360, r = L.r0 + (L.r1 - L.r0) * t; const [x, y] = N.p(r, a); d += (i ? 'L' : 'M') + x + ',' + y; } out = `<path d="${d}" ${S()} stroke-linecap="round"/>`; break; }
    case 'lattice': { let d = ''; for (let v = -L.r + L.step; v < L.r - 0.01; v += L.step) { const h = N.f(Math.sqrt(L.r * L.r - v * v)); d += `M${-h},${N.f(v)}H${h}M${N.f(v)},${-h}V${h}`; } out = `<path d="${d}" ${S()}/>`; break; }
    case 'petals': { const n = L.n, sp = L.spread || 360, st = L.start ?? -90; for (let i = 0; i < n; i++) { const a = sp === 360 ? st + 360 * i / n : st - sp / 2 + sp * i / (n - 1); const len = L.r * (L.vary ? 1 - L.vary * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2) : 1); out += `<path d="M0,0Q${L.w},${N.f(-len / 2)} 0,${N.f(-len)}Q${-L.w},${N.f(-len / 2)} 0,0Z" transform="rotate(${N.f(a + 90)})" ${F || S()} stroke-linejoin="round"/>`; } break; }
    case 'wave': { let d = ''; const steps = 260; for (let i = 0; i <= steps; i++) { const a = 360 * i / steps; const r = L.r + L.amp * Math.sin(N.rad(L.fr * a + (L.phase || 0))); const [x, y] = N.p(r, a); d += (i ? 'L' : 'M') + x + ',' + y; } out = `<path d="${d}Z" ${S()}/>`; break; }
    case 'chord': { const P = N.ngon(L.n, L.r, L.rot ?? -90); const g = (a, b) => b ? g(b, a % b) : a, cyc = g(L.n, L.st); let d = ''; for (let s = 0; s < cyc; s++) { let j = s; d += `M${P[j]}`; for (let m = 0; m < L.n / cyc; m++) { j = (j + L.st) % L.n; d += `L${P[j]}`; } } out = `<path d="${d}" ${S()} stroke-linejoin="round"/>`; break; }
    case 'graph': { const P = N.ngon(L.n, L.r, L.rot ?? -90); let d = ''; for (let a = 0; a < L.n; a++) for (let b = a + 1; b < L.n; b++) d += `M${P[a]}L${P[b]}`; out = `<path d="${d}" ${S()}/>`; break; }
    case 'vesica': out = `<path d="M${-L.r},0Q0,${-L.d} ${L.r},0Q0,${L.d} ${-L.r},0Z" ${F || S()} stroke-linejoin="round"/>`; break;
    case 'crescent': { const [x0, y0] = N.p(L.r, L.a0), [x1, y1] = N.p(L.r, L.a1); out = `<path d="M${x0},${y0}A${L.r},${L.r} 0 1 0 ${x1},${y1}A${L.r2},${L.r2} 0 0 1 ${x0},${y0}Z" ${F || S()}/>`; break; }
    case 'semis': for (let i = 0; i < L.count; i++) { const r = L.r0 + i * L.step; out += `<path d="M${-r},${L.cy || 0}A${r},${r} 0 0 1 ${r},${L.cy || 0}" ${N.st(c, w, { op: L.op, dash: L.dash })} stroke-linecap="round"/>`; } break;
    case 'line': out = `<path d="M${L.x1},${L.y1}L${L.x2},${L.y2}" ${S()} stroke-linecap="round"/>`; break;
    case 'dot': out = `<circle cx="${L.cx || 0}" cy="${L.cy || 0}" r="${L.r}" fill="${c}"${OP}/>`; break;
    case 'diamond': out = `<polygon points="${N.pts(N.ngon(4, L.r, -90).map(([x, y]) => [N.f(x + (L.cx || 0)), N.f(y + (L.cy || 0))]))}" ${L.fill === false ? S() : `fill="${c}"${OP}`} stroke-linejoin="round"/>`; break;
    case 'square': out = `<rect x="${-L.r}" y="${-L.r}" width="${2 * L.r}" height="${2 * L.r}" ${L.fill === false ? S() : `fill="${c}"${OP}`}/>`; break;
    case 'sparkle': out = `<path d="${N.sparkleD(L.cx || 0, L.cy || 0, L.r, L.kk || 0.14)}" ${L.fill === false ? S() : `fill="${c}"${OP}`}/>`; break;
    case 'shards': { const R = N.rng(L.seed || 3); for (let i = 0; i < L.n; i++) { const a = R() * 360, d = L.r * (0.35 + 0.65 * R()), s = (L.s || 1) * (5 + R() * 10), rot = R() * 360; const [x, y] = N.p(d, a); out += `<polygon points="${N.pts(N.ngon(3, s, rot).map(([px, py]) => [N.f(px + x), N.f(py + y)]))}" ${i % 3 === 0 ? `fill="${c}"${OP}` : S()} stroke-linejoin="round"/>`; } break; }
  }
  if (L.dx || L.dy || L.tr) out = `<g transform="translate(${L.dx || 0},${L.dy || 0}) rotate(${L.tr || 0})">${out}</g>`;
  return out;
};
N.sigil = (A, o = {}) => {
  const col = o.col || N.C.bone, acc = o.acc || N.acc(A.hue), sw = o.sw || 2.2, tr = o.treat || 'line';
  const layers = o.compact ? A.layers.filter(L => L.k) : A.layers;
  let s = '';
  layers.forEach((L, i) => {
    let c = L.a ? acc : col; const LL = { ...L };
    if (tr === 'duotone' && i % 2 === 1) c = acc;
    if (tr === 'dotted' && i % 2 === 0 && !L.fill && !['dot', 'diamond', 'sparkle', 'square'].includes(L.t)) { LL.dash = LL.dash || `0.1 ${N.f(sw * 4.8)}`; LL.sw = (LL.sw || 1) * 2.9; }
    if (tr === 'filled' && L.fz) { LL.fill = true; c = acc; }
    if (o.mono) c = col;
    s += N.layer(LL, c, sw);
  });
  return `<g transform="translate(${N.f(o.x || 0)},${N.f(o.y || 0)}) scale(${N.f(o.s || 1)})">${s}</g>`;
};
N.mark = (col, acc, sw = 6) => { const [dx, dy] = N.p(44, -45); return `<path d="${N.arcD(44, -28, 298)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/><path d="${N.sparkleD(0, 0, 25, 0.13)}" fill="${col}"/><circle cx="${dx}" cy="${dy}" r="${N.f(sw * 0.95)}" fill="${acc}"/>`; };
N.letters = { N: 'M0,100V0L60,100V0', A: 'M0,100L30,0L60,100', K: 'M4,0V100M60,0L4,60M24,40L60,100', S: 'M57,16C50,5 40,0 30,0C15,0 4,9 4,25C4,43 22,47 31,49C42,52 58,56 58,74C58,91 45,100 30,100C17,100 7,94 1,83', H: 'M2,0V100M58,0V100M2,50H58', T: 'M0,0H60M30,0V100', R: 'M4,100V0H33C50,0 59,12 59,27C59,43 49,55 33,55H4M33,55L60,100' };
N.wordmark = (col, acc, sw = 12.5) => { let s = '', x = 0; 'NAKSHATRA'.split('').forEach((ch, i) => { s += `<path d="${N.letters[ch]}" transform="translate(${x},0)" stroke="${col}" stroke-width="${sw}" stroke-linejoin="miter" stroke-miterlimit="6"/>`; if (i === 5) s += `<path d="${N.sparkleD(x + 30, 74, 10, 0.18)}" fill="${acc}"/>`; x += 84; }); return s; };
N.WM = { w: 8 * 84 + 60, vb: '-10 -16 752 132' };
N.out = 'nakshatra-visual-universe/';
N.save = async (path, svg, meta = {}) => {
  await saveFile(N.out + path, svg);
  const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
  N.man.push({ id: meta.id || path.replace(/\.svg$/, '').replace(/\//g, '--'), file: path, format: 'svg', type: meta.type || 'vector', category: path.split('/')[0], use: meta.use || '', screens: meta.screens || [], related: meta.related || null, width: m ? +m[1] : null, height: m ? +m[2] : null, transparent: !svg.includes('data-bg="1"'), decorative: meta.decorative ?? true, crop: meta.crop || null, alt: meta.alt || '', source: 'Procedural SVG authored in-house (not AI raster)', license: 'Original work for Nakshatra. No third-party imagery or fonts embedded.' });
};
N.flush = async name => saveFile(N.out + '_src/manifest-part-' + name + '.json', JSON.stringify(N.man));

N.archetypes = [
 { n: 1, name: 'The Lantern', hue: 60, treat: 'halo', mood: 'warm, guiding', concept: 'A small fixed light that other people orient by. Sixteen alternating rays around a held flame.', layers: [{ t: 'ring', r: 98, op: .35 }, { t: 'rays', n: 16, r0: 56, r1: 90, alt: 2, k: 1 }, { t: 'ring', r: 42, k: 1 }, { t: 'sparkle', r: 26, a: 1, k: 1 }] },
 { n: 2, name: 'The Cartographer', hue: 195, treat: 'engraved', mood: 'analytical, curious', concept: 'Charts the unknown into a grid. A survey lattice inside a bounded world, one marked coordinate.', layers: [{ t: 'lattice', r: 84, step: 16.8, op: .45, sw: .7 }, { t: 'ring', r: 84, k: 1 }, { t: 'poly', n: 4, r: 58, rot: -90, k: 1 }, { t: 'line', x1: -96, y1: 0, x2: 96, y2: 0, op: .6 }, { t: 'dot', r: 8, cx: 16.8, cy: -16.8, a: 1, k: 1 }] },
 { n: 3, name: 'The Tidecaller', hue: 210, treat: 'duotone', mood: 'emotional, rhythmic', concept: 'Feels in cycles. Three phase-shifted wave rings, like water answering the moon.', layers: [{ t: 'wave', r: 86, amp: 5, fr: 12, op: .5 }, { t: 'wave', r: 68, amp: 9, fr: 6, a: 1, k: 1 }, { t: 'wave', r: 50, amp: 7, fr: 6, phase: 30, k: 1 }, { t: 'dot', r: 7, a: 1, k: 1 }] },
 { n: 4, name: 'The Spark', hue: 75, treat: 'filled', mood: 'playful, impulsive', concept: 'Starts things. A four-point flash with shards thrown outward mid-burst.', layers: [{ t: 'shards', n: 11, r: 94, seed: 4 }, { t: 'ring', r: 22, op: .7 }, { t: 'star', n: 4, r: 52, ri: 11, fz: 1, k: 1 }, { t: 'dot', r: 5, cx: 0, cy: 0, col: '#0F121A', k: 1 }] },
 { n: 5, name: 'The Keeper', hue: 120, treat: 'engraved', mood: 'loyal, protective', concept: 'Holds what matters. Four nested squares like walls around a kept stone.', layers: [{ t: 'nested', n: 4, r: 92, count: 4, rot: -45, k: 1 }, { t: 'poly', n: 4, r: 30, rot: -90, op: .6 }, { t: 'diamond', r: 12, a: 1, k: 1 }] },
 { n: 6, name: 'The Wanderer', hue: 150, treat: 'dotted', mood: 'adventurous, open', concept: 'Never on the same path twice. An open spiral that leaves the frame, waypoints beyond.', layers: [{ t: 'spiral', turns: 2.4, r0: 6, r1: 84, rot: 0, k: 1 }, { t: 'dots', n: 3, r: 96, d: 4.5, rot: -60, span: 60, a: 1 }, { t: 'ring', r: 98, op: .25 }, { t: 'dot', r: 7, a: 1, k: 1 }] },
 { n: 7, name: 'The Oracle', hue: 285, treat: 'eclipse', mood: 'intuitive, introspective', concept: 'Sees what is unsaid. A vesica eye with a full iris, ringed by a fine crown of ticks.', layers: [{ t: 'rays', n: 36, r0: 90, r1: 98, op: .6, sw: .8 }, { t: 'vesica', r: 86, d: 72, k: 1 }, { t: 'ring', r: 27, k: 1 }, { t: 'dot', r: 12, a: 1, k: 1 }] },
 { n: 8, name: 'The Architect', hue: 240, treat: 'engraved', mood: 'precise, systematic', concept: 'Builds frameworks. A hexagon braced by its own internal triangles.', layers: [{ t: 'poly', n: 6, r: 88, k: 1 }, { t: 'chord', n: 6, st: 2, r: 88, op: .75 }, { t: 'poly', n: 6, r: 44, rot: -60, k: 1 }, { t: 'dot', r: 6, a: 1, k: 1 }] },
 { n: 9, name: 'The Muse', hue: 330, treat: 'duotone', mood: 'expressive, creative', concept: 'Makes feeling visible. Seven open petals around a quiet center.', layers: [{ t: 'dots', n: 7, r: 96, d: 2.6, rot: -90 + 360 / 14 }, { t: 'petals', n: 7, r: 86, w: 30, k: 1 }, { t: 'ring', r: 16, k: 1 }] },
 { n: 10, name: 'The Rebel', hue: 15, treat: 'filled', mood: 'contrarian, bold', concept: 'Breaks the circle on purpose. A tilted triangle cutting through a three-part broken ring.', layers: [{ t: 'arcs', r: 82, n: 3, gap: 38, rot: 20, k: 1 }, { t: 'poly', n: 3, r: 54, rot: -78, fz: 1, k: 1 }, { t: 'line', x1: -88, y1: 60, x2: 80, y2: -70, op: .7 }, { t: 'dot', r: 6, cx: 26, cy: -30, a: 1 }] },
 { n: 11, name: 'The Anchor', hue: 180, treat: 'halo', mood: 'steady, grounded', concept: 'The one who stays. A horizon line with arcs settled on it like a held breath.', layers: [{ t: 'line', x1: -96, y1: 28, x2: 96, y2: 28, k: 1 }, { t: 'semis', count: 3, r0: 30, step: 22, cy: 28, k: 1 }, { t: 'dot', r: 9, cx: 0, cy: 6, a: 1, k: 1 }, { t: 'line', x1: -40, y1: 44, x2: 40, y2: 44, op: .5 }, { t: 'line', x1: -16, y1: 58, x2: 16, y2: 58, op: .35 }] },
 { n: 12, name: 'The Alchemist', hue: 105, treat: 'engraved', mood: 'transforming, inventive', concept: 'Turns one thing into another. Opposed triangles interlocked inside a vessel ring.', layers: [{ t: 'ring', r: 92, op: .45 }, { t: 'poly', n: 3, r: 80, rot: -90, k: 1 }, { t: 'poly', n: 3, r: 80, rot: 90, a: 1, k: 1 }, { t: 'ring', r: 40 }, { t: 'dot', r: 6, k: 1 }] },
 { n: 13, name: 'The Hearth', hue: 45, treat: 'halo', mood: 'nurturing, warm', concept: 'Where people gather. Four concentric arches rising from a shared floor.', layers: [{ t: 'semis', count: 4, r0: 20, step: 19, cy: 22, k: 1 }, { t: 'line', x1: -92, y1: 22, x2: 92, y2: 22, k: 1 }, { t: 'sparkle', r: 12, cy: 0, a: 1, k: 1 }, { t: 'dots', n: 5, r: 104, d: 2.4, rot: -150, span: 120, op: .7 }] },
 { n: 14, name: 'The Strategist', hue: 255, treat: 'engraved', mood: 'deliberate, far-seeing', concept: 'Thinks three moves ahead. An eight-point star polygon {8/3} inside its board.', layers: [{ t: 'ring', r: 88, k: 1 }, { t: 'chord', n: 8, st: 3, r: 88, k: 1 }, { t: 'poly', n: 4, r: 22, rot: -45, k: 1 }, { t: 'dot', r: 5, a: 1 }] },
 { n: 15, name: 'The Dreamer', hue: 270, treat: 'eclipse', mood: 'quiet, imaginative', concept: 'Lives half in another sky. A thin crescent with three far stars drifting off it.', layers: [{ t: 'crescent', r: 70, r2: 92, a0: -70, a1: 70, k: 1 }, { t: 'sparkle', r: 12, cx: 46, cy: -40, a: 1, k: 1 }, { t: 'dot', r: 3.5, cx: 70, cy: 4 }, { t: 'dot', r: 2.5, cx: 56, cy: 40 }, { t: 'ring', r: 98, op: .2, dash: '0.1 6' }] },
 { n: 16, name: 'The Catalyst', hue: 30, treat: 'filled', mood: 'energizing, restless', concept: 'Makes reactions happen. An uneven burst from a solid core — more push than symmetry.', layers: [{ t: 'rays', n: 24, r0: 34, r1: 94, alt: 3, k: 1 }, { t: 'ring', r: 24, fz: 1, k: 1 }, { t: 'ring', r: 56, op: .3 }] },
 { n: 17, name: 'The Sage', hue: 135, treat: 'dotted', mood: 'wise, patient', concept: 'Accumulates. Seven rings laid down like growth rings, quartered by true north.', layers: [{ t: 'rings', r0: 20, r1: 92, step: 12, k: 1 }, { t: 'rays', n: 4, r0: 94, r1: 104 }, { t: 'dot', r: 6, a: 1, k: 1 }] },
 { n: 18, name: 'The Jester', hue: 345, treat: 'filled', mood: 'chaotic, funny', concept: 'Turns tension into laughter. A zigzag crown around a spun triangle, bells at the tips.', layers: [{ t: 'star', n: 12, r: 86, ri: 66, k: 1 }, { t: 'star', n: 3, r: 40, ri: 17, rot: -60, fz: 1, k: 1 }, { t: 'dots', n: 6, r: 100, d: 3.2, a: 1 }] },
 { n: 19, name: 'The Sentinel', hue: 165, treat: 'engraved', mood: 'vigilant, dependable', concept: 'Keeps watch. A double hex wall with six lookouts and a lit center.', layers: [{ t: 'rays', n: 6, r0: 80, r1: 98, rot: -90 }, { t: 'poly', n: 6, r: 80, rot: -90, k: 1 }, { t: 'poly', n: 6, r: 66, rot: -90, op: .55 }, { t: 'ring', r: 30, k: 1 }, { t: 'dot', r: 11, a: 1, k: 1 }] },
 { n: 20, name: 'The Weaver', hue: 315, treat: 'dotted', mood: 'connecting, social', concept: 'Knows everyone. Seven points, every pair joined — a complete web.', layers: [{ t: 'ring', r: 84, op: .3 }, { t: 'graph', n: 7, r: 84, sw: .8, k: 1 }, { t: 'dots', n: 7, r: 84, d: 5, a: 1, k: 1 }] },
 { n: 21, name: 'The Pioneer', hue: 90, treat: 'duotone', mood: 'driven, building', concept: 'Goes first. Ascending chevrons inside an upward triangle, a ground line left behind.', layers: [{ t: 'poly', n: 3, r: 88, rot: -90, k: 1 }, { t: 'nested', n: 3, r: 54, count: 3, rot: -90, dy: 10 }, { t: 'line', x1: -96, y1: 62, x2: 96, y2: 62, op: .45 }, { t: 'dot', r: 6, cy: -50, a: 1, k: 1 }] },
 { n: 22, name: 'The Mirror', hue: 225, treat: 'eclipse', mood: 'empathetic, attuned', concept: 'Reflects people back to themselves. Two equal circles meeting on an axis.', layers: [{ t: 'line', x1: 0, y1: -98, x2: 0, y2: 98, op: .6 }, { t: 'ring', r: 50, cx: -26, k: 1 }, { t: 'ring', r: 50, cx: 26, a: 1, k: 1 }, { t: 'dot', r: 5, cx: -26 }, { t: 'dot', r: 5, cx: 26, a: 1 }] },
 { n: 23, name: 'The Ember', hue: 0, treat: 'halo', mood: 'passionate, intense', concept: 'Burns low and long. A fan of flame-petals rising from a coal.', layers: [{ t: 'petals', n: 5, r: 90, w: 20, spread: 80, start: -90, vary: .35, k: 1 }, { t: 'line', x1: -60, y1: 34, x2: 60, y2: 34, op: .5 }, { t: 'ring', r: 16, fill: true, a: 1, k: 1, dy: 12 }] },
 { n: 24, name: 'The Cipher', hue: 300, treat: 'dotted', mood: 'private, enigmatic', concept: 'Keeps a combination. Three broken rings, each offset like a lock not yet aligned.', layers: [{ t: 'arcs', r: 86, n: 4, gap: 28, rot: 10, k: 1 }, { t: 'arcs', r: 64, n: 3, gap: 46, rot: 72, k: 1 }, { t: 'arcs', r: 42, n: 2, gap: 70, rot: 140 }, { t: 'square', r: 9, a: 1, k: 1 }] },
];
N.archetypes.forEach(A => { A.id = 'archetype-' + String(A.n).padStart(2, '0'); A.accent = N.acc(A.hue); A.accentDeep = N.accDeep(A.hue); });

N.games = [
 { key: 'who-said-it', name: 'Who Said It?', hue: 285, concept: 'Concealment and reveal — a voice half seen, half hidden.' },
 { key: 'pick-your-chaos', name: 'Pick Your Chaos', hue: 30, concept: 'Scattered shards; every choice throws something loose.' },
 { key: 'honest-vote', name: 'The Honest Vote', hue: 195, concept: 'A balance under tension — the group tips it.' },
 { key: 'one-line-confessions', name: 'One-Line Confessions', hue: 330, concept: 'A keyhole over a single line. Vast negative space.' },
 { key: 'archetype-showdown', name: 'Archetype Showdown', hue: 15, concept: 'Two forms pointed at each other across a spark.' },
 { key: 'friend-decoder', name: 'Friend Decoder', hue: 165, concept: 'A grid with one cell that is truly them.' },
 { key: 'this-or-that', name: 'This or That', hue: 60, concept: 'Opposed halves: outline against solid.' },
 { key: 'plot-twist', name: 'Plot Twist', hue: 240, concept: 'A line that turns back on itself before it ends.' },
 { key: 'hot-take-arena', name: 'Hot Take Arena', hue: 0, concept: 'Rising chevrons above an arena floor.' },
 { key: 'prediction-market', name: 'Prediction Market', hue: 135, concept: 'A forecast trail of growing points. Fictional points only.' },
 { key: 'memory-lane', name: 'Memory Lane', hue: 45, concept: 'Archival timeline with one held moment.' },
 { key: 'compatibility-lab', name: 'The Compatibility Lab', hue: 345, concept: 'Two circles and the lens they share.' },
];
N.games.forEach(g => { g.accent = N.acc(g.hue); });
N.gsym = {
 'who-said-it': (c, a, w) => `<circle r="34" stroke="${c}" stroke-width="${w}"/><path d="M0,-34A34,34 0 0 1 0,34Z" fill="${a}"/><path d="M-22,27L-34,42L-8,33" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/><path d="${N.sparkleD(-14, -4, 9, .16)}" fill="${c}"/>`,
 'pick-your-chaos': (c, a, w) => `<polygon points="${N.pts(N.ngon(3, 17, 10).map(([x, y]) => [N.f(x - 18), N.f(y - 12)]))}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/><polygon points="${N.pts(N.ngon(3, 13, 70).map(([x, y]) => [N.f(x + 18), N.f(y - 20)]))}" fill="${a}"/><polygon points="${N.pts(N.ngon(3, 20, -30).map(([x, y]) => [N.f(x + 8), N.f(y + 18)]))}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/><circle cx="-24" cy="24" r="3.5" fill="${c}"/><path d="M30,8L40,2" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`,
 'honest-vote': (c, a, w) => `<path d="M0,-2L-12,32H12Z" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/><path d="M-40,3L40,-7" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/><path d="M-34,2V14M34,-6V4" stroke="${c}" stroke-width="${w * .7}"/><circle cx="-34" cy="22" r="8" fill="${a}"/><circle cx="34" cy="12" r="8" stroke="${c}" stroke-width="${w}"/>`,
 'one-line-confessions': (c, a, w) => `<circle cx="0" cy="-16" r="12" stroke="${c}" stroke-width="${w}"/><path d="M-5,-5L-10,20H10L5,-5" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/><path d="M-42,36H42" stroke="${a}" stroke-width="${w}" stroke-linecap="round"/>`,
 'archetype-showdown': (c, a, w) => `<path d="M-42,-24V24L-8,0Z" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/><path d="M42,-24V24L8,0Z" fill="${a}"/><path d="${N.sparkleD(0, -26, 7, .16)}" fill="${c}"/><path d="${N.sparkleD(0, 26, 5, .16)}" fill="${c}"/>`,
 'friend-decoder': (c, a, w) => { let s = ''; [-20, 0, 20].forEach(y => [-20, 0, 20].forEach(x => { s += x === 20 && y === -20 ? `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="${a}"/>` : `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" stroke="${c}" stroke-width="${w * .8}"/>`; })); return s + `<circle cx="20" cy="-20" r="15" stroke="${a}" stroke-width="${w * .7}"/>`; },
 'this-or-that': (c, a, w) => `<circle cx="-20" cy="0" r="16" stroke="${c}" stroke-width="${w}"/><circle cx="20" cy="0" r="16" fill="${a}"/><path d="M0,-38V38" stroke="${c}" stroke-width="${w * .7}" stroke-linecap="round"/>`,
 'plot-twist': (c, a, w) => `<path d="M-40,26C-40,-34 10,-34 10,0C10,28 34,28 36,-14" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/><path d="M26,-8L36,-20L45,-6" stroke="${a}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="0" r="4" fill="${a}"/>`,
 'hot-take-arena': (c, a, w) => `<ellipse cx="0" cy="30" rx="36" ry="8" stroke="${c}" stroke-width="${w}"/><path d="M-26,14L0,-6L26,14" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/><path d="M-18,-2L0,-18L18,-2" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/><path d="M-10,-18L0,-30L10,-18" stroke="${a}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`,
 'prediction-market': (c, a, w) => { let s = `<path d="M-42,36H42" stroke="${c}" stroke-width="${w * .6}" opacity=".5"/>`; for (let i = 0; i < 6; i++) { const t = i / 6, x = -38 + 70 * t, y = 28 - 52 * t ** 1.5; s += `<circle cx="${N.f(x)}" cy="${N.f(y)}" r="${N.f(2 + i * .6)}" fill="${c}"/>`; } return s + `<circle cx="34" cy="-30" r="9" stroke="${a}" stroke-width="${w}"/><circle cx="34" cy="-30" r="3.5" fill="${a}"/>`; },
 'memory-lane': (c, a, w) => `<path d="M-32,10A32,32 0 0 1 32,10" stroke="${c}" stroke-width="${w * .7}" stroke-dasharray="0.1 5" stroke-linecap="round"/><path d="M-44,10H44" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>${[-32, -16, 16, 32].map(x => `<circle cx="${x}" cy="10" r="3.6" fill="${c}"/>`).join('')}<circle cx="0" cy="10" r="8" fill="${a}"/><path d="M0,22V34" stroke="${c}" stroke-width="${w * .7}"/>`,
 'compatibility-lab': (c, a, w) => `<path d="M0,-21.91A26,26 0 0 1 0,21.91A26,26 0 0 1 0,-21.91Z" fill="${a}"/><circle cx="-14" cy="0" r="26" stroke="${c}" stroke-width="${w}"/><circle cx="14" cy="0" r="26" stroke="${c}" stroke-width="${w}"/>`,
};
N.gfield = {
 'who-said-it': (W, H, c, a) => `<circle cx="${W * .5}" cy="${H * .42}" r="${Math.min(W, H) * .62}" stroke="${c}" stroke-width="1.2" opacity=".18"/><path d="M${W * .5},${H * .42 - Math.min(W, H) * .62}A${Math.min(W, H) * .62},${Math.min(W, H) * .62} 0 0 1 ${W * .5},${H * .42 + Math.min(W, H) * .62}Z" fill="${a}" opacity=".1"/>`,
 'pick-your-chaos': (W, H, c, a) => `<g transform="translate(${W * .5},${H * .42}) scale(${Math.min(W, H) / 120})">${N.layer({ t: 'shards', n: 28, r: 100, seed: 11, s: .7, op: .28 }, a, .6)}</g>`,
 'honest-vote': (W, H, c, a) => `<rect x="${W * .1}" y="${H * .18}" width="${W * .32}" height="${H * .54}" fill="${a}" opacity=".1"/><rect x="${W * .58}" y="${H * .34}" width="${W * .32}" height="${H * .38}" stroke="${c}" stroke-width="1" opacity=".22"/>`,
 'one-line-confessions': (W, H, c, a) => `<path d="M0,${H * .62}H${W}" stroke="${a}" stroke-width="1.2" opacity=".45"/>`,
 'archetype-showdown': (W, H, c, a) => `<path d="M${W},0V${H}H0Z" fill="${a}" opacity=".08"/><path d="M${W},0L0,${H}" stroke="${c}" stroke-width="1" opacity=".25"/>`,
 'friend-decoder': (W, H, c, a) => { let s = ''; const g = Math.min(W, H) / 10; let i = 0; for (let y = g * .5; y < H * .72; y += g) for (let x = g * .5; x < W; x += g) { i++; s += `<rect x="${N.f(x)}" y="${N.f(y)}" width="${N.f(g * .5)}" height="${N.f(g * .5)}" ${i % 23 === 7 ? `fill="${a}" opacity=".5"` : `stroke="${c}" stroke-width="1" opacity=".12"`}/>`; } return s; },
 'this-or-that': (W, H, c, a) => `<rect width="${W / 2}" height="${H}" fill="${c}" opacity=".035"/><rect x="${W / 2}" width="${W / 2}" height="${H}" fill="${a}" opacity=".09"/>`,
 'plot-twist': (W, H, c, a) => `<path d="M${-W * .1},${H * .7}C${W * .1},${-H * .1} ${W * .6},${-H * .05} ${W * .5},${H * .4}C${W * .42},${H * .8} ${W * .9},${H * .75} ${W * 1.1},${H * .15}" stroke="${a}" stroke-width="1.4" opacity=".4"/>`,
 'hot-take-arena': (W, H, c, a) => { let s = ''; for (let i = 1; i <= 7; i++) s += `<ellipse cx="${W / 2}" cy="${H * .8}" rx="${W * .1 * i}" ry="${H * .025 * i}" stroke="${i % 2 ? a : c}" stroke-width="1" opacity="${N.f(.35 - i * .035)}"/>`; return s; },
 'prediction-market': (W, H, c, a) => { let s = ''; for (let i = 1; i < 6; i++) s += `<path d="M0,${N.f(H * .12 * i)}H${W}" stroke="${c}" stroke-width="1" opacity=".07"/>`; for (let i = 0; i < 26; i++) { const t = i / 25; s += `<circle cx="${N.f(W * (.05 + .9 * t))}" cy="${N.f(H * (.66 - .5 * t ** 1.7))}" r="${N.f(1.5 + t * 4)}" fill="${a}" opacity="${N.f(.2 + t * .4)}"/>`; } return s; },
 'memory-lane': (W, H, c, a) => { let s = `<path d="M0,${H * .5}H${W}" stroke="${c}" stroke-width="1" opacity=".2"/>`; for (let i = 0; i < 14; i++) { const x = W * (i + .5) / 14; s += `<path d="M${N.f(x)},${H * .5 - (i % 3 ? 8 : 18)}V${H * .5 + (i % 3 ? 8 : 18)}" stroke="${i === 9 ? a : c}" stroke-width="1" opacity="${i === 9 ? .8 : .22}"/>`; } return s; },
 'compatibility-lab': (W, H, c, a) => { const r = Math.min(W, H) * .42, cx = W / 2, cy = H * .4, d = r * .55, hh = N.f(Math.sqrt(r * r - d * d)); return `<path d="M${cx},${N.f(cy - hh)}A${r},${r} 0 0 1 ${cx},${N.f(cy + hh)}A${r},${r} 0 0 1 ${cx},${N.f(cy - hh)}Z" fill="${a}" opacity=".12"/><circle cx="${N.f(cx - d)}" cy="${cy}" r="${N.f(r)}" stroke="${c}" stroke-width="1" opacity=".2"/><circle cx="${N.f(cx + d)}" cy="${cy}" r="${N.f(r)}" stroke="${c}" stroke-width="1" opacity=".2"/>`; },
};
return N;
})
