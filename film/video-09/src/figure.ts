import * as THREE from 'three';
import { headGeometry } from './head';
import { statueMaterials, type StatueMaterials } from './materials';
import type { WorldBuild } from '@app/web/three/archetypeWorlds';

/**
 * Film characters. One statue rig; each of the app's 24 archetypes gets a silhouette (hair or headwear,
 * outfit, pose, one object) chosen from its own traits in src/shared/personality.ts. Hair names and the
 * wave / hips / think poses are the Avatar Studio's (src/shared/avatar.ts); the rest are film additions.
 * These looks are an interpretation for this film, not canonical product artwork.
 */
export type Hair = 'none' | 'crop' | 'bun' | 'long' | 'waves' | 'curly' | 'headwrap' | 'spiky' | 'topknot';
export type Headwear = 'none' | 'hood' | 'beanie' | 'brim' | 'beret' | 'explorer' | 'headphones';
export type Outfit = 'legs' | 'robe' | 'dress' | 'coat' | 'cloak';
export type Pose = 'rest' | 'think' | 'wave' | 'hips' | 'open' | 'crossed' | 'hold' | 'hero' | 'cheer' | 'calm' | 'point' | 'offer' | 'stride' | 'behind' | 'heart';
export type Prop = 'moon' | 'juggle' | 'tabs' | 'book' | 'ember' | 'bolt' | 'fade' | 'frames' | 'star' | 'bubble' | 'spark' | 'battery' | 'bubbles' | 'grid' | 'spotlight' | 'stones' | 'compass' | 'mirror' | 'mug' | 'phone' | 'megaphone' | 'lens' | 'plane' | 'beacon' | 'none';
export interface Look { hair: Hair; headwear: Headwear; outfit: Outfit; pose: Pose; prop: Prop; glasses?: boolean; scarf?: boolean; cape?: boolean; pack?: boolean; yaw?: number }

export const LOOKS: Record<string, Look> = {
  midnight_philosopher: { hair: 'long', headwear: 'none', outfit: 'robe', pose: 'think', prop: 'moon' },
  chaos_diplomat: { hair: 'curly', headwear: 'none', outfit: 'legs', pose: 'open', prop: 'juggle', scarf: true },
  unbothered_overthinker: { hair: 'crop', headwear: 'headphones', outfit: 'legs', pose: 'crossed', prop: 'tabs', glasses: true },
  lore_keeper: { hair: 'bun', headwear: 'none', outfit: 'coat', pose: 'hold', prop: 'book' },
  soft_launch_romantic: { hair: 'waves', headwear: 'none', outfit: 'dress', pose: 'heart', prop: 'ember' },
  human_plot_twist: { hair: 'spiky', headwear: 'none', outfit: 'legs', pose: 'hero', prop: 'bolt', cape: true },
  professional_disappearing_act: { hair: 'none', headwear: 'hood', outfit: 'cloak', pose: 'rest', prop: 'fade', yaw: 0.9 },
  emotional_archivist: { hair: 'long', headwear: 'none', outfit: 'dress', pose: 'hold', prop: 'frames', scarf: true },
  delulu_strategist: { hair: 'topknot', headwear: 'none', outfit: 'coat', pose: 'point', prop: 'star' },
  accidental_therapist: { hair: 'waves', headwear: 'none', outfit: 'robe', pose: 'offer', prop: 'bubble' },
  quiet_instigator: { hair: 'crop', headwear: 'beanie', outfit: 'legs', pose: 'behind', prop: 'spark' },
  social_battery_economist: { hair: 'crop', headwear: 'none', outfit: 'coat', pose: 'hips', prop: 'battery', glasses: true },
  group_chat_mayor: { hair: 'curly', headwear: 'none', outfit: 'legs', pose: 'wave', prop: 'bubbles' },
  spreadsheet_optimist: { hair: 'crop', headwear: 'none', outfit: 'legs', pose: 'hold', prop: 'grid', glasses: true },
  main_character_trainee: { hair: 'long', headwear: 'none', outfit: 'dress', pose: 'hero', prop: 'spotlight', cape: true },
  calm_in_the_chaos: { hair: 'bun', headwear: 'none', outfit: 'robe', pose: 'calm', prop: 'stones' },
  side_quest_collector: { hair: 'crop', headwear: 'explorer', outfit: 'legs', pose: 'stride', prop: 'compass', pack: true },
  kind_truth_teller: { hair: 'crop', headwear: 'none', outfit: 'coat', pose: 'offer', prop: 'mirror' },
  cosy_contrarian: { hair: 'waves', headwear: 'beanie', outfit: 'cloak', pose: 'hold', prop: 'mug' },
  loyal_night_owl: { hair: 'headwrap', headwear: 'none', outfit: 'legs', pose: 'hold', prop: 'phone', scarf: true },
  hype_engineer: { hair: 'spiky', headwear: 'none', outfit: 'legs', pose: 'cheer', prop: 'megaphone' },
  gentle_detective: { hair: 'crop', headwear: 'brim', outfit: 'coat', pose: 'think', prop: 'lens' },
  plan_b_poet: { hair: 'waves', headwear: 'beret', outfit: 'robe', pose: 'open', prop: 'plane', scarf: true },
  steady_signal: { hair: 'crop', headwear: 'none', outfit: 'legs', pose: 'rest', prop: 'beacon' },
};

