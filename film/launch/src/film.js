/**
 * NAKSHATRA — "The Universe Is Open" · 30 s · 1080×1920 · 30 fps
 *
 * The whole film is one pure function of time: render(frame) draws frame n and nothing depends on wall-clock time,
 * so the renderer can take as long as it likes per frame and the result is identical on every run.
 *
 * What is real and what is drawn here:
 *   - Scenes 3 and 4 show the product. Every product pixel is a recording of the running app (film/launch/.shoot,
 *     made by scripts/capture.mjs): its own 3D scenes as plates, its own screens as phone recordings, a real Thought
 *     Drop card and the avatars it draws. This file only places, lights and cuts that footage.
 *   - The portal, the universe and the launch constellation are original to this film. They are built from the
 *     product's own visual language: the single light, particle ring and gateway of the in-app introduction
 *     (src/web/three/intro.tsx), and the 27-mansion ring of the brand motif (public/visual/brand).
 *   - The logo, wordmark and lockup are the official SVG files, loaded as they are.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const W = 1080, H = 1920, FPS = 30, SECONDS = 30;
const SCALE = parseFloat(new URLSearchParams(location.search).get('scale') ?? '1');
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ maths */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const span = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (t, a, b) => { const x = span(t, a, b); return x * x * (3 - 2 * x); };
const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
const inCubic = (x) => Math.pow(clamp(x), 3);
const inOutCubic = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const outBack = (x) => { x = clamp(x); const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
/** 0 → 1 → 0 window: in over `i` seconds after a, out over `o` seconds before b. */
const win = (t, a, b, i = 0.3, o = 0.3) => smooth(t, a, a + i) * (1 - smooth(t, b - o, b));
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

/* --------------------------------------------------------------- timeline */
const T = {
  portal: 0, open: 4, through: 6.3, montage: 9, product: 17, launch: 23, hit: 25, end: 27, out: 30,
};
/** Montage beats sit on a 120 bpm grid (0.5 s), so every cut lands on the music. */
const BEATS = [
  { key: 'identity', at: 9.0, to: 11.0, line: 'Discover who you are.' },
  { key: 'expression', at: 11.0, to: 12.5, line: 'Express what you think.' },
  { key: 'belonging', at: 12.5, to: 14.0, line: 'Find your people.' },
  { key: 'play', at: 14.0, to: 15.0, line: 'Play.' },
  { key: 'connect', at: 15.0, to: 16.0, line: 'Connect.' },
  { key: 'evolve', at: 16.0, to: 17.0, line: 'Evolve.' },
];
/** Product screens, on the same grid in eighth notes: 4·3·3·4·3·3·4. */
const SCREENS = [
  { key: 'home', at: 17.0 }, { key: 'identity', at: 18.0 }, { key: 'archetype', at: 18.75 }, { key: 'discover', at: 19.5 },
  { key: 'circles', at: 20.5 }, { key: 'thoughts', at: 21.25 }, { key: 'play', at: 22.0 },
];

/* ----------------------------------------------------------------- colour */
const C = {
  void: new THREE.Color('#05060f'), indigo: new THREE.Color('#3c448d'), violet: new THREE.Color('#714ca6'), tide: new THREE.Color('#358da5'),
  gold: new THREE.Color('#d9b26f'), goldPale: new THREE.Color('#f3e4c0'), lavender: new THREE.Color('#b9adf0'), bone: new THREE.Color('#f2ece1'), ember: new THREE.Color('#f38c48'),
};
const hdr = (c, k) => c.clone().multiplyScalar(k);

/* --------------------------------------------------------------- renderer */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(SCALE);
renderer.setSize(W, H, false);
renderer.setClearColor(C.void, 1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
const PX = SCALE; // device pixels per film pixel

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070920, 0.0042);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 3000);

/* A soft round sprite, shared by every particle system. */
const POINT_FRAG = /* glsl */`
  varying vec3 vCol; varying float vA;
  void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vCol * a * vA, 1.0); }
`;
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
const NOISE = /* glsl */`
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.02 + 11.3; a *= 0.5; } return s; }
`;

/* -------------------------------------------------------------------- sky */
const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uI: { value: 0.3 }, uAhead: { value: 0 }, uT: { value: 0 }, uIndigo: { value: C.indigo }, uViolet: { value: C.violet }, uTide: { value: C.tide }, uGold: { value: C.gold } },
  vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    ${NOISE}
    varying vec3 vDir; uniform float uI, uT, uAhead; uniform vec3 uIndigo, uViolet, uTide, uGold;
    void main() {
      vec3 d = normalize(vDir);
      float n1 = fbm(d * 2.2 + vec3(0.0, uT * 0.012, 0.0));
      float n2 = fbm(d * 4.1 + 7.0 + vec3(uT * 0.008));
      float band = smoothstep(0.42, 0.78, n1);
      vec3 col = vec3(0.006, 0.008, 0.022);
      col += uIndigo * band * 0.30;
      col += uViolet * smoothstep(0.5, 0.86, n2) * band * 0.22;
      col += uTide * smoothstep(0.62, 0.9, fbm(d * 3.0 - 4.0)) * 0.10;
      // A warm horizon ahead, where the universe's light is.
      float ahead = smoothstep(0.55, 1.0, dot(d, normalize(vec3(0.0, 0.07, -1.0))));
      col += (uGold * ahead * ahead * 0.10 + uViolet * ahead * 0.10) * uAhead;
      gl_FragColor = vec4(col * uI, 1.0);
    }`,
}));
sky.renderOrder = -10;
scene.add(sky);

function makePoints(count, fill, vertex, uniforms = {}) {
  const g = new THREE.BufferGeometry();
  const a = new Float32Array(count * 4), col = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) fill(i, a, col, size);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aData', new THREE.BufferAttribute(a, 4));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({ ...additive, uniforms: { uT: { value: 0 }, uPx: { value: PX }, uA: { value: 1 }, ...uniforms }, vertexShader: vertex, fragmentShader: POINT_FRAG });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

const stars = (() => {
  const rand = mulberry32(27);
  return makePoints(7000, (i, a, col, size) => {
    const u = rand() * 2 - 1, th = rand() * TAU, s = Math.sqrt(1 - u * u), r = 900 + rand() * 300;
    a.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th), rand() * TAU], i * 4);
    const c = pick(rand, [C.bone, C.bone, C.bone, C.goldPale, C.lavender]);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 1.2 + Math.pow(rand(), 6) * 5.5;
  }, /* glsl */`
    attribute vec4 aData; attribute vec3 aCol; attribute float aSize; uniform float uT, uPx, uA; varying vec3 vCol; varying float vA;
    void main() { vec4 mv = modelViewMatrix * vec4(aData.xyz, 1.0); gl_Position = projectionMatrix * mv;
      float tw = 0.72 + 0.28 * sin(uT * 1.7 + aData.w * 9.0);
      gl_PointSize = aSize * uPx * 1.6; vCol = aCol; vA = tw * uA; }`);
})();
stars.renderOrder = -9;
scene.add(stars);

/* ----------------------------------------------------------------- portal */
/**
 * The gateway of the in-app introduction, grown to full scale: a gold ring of 27 stations (the brand's 27-mansion
 * motif) closed by an iris of 27 blades. Each blade is the slice of the disc beyond one chord; the opening is the
 * circle those chords leave free, radius R·cos(φ/2). φ near π seals it; φ near 0 is wide open.
 */
const R = 6, BLADES = 27, SEG = 28;
const portal = new THREE.Group();
scene.add(portal);

const goldMat = new THREE.MeshBasicMaterial({ color: hdr(C.gold, 1.5), fog: false });
const paleMat = new THREE.MeshBasicMaterial({ color: hdr(C.goldPale, 2.2), fog: false });
const lavMat = new THREE.LineBasicMaterial({ color: C.lavender, transparent: true, opacity: 0.08, fog: false });
portal.add(new THREE.Mesh(new THREE.TorusGeometry(R + 0.1, 0.055, 12, 220), goldMat));
portal.add(new THREE.Mesh(new THREE.TorusGeometry(R + 0.62, 0.02, 8, 220), goldMat));
portal.add(new THREE.Mesh(new THREE.TorusGeometry(R + 1.02, 0.036, 10, 220), goldMat));
const stations = [];
for (let i = 0; i < BLADES; i++) {
  const a = (i / BLADES) * TAU + Math.PI / 2;
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.4, 0.035), goldMat);
  tick.position.set(Math.cos(a) * (R + 0.82), Math.sin(a) * (R + 0.82), 0);
  tick.rotation.z = a - Math.PI / 2;
  portal.add(tick);
  const node = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), paleMat);
  node.position.set(Math.cos(a) * (R + 0.1), Math.sin(a) * (R + 0.1), 0.02);
  portal.add(node);
  stations.push(node);
}
const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1)), lavMat);
shell.scale.setScalar(11.5);
portal.add(shell);

// The light waiting behind the gate.
const beyond = new THREE.Mesh(new THREE.PlaneGeometry(R * 6.4, R * 6.4), new THREE.ShaderMaterial({
  ...additive, uniforms: { uI: { value: 0 }, uT: { value: 0 }, uOpen: { value: 0 }, uGold: { value: C.gold }, uViolet: { value: C.violet }, uPale: { value: C.goldPale } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    varying vec2 vUv; uniform float uI, uT, uOpen; uniform vec3 uGold, uViolet, uPale;
    void main() {
      vec2 p = (vUv - 0.5) * 6.4; float r = length(p); float ang = atan(p.y, p.x);
      float core = exp(-r * r * 3.2), halo = exp(-r * 1.55);
      float rays = pow(0.5 + 0.5 * sin(ang * 9.0 + uT * 0.35) * sin(ang * 23.0 - uT * 0.22), 3.0);
      vec3 col = mix(uViolet, uGold, smoothstep(1.5, 0.2, r));
      col = mix(col, uPale * 1.6, core);
      float v = core * 2.4 + halo * 0.9 + rays * halo * (0.5 + uOpen * 1.6);
      gl_FragColor = vec4(col * v * uI * smoothstep(3.2, 1.6, r), 1.0);
    }`,
}));
beyond.position.z = -0.5;
beyond.renderOrder = 1;
portal.add(beyond);

