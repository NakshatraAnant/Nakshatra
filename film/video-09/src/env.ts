import * as THREE from 'three';

/**
 * Reflection environment for the metal and glass finishes: a dark indigo room with one warm gold panel,
 * one violet panel and a cool strip above. Built in code and pre-filtered once; no HDR file.
 */
export function buildEnvironment(renderer: THREE.WebGLRenderer, warm = '#ffd9a0', cool = '#8d7bd8'): THREE.Texture {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: '#0a0b22', side: THREE.BackSide })));
  const panel = (color: string, intensity: number, pos: [number, number, number], size: [number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(warm, 3.2, [-22, 8, 12], [16, 26]);
  panel(cool, 2.4, [24, 2, -6], [14, 30]);
  panel('#a9cdf0', 1.4, [0, 30, 0], [30, 8]);
  panel('#5d4bb0', 1.0, [0, -26, 6], [40, 40]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  return tex;
}