/** Arm pose: [raise forward, raise sideways, elbow bend] per arm, in radians. */
type Arm = [number, number, number];
const POSES: Record<Pose, { L: Arm; R: Arm; lean?: number; lift?: number }> = {
  rest: { L: [0.05, 0.14, 0.15], R: [0.05, 0.14, 0.15] },
  think: { L: [0.5, 0.05, 1.5], R: [1.15, -0.25, 2.25] },
  wave: { L: [0.05, 0.16, 0.2], R: [0.1, 2.5, 0.5] },
  hips: { L: [-0.15, 0.75, 1.5], R: [-0.15, 0.75, 1.5] },
  open: { L: [0.5, 0.9, 0.5], R: [0.5, 0.9, 0.5] },
  crossed: { L: [0.75, -0.35, 1.9], R: [0.6, -0.35, 1.9] },
  hold: { L: [0.55, 0.0, 1.35], R: [0.55, 0.0, 1.35] },
  hero: { L: [-0.15, 0.75, 1.5], R: [0.5, 2.3, 0.2], lean: -0.06 },
  cheer: { L: [0.2, 2.55, 0.25], R: [0.2, 2.55, 0.25], lift: 0.12 },
  calm: { L: [0.75, -0.3, 1.75], R: [0.75, -0.3, 1.75], lift: 0.35 },
  point: { L: [-0.15, 0.75, 1.5], R: [1.3, 1.75, 0.05] },
  offer: { L: [0.05, 0.14, 0.2], R: [1.15, 0.25, 0.55] },
  stride: { L: [-0.45, 0.12, 0.5], R: [0.6, 0.12, 0.8], lean: 0.08 },
  behind: { L: [-0.35, 0.05, 0.6], R: [0.9, 0.1, 1.9] },
  heart: { L: [0.05, 0.14, 0.2], R: [0.8, -0.3, 2.05] },
};