const bladeGeom = new THREE.BufferGeometry();
const bladePos = new Float32Array(BLADES * (SEG + 1) * 3);
{
  const idx = [];
  for (let b = 0; b < BLADES; b++) { const o = b * (SEG + 1); for (let j = 1; j < SEG; j++) idx.push(o, o + j, o + j + 1); }
  bladeGeom.setIndex(idx);
  bladeGeom.setAttribute('position', new THREE.BufferAttribute(bladePos, 3));
}
const bladesDark = new THREE.Mesh(bladeGeom, new THREE.MeshBasicMaterial({ color: 0x070919, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide, fog: false }));
const bladesSheen = new THREE.Mesh(bladeGeom, new THREE.MeshBasicMaterial({ color: hdr(C.indigo, 0.011), ...additive, side: THREE.DoubleSide }));
bladesDark.renderOrder = 2; bladesSheen.renderOrder = 3;
bladesDark.frustumCulled = bladesSheen.frustumCulled = false;
portal.add(bladesDark, bladesSheen);

const chordGeom = new LineSegmentsGeometry();
const chordPos = new Float32Array(BLADES * 6);
chordGeom.setPositions(chordPos);
const chordMat = new LineMaterial({ color: hdr(C.gold, 1.3), linewidth: 2.4, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
const chords = new LineSegments2(chordGeom, chordMat);
chords.renderOrder = 4; chords.frustumCulled = false;
portal.add(chords);

function setIris(phi, rot) {
  for (let b = 0; b < BLADES; b++) {
    const th = (b / BLADES) * TAU + rot, o = b * (SEG + 1) * 3;
    for (let j = 0; j <= SEG; j++) {
      const a = th + (phi * j) / SEG;
      bladePos[o + j * 3] = Math.cos(a) * R; bladePos[o + j * 3 + 1] = Math.sin(a) * R; bladePos[o + j * 3 + 2] = b * 0.003;
    }
    chordPos.set([Math.cos(th) * R, Math.sin(th) * R, 0.1, Math.cos(th + phi) * R, Math.sin(th + phi) * R, 0.1], b * 6);
  }
  bladeGeom.attributes.position.needsUpdate = true;
  chordGeom.setPositions(chordPos);
}

/** The brand's four-point star, as the seal at the centre of the gate. */
function starShape(r, waist = 0.2) {
  const s = new THREE.Shape();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 2, m = a + TAU / 8, n = a + TAU / 4;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    s.quadraticCurveTo(Math.cos(m) * r * waist, Math.sin(m) * r * waist, Math.cos(n) * r, Math.sin(n) * r);
  }
  return new THREE.ShapeGeometry(s, 24);
}
const sealMat = new THREE.MeshBasicMaterial({ color: hdr(C.bone, 1.5), transparent: true, depthWrite: false, depthTest: false, fog: false });
const seal = new THREE.Mesh(starShape(1.15), sealMat);
seal.position.z = 0.3; seal.renderOrder = 6;
portal.add(seal);
const glowMat = (color) => new THREE.ShaderMaterial({ ...additive, depthTest: false, uniforms: { uI: { value: 1 }, uC: { value: color } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vUv; uniform float uI; uniform vec3 uC; void main() { float r = length(vUv - 0.5) * 2.0; float v = exp(-r * r * 5.0) + 0.35 * exp(-r * 2.6); gl_FragColor = vec4(uC * v * uI * smoothstep(1.0, 0.7, r), 1.0); }` });
const sealGlow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glowMat(C.goldPale));
sealGlow.position.z = 0.25; sealGlow.renderOrder = 5;
portal.add(sealGlow);

// Thousands of particles in orbit around the gate.
const belt = (() => {
  const rand = mulberry32(1107);
  return makePoints(11000, (i, a, col, size) => {
    const r = R + 1.3 + Math.pow(rand(), 1.7) * 13, z = (rand() + rand() + rand() - 1.5) * (1.2 + r * 0.22);
    a.set([r, rand() * TAU, z, 0.55 * Math.pow((R + 1.3) / r, 1.5) * (0.8 + rand() * 0.4)], i * 4);
    const c = pick(rand, [C.goldPale, C.goldPale, C.gold, C.bone, C.lavender]);
    const k = 0.7 + rand() * 1.0;
    col.set([c.r * k, c.g * k, c.b * k], i * 3);
    size[i] = 5.0 + Math.pow(rand(), 3) * 16;
  }, /* glsl */`
    attribute vec4 aData; attribute vec3 aCol; attribute float aSize; uniform float uT, uPx, uA, uPhase, uRush; varying vec3 vCol; varying float vA;
    void main() { float a = aData.y + aData.w * uPhase; float r = aData.x * (1.0 + 0.025 * sin(uT * 0.6 + aData.y * 5.0)) * (1.0 + uRush * 0.35);
      vec3 p = vec3(cos(a) * r, sin(a) * r, aData.z + uRush * aData.z * 2.5);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aSize * uPx * 30.0 / max(1.0, -mv.z), 1.0, 90.0 * uPx); vCol = aCol; vA = uA * (0.65 + 0.35 * sin(uT * 2.3 + aData.y * 31.0)); }`,
  { uPhase: { value: 0 }, uRush: { value: 0 } });
})();
belt.renderOrder = 7;
portal.add(belt);

// The wave of light when it opens.
const waveMat = () => new THREE.ShaderMaterial({ ...additive, side: THREE.DoubleSide, uniforms: { uI: { value: 0 }, uC: { value: new THREE.Color() } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vUv; uniform float uI; uniform vec3 uC; void main() { float r = length(vUv - 0.5) * 2.0; float v = exp(-pow((r - 0.86) / 0.055, 2.0)) + 0.25 * exp(-pow((r - 0.8) / 0.16, 2.0)); gl_FragColor = vec4(uC * v * uI, 1.0); }` });
const waves = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), waveMat()); m.position.z = 0.6; m.renderOrder = 8; portal.add(m); return m; });

