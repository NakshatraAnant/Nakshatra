import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D, mulberry32 } from './core';
import { Nebula } from './elements';
import { INTRO_LENGTH, phase } from '../lib/intro';

/**
 * The introduction's stage (timeline in lib/intro.ts). One point cloud does everything, in one draw call: the
 * particles wake as loose dust, gather into a constellation, widen, then converge into a ring — the portal.
 * A single light is there from the first frame. The page owns the clock and passes the start time, so the words
 * on screen and this scene stay in step.
 */
const N = 720;
const ANCHORS: [number, number, number][] = [[-3.4, 1.6, 0], [-1.8, 2.4, -0.6], [-0.4, 1.1, 0.4], [1.2, 2.0, -0.3], [3.0, 1.2, 0.2], [2.2, -0.6, -0.4], [0.5, -1.5, 0.3], [-1.6, -0.9, -0.2], [-3.0, -1.8, 0.5]];
const LINKS: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [2, 7], [2, 6]];

function Cloud({ startedAt, still }: { startedAt: number; still: boolean }) {
  const camera = useThree((s) => s.camera);
  const built = useMemo(() => {
    const rand = mulberry32(1107);
    const dust = new Float32Array(N * 3), star = new Float32Array(N * 3), ring = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 5 + rand() * 9, th = rand() * Math.PI * 2, u = rand() * 2 - 1, s = Math.sqrt(1 - u * u);
      dust.set([r * s * Math.cos(th), r * u * 0.6, r * s * Math.sin(th) * 0.5], i * 3);
      // Constellation: most particles sit along the links, the rest gather at the anchors.
      if (i % 3) {
        const [a, b] = LINKS[i % LINKS.length], k = rand();
        star.set([ANCHORS[a][0] + (ANCHORS[b][0] - ANCHORS[a][0]) * k + (rand() - 0.5) * 0.12, ANCHORS[a][1] + (ANCHORS[b][1] - ANCHORS[a][1]) * k + (rand() - 0.5) * 0.12, ANCHORS[a][2] + (ANCHORS[b][2] - ANCHORS[a][2]) * k], i * 3);
      } else {
        const a = ANCHORS[i % ANCHORS.length], j = 0.28;
        star.set([a[0] + (rand() - 0.5) * j, a[1] + (rand() - 0.5) * j, a[2] + (rand() - 0.5) * j], i * 3);
      }
      const ang = (i / N) * Math.PI * 2, rr = 2.3 + (rand() - 0.5) * 0.35;
      ring.set([Math.cos(ang) * rr, Math.sin(ang) * rr, (rand() - 0.5) * 0.3], i * 3);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dust), 3));
    const mat = new THREE.PointsMaterial({ color: '#f3e4c0', size: 0.07, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const core = new THREE.MeshBasicMaterial({ color: '#fff4dd', transparent: true, opacity: 0 });
    const gate = new THREE.MeshBasicMaterial({ color: '#d9b26f', transparent: true, opacity: 0 });
    const frame = new THREE.LineBasicMaterial({ color: '#b9adf0', transparent: true, opacity: 0 });
    const frameGeom = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1));
    return { dust, star, ring, geom, mat, core, gate, frame, frameGeom };
  }, []);
  useEffect(() => () => { built.geom.dispose(); built.frameGeom.dispose(); built.mat.dispose(); built.core.dispose(); built.gate.dispose(); built.frame.dispose(); }, [built]);
  const group = useRef<THREE.Group>(null);
  const shell = useRef<THREE.LineSegments>(null);
  useFrame(() => {
    const t = still ? INTRO_LENGTH : Math.min(INTRO_LENGTH, (performance.now() - startedAt) / 1000);
    const wake = phase(t, 2, 4), form = phase(t, 4, 6), widen = phase(t, 6, 9), gather = phase(t, 9, 11), settle = phase(t, 11, 13);
    const pos = built.geom.getAttribute('position') as THREE.BufferAttribute;
    const out = pos.array as Float32Array;
    const spread = 1 + widen * 0.45 * (1 - gather);
    for (let i = 0; i < N * 3; i++) {
      const drift = built.dust[i] * (1 + 0.04 * Math.sin(t * 0.6 + i));
      const a = drift + (built.star[i] * spread - drift) * form;
      out[i] = a + (built.ring[i] - a) * gather;
    }
    pos.needsUpdate = true;
    built.mat.opacity = 0.9 * wake;
    // The single light: there from the start, swallowed by the portal, back as its heart.
    built.core.opacity = Math.min(1, phase(t, 0.2, 1.6)) * (1 - form * 0.7) + gather * 0.6;
    built.gate.opacity = gather * 0.9;
    built.frame.opacity = widen * 0.35 * (1 - gather * 0.6);
    if (group.current) group.current.rotation.z = gather * 0.4 + settle * 0.15 + (still ? 0 : t * 0.01);
    if (shell.current) { shell.current.rotation.y = t * 0.12; shell.current.scale.setScalar(2.6 + widen * 1.6); }
    camera.position.z = 15 - 4.5 * phase(t, 3, 11);
  });
  return (
    <>
      <mesh material={built.core}><sphereGeometry args={[0.22, 20, 14]} /></mesh>
      <group ref={group}>
        <points geometry={built.geom} material={built.mat} />
        <mesh material={built.gate}><torusGeometry args={[2.3, 0.03, 8, 120]} /></mesh>
      </group>
      <lineSegments ref={shell} geometry={built.frameGeom} material={built.frame} />
    </>
  );
}

export function IntroScene3D({ startedAt, still, fallback }: { startedAt: number; still: boolean; fallback: React.ReactNode }) {
  return (
    <Scene3D label="A single light becomes a constellation, then a gateway." fallback={fallback} className="h-full w-full" camera={{ position: [0, 0, 15], fov: 50 }}>
      {() => (
        <>
          <Nebula intensity={0.5} />
          <Cloud startedAt={startedAt} still={still} />
        </>
      )}
    </Scene3D>
  );
}