const GEO = {
  torso: new THREE.LatheGeometry([[0.0, 1.2], [0.2, 1.2], [0.265, 1.26], [0.25, 1.4], [0.225, 1.55], [0.25, 1.72], [0.31, 1.9], [0.355, 2.02], [0.36, 2.08], [0.31, 2.15], [0.18, 2.2], [0.09, 2.22], [0, 2.22]].map(([r, y]) => new THREE.Vector2(r, y)), 28),
  robe: new THREE.LatheGeometry([[0.0, 0.02], [0.5, 0.02], [0.52, 0.06], [0.47, 0.3], [0.41, 0.6], [0.34, 0.95], [0.28, 1.2], [0.26, 1.32]].map(([r, y]) => new THREE.Vector2(r, y)), 28),
  dress: new THREE.LatheGeometry([[0.0, 0.3], [0.72, 0.3], [0.74, 0.34], [0.66, 0.5], [0.52, 0.75], [0.37, 1.02], [0.28, 1.22], [0.26, 1.32]].map(([r, y]) => new THREE.Vector2(r, y)), 28),
  coat: new THREE.LatheGeometry([[0.44, 0.62], [0.36, 1.0], [0.29, 1.3]].map(([r, y]) => new THREE.Vector2(r, y)), 20, Math.PI * 0.3, Math.PI * 1.4),
  cloak: new THREE.LatheGeometry([[0.0, 0.05], [0.6, 0.05], [0.62, 0.1], [0.55, 0.6], [0.47, 1.2], [0.41, 1.7], [0.37, 2.02], [0.3, 2.14], [0.16, 2.22]].map(([r, y]) => new THREE.Vector2(r, y)), 28),
  leg: new THREE.CylinderGeometry(0.115, 0.07, 1.2, 14),
  foot: new THREE.SphereGeometry(0.5, 12, 8),
  upper: new THREE.CapsuleGeometry(0.075, 0.42, 4, 12),
  fore: new THREE.CapsuleGeometry(0.06, 0.4, 4, 12),
  hand: new THREE.SphereGeometry(0.075, 12, 8),
  shoulder: new THREE.SphereGeometry(0.1, 12, 8),
  neck: new THREE.CylinderGeometry(0.08, 0.1, 0.22, 14),
  ico: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.SphereGeometry(1, 16, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 24),
  ring: new THREE.TorusGeometry(1, 0.03, 6, 40),
  oct: new THREE.OctahedronGeometry(1, 0),
  tet: new THREE.TetrahedronGeometry(1, 0),
};

const HEAD_Y = 2.52, HEAD_S = 0.3;

export interface Figure { group: THREE.Group; mats: StatueMaterials; update: (time: number) => void }

function mesh(g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number] = [0, 0, 0], s: number | [number, number, number] = 1, r: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(...p);
  if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(...s);
  o.rotation.set(...r);
  return o;
}

function buildHair(kind: Hair, m: THREE.Material): THREE.Object3D[] {
  // Coordinates are in head space (head radius ≈ 0.8, +z is the face).
  const capGeo = (theta: number) => new THREE.SphereGeometry(0.86, 24, 12, 0, Math.PI * 2, 0, Math.PI * theta);
  const cap = (theta: number) => mesh(capGeo(theta), m, [0, 0.3, -0.14], [0.97, 1, 1.08], [-0.22, 0, 0]);
  switch (kind) {
    case 'none': return [];
    case 'crop': return [cap(0.42)];
    case 'bun': return [cap(0.46), mesh(GEO.ico1, m, [0, 0.95, -0.62], 0.36)];
    case 'topknot': return [cap(0.44), mesh(GEO.ico1, m, [0, 1.3, -0.12], 0.3), mesh(GEO.cyl, m, [0, 1.1, -0.12], [0.12, 0.2, 0.12])];
    case 'long': return [cap(0.5), mesh(GEO.ico1, m, [0, -0.55, -0.5], [0.86, 1.5, 0.5])];
    case 'waves': return [cap(0.5), mesh(GEO.ico1, m, [-0.62, -0.25, -0.2], [0.34, 0.85, 0.5]), mesh(GEO.ico1, m, [0.62, -0.25, -0.2], [0.34, 0.85, 0.5])];
    case 'curly': return [cap(0.42), ...Array.from({ length: 11 }, (_, i) => { const a = (i / 10) * Math.PI; return mesh(GEO.ico, m, [Math.cos(a) * 0.82, Math.sin(a) * 0.72 + 0.34, -0.12 + (i % 2) * 0.22], 0.34); })];
    case 'headwrap': return [mesh(capGeo(0.5), m, [0, 0.32, -0.14], [1.04, 1.1, 1.14], [-0.22, 0, 0]), mesh(GEO.torus, m, [0, 0.62, -0.06], [0.72, 0.72, 0.9], [Math.PI / 2 - 0.22, 0, 0])];
    case 'spiky': return [cap(0.36), ...Array.from({ length: 7 }, (_, i) => { const a = (i / 6) * Math.PI; return mesh(GEO.cone, m, [Math.cos(a) * 0.5, 0.95 + Math.sin(a) * 0.3, -0.25], [0.2, 0.75, 0.2], [-0.35, 0, Math.cos(a) * -0.7]); })];
  }
}