/* --------------------------------------------------------------- universe */
const universe = new THREE.Group();
scene.add(universe);
scene.add(new THREE.HemisphereLight(0x6a62c8, 0x0b0c22, 0.75));
const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
sun.position.set(0.18, 0.5, -1); // from the light ahead, back toward the lens: rim-lit silhouettes
scene.add(sun);
const fill = new THREE.DirectionalLight(0xb9adf0, 0.85);
fill.position.set(-0.6, 0.35, 1);
scene.add(fill);

const rockMat = new THREE.MeshStandardMaterial({ color: 0x1b1d40, roughness: 0.92, metalness: 0.05, flatShading: true });
const topMat = new THREE.MeshStandardMaterial({ color: 0x34386f, roughness: 0.8, flatShading: true });
const towerMat = new THREE.MeshStandardMaterial({ color: 0x262a58, roughness: 0.45, metalness: 0.35, flatShading: true });
const edgeMat = new THREE.LineBasicMaterial({ color: hdr(C.gold, 1.25), transparent: true, opacity: 0.85 });
const gateMat = new THREE.MeshBasicMaterial({ color: hdr(C.gold, 1.7) });
const beaconMat = new THREE.MeshBasicMaterial({ color: hdr(C.goldPale, 3.0) });
const islands = [];
function makeIsland(rand, size) {
  const g = new THREE.Group();
  const rock = new THREE.ConeGeometry(size, size * 1.7, 7, 3);
  const p = rock.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < size * 0.8) { const j = 1 + (rand() - 0.5) * 0.34; p.setX(i, p.getX(i) * j); p.setZ(i, p.getZ(i) * j); } }
  rock.computeVertexNormals();
  const cone = new THREE.Mesh(rock, rockMat);
  cone.rotation.x = Math.PI; cone.position.y = -size * 0.85;
  g.add(cone);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.03, size * 0.99, size * 0.1, 7), topMat);
  top.position.y = 0.02 * size;
  g.add(top);
  const n = 2 + Math.floor(rand() * 4);
  let tallest = 0, tallestAt = [0, 0];
  for (let i = 0; i < n; i++) {
    const w = size * (0.09 + rand() * 0.1), h = size * (0.5 + rand() * 1.5), a = rand() * TAU, d = size * (0.1 + rand() * 0.5);
    const geo = new THREE.CylinderGeometry(w * (0.75 + rand() * 0.25), w, h, 6);
    const tower = new THREE.Mesh(geo, towerMat);
    tower.position.set(Math.cos(a) * d, h / 2 + size * 0.07, Math.sin(a) * d);
    tower.rotation.y = rand() * TAU;
    tower.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
    g.add(tower);
    if (h > tallest) { tallest = h; tallestAt = [tower.position.x, tower.position.z]; }
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(size * 0.045, 10, 8), beaconMat);
  beacon.position.set(tallestAt[0], tallest + size * 0.2, tallestAt[1]);
  g.add(beacon);
  if (rand() < 0.7) { // each land keeps a small gate of its own
    const gate = new THREE.Mesh(new THREE.TorusGeometry(size * 0.36, size * 0.016, 8, 56), gateMat);
    gate.position.set(-tallestAt[0] * 0.8, size * 0.5, -tallestAt[1] * 0.8);
    gate.rotation.y = rand() * 0.9 - 0.45;
    g.add(gate);
  }
  return g;
}
{
  const rand = mulberry32(2026);
  // Hand-placed lands along the flight, off the centre line so the way ahead stays open.
  const spots = [
    [-9.5, -3.5, -44, 4.2], [10.5, 1.5, -58, 5.0], [-15, 4.5, -82, 6.5], [7.5, -7, -76, 3.2], [17, -2, -104, 7.5], [-8.5, -5.5, -112, 3.6],
    [-22, 2, -138, 9], [11, 6.5, -142, 4.4], [24, 9, -176, 10], [-13, -9, -168, 5.5], [-30, 12, -214, 13], [31, -6, -232, 12],
    [-19, -14, -246, 8], [15, -15, -206, 6], [-42, -4, -300, 18], [44, 16, -320, 20],
  ];
  for (const [x, y, z, s] of spots) {
    const isl = makeIsland(rand, s);
    isl.position.set(x, y, z);
    isl.rotation.y = rand() * TAU;
    isl.userData = { y, phase: rand() * TAU, spin: (rand() - 0.5) * 0.05 };
    universe.add(isl);
    islands.push(isl);
  }
}

