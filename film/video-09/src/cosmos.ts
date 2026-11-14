import * as THREE from 'three';
import { ARCHETYPES, DIMS, type Archetype } from './data';
import { buildFigure, type Figure } from './figure';
import { glowSprite, glowTexture, withRim } from './materials';
import { TAU, clamp, easeOut, hashKey, lerp, mulberry32, smooth } from './util';
import type { WorldForm } from '@app/web/three/archetypeWorlds';

/** Same eight forms as the app's identity scene (src/web/three/identity.tsx formGeometry). */
export function formGeometry(form: WorldForm, r: number): THREE.BufferGeometry {
  switch (form) {
    case 'octahedron': return new THREE.OctahedronGeometry(r * 1.05, 0);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(r, 0);
    case 'tetrahedron': return new THREE.TetrahedronGeometry(r * 1.2, 0);
    case 'knot': return new THREE.TorusKnotGeometry(r * 0.72, r * 0.07, 96, 6, 2, 3);
    case 'sphere': return new THREE.SphereGeometry(r, 20, 12);
    case 'prism': return new THREE.CylinderGeometry(r * 0.72, r * 0.72, r * 1.9, 6, 1);
    case 'lattice': return new THREE.BoxGeometry(r * 1.45, r * 1.45, r * 1.45, 3, 3, 3);
    default: return new THREE.IcosahedronGeometry(r, 0);
  }
}
const linesFor = (form: WorldForm, solid: THREE.BufferGeometry) => (['sphere', 'knot', 'lattice'].includes(form) ? new THREE.WireframeGeometry(solid) : new THREE.EdgesGeometry(solid));

/* ---------------- the helix gallery ---------------- */
export const HELIX = { n: 24, radius: 11, rise: 1.05, perTurn: 12 };
export const podAngle = (u: number) => (u / HELIX.perTurn) * TAU;
export const podY = (u: number) => (u - (HELIX.n - 1) / 2) * HELIX.rise;
export const podPos = (u: number, out = new THREE.Vector3()) => out.set(Math.cos(podAngle(u)) * HELIX.radius, podY(u), Math.sin(podAngle(u)) * HELIX.radius);

export interface Pod {
  a: Archetype; group: THREE.Group; body: THREE.Group; figure: Figure; shell: THREE.Group; fill: THREE.MeshStandardMaterial | null; stroke: THREE.LineBasicMaterial;
  star: THREE.Sprite; halo: THREE.Sprite; sigil: THREE.Mesh; sats: THREE.Mesh[]; orbits: { r: number; phase: number; tilt: number; speed: number }[]; dust: THREE.Points; baseFill: number; baseStroke: number;
}

