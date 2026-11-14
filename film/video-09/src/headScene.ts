import * as THREE from 'three';
import { headGeometry } from './head';
import { glowSprite, glowTexture, withRim } from './materials';
import { clamp, easeInOut, mulberry32, pulse, seg, smooth, TAU } from './util';
import { ARCHETYPES } from './data';

/**
 * Scene 01. One face, lit gold from one side. The other side is the "reflection": from 1.5 s it stops agreeing
 * with the face and shows other ways the same person could be drawn. Each is an archetype's own accent and one
 * of the product's own finishes (wire / facets / glass, and the dotted sigil treatment).
 */
export const REFLECTION_CUTS = [1.5, 1.86, 2.2, 2.52, 2.82, 3.1, 3.36, 3.58, 3.76, 3.9];
const accentOf = (key: string) => ARCHETYPES.find((a) => a.key === key)!.accent;

export function buildHeadScene(env: THREE.Texture) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#03040f');
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(30, 1080 / 1920, 0.1, 200);
  const key = new THREE.DirectionalLight('#ffcf85', 0);
  key.position.set(-5, 1.2, 2.2);
  const rim = new THREE.DirectionalLight('#8d7bd8', 0.9);
  rim.position.set(3.5, 2, -4);
  const side = new THREE.DirectionalLight('#ffffff', 0);
  side.position.set(4.5, 0.8, 3);
  scene.add(key, rim, side, new THREE.AmbientLight('#3c4078', 0.12));

  const left = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const right = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  const smoothGeo = headGeometry(64, false);
  const skin = () => withRim(new THREE.MeshStandardMaterial({ color: '#40364f', metalness: 0.4, roughness: 0.42 }), '#8d7bd8', 0.35, 3);
  const head = new THREE.Group();
  const leftMat = skin(); leftMat.clippingPlanes = [left];
  const rightMat = skin(); rightMat.clippingPlanes = [right];
  const leftHalf = new THREE.Mesh(smoothGeo, leftMat);
  const rightHalf = new THREE.Mesh(smoothGeo, rightMat);
  head.add(leftHalf, rightHalf);

  const occluder = () => { const m = new THREE.Mesh(smoothGeo, new THREE.MeshBasicMaterial({ color: '#05061a', clippingPlanes: [right] })); m.scale.setScalar(0.992); return m; };
  const wire = (accent: string, detail: number) => { const g = new THREE.Group(); g.add(occluder(), new THREE.LineSegments(new THREE.WireframeGeometry(headGeometry(detail, false)), new THREE.LineBasicMaterial({ color: accent, clippingPlanes: [right] }))); return g; };
  const facets = (accent: string, detail: number) => new THREE.Mesh(headGeometry(detail, true), withRim(new THREE.MeshStandardMaterial({ color: new THREE.Color(accent).multiplyScalar(0.7), metalness: 0.8, roughness: 0.25, flatShading: true, emissive: accent, emissiveIntensity: 0.1, clippingPlanes: [right] }), accent, 1.2, 2.2));
  const glass = (accent: string) => new THREE.Mesh(smoothGeo, withRim(new THREE.MeshStandardMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.5), metalness: 0.2, roughness: 0.1, emissive: accent, emissiveIntensity: 0.05, clippingPlanes: [right] }), accent, 0.9, 2.4));
  const dotted = (accent: string) => { const g = new THREE.Group(); g.add(occluder(), new THREE.Points(headGeometry(26, false), new THREE.PointsMaterial({ color: accent, size: 0.03, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clippingPlanes: [right] }))); return g; };
  const variants: { o: THREE.Object3D; accent: string }[] = [
    { o: wire(accentOf('midnight_philosopher'), 11), accent: accentOf('midnight_philosopher') },
    { o: facets(accentOf('human_plot_twist'), 9), accent: accentOf('human_plot_twist') },
    { o: dotted(accentOf('chaos_diplomat')), accent: accentOf('chaos_diplomat') },
    { o: glass(accentOf('kind_truth_teller')), accent: accentOf('kind_truth_teller') },
    { o: wire(accentOf('steady_signal'), 6), accent: accentOf('steady_signal') },
    { o: facets(accentOf('soft_launch_romantic'), 5), accent: accentOf('soft_launch_romantic') },
    { o: dotted(accentOf('lore_keeper')), accent: accentOf('lore_keeper') },
    { o: glass(accentOf('unbothered_overthinker')), accent: accentOf('unbothered_overthinker') },
  ];
  variants.forEach((v) => { v.o.visible = false; head.add(v.o); });
  scene.add(head);

  // The mirror's edge.
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 5), new THREE.MeshBasicMaterial({ color: '#ffe7b8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false }));
  edge.position.set(0, 0, 1.05);
  scene.add(edge);
  const glint = glowSprite('#ffe7b8', 1.4, 0);
  glint.position.set(0, 0.1, 1.06);
  scene.add(glint);

  // Dust in the light.
  const rand = mulberry32(3);
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(rand() - 0.5) * 5, (rand() - 0.5) * 6, -3 + rand() * 5.2], i * 3);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffdca6', size: 0.035, map: glowTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);
  const backGlow = glowSprite('#3c2f7a', 9, 0.5);
  backGlow.position.set(0.6, 0.2, -3);
  scene.add(backGlow);

  const update = (t: number) => {
    const push = easeInOut(seg(t, 0, 4.2));
    camera.position.set(Math.sin(t * 0.5) * 0.03, -0.06 + push * 0.04, 3.55 - push * 0.95);
    camera.lookAt(0, -0.06, 0);
    head.rotation.y = 0;
    key.intensity = 3.4 * smooth(seg(t, 0.05, 0.9)) * (1 + 0.5 * pulse(t, 0.12, 0.1, 0.9));
    let slot = -1;
    for (let i = 0; i < REFLECTION_CUTS.length; i++) if (t >= REFLECTION_CUTS[i]) slot = i;
    const active = slot >= 0 ? slot % variants.length : -1;
    rightHalf.visible = active < 0;
    variants.forEach((v, i) => { v.o.visible = i === active; });
    const since = slot >= 0 ? t - REFLECTION_CUTS[slot] : 9;
    if (active >= 0) { side.color.set(variants[active].accent); side.intensity = 1.5; } else side.intensity = 0;
    const flashCut = clamp(1 - since / 0.16);
    edge.material.opacity = (slot >= 0 ? 0.35 : 0.0) + flashCut * 0.65 + 0.25 * smooth(seg(t, 1.1, 1.5)) * (slot < 0 ? 1 : 0);
    glint.material.opacity = flashCut * 0.8;
    glint.position.y = 0.6 - ((slot * 0.37) % 1) * 1.3;
    dust.rotation.y = t * 0.03;
    dust.position.y = t * 0.03;
    void TAU;
  };
  return { scene, camera, update };
}