// The light every land faces, and the great rings around it.
const SUN_AT = new THREE.Vector3(4, 46, -640);
const sunDisc = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.ShaderMaterial({ ...additive, uniforms: { uI: { value: 1 }, uGold: { value: C.gold }, uViolet: { value: C.violet }, uPale: { value: C.goldPale } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vUv; uniform float uI; uniform vec3 uGold, uViolet, uPale;
    void main() { vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
      float core = exp(-r * r * 160.0), halo = exp(-r * 7.5), wide = exp(-r * 2.1);
      float streak = exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 2.4);
      vec3 col = uPale * core * 2.0 + uGold * halo * 0.22 + uViolet * wide * 0.04 + uPale * streak * 0.4;
      gl_FragColor = vec4(col * uI * smoothstep(1.0, 0.6, r), 1.0); }` }));
sunDisc.position.copy(SUN_AT);
universe.add(sunDisc);
const orbitMat = new THREE.MeshBasicMaterial({ color: hdr(C.gold, 0.9), transparent: true, opacity: 0.55, fog: false });
for (const [r, tx, tz, w] of [[150, 1.25, 0.2, 0.35], [215, 1.38, -0.35, 0.22], [290, 1.12, 0.5, 0.5]]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 260), orbitMat);
  ring.position.copy(SUN_AT);
  ring.rotation.set(tx, 0, tz);
  universe.add(ring);
}

// Constellations: stars joined by gold lines, as on the product's star maps.
const constMat = new THREE.LineBasicMaterial({ color: hdr(C.gold, 1.1), transparent: true, opacity: 0.55, fog: false });
{
  const rand = mulberry32(88);
  const centres = [[-26, 26, -150], [28, 30, -190], [-6, 40, -260], [34, -22, -170], [-36, -20, -230], [52, 8, -280], [-58, 30, -330]];
  const linePts = [], nodePts = [];
  for (const [cx, cy, cz] of centres) {
    const n = 5 + Math.floor(rand() * 4), pts = [];
    for (let i = 0; i < n; i++) pts.push([cx + (rand() - 0.5) * 22, cy + (rand() - 0.5) * 16, cz + (rand() - 0.5) * 14]);
    for (let i = 0; i < n - 1; i++) linePts.push(...pts[i], ...pts[i + 1]);
    linePts.push(...pts[1], ...pts[n - 1]);
    nodePts.push(...pts);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
  universe.add(new THREE.LineSegments(lg, constMat));
  const nodes = makePoints(nodePts.length, (i, a, col, size) => { a.set([...nodePts[i], i], i * 4); col.set([C.goldPale.r, C.goldPale.g, C.goldPale.b], i * 3); size[i] = 16; }, /* glsl */`
    attribute vec4 aData; attribute vec3 aCol; attribute float aSize; uniform float uT, uPx, uA; varying vec3 vCol; varying float vA;
    void main() { vec4 mv = modelViewMatrix * vec4(aData.xyz, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uPx * 60.0 / max(1.0, -mv.z), 2.0 * uPx, 40.0 * uPx); vCol = aCol * 1.4; vA = uA * (0.8 + 0.2 * sin(uT * 2.0 + aData.w)); }`);
  universe.add(nodes);
  universe.userData.nodes = nodes;
}

// Gold dust through the whole flight.
const dust = (() => {
  const rand = mulberry32(5);
  return makePoints(5200, (i, a, col, size) => {
    a.set([(rand() - 0.5) * 110, (rand() - 0.5) * 100, 30 - rand() * 420, rand() * TAU], i * 4);
    const c = pick(rand, [C.goldPale, C.gold, C.bone, C.lavender]);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 1.5 + Math.pow(rand(), 3) * 7;
  }, /* glsl */`
    attribute vec4 aData; attribute vec3 aCol; attribute float aSize; uniform float uT, uPx, uA; varying vec3 vCol; varying float vA;
    void main() { vec3 p = aData.xyz + vec3(sin(uT * 0.21 + aData.w) * 1.2, cos(uT * 0.17 + aData.w * 1.7) * 1.0, 0.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aSize * uPx * 22.0 / max(1.0, -mv.z), 1.0, 14.0 * uPx); vCol = aCol; vA = uA * (0.45 + 0.55 * sin(uT * 1.3 + aData.w * 13.0)) * smoothstep(2.0, 9.0, -mv.z); }`);
})();
universe.add(dust);

/* ------------------------------------------------- the launch constellation */
/** The 27-mansion motif at the scale of a sky: 27 stars on a ring, joined across it, with the star at its heart. */
const LAUNCH_AT = new THREE.Vector3(0, 6, -262), LR = 16;
const launch = new THREE.Group();
launch.position.copy(LAUNCH_AT);
scene.add(launch);
const launchRing = new THREE.Mesh(new THREE.TorusGeometry(LR, 0.045, 8, 260), new THREE.MeshBasicMaterial({ color: hdr(C.gold, 1.4), transparent: true, opacity: 0, fog: false }));
const launchRing2 = new THREE.Mesh(new THREE.TorusGeometry(LR * 1.085, 0.02, 6, 260), launchRing.material);
launch.add(launchRing, launchRing2);
const STEP = 10; // each star is joined to the tenth along, as in the motif
const lcGeom = new LineSegmentsGeometry();
const lcPos = [], lcCol = [];
for (let i = 0; i < 27; i++) {
  const a = (i / 27) * TAU + Math.PI / 2, b = ((i + STEP) / 27) * TAU + Math.PI / 2;
  lcPos.push(Math.cos(a) * LR, Math.sin(a) * LR, 0, Math.cos(b) * LR, Math.sin(b) * LR, 0);
  lcCol.push(0, 0, 0, 0, 0, 0);
}
lcGeom.setPositions(lcPos); lcGeom.setColors(lcCol);
const lcMat = new LineMaterial({ vertexColors: true, linewidth: 1.8, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const launchChords = new LineSegments2(lcGeom, lcMat);
launchChords.frustumCulled = false;
launch.add(launchChords);
const launchNodes = makePoints(27, (i, a, col, size) => {
  const ang = (i / 27) * TAU + Math.PI / 2;
  a.set([Math.cos(ang) * LR, Math.sin(ang) * LR, 0, i], i * 4);
  col.set([C.goldPale.r, C.goldPale.g, C.goldPale.b], i * 3); size[i] = 30;
}, /* glsl */`
  attribute vec4 aData; attribute vec3 aCol; attribute float aSize; uniform float uT, uPx, uA, uLit; varying vec3 vCol; varying float vA;
  void main() { vec4 mv = modelViewMatrix * vec4(aData.xyz, 1.0); gl_Position = projectionMatrix * mv;
    float on = smoothstep(aData.w - 0.5, aData.w + 1.5, uLit * 27.0);
    gl_PointSize = aSize * uPx * (0.5 + on) * 90.0 / max(1.0, -mv.z); vCol = aCol * (0.5 + on * 2.0); vA = uA * (0.12 + on); }`,
{ uLit: { value: 0 } });
launch.add(launchNodes);
const launchStar = new THREE.Mesh(starShape(2.3), new THREE.MeshBasicMaterial({ color: hdr(C.bone, 1.8), transparent: true, opacity: 0, depthWrite: false, fog: false }));
const launchGlow = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), glowMat(C.goldPale));
launchGlow.position.z = -0.5;
launch.add(launchGlow, launchStar);

// Thousands of gold particles converge on it.
const swarm = (() => {
  const rand = mulberry32(404);
  return makePoints(9000, (i, a, col, size) => {
    const u = rand() * 2 - 1, th = rand() * TAU, s = Math.sqrt(1 - u * u), r = 34 + rand() * 90;
    a.set([r * s * Math.cos(th), r * u * 1.5, r * s * Math.sin(th) * 0.6 + 20, rand()], i * 4);
    const c = pick(rand, [C.goldPale, C.gold, C.gold, C.bone]);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 2.5 + Math.pow(rand(), 3) * 9;
  }, /* glsl */`
    attribute vec4 aData; attribute vec3 aCol; attribute float aSize; uniform float uT, uPx, uA, uK; varying vec3 vCol; varying float vA;
    void main() { float k = clamp((uK - aData.w * 0.35) / 0.65, 0.0, 1.0); float e = k * k * k;
      float ang = (1.0 - e) * 2.6 * (0.6 + aData.w); float c = cos(ang), s = sin(ang);
      vec3 p = aData.xyz * (1.0 - e); p.xy = mat2(c, -s, s, c) * p.xy;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aSize * uPx * 70.0 / max(1.0, -mv.z), 1.0, 60.0 * uPx); vCol = aCol * (1.0 + e * 1.5); vA = uA * smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.93, 1.0, k)); }`,
  { uK: { value: 0 } });
})();
launch.add(swarm);

/* ---------------------------------------- overlay scene: plates and montage */
/** Film-pixel space (origin top-left). Product footage is placed here, over the universe, and takes the bloom. */
const flat = new THREE.Scene();
const flatCam = new THREE.OrthographicCamera(0, W, H, 0, -1000, 1000);
const fy = (y) => H - y;

const dimmer = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x03040a, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
dimmer.position.set(W / 2, H / 2, -10);
flat.add(dimmer);

const plateMat = () => new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: { map: { value: null }, uO: { value: 0 }, uGain: { value: 1 }, uFeather: { value: new THREE.Vector2(0.08, 0.12) }, uOval: { value: 0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vUv; uniform sampler2D map; uniform float uO, uGain, uOval; uniform vec2 uFeather;
    void main() { vec4 c = texture2D(map, vUv); vec2 d = min(vUv, 1.0 - vUv);
      float m = smoothstep(0.0, uFeather.x, d.x) * smoothstep(0.0, uFeather.y, d.y);
      float o = 1.0 - smoothstep(0.62, 1.0, length((vUv - 0.5) * 2.0)); m *= mix(1.0, o, uOval);
      gl_FragColor = vec4(c.rgb * uGain, m * uO); }`,
});
const plates = [0, 1].map((i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMat()); m.position.z = i; m.visible = false; flat.add(m); return m; });

// A real Thought Drop card, with rounded corners and a gold rim of light.
const cardMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: { map: { value: null }, uO: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 20 }, uRim: { value: C.gold }, uGlow: { value: 1 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vUv; uniform sampler2D map; uniform float uO, uRadius, uGlow; uniform vec2 uSize; uniform vec3 uRim;
    void main() { vec2 pad = vec2(40.0); vec2 full = uSize + pad * 2.0; vec2 p = vUv * full - pad; vec2 q = abs(p - uSize * 0.5) - (uSize * 0.5 - uRadius);
      float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
      vec4 c = texture2D(map, clamp(p / uSize, 0.0, 1.0)); float inside = 1.0 - smoothstep(-1.0, 1.0, sd);
      float rim = exp(-abs(sd) * 0.45) * 1.2 + exp(-max(sd, 0.0) * 0.09) * 0.42 * step(0.0, sd);
      vec3 col = c.rgb * 1.08 * inside + uRim * rim * uGlow; float a = max(inside, clamp(rim * uGlow, 0.0, 1.0) * step(0.0, sd));
      gl_FragColor = vec4(col, a * uO); }`,
});
const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cardMat);
card.visible = false; card.position.z = 5;
flat.add(card);
const trail = makePoints(260, (i, a, col, size) => { a.set([0, 0, 0, i / 260], i * 4); col.set([C.goldPale.r, C.goldPale.g, C.goldPale.b], i * 3); size[i] = 1; }, /* glsl */`
  attribute vec4 aData; attribute vec3 aCol; attribute float aSize; uniform float uT, uPx, uA; varying vec3 vCol; varying float vA;
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPx; vCol = aCol * 1.6; vA = uA * (1.0 - aData.w) * (1.0 - aData.w); }`);
trail.position.z = 4; trail.visible = false;
flat.add(trail);

// The cast's real avatars, joined into a constellation.
const PEOPLE = [ // film-pixel positions; the lead sits at the centre
  { key: 'lead', x: 540, y: 800, r: 118 }, { key: 'kabir', x: 232, y: 520, r: 80 }, { key: 'meera', x: 846, y: 468, r: 84 }, { key: 'zoya', x: 176, y: 900, r: 72 },
  { key: 'arjun', x: 902, y: 846, r: 78 }, { key: 'tara', x: 318, y: 1182, r: 80 }, { key: 'ishaan', x: 760, y: 1176, r: 74 }, { key: 'noor', x: 540, y: 372, r: 66 },
];
const LINKS = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [1, 7], [7, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6]];
const avatarMat = () => new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { map: { value: null }, uO: { value: 0 }, uRim: { value: C.gold } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vUv; uniform sampler2D map; uniform float uO; uniform vec3 uRim;
    void main() { vec2 p = (vUv - 0.5) * 2.5; float r = length(p); vec4 c = texture2D(map, clamp(p * 0.5 + 0.5, 0.0, 1.0));
      float inside = 1.0 - smoothstep(0.97, 1.0, r); float ring = exp(-pow((r - 1.04) / 0.035, 2.0)); float halo = exp(-max(r - 1.0, 0.0) * 9.0) * step(1.0, r) * 0.5;
      gl_FragColor = vec4(c.rgb * inside + uRim * (ring * 1.7 + halo), max(inside, clamp(ring + halo, 0.0, 1.0)) * uO); }` });