function buildPod(a: Archetype, sigilTex: THREE.Texture): Pod {
  const group = new THREE.Group();
  podPos(a.index, group.position);
  const ang = podAngle(a.index);
  group.rotation.y = Math.atan2(-Math.cos(ang), -Math.sin(ang)); // statues look in, towards the axis
  const body = new THREE.Group();
  group.add(body);
  const c = new THREE.Color(a.accent);
  const rand = mulberry32(hashKey(a.key));

  const figure = buildFigure(a.look, a.accent, a.world.build);
  figure.group.position.y = -1.55;
  body.add(figure.group);

  // Plinth.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.08, 0.14, 48), withRim(new THREE.MeshStandardMaterial({ color: '#12143a', metalness: 0.9, roughness: 0.3 }), c, 0.9));
  plinth.position.y = -1.63;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.018, 6, 64), new THREE.MeshBasicMaterial({ color: c }));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -1.55;
  body.add(plinth, lip);

  // The archetype's own world shell: form, build and tilt straight from the app's data.
  const shell = new THREE.Group();
  const solid = formGeometry(a.world.form, 2.45);
  const stroke = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: a.world.build === 'wire' ? 0.8 : a.world.build === 'facets' ? 0.55 : 0.4 });
  const fill = a.world.build === 'wire' ? null : new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(a.world.build === 'glass' ? 0.9 : 0.55), emissive: c, emissiveIntensity: a.world.build === 'glass' ? 0.3 : 0.16, transparent: true,
    opacity: a.world.build === 'glass' ? 0.07 : 0.12, flatShading: a.world.build === 'facets', metalness: 0.3, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false,
  });
  if (fill) shell.add(new THREE.Mesh(solid, fill));
  shell.add(new THREE.LineSegments(linesFor(a.world.form, solid), stroke));
  shell.rotation.x = a.world.tilt;
  body.add(shell);

  // The archetype's sigil artwork, as a plate of light behind the statue.
  const sigil = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), new THREE.MeshBasicMaterial({ map: sigilTex, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
  sigil.position.set(0, 0.55, -1.25);
  body.add(sigil);

  const halo = glowSprite(c, 9, 0.2);
  halo.position.set(0, 0.2, -1.6);
  group.add(halo);
  const star = glowSprite(c.clone().lerp(new THREE.Color('#ffffff'), 0.5), 1.6, 0);
  group.add(star);

  const orbits = Array.from({ length: a.world.satellites }, (_, i) => ({ r: 2.5 + rand() * 0.4, phase: (i / Math.max(1, a.world.satellites)) * TAU, tilt: (rand() - 0.5) * 1.1, speed: 0.5 + rand() * 0.5 }));
  const sats = orbits.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + rand() * 0.05, 10, 8), new THREE.MeshBasicMaterial({ color: c })); body.add(m); return m; });

  const n = { dust: 90, motes: 60, sparks: 50, embers: 60 }[a.world.particles];
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const r = 1.4 + rand() * 2.2, th = rand() * TAU, u = rand() * 2 - 1, s = Math.sqrt(1 - u * u); pos.set([r * s * Math.cos(th), a.world.particles === 'embers' ? -1.6 + rand() * 3.4 : r * u * 0.9, r * s * Math.sin(th)], i * 3); }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: c, size: { dust: 0.05, motes: 0.08, sparks: 0.07, embers: 0.09 }[a.world.particles], map: glowTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  body.add(dust);

  return { a, group, body, figure, shell, fill, stroke, star, halo, sigil, sats, orbits, dust, baseFill: fill?.opacity ?? 0, baseStroke: stroke.opacity };
}

/** open: 0 = a single star, 1 = the full identity object. reveal: 0 = sealed shell of light, 1 = statue shown. */
export function updatePod(p: Pod, time: number, open: number, reveal: number, flare: number) {
  const w = p.a.world;
  const o = easeOut(open);
  p.body.visible = o > 0.004;
  p.body.scale.setScalar(Math.max(0.001, o));
  p.figure.group.scale.setScalar(Math.max(0.001, easeOut(reveal)));
  p.figure.update(time);
  let ry = time * 0.05, rz = 0, scale = 1, flick = 1;
  switch (w.motion) {
    case 'spin': ry = time * 0.35; break;
    case 'drift': ry = time * 0.08; break;
    case 'pulse': scale = 1 + 0.045 * Math.sin(time * 2.1); break;
    case 'sway': rz = Math.sin(time * 0.6) * 0.16; break;
    case 'flicker': flick = 0.78 + 0.22 * Math.sin(time * 7.3) * Math.sin(time * 2.9); ry = time * 0.2; break;
    case 'breathe': scale = 1 + 0.025 * Math.sin(time * 0.9); break;
  }
  p.shell.rotation.set(w.tilt, ry + p.a.index, rz);
  p.shell.scale.setScalar(scale);
  p.stroke.opacity = Math.min(1, p.baseStroke * flick * (1 + flare * 0.8));
  if (p.fill) p.fill.opacity = lerp(0.5, p.baseFill, smooth(reveal)) * flick + flare * 0.12;
  p.sats.forEach((m, i) => { const b = p.orbits[i]; const a = b.phase + time * b.speed; m.position.set(Math.cos(a) * b.r, Math.sin(a) * b.r * Math.sin(b.tilt), Math.sin(a) * b.r * Math.cos(b.tilt)); });
  p.dust.rotation.y = time * 0.1;
  (p.sigil.material as THREE.MeshBasicMaterial).opacity = 0.62 * smooth(reveal);
  p.halo.material.opacity = 0.16 * o + flare * 0.5 + (1 - o) * 0.05;
  p.halo.scale.setScalar(9 * (0.4 + 0.6 * o) * (1 + flare * 0.5));
  p.star.material.opacity = clamp((1 - o) * 1.2 + flare * 0.9);
  p.star.scale.setScalar(1.5 + flare * 3 + Math.sin(time * 2 + p.a.index) * 0.15);
}

