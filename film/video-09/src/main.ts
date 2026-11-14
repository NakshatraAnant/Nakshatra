import * as THREE from 'three';
import { createStage } from './stage';
import { ARCHETYPES } from './data';
import { buildFigure } from './figure';
import { headGeometry } from './head';
import { withRim } from './materials';
import { buildEnvironment } from './env';

const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale') ?? 1);
const debug = params.get('debug');
const stage = createStage(document.getElementById('gl') as HTMLCanvasElement, scale);

declare global { interface Window { film: { ready: Promise<void>; duration: number; fps: number; render: (t: number) => void } } }

if (debug === 'lineup') {
  // Contact sheet of all 24 statues, for art review only.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07081a');
  scene.environment = buildEnvironment(stage.renderer);
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.AmbientLight('#8d7bd8', 0.5));
  const key = new THREE.DirectionalLight('#ffe2b0', 2.6); key.position.set(-4, 6, 6); scene.add(key);
  const fill = new THREE.DirectionalLight('#6fa8dc', 0.8); fill.position.set(5, 2, 3); scene.add(fill);
  const page = Number(params.get('page') ?? 0);
  ARCHETYPES.slice(page * 12, page * 12 + 12).forEach((a, i) => {
    const f = buildFigure(a.look, a.accent, a.world.build);
    f.group.position.set((i % 3 - 1) * 2.3, (1.5 - Math.floor(i / 3)) * 3.9 - 1.6, 0);
    f.group.rotation.y = 0.35;
    scene.add(f.group);
  });
  const cam = new THREE.PerspectiveCamera(30, 1080 / 1920, 0.1, 200);
  cam.position.set(0, 0, 30);
  window.film = { ready: Promise.resolve(), duration: 1, fps: 30, render: (t) => stage.render(scene, cam, t, { bloom: 0.6 }) };
} else if (debug === 'head') {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05061a');
  scene.environment = buildEnvironment(stage.renderer);
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.AmbientLight('#3c4078', 0.25));
  const key = new THREE.DirectionalLight('#ffd89a', 3.2); key.position.set(-5, 2, 3); scene.add(key);
  const rim = new THREE.DirectionalLight('#8d7bd8', 1.4); rim.position.set(4, 1, -3); scene.add(rim);
  const faceted = params.get('smooth') !== '1';
  const m = withRim(new THREE.MeshStandardMaterial({ color: '#3a3350', metalness: 0.45, roughness: 0.4, flatShading: faceted }), '#8d7bd8', 0.5);
  const head = new THREE.Mesh(headGeometry(Number(params.get('detail') ?? 14), faceted), m);
  head.rotation.y = Number(params.get('yaw') ?? 0);
  scene.add(head);
  const cam = new THREE.PerspectiveCamera(30, 1080 / 1920, 0.1, 200);
  cam.position.set(0, -0.1, Number(params.get('d') ?? 6));
  window.film = { ready: Promise.resolve(), duration: 1, fps: 30, render: (t) => stage.render(scene, cam, t, { bloom: 0.5 }) };
} else {
  const { createFilm } = await import('./film');
  window.film = await createFilm(stage);
}