const avatars = PEOPLE.map((p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), avatarMat()); m.position.set(p.x, fy(p.y), 3); m.visible = false; flat.add(m); return m; });
const linkGeom = new LineSegmentsGeometry();
linkGeom.setPositions(new Float32Array(LINKS.length * 6));
const linkMat = new LineMaterial({ color: hdr(C.gold, 1.5), linewidth: 3, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
const links = new LineSegments2(linkGeom, linkMat);
links.position.z = 2; links.frustumCulled = false; links.visible = false;
flat.add(links);

// A sweep of light across each cut.
const sweep = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, 520), new THREE.ShaderMaterial({ ...additive, depthTest: false, uniforms: { uI: { value: 0 }, uC: { value: C.goldPale } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vUv; uniform float uI; uniform vec3 uC; void main() { vec2 p = (vUv - 0.5) * 2.0; float v = exp(-p.y * p.y * 26.0) * exp(-p.x * p.x * 2.4) + exp(-p.y * p.y * 900.0) * exp(-p.x * p.x * 1.2) * 1.6; gl_FragColor = vec4(uC * v * uI, 1.0); }` }));
sweep.position.z = 8;
flat.add(sweep);

/* ------------------------------------------------------------- compositing */
const target = new THREE.WebGLRenderTarget(W * PX, H * PX, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.setPixelRatio(1);
composer.setSize(W * PX, H * PX);
composer.addPass(new RenderPass(scene, camera));
const flatPass = new RenderPass(flat, flatCam);
flatPass.clear = false; flatPass.clearDepth = true;
composer.addPass(flatPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W * PX, H * PX), 0.5, 0.42, 0.9);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uFlash: { value: 0 }, uFlashC: { value: C.goldPale.clone() }, uFade: { value: 1 }, uVig: { value: 1 }, uSeed: { value: 0 }, uCA: { value: 0.004 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uFlash, uFade, uVig, uSeed, uCA; uniform vec3 uFlashC;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
    void main() { vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * uCA * r2).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * uCA * r2).b);
      float v = smoothstep(0.86, 0.22, length(c * vec2(1.0, 0.78))); col *= mix(1.0, 0.25 + 0.75 * v, uVig);
      col += uFlashC * uFlash; col *= uFade;
      col += (h(vUv * 1931.0) - 0.5) * 0.012 * (0.4 + col.g);
      gl_FragColor = vec4(max(col, 0.0), 1.0); }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ assets */
const SHOOT = '../.shoot';
const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
async function bitmapTexture(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
  const tex = new THREE.Texture(bmp);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.flipY = false; tex.needsUpdate = true;
  return tex;
}
async function svgTexture(url, size) {
  const img = new Image();
  img.src = url; await img.decode();
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  cv.getContext('2d').drawImage(img, 0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const pad4 = (n) => String(n).padStart(4, '0');
const plateMeta = {}, screenMeta = {};
const plateSlots = [{ key: '', tex: null }, { key: '', tex: null }];
async function setPlate(slot, name, frame, opts) {
  const mesh = plates[slot], meta = plateMeta[name], f = clamp(Math.round(frame), 0, meta.frames - 1), key = `${name}/${f}`;
  if (plateSlots[slot].key !== key) {
    plateSlots[slot].tex?.dispose();
    plateSlots[slot] = { key, tex: await bitmapTexture(`${SHOOT}/plates/${name}/${pad4(f)}.png`) };
  }
  const u = mesh.material.uniforms;
  u.map.value = plateSlots[slot].tex; u.uO.value = opts.o; u.uGain.value = opts.gain ?? 1.15; u.uOval.value = opts.oval ?? 0;
  u.uFeather.value.set(opts.fx ?? 0.08, opts.fy ?? 0.12);
  const s = opts.scale ?? 1;
  mesh.scale.set(meta.width * s, meta.height * s, 1);
  mesh.position.set(opts.x ?? W / 2, fy(opts.y ?? 800), slot);
  mesh.visible = opts.o > 0.001;
}

/* --------------------------------------------------------------------- DOM */
const $ = (id) => document.getElementById(id);
const ui = { time: $('t-time'), wait: $('t-wait'), cap: $('cap'), deck: $('deck'), deckGlow: $('deck-glow'), deckLabel: $('deck-label'), mark: $('mark'), symbol: $('mark-symbol'), word: $('mark-word'), live: $('t-live'), end: $('end') };
const endParts = ['.line1', '.line2', '.rule', '.cta', '.url'].map((s) => ui.end.querySelector(s));
function hero(el, t, a, b, { from = 0.32, to = 0.09, size = null } = {}) {
  const kin = smooth(t, a, a + 0.6), kout = smooth(t, b - 0.4, b), o = kin * (1 - kout);
  el.style.opacity = o.toFixed(4);
  if (o <= 0) return;
  const ls = lerp(from, to, outCubic(span(t, a, a + 1.1)));
  el.style.letterSpacing = `${ls.toFixed(4)}em`; el.style.textIndent = `${ls.toFixed(4)}em`;
  el.style.transform = `scale(${(1 + 0.035 * span(t, a, b)).toFixed(4)})`;
  el.style.filter = `blur(${((1 - kin) * 14 + kout * 10).toFixed(2)}px)`;
  if (size) el.style.fontSize = `${size}px`;
}
const phones = [];
const frameImages = new Map();
function frameImage(src) { // decoded once, then reused
  let p = frameImages.get(src);
  if (!p) { const img = new Image(); img.src = src; p = img.decode().then(() => img); frameImages.set(src, p); if (frameImages.size > 90) frameImages.delete(frameImages.keys().next().value); }
  return p;
}

/* ------------------------------------------------------------------ camera */
const look = new THREE.Vector3();
function placeCamera(t) {
  let x = 0, y = 0, z = 36;
  if (t < T.open) { z = lerp(38, 32.5, span(t, 0, T.open)); x = Math.sin(t * 0.5) * 0.25; y = Math.cos(t * 0.4) * 0.18; look.set(0, -2.4, 0); } // gate high in frame, room for the line beneath
  else if (t < T.montage) {
    const drift = lerp(32.5, 29.5, smooth(t, T.open, 5.3));
    const dive = inCubic(span(t, 5.0, T.through + 0.15));
    z = lerp(drift, -12, dive);
    const after = outCubic(span(t, T.through + 0.15, T.montage));
    z = lerp(z, -40, after);
    y = lerp(0, 2.2, smooth(t, 6.2, T.montage));
    const shake = (1 - smooth(t, T.open, 4.9)) * 0.16;
    x = Math.sin(t * 71) * shake; y += Math.cos(t * 63) * shake;
    look.set(0, lerp(-2.4, 0, smooth(t, T.open, 5.2)) + lerp(0, 5, smooth(t, 6.0, 8.5)), z - lerp(z, 60, smooth(t, T.open, 5.0)));
  } else if (t < T.launch) {
    const k = span(t, T.montage, T.launch);
    z = lerp(-40, -128, k); x = Math.sin(k * Math.PI * 2) * 2.2; y = 2.2 + Math.sin(k * Math.PI) * 1.6;
    look.set(x * 0.4, 5, z - 60);
  } else {
    const k = outCubic(span(t, T.launch, T.end + 0.6));
    z = lerp(-128, LAUNCH_AT.z + 84, k); x = lerp(0, 0, k); y = lerp(2.2, LAUNCH_AT.y - 4, k);
    const d = Math.abs(LAUNCH_AT.z - z);
    look.set(0, lerp(5, LAUNCH_AT.y - 0.0607 * d, smooth(t, T.launch, T.launch + 1.2)), LAUNCH_AT.z);
  }
  camera.position.set(x, y, z);
  camera.lookAt(look);
  camera.rotation.z += t < T.open ? Math.sin(t * 0.3) * 0.004 : t < T.montage ? lerp(0, -0.12, smooth(t, 5.2, T.through)) * (1 - smooth(t, T.through, 7.4)) : 0;
  sky.position.copy(camera.position); stars.position.copy(camera.position);
}

/** Orbital phase of the belt: steady, then far faster once the gate begins to open. */
function beltPhase(t) { let p = 0; const dt = 1 / 60; for (let s = 0; s < t; s += dt) p += dt * (1 + 9 * smooth(s, T.open - 0.2, 5.4)); return p; }
/** A soft heartbeat at 66 bpm, in step with the score's opening pulse. */
function heartbeat(t) { const b = (t * 1.1) % 1; return Math.exp(-b * 9) + 0.55 * Math.exp(-Math.pow((b - 0.18) * 12, 2)); }

/* ------------------------------------------------------------------ render */
let config = { url: null, registration: null, captions: true };
const thought = { tex: null, w: 1, h: 1, radius: 20 };

async function render(frame) {
  const t = frame / FPS;
  placeCamera(t);

  /* ---- scene 1 + 2: the gate ---- */
  const inPortal = t < T.through + 0.4;
  portal.visible = inPortal;
  if (inPortal) {
    const hb = heartbeat(t) * (1 - smooth(t, T.open - 0.15, T.open + 0.2));
    const opening = inOutCubic(span(t, T.open, 5.5));
    const phi = lerp(Math.PI * (0.972 - 0.012 * hb), Math.PI * 0.085, opening);
    setIris(phi, t * 0.035 + opening * 1.9);
    const charge = smooth(t, 2.4, T.open); // the last second: everything tightens
    chordMat.color.copy(C.gold).multiplyScalar(1.0 + hb * 1.3 + charge * 0.9 + opening * 2.2);
    goldMat.color.copy(C.gold).multiplyScalar(1.25 + hb * 0.8 + charge * 0.7 + opening * 1.8);
    paleMat.color.copy(C.goldPale).multiplyScalar(1.8 + hb * 1.6 + opening * 2.5);
    lavMat.opacity = 0.05 + hb * 0.04 + opening * 0.08;
    shell.rotation.set(t * 0.05, t * 0.08, 0);
    beyond.material.uniforms.uT.value = t;
    beyond.material.uniforms.uOpen.value = opening;
    beyond.material.uniforms.uI.value = (0.42 + hb * 0.4 + charge * 0.4 + opening * 0.3) * (1 - 0.96 * smooth(t, 4.8, 5.6));
    const sealOut = smooth(t, T.open, T.open + 0.45);
    seal.scale.setScalar((1 + hb * 0.1 + charge * 0.12) * (1 + sealOut * 2.6));
    seal.rotation.z = -t * 0.06;
    sealMat.opacity = 1 - sealOut;
    sealGlow.material.uniforms.uI.value = (0.5 + hb * 0.55 + charge * 0.6) * (1 - smooth(t, T.open + 0.1, T.open + 0.8));
    belt.material.uniforms.uT.value = t;
    belt.material.uniforms.uPhase.value = beltPhase(t);
    belt.material.uniforms.uRush.value = smooth(t, 5.1, T.through);
    belt.material.uniforms.uA.value = 0.85 + charge * 0.35 + opening * 0.6;
    waves.forEach((w, i) => {
      const k = span(t, T.open + i * 0.34, T.open + 1.7 + i * 0.34);
      w.visible = k > 0 && k < 1;
      w.scale.setScalar(R * (0.4 + 7.5 * outCubic(k)));
      w.material.uniforms.uC.value.copy(C.goldPale).lerp(C.violet, clamp(k * 1.25 + i * 0.2));
      w.material.uniforms.uI.value = (1 - k) * (1 - k) * (1.5 - i * 0.4);
    });
  }

  /* ---- the universe beyond ---- */
  const uni = smooth(t, 4.6, 6.6);
  universe.visible = t > 4.4;
  sky.material.uniforms.uI.value = lerp(0.42, 1.0, uni) * lerp(1, 0.72, smooth(t, T.end - 0.3, T.end + 0.6));
  sky.material.uniforms.uT.value = t;
  sky.material.uniforms.uAhead.value = uni;
  stars.material.uniforms.uT.value = t;
  stars.material.uniforms.uA.value = lerp(0.75, 1.0, uni);
  dust.material.uniforms.uT.value = t;
  dust.material.uniforms.uA.value = uni * 0.9;
  universe.userData.nodes.material.uniforms.uT.value = t;
  sunDisc.lookAt(camera.position);
  sunDisc.material.uniforms.uI.value = uni * lerp(1, 0.4, smooth(t, T.launch, T.hit)) * lerp(1, 0.5, smooth(t, T.end - 0.3, T.end + 0.6));
  for (const isl of islands) { isl.position.y = isl.userData.y + Math.sin(t * 0.35 + isl.userData.phase) * 0.35; isl.rotation.y += 0; isl.rotation.z = Math.sin(t * 0.2 + isl.userData.phase) * 0.012; }
  scene.fog.density = lerp(0.0, 0.0042, uni);

  /* ---- scene 5: the launch constellation ---- */
  const lit = smooth(t, T.launch - 0.4, T.hit - 0.45);
  const settle = smooth(t, T.end - 0.3, T.end + 0.7); // the end frame calms it
  launch.visible = t > T.product + 4;
  if (launch.visible) {
    launchNodes.material.uniforms.uLit.value = lit;
    launchNodes.material.uniforms.uA.value = lerp(1, 0.2, settle);
    launchRing.material.opacity = lerp(0.12, 0.9, lit) * lerp(1, 0.18, settle);
    const cols = [];
    const pulse = 1 + 1.6 * Math.exp(-Math.pow((t - T.hit) * 3.2, 2));
    for (let i = 0; i < 27; i++) { const on = smooth(lit * 27, i - 0.5, i + 2.5) * 0.5 * pulse * lerp(1, 0.14, settle); const c = [C.gold.r * on, C.gold.g * on, C.gold.b * on]; cols.push(...c, ...c); }
    lcGeom.setColors(cols);
    launch.rotation.z = (t - T.hit) * 0.02;
    swarm.material.uniforms.uK.value = span(t, T.launch + 0.15, T.hit + 0.05);
    swarm.material.uniforms.uA.value = 1;
    swarm.visible = t > T.launch && t < T.hit + 0.2;
    // The heart of it burns brightest at the hit, then gives way to the wordmark.
    const flare = Math.exp(-Math.pow((t - T.hit) * 4.0, 2));
    launchGlow.material.uniforms.uI.value = (smooth(t, T.launch + 0.6, T.hit) * 0.55 + flare * 0.7) * (1 - smooth(t, T.hit + 0.15, T.hit + 0.9) * 0.82) * lerp(1, 0.4, settle);
    launchStar.material.opacity = smooth(t, T.launch + 0.9, T.hit - 0.2) * (1 - smooth(t, T.hit - 0.05, T.hit + 0.3));
    launchStar.scale.setScalar(0.4 + 0.9 * smooth(t, T.launch + 0.9, T.hit) + flare * 0.5);
    launchStar.rotation.z = t * 0.2;
  }

  /* ---- scene 3: the montage (real product footage) ---- */
  const inMontage = t >= T.montage - 0.05 && t < T.product + 0.3;
  const beat = BEATS.find((b) => t >= b.at && t < b.to);
  for (const p of plates) p.visible = false;
  card.visible = false; trail.visible = false; links.visible = false; for (const a of avatars) a.visible = false;
  dimmer.material.opacity = 0.7 * smooth(t, T.montage - 0.2, T.montage + 0.3) * (1 - smooth(t, T.launch - 0.4, T.launch + 0.3)) + 0.5 * smooth(t, T.end - 0.3, T.end + 0.5);
  if (inMontage) {
    const X = 0.2; // seconds of dissolve across a cut
    const io = (a, b) => smooth(t, a - X / 2, a + X / 2) * (1 - smooth(t, b - X / 2, b + X / 2));
    // Identity: the reveal theatre, then the avatar figure rising out of it.
    if (t < 10.25) await setPlate(0, 'identity', lerp(18, 250, Math.sin(span(t, 8.9, 10.0) * Math.PI / 2)), { o: io(T.montage, 10.05), scale: lerp(1.0, 1.1, span(t, 9, 10.1)), y: 800, fx: 0.1, fy: 0.13 });
    if (t >= 9.85 && t < 11.2) await setPlate(1, 'avatar', (t - 9.9) * FPS, { o: io(10.05, 11.0), scale: lerp(0.86, 1.02, outCubic(span(t, 9.9, 10.7))), y: lerp(880, 800, outCubic(span(t, 9.9, 10.7))), fx: 0.14, fy: 0.14, gain: 1.25, oval: 0.35 });
    // Expression: a real Thought Drop travels in from the deep, rests, and streaks on.
    if (t >= 10.9 && t < 12.65) {
      const k = span(t, 11.0, 12.5);
      const path = (q) => { // arrive along an arc, hold, leave
        const arrive = outCubic(span(q, 0, 0.36)), leave = inCubic(span(q, 0.8, 1));
        return { x: lerp(1010, 540, arrive) - leave * 700, y: lerp(360, 800, arrive) - Math.sin(arrive * Math.PI) * 120 + leave * 420, s: lerp(0.05, 1, arrive) * (1 - leave * 0.92) };
      };
      const p = path(k);
      const cw = 900, ch = cw * thought.h / thought.w, padPx = 40 * (cw / thought.w);
      card.visible = true;
      cardMat.uniforms.uO.value = smooth(t, 10.95, 11.15) * (1 - smooth(t, 12.4, 12.56));
      cardMat.uniforms.uGlow.value = 0.55 + 1.6 * (1 - smooth(k, 0.2, 0.42)) + 1.6 * smooth(k, 0.78, 0.95);
      card.scale.set((cw + padPx * 2) * p.s, (ch + padPx * 2) * p.s, 1);
      card.position.set(p.x, fy(p.y), 5);
      card.rotation.set(lerp(0.5, 0, outCubic(span(k, 0, 0.4))), lerp(-0.9, 0, outCubic(span(k, 0, 0.4))) + Math.sin(k * 5) * 0.02, lerp(0.16, 0, outCubic(span(k, 0, 0.4))) - inCubic(span(k, 0.8, 1)) * 0.3);
      trail.visible = true;
      const pos = trail.geometry.attributes.position, sz = trail.geometry.attributes.aSize;
      const rand = mulberry32(9);
      for (let i = 0; i < pos.count; i++) {
        const back = (i / pos.count) * 0.3, q = path(Math.max(0, k - back)), j = (i / pos.count) * 46;
        pos.setXYZ(i, q.x + (rand() - 0.5) * j, fy(q.y + (rand() - 0.5) * j), 0);
        sz.setX(i, (5 + rand() * 20) * (0.35 + q.s));
      }
      pos.needsUpdate = true; sz.needsUpdate = true;
      trail.material.uniforms.uA.value = cardMat.uniforms.uO.value * (0.25 + 0.75 * (1 - smooth(k, 0.3, 0.5) * (1 - smooth(k, 0.76, 0.86))));
    }
    // Belonging: the cast's avatars find each other.
    if (t >= 12.4 && t < 14.15) {
      const out = smooth(t, 13.85, 14.1);
      const arr = new Float32Array(LINKS.length * 6);
      avatars.forEach((m, i) => {
        const p = PEOPLE[i], k = span(t, 12.5 + i * 0.07, 12.85 + i * 0.07), s = outBack(k) * (1 + out * 0.25);
        const bob = Math.sin(t * 2.2 + i * 1.7) * 6;
        m.visible = k > 0; m.scale.setScalar(p.r * 2.5 * Math.max(0.0001, s));
        m.position.set(lerp(540, p.x, lerp(1, 1.12, out)) + (p.x - 540) * 0, fy(p.y + bob), 3);
        m.material.uniforms.uO.value = clamp(k * 3) * (1 - out);
      });
      LINKS.forEach(([a, b], i) => {
        const k = outCubic(span(t, 12.7 + i * 0.05, 13.15 + i * 0.05));
        const A = avatars[a].position, B = avatars[b].position;
        arr.set([A.x, A.y, 0, lerp(A.x, B.x, k), lerp(A.y, B.y, k), 0], i * 6);
      });
      linkGeom.setPositions(arr);
      links.visible = true;
      linkMat.opacity = 0.85 * smooth(t, 12.7, 12.9) * (1 - out);
    }
    // Play, connect, evolve: the arena, the people map and the season path, one beat each.
    if (t >= 13.9 && t < 15.15) await setPlate(0, 'arena', (t - 14.0) * FPS * 2.2, { o: io(14.0, 15.0), scale: lerp(1.0, 1.1, span(t, 14, 15)), y: 800, gain: 1.35, fx: 0.14, fy: 0.16, oval: 0.5 });
    if (t >= 14.9 && t < 16.15) await setPlate(1, 'people', 20 + (t - 15.0) * FPS * 1.4, { o: io(15.0, 16.0), scale: lerp(1.16, 1.26, span(t, 15, 16)), y: 800, gain: 1.3, oval: 0.6 });
    if (t >= 15.9 && t < 17.2) await setPlate(0, 'season', 30 + (t - 16.0) * FPS * 1.5, { o: io(16.0, 17.05), scale: lerp(1.3, 1.4, span(t, 16, 17)), x: lerp(940, 900, span(t, 16, 17)), y: 890, gain: 1.8, fx: 0.16, fy: 0.2 });
  }
  // Light sweeps on the cuts.
  let sw = 0, sx = 0;
  for (const cut of [10.05, 11.0, 12.5, 14.0, 15.0, 16.0, 17.0]) { const d = t - cut; if (Math.abs(d) < 0.22) { sw = Math.max(sw, Math.exp(-Math.pow(d * 9, 2))); sx = d / 0.22; } }
  sweep.material.uniforms.uI.value = sw * 0.6;
  sweep.position.set(W / 2 + sx * 620, fy(800), 8);
  sweep.visible = sw > 0.01;

  if (config.captions && beat) {
    if (ui.cap.textContent !== beat.line) ui.cap.textContent = beat.line;
    const o = win(t, beat.at, beat.to, 0.16, 0.14);
    ui.cap.style.opacity = o.toFixed(4);
    ui.cap.style.transform = `translateY(${((1 - outCubic(span(t, beat.at, beat.at + 0.3))) * 22).toFixed(2)}px)`;
  } else ui.cap.style.opacity = '0';

  /* ---- scene 4: the product ---- */
  const inProduct = t >= T.product - 0.1 && t < T.launch + 0.1;
  ui.deck.style.display = inProduct ? '' : 'none';
  ui.deckGlow.style.opacity = (0.9 * win(t, T.product, T.launch, 0.5, 0.35)).toFixed(4);
  if (inProduct) {
    const SLIDE = 0.3;
    let pos = 0;
    SCREENS.forEach((s, i) => { if (i > 0) pos += inOutCubic(span(t, s.at - SLIDE / 2, s.at + SLIDE / 2)); });
    const enter = outCubic(span(t, T.product - 0.05, T.product + 0.55)), exit = inCubic(span(t, T.launch - 0.34, T.launch + 0.02));
    ui.deck.style.opacity = (smooth(t, T.product - 0.05, T.product + 0.3) * (1 - exit)).toFixed(4);
    ui.deck.style.transform = `translateY(${((1 - enter) * 520).toFixed(2)}px) scale(${(lerp(0.84, 1, enter) * (1 + exit * 0.22)).toFixed(4)}) rotateY(${(Math.sin(t * 0.9) * 1.6).toFixed(3)}deg)`;
    ui.deck.style.filter = exit > 0 ? `blur(${(exit * 14).toFixed(2)}px) brightness(${(1 + exit * 1.6).toFixed(3)})` : 'none';
    const waits = [];
    phones.forEach((ph, i) => {
      const d = i - pos, ad = Math.abs(d);
      if (ad > 2.3) { ph.el.style.display = 'none'; return; }
      ph.el.style.display = '';
      ph.el.style.transform = `translateX(${(d * 596).toFixed(2)}px) translateZ(${(-Math.min(ad, 1.5) * 540).toFixed(2)}px) rotateY(${(-clamp(d, -1.6, 1.6) * 44).toFixed(3)}deg)`;
      ph.el.style.zIndex = String(100 - Math.round(ad * 10));
      ph.shade.style.opacity = Math.min(0.72, ad * 0.62).toFixed(4);
      const next = SCREENS[i + 1]?.at ?? T.launch, meta = screenMeta[ph.key];
      const f = clamp(Math.round(span(t, SCREENS[i].at - 0.25, next + 0.1) * (meta.frames - 1)), 0, meta.frames - 1);
      const src = `${SHOOT}/screens/${ph.key}/${pad4(f)}.png`;
      if (ph.src !== src) { ph.src = src; waits.push(frameImage(src).then((img) => { if (ph.src === src) ph.img.src = img.src; return ph.img.decode().catch(() => undefined); })); }
    });
    await Promise.all(waits);
    const near = clamp(Math.round(pos), 0, SCREENS.length - 1);
    const label = screenMeta[SCREENS[near].key].label;
    if (ui.deckLabel.textContent !== label) ui.deckLabel.textContent = label;
    ui.deckLabel.style.opacity = ((1 - Math.min(1, Math.abs(pos - near) * 3.4)) * smooth(t, T.product + 0.25, T.product + 0.6) * (1 - smooth(t, T.launch - 0.4, T.launch - 0.15)) * 0.92).toFixed(4);
    ui.deckLabel.style.textIndent = '0.24em';
  } else ui.deckLabel.style.opacity = '0';

  /* ---- type ---- */
  hero(ui.time, t, 1.0, 3.75);
  hero(ui.wait, t, 6.85, 8.85, { size: 96 });
  // Scene 5: the official symbol and wordmark resolve out of the light.
  const markIn = smooth(t, T.hit - 0.02, T.hit + 0.5), markOut = inOutCubic(span(t, T.end - 0.3, T.end + 0.35)); // into the end frame, the mark rises to make room
  ui.mark.style.opacity = markIn.toFixed(4);
  ui.mark.style.transform = `scale(${(lerp(1.16, 1, outCubic(span(t, T.hit - 0.02, T.hit + 0.9))) * (1 + 0.025 * span(t, T.hit, T.end)) * lerp(1, 0.86, markOut)).toFixed(4)}) translateY(${(-markOut * 178).toFixed(2)}px)`;
  ui.mark.style.transformOrigin = '50% 46%';
  ui.mark.style.filter = `blur(${((1 - markIn) * 22).toFixed(2)}px) brightness(${(1 + (1 - smooth(t, T.hit, T.hit + 0.7)) * 1.4).toFixed(3)})`;
  hero(ui.live, t, T.hit + 0.45, T.end + 0.02, { from: 0.4, to: 0.14 });
  // Scene 6: the end frame — say who, say what, say where, say what to do.
  ui.end.style.display = t >= T.end - 0.1 ? '' : 'none';
  [0.1, 0.22, 0.36, 0.46, 0.58].forEach((delay, i) => {
    const el = endParts[i];
    if (!el || el.classList.contains('hidden')) return;
    const a = T.end - 0.02 + delay, k = outCubic(span(t, a, a + 0.5));
    el.style.opacity = smooth(t, a, a + 0.35).toFixed(4);
    el.style.transform = i === 3 ? `scale(${lerp(0.9, 1, outBack(span(t, a, a + 0.45))).toFixed(4)})` : `translateY(${((1 - k) * 26).toFixed(2)}px)`;
  });

  /* ---- grade ---- */
  const through = Math.exp(-Math.pow((t - T.through) * 3.4, 2));
  const openFlash = Math.exp(-Math.pow((t - T.open - 0.06) * 7, 2)) * 0.16;
  const hit = Math.exp(-Math.pow((t - T.hit) * 7.5, 2)) * 0.3;
  grade.uniforms.uFlash.value = through * 0.5 + openFlash + hit + sw * 0.05;
  grade.uniforms.uFade.value = smooth(t, 0, 0.5);
  grade.uniforms.uSeed.value = frame * 0.731;
  grade.uniforms.uCA.value = 0.004 + through * 0.03 + smooth(t, 5.2, T.through) * 0.015 * (1 - smooth(t, T.through, 7));
  bloom.strength = 0.5 + through * 0.35 + hit * 0.4;
  composer.render();
  renderer.getContext().finish();
}

/* -------------------------------------------------------------------- boot */
async function boot() {
  config = { ...config, ...(await json('../launch.config.json').catch(() => ({}))) };
  for (const n of ['identity', 'avatar', 'arena', 'people', 'season']) plateMeta[n] = await json(`${SHOOT}/plates/${n}/meta.json`);
  for (const s of SCREENS) screenMeta[s.key] = await json(`${SHOOT}/screens/${s.key}/meta.json`);
  const stills = await json(`${SHOOT}/stills/meta.json`);
  thought.tex = await bitmapTexture(`${SHOOT}/stills/${stills.thoughtDrop.file}`);
  thought.w = stills.thoughtDrop.cssWidth * stills.thoughtDrop.scale; thought.h = stills.thoughtDrop.cssHeight * stills.thoughtDrop.scale; thought.radius = stills.thoughtDrop.radius * stills.thoughtDrop.scale;
  cardMat.uniforms.map.value = thought.tex; cardMat.uniforms.uSize.value.set(thought.w, thought.h); cardMat.uniforms.uRadius.value = thought.radius;
  for (let i = 0; i < PEOPLE.length; i++) {
    const c = stills.cast.find((x) => x.key === PEOPLE[i].key);
    avatars[i].material.uniforms.map.value = await svgTexture(`${SHOOT}/stills/${c.avatar}`, 384);
  }
  for (const s of SCREENS) {
    const el = document.createElement('div'); el.className = 'phone';
    const img = document.createElement('img'); img.alt = '';
    const shade = document.createElement('div'); shade.className = 'shade';
    el.append(img, shade); ui.deck.append(el);
    phones.push({ key: s.key, el, img, shade, src: '' });
  }
  // The end frame only ever states what has been confirmed (launch.config.json).
  const cta = config.registration === 'open' ? 'Join now' : config.registration === 'waitlist' ? 'Join the waitlist' : '';
  $('cta-text').textContent = cta; endParts[3].classList.toggle('hidden', !cta);
  $('url-text').textContent = config.url ?? ''; endParts[4].classList.toggle('hidden', !config.url);
  await Promise.all(['400 10px "Instrument Serif"', 'italic 400 10px "Instrument Serif"', '500 10px "Hanken Grotesk"', '600 10px "Hanken Grotesk"', '500 10px "JetBrains Mono"'].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => i.decode().catch(() => undefined)));
  for (const el of [ui.time, ui.wait, ui.cap, ui.live, ui.mark, ui.deckLabel, ui.deckGlow, ...endParts]) if (el) el.style.opacity = '0';
  setIris(Math.PI * 0.97, 0);
}

window.__film = { frames: SECONDS * FPS, fps: FPS, width: W, height: H, ready: boot(), render };