/* ---------------- sky ---------------- */
function starPoints(count: number, rMin: number, rMax: number, seed: number, pixelRatio: number, sizeMul = 1): THREE.Points {
  const rand = mulberry32(seed);
  const pos = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count), tint = new Float32Array(count * 3);
  const palette = ['#f3eee2', '#f3eee2', '#ecd29d', '#b9adf0', '#a9cdf0'].map((h) => new THREE.Color(h));
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, th = rand() * TAU, r = lerp(rMin, rMax, rand()), s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
    size[i] = (0.7 + Math.pow(rand(), 4) * 4.5) * sizeMul;
    phase[i] = rand() * TAU;
    const c = palette[Math.floor(rand() * palette.length)];
    tint.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uGain: { value: 1 } },
    vertexShader: /* glsl */ `attribute float aSize; attribute float aPhase; attribute vec3 aTint; uniform float uTime; uniform float uPixelRatio; varying float vAlpha; varying vec3 vTint;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vAlpha = 0.6 + 0.4 * sin(uTime * 1.3 + aPhase); vTint = aTint; gl_PointSize = max(1.2 * uPixelRatio, aSize * uPixelRatio * (220.0 / -mv.z)); }`,
    fragmentShader: /* glsl */ `uniform float uGain; varying float vAlpha; varying vec3 vTint; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vTint * uGain, a * a * vAlpha); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

function cloudTexture(seed: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rand = mulberry32(seed);
  for (let i = 0; i < 26; i++) {
    const x = 128 + (rand() - 0.5) * 130, y = 128 + (rand() - 0.5) * 130, r = 26 + rand() * 62;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${0.05 + rand() * 0.07})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Cosmos {
  scene: THREE.Scene; pods: Pod[]; you: Figure; youGroup: THREE.Group; rings: { group: THREE.Group; ring: THREE.Mesh; marker: THREE.Mesh; radius: number; mat: THREE.MeshBasicMaterial }[];
  links: THREE.LineSegments; linkMat: THREE.LineBasicMaterial; outer: THREE.LineSegments; outerMat: THREE.LineBasicMaterial; outerStars: THREE.Points;
  streams: { pts: THREE.Points; mat: THREE.PointsMaterial; head: THREE.Sprite; pos: Float32Array; phase: number; y0: number }[];
  sculpture: { group: THREE.Group; primary: { mesh: THREE.Mesh; lines: THREE.LineSegments }[]; inner: THREE.LineSegments; fill: THREE.MeshStandardMaterial; stroke: THREE.LineBasicMaterial; innerMat: THREE.LineBasicMaterial; glow: THREE.Sprite };
  core: THREE.Sprite; coreRays: THREE.Mesh; keyLight: THREE.DirectionalLight; stars: THREE.Points[]; nebula: THREE.Sprite[]; pentagon: THREE.Line; pentagonMat: THREE.LineBasicMaterial;
  setTime: (time: number) => void;
}

export const BLEND_GOLD = '#ecd29d', BLEND_VIOLET = '#b9adf0';
/** The forms the blend sculpture passes through before it settles: all eight shells from the product. */
export const SCULPT_FORMS: WorldForm[] = ['sphere', 'tetrahedron', 'dodecahedron', 'prism', 'octahedron', 'lattice', 'knot', 'icosahedron'];

export function buildCosmos(env: THREE.Texture, sigils: THREE.Texture[], pixelRatio: number, camera: THREE.PerspectiveCamera): Cosmos {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04051a');
  scene.environment = env;
  scene.environmentIntensity = 0.8;
  scene.add(new THREE.AmbientLight('#5d4bb0', 0.35));
  // The key light travels with the camera, upper left, so every statue is lit the same warm way in every shot.
  const keyLight = new THREE.DirectionalLight('#ffe0ad', 2.0);
  keyLight.position.set(-4, 5, 3);
  camera.add(keyLight, keyLight.target);
  keyLight.target.position.set(0, 0, -10);
  const back = new THREE.DirectionalLight('#8d7bd8', 0.9);
  back.position.set(5, -1, -8);
  camera.add(back, back.target);
  back.target.position.set(0, 0, -10);
  scene.add(camera);

  const stars = [starPoints(13000, 90, 300, 11, pixelRatio), starPoints(2200, 14, 80, 23, pixelRatio, 0.5)];
  stars.forEach((s) => scene.add(s));

  const nebula: THREE.Sprite[] = [];
  const nrand = mulberry32(5);
  const ncol = ['#2a2d5c', '#5d4bb0', '#3c4078', '#8d7bd8', '#1d2046', '#6fa8dc', '#5d4bb0', '#8a6526', '#3c4078', '#5d4bb0', '#2a2d5c', '#8d7bd8'];
  ncol.forEach((col, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(40 + i), color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, rotation: nrand() * TAU }));
    const th = nrand() * TAU, u = nrand() * 1.4 - 0.7, r = 110 + nrand() * 60;
    s.position.set(Math.cos(th) * r, u * r, Math.sin(th) * r);
    s.scale.setScalar(150 + nrand() * 130);
    nebula.push(s);
    scene.add(s);
  });

  const pods = ARCHETYPES.map((a) => buildPod(a, sigils[a.index]));
  pods.forEach((p) => scene.add(p.group));

  // Constellation: the helix in order, plus the rungs between its two turns.
  const seg: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < HELIX.n - 1; i++) { podPos(i, a); podPos(i + 1, b); seg.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  for (let i = 0; i < HELIX.perTurn; i += 2) { podPos(i, a); podPos(i + HELIX.perTurn, b); seg.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const linkMat = new THREE.LineBasicMaterial({ color: '#ecd29d', transparent: true, opacity: 0, depthWrite: false });
  const links = new THREE.LineSegments(lg, linkMat);
  scene.add(links);

  // The wider constellation the gallery turns out to be part of (final pull-back).
  const orand = mulberry32(77);
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < 90; i++) { const th = orand() * TAU, r = 20 + orand() * 46, y = (orand() - 0.5) * 120; nodes.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r * 0.5)); }
  const oseg: number[] = [];
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => ({ j, d: m.distanceTo(n) })).filter((x) => x.j !== i).sort((x, y) => x.d - y.d).slice(0, 2);
    near.forEach(({ j }) => { if (j > i || orand() < 0.3) oseg.push(n.x, n.y, n.z, nodes[j].x, nodes[j].y, nodes[j].z); });
    if (i % 5 === 0) { podPos(Math.floor(orand() * 24), a); oseg.push(n.x, n.y, n.z, a.x, a.y, a.z); }
  });
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.Float32BufferAttribute(oseg, 3));
  const outerMat = new THREE.LineBasicMaterial({ color: '#8d7bd8', transparent: true, opacity: 0, depthWrite: false });
  const outer = new THREE.LineSegments(og, outerMat);
  scene.add(outer);
  const ng = new THREE.BufferGeometry().setFromPoints(nodes);
  const outerStars = new THREE.Points(ng, new THREE.PointsMaterial({ color: '#f3eee2', size: 1.5, map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(outerStars);

  // The person at the centre: no archetype, no colour of their own yet.
  const youGroup = new THREE.Group();
  const you = buildFigure({ hair: 'none', headwear: 'none', outfit: 'robe', pose: 'rest', prop: 'none' }, '#ecd29d', 'facets', 20);
  you.group.position.y = -1.85;
  you.group.scale.setScalar(1.28);
  youGroup.add(you.group);
  scene.add(youGroup);

  // Five dimension rings, in the product's own dimension colours.
  const rings = DIMS.map((d, i) => {
    const radius = 2.55 + i * 0.3;
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.022, 8, 180), mat);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color).lerp(new THREE.Color('#ffffff'), 0.4) }));
    marker.add(glowSprite(d.color, 0.9, 0.9));
    group.add(ring, marker);
    scene.add(group);
    return { group, ring, marker, radius, mat };
  });
  const pentagonMat = new THREE.LineBasicMaterial({ color: '#f2ece1', transparent: true, opacity: 0, depthWrite: false });
  const pentagon = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, () => new THREE.Vector3())), pentagonMat);
  pentagon.frustumCulled = false;
  scene.add(pentagon);

  // Two identity energies.
  const streams = [BLEND_GOLD, BLEND_VIOLET].map((col, k) => {
    const n = 520;
    const pos = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: col, size: 0.3, map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    const head = glowSprite(col, 3.4, 0);
    scene.add(pts, head);
    return { pts, mat, head, pos, phase: k * Math.PI, y0: k ? -11 : 11 };
  });

  // The blend sculpture: an outer shell that tries every form, with a second shell held inside it.
  const sg = new THREE.Group();
  const fill = new THREE.MeshStandardMaterial({ color: '#b08a3e', emissive: BLEND_GOLD, emissiveIntensity: 0.3, transparent: true, opacity: 0.12, flatShading: true, metalness: 0.5, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false });
  const stroke = new THREE.LineBasicMaterial({ color: BLEND_GOLD, transparent: true, opacity: 0.9 });
  const primary = SCULPT_FORMS.map((f) => {
    const solid = formGeometry(f, 2.35);
    const mesh = new THREE.Mesh(solid, fill);
    const lines = new THREE.LineSegments(linesFor(f, solid), stroke);
    sg.add(mesh, lines);
    return { mesh, lines };
  });
  const innerMat = new THREE.LineBasicMaterial({ color: BLEND_VIOLET, transparent: true, opacity: 0.9 });
  const inner = new THREE.LineSegments(new THREE.EdgesGeometry(formGeometry('dodecahedron', 1.72)), innerMat);
  sg.add(inner);
  const sglow = glowSprite('#f3e4c0', 10, 0);
  sg.add(sglow);
  scene.add(sg);

  const core = glowSprite('#fff4dd', 6, 0);
  scene.add(core);
  const coreRays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rayTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(coreRays);

  const setTime = (time: number) => {
    stars.forEach((s) => { (s.material as THREE.ShaderMaterial).uniforms.uTime.value = time; });
    stars[1].rotation.y = time * 0.01;
    nebula.forEach((s, i) => { s.material.rotation += 0; s.position.y += 0; void i; });
  };
  return { scene, pods, you, youGroup, rings, links, linkMat, outer, outerMat, outerStars, streams, sculpture: { group: sg, primary, inner, fill, stroke, innerMat, glow: sglow }, core, coreRays, keyLight, stars, nebula, pentagon, pentagonMat, setTime };
}

/** The symbol's four-point star, as light. */
function rayTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.translate(256, 256);
  for (let k = 0; k < 2; k++) {
    g.rotate(Math.PI / 2);
    const grad = g.createLinearGradient(-256, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,244,221,0)');
    grad.addColorStop(0.5, 'rgba(255,244,221,1)');
    grad.addColorStop(1, 'rgba(255,244,221,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-256, 0); g.quadraticCurveTo(0, -14, 256, 0); g.quadraticCurveTo(0, 14, -256, 0);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