function buildHeadwear(kind: Headwear, body: THREE.Material, trim: THREE.Material): THREE.Object3D[] {
  switch (kind) {
    case 'none': return [];
    case 'hood': return [mesh(new THREE.SphereGeometry(1.08, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.72), body, [0, 0.18, -0.22], [1, 1.08, 1.1], [-0.5, 0, 0])];
    case 'beanie': return [mesh(new THREE.SphereGeometry(0.9, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), trim, [0, 0.36, -0.12], [1, 1.12, 1.08], [-0.2, 0, 0]), mesh(GEO.torus, trim, [0, 0.58, -0.07], [0.8, 0.8, 0.9], [Math.PI / 2 - 0.2, 0, 0]), mesh(GEO.ico, trim, [0, 1.38, -0.3], 0.16)];
    case 'brim': return [mesh(GEO.cyl, trim, [0, 0.82, -0.1], [1.35, 0.05, 1.35], [-0.12, 0, 0]), mesh(GEO.cyl, trim, [0, 1.1, -0.14], [0.7, 0.5, 0.74], [-0.12, 0, 0])];
    case 'beret': return [mesh(GEO.ico1, trim, [0.18, 1.02, -0.12], [0.9, 0.24, 0.9], [-0.1, 0, -0.28]), mesh(GEO.ico, trim, [0.18, 1.27, -0.12], 0.07)];
    case 'explorer': return [mesh(GEO.cyl, trim, [0, 0.8, -0.08], [1.25, 0.045, 1.25], [-0.1, 0, 0]), mesh(new THREE.SphereGeometry(0.78, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), trim, [0, 0.8, -0.1], [1, 0.9, 1.05], [-0.1, 0, 0])];
    case 'headphones': return [mesh(new THREE.TorusGeometry(0.88, 0.06, 5, 12, Math.PI), trim, [0, 0.25, -0.05]), mesh(GEO.cyl, trim, [-0.86, 0.02, -0.05], [0.22, 0.14, 0.22], [0, 0, Math.PI / 2]), mesh(GEO.cyl, trim, [0.86, 0.02, -0.05], [0.22, 0.14, 0.22], [0, 0, Math.PI / 2])];
  }
}

/** Builds the statue. `detail` raises head resolution for close shots. */
export function buildFigure(look: Look, accent: string, build: WorldBuild, detail = 12): Figure {
  const mats = statueMaterials(accent, build);
  const { body, trim, glow } = mats;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const pose = POSES[look.pose];
  rig.rotation.x = pose.lean ?? 0;
  rig.rotation.y = look.yaw ?? 0;
  const lift = pose.lift ?? 0;

  rig.add(mesh(GEO.torso, body, [0, 0, 0], [1, 1, 0.72]));
  rig.add(mesh(GEO.neck, body, [0, 2.26, 0]));
  const head = new THREE.Group();
  head.position.set(0, HEAD_Y, 0.02);
  head.scale.setScalar(HEAD_S);
  const headMesh = new THREE.Mesh(headGeometry(detail, false, true), body);
  head.add(headMesh);
  buildHair(look.hair, trim).forEach((o) => head.add(o));
  buildHeadwear(look.headwear, body, trim).forEach((o) => head.add(o));
  if (look.glasses) {
    for (const x of [-0.29, 0.29]) head.add(mesh(new THREE.TorusGeometry(0.19, 0.022, 4, 14), glow, [x, 0.03, 0.78]));
    head.add(mesh(GEO.box, glow, [0, 0.05, 0.8], [0.2, 0.025, 0.025]));
  }
  if (look.pose === 'think') head.rotation.set(0.14, 0.2, 0.06);
  if (look.pose === 'cheer' || look.pose === 'hero') head.rotation.x = -0.18;
  rig.add(head);

  // Lower body: what makes the silhouette at a distance.
  if (look.outfit === 'robe') rig.add(mesh(GEO.robe, body, [0, 0, 0], [1, 1, 0.82]));
  else if (look.outfit === 'dress') rig.add(mesh(GEO.dress, body, [0, 0, 0], [1, 1, 0.9]), mesh(GEO.leg, body, [-0.12, 0.6, 0], [0.8, 0.6, 0.8]), mesh(GEO.leg, body, [0.12, 0.6, 0], [0.8, 0.6, 0.8]));
  else if (look.outfit === 'cloak') rig.add(mesh(GEO.cloak, body, [0, 0, -0.03], [1, 1, 0.85]));
  else {
    const stride = look.pose === 'stride' ? 0.32 : look.pose === 'hero' ? 0.1 : 0;
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.14, 1.22, 0);
      leg.rotation.set(s * stride, 0, s * (look.pose === 'hero' || look.pose === 'hips' ? 0.12 : 0.03));
      leg.add(mesh(GEO.leg, body, [0, -0.6, 0]), mesh(GEO.foot, body, [0, -1.17, 0.07], [0.17, 0.11, 0.34]));
      rig.add(leg);
    }
    if (look.outfit === 'coat') rig.add(mesh(GEO.coat, trim, [0, 0, 0], [1, 1, 0.85], [0, Math.PI / 2, 0]));
  }
  if (look.pose === 'calm') {
    // Seated in the air, legs folded: two crossed thighs under the robe.
    for (const s of [-1, 1]) rig.add(mesh(GEO.leg, body, [s * 0.3, 1.02, 0.28], [1.2, 0.5, 1.2], [1.35, 0, s * 0.9]));
  }

  // Arms.
  const hands: Record<'L' | 'R', THREE.Group> = { L: new THREE.Group(), R: new THREE.Group() };
  (['L', 'R'] as const).forEach((side) => {
    const s = side === 'L' ? -1 : 1;
    const [fwd, out, bend] = pose[side];
    const sh = new THREE.Group();
    sh.position.set(s * 0.41, 2.04, 0);
    sh.rotation.set(-fwd, 0, s * out);
    sh.add(mesh(GEO.shoulder, body), mesh(GEO.upper, body, [0, -0.27, 0]));
    const el = new THREE.Group();
    el.position.set(0, -0.52, 0);
    el.rotation.set(-bend, 0, 0);
    el.add(mesh(GEO.fore, body, [0, -0.23, 0]));
    const hand = hands[side];
    hand.position.set(0, -0.5, 0);
    hand.add(mesh(GEO.hand, body));
    el.add(hand);
    sh.add(el);
    rig.add(sh);
  });

  if (look.scarf) rig.add(mesh(GEO.torus, trim, [0, 2.2, 0.02], [0.2, 0.2, 0.34], [Math.PI / 2, 0, 0]), mesh(GEO.box, trim, [0.16, 1.92, 0.24], [0.13, 0.55, 0.05], [0.1, 0, -0.12]));
  if (look.cape) rig.add(mesh(new THREE.CylinderGeometry(0.34, 0.75, 1.75, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9), trim, [0, 1.3, -0.12], [1, 1, 0.7], [0.16, 0, 0]));
  if (look.pack) rig.add(mesh(GEO.box, trim, [0, 1.72, -0.34], [0.46, 0.6, 0.26]), mesh(GEO.cyl, trim, [0, 2.08, -0.34], [0.22, 0.46, 0.13], [0, 0, Math.PI / 2]));

  // The one object each archetype carries. `floaters` drift a little, driven by update().
  const floaters: { o: THREE.Object3D; base: THREE.Vector3; amp: number; speed: number; phase: number; spin: number }[] = [];
  const float = (o: THREE.Object3D, amp = 0.06, speed = 1, spin = 0) => { rig.add(o); floaters.push({ o, base: o.position.clone(), amp, speed, phase: floaters.length * 1.7, spin }); return o; };
  const orbiters: { o: THREE.Object3D; r: number; y: number; speed: number; phase: number; tilt: number }[] = [];
  const orbit = (o: THREE.Object3D, r: number, y: number, speed: number, phase: number, tilt = 0) => { rig.add(o); orbiters.push({ o, r, y, speed, phase, tilt }); };
  const R = hands.R, L = hands.L;
  switch (look.prop) {
    case 'moon': float(mesh(new THREE.TorusGeometry(0.22, 0.07, 5, 12, Math.PI * 1.25), glow, [0.72, 2.95, 0.1], 1, [0, 0, 0.9]), 0.05, 0.6); break;
    case 'juggle': for (let i = 0; i < 3; i++) orbit(mesh(GEO.ico, glow, [0, 0, 0], 0.09), 0.62, 2.55, 2.4, i * 2.09, 1.35); break;
    case 'tabs': for (let i = 0; i < 6; i++) orbit(mesh(GEO.box, glow, [0, 0, 0], [0.2, 0.14, 0.012]), 0.7 + (i % 2) * 0.16, 2.72 + (i % 3) * 0.14, 0.5, i * 1.05, 0.15); break;
    case 'book': rig.add(mesh(GEO.box, trim, [0, 1.66, 0.42], [0.46, 0.07, 0.34], [0.5, 0, 0]), mesh(GEO.box, glow, [0, 1.7, 0.44], [0.4, 0.012, 0.28], [0.5, 0, 0])); break;
    case 'ember': rig.add(mesh(GEO.oct, glow, [0.02, 1.86, 0.3], [0.09, 0.13, 0.09])); float(mesh(GEO.oct, glow, [0.5, 2.3, 0.35], 0.04), 0.1, 1.3); float(mesh(GEO.oct, glow, [-0.45, 2.75, 0.2], 0.03), 0.12, 0.9); break;
    case 'bolt': R.add(mesh(GEO.box, glow, [0, -0.3, 0], [0.07, 0.45, 0.04], [0, 0, 0.5]), mesh(GEO.box, glow, [0.1, -0.62, 0], [0.07, 0.45, 0.04], [0, 0, -0.4])); break;
    case 'fade': for (let i = 0; i < 14; i++) float(mesh(GEO.tet, glow, [Math.sin(i * 2.4) * (0.35 + i * 0.03), 0.15 + i * 0.12, -0.25 - (i % 4) * 0.16], 0.035 + (i % 3) * 0.012), 0.1, 0.5 + (i % 5) * 0.2, 1); break;
    case 'frames': rig.add(mesh(GEO.box, trim, [0, 1.62, 0.4], [0.4, 0.26, 0.3])); for (let i = 0; i < 4; i++) orbit(mesh(new THREE.TorusGeometry(0.11, 0.014, 4, 4), glow, [0, 0, 0], 1, [0, 0, Math.PI / 4]), 0.82, 2.0 + i * 0.3, 0.45, i * 1.6, 0.1); break;
    case 'star': float(mesh(GEO.oct, glow, [0.95, 3.25, 0.1], [0.1, 0.2, 0.1]), 0.04, 0.8, 1.2); float(mesh(GEO.oct, glow, [0.95, 3.25, 0.1], [0.2, 0.06, 0.06]), 0.04, 0.8, 0); break;
    case 'bubble': float(mesh(GEO.ico1, glow, [0.52, 2.1, 0.62], [0.2, 0.15, 0.06]), 0.04, 0.9); break;
    case 'spark': R.add(mesh(GEO.oct, glow, [0, -0.14, 0.02], [0.05, 0.1, 0.05])); break;
    case 'battery': for (let i = 0; i < 4; i++) float(mesh(GEO.box, i < 3 ? glow : trim, [0.78, 2.2 + i * 0.13, 0.15], [0.2, 0.09, 0.05]), 0.02, 0.7); break;
    case 'bubbles': for (let i = 0; i < 5; i++) orbit(mesh(GEO.ico1, glow, [0, 0, 0], [0.15, 0.11, 0.05]), 0.9 + (i % 2) * 0.12, 2.25 + (i % 3) * 0.36, 0.7, i * 1.26, 0.2); break;
    case 'grid': { const tab = new THREE.Group(); tab.position.set(0, 1.68, 0.42); tab.rotation.x = 0.55; tab.add(mesh(GEO.box, trim, [0, 0, 0], [0.5, 0.36, 0.025])); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tab.add(mesh(GEO.box, glow, [-0.15 + i * 0.15, -0.1 + j * 0.1, 0.02], [0.11, 0.07, 0.01])); rig.add(tab); break; }
    case 'spotlight': rig.add(mesh(GEO.ring, glow, [0, 0.04, 0], 0.82, [Math.PI / 2, 0, 0])); float(mesh(GEO.oct, glow, [0.62, 3.2, 0.05], [0.07, 0.14, 0.07]), 0.04, 1, 1.5); break;
    case 'stones': for (let i = 0; i < 5; i++) orbit(mesh(GEO.ico, trim, [0, 0, 0], 0.07 + (i % 2) * 0.03), 0.95, 1.55 + (i % 3) * 0.22, 0.55, i * 1.26, 0.3); break;
    case 'compass': R.add(mesh(GEO.cyl, trim, [0, -0.1, 0.06], [0.13, 0.03, 0.13], [Math.PI / 2, 0, 0]), mesh(GEO.oct, glow, [0, -0.1, 0.09], [0.03, 0.11, 0.02])); break;
    case 'mirror': R.add(mesh(GEO.cyl, glow, [0, -0.2, 0.05], [0.2, 0.015, 0.2], [Math.PI / 2 - 0.4, 0, 0]), mesh(GEO.ring, trim, [0, -0.2, 0.05], 0.21, [-0.4, 0, 0])); break;
    case 'mug': rig.add(mesh(GEO.cyl, trim, [0, 1.74, 0.44], [0.1, 0.17, 0.1]), mesh(GEO.cyl, glow, [0, 1.83, 0.44], [0.085, 0.01, 0.085])); float(mesh(GEO.ico, glow, [0.03, 2.0, 0.44], 0.03), 0.07, 1.4); break;
    case 'phone': rig.add(mesh(GEO.box, glow, [0, 1.74, 0.46], [0.15, 0.27, 0.02], [0.6, 0, 0])); float(mesh(new THREE.TorusGeometry(0.18, 0.06, 5, 12, Math.PI * 1.2), glow, [-0.7, 3.0, 0.1], 1, [0, 0, 2.2]), 0.05, 0.6); break;
    case 'megaphone': R.add(mesh(new THREE.ConeGeometry(0.2, 0.42, 7, 1, true), trim, [0, -0.3, 0], 1, [0, 0, 0])); for (let i = 0; i < 3; i++) float(mesh(GEO.ring, glow, [0.5, 3.35 + i * 0.16, 0.05], 0.12 + i * 0.07, [Math.PI / 2, 0, 0]), 0.03, 2, 0); break;
    case 'lens': R.add(mesh(GEO.ring, glow, [0, -0.24, 0.05], 0.15, [0, 0, 0]), mesh(GEO.cyl, trim, [0, -0.05, 0.05], [0.02, 0.18, 0.02])); break;
    case 'plane': float(mesh(GEO.tet, glow, [0.7, 3.0, 0.3], [0.2, 0.05, 0.11], [0.3, 0.6, 0.2]), 0.12, 0.8); float(mesh(GEO.tet, glow, [-0.75, 2.5, 0.15], [0.13, 0.035, 0.07], [0.2, -0.5, -0.2]), 0.1, 1.1); break;
    case 'beacon': rig.add(mesh(GEO.cyl, trim, [0.62, 1.35, 0.1], [0.022, 2.7, 0.022]), mesh(GEO.oct, glow, [0.62, 2.85, 0.1], [0.11, 0.17, 0.11])); for (let i = 0; i < 2; i++) rig.add(mesh(GEO.ring, glow, [0.62, 2.85, 0.1], 0.24 + i * 0.14, [Math.PI / 2, 0, 0])); break;
    case 'none': break;
  }
  void L;

  // Wire and glass finishes draw their own edges, so the form reads as light rather than mass.
  if (mats.line) {
    const lines: THREE.LineSegments[] = [];
    rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === body && m !== headMesh) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 14), mats.line!); lines.push(e); m.add(e); }
    });
  }
  rig.position.y = lift;

  const update = (time: number) => {
    rig.position.y = lift + Math.sin(time * 1.1 + accent.charCodeAt(2)) * 0.02 + (lift ? Math.sin(time * 0.7) * 0.05 : 0);
    for (const f of floaters) { f.o.position.y = f.base.y + Math.sin(time * f.speed + f.phase) * f.amp; if (f.spin) f.o.rotation.y = time * f.spin; }
    for (const b of orbiters) { const a = b.phase + time * b.speed; b.o.position.set(Math.cos(a) * b.r, b.y + Math.sin(a) * b.r * Math.sin(b.tilt), Math.sin(a) * b.r * Math.cos(b.tilt)); b.o.rotation.y = -a; }
  };
  update(0);
  return { group: root, mats, update };
}
