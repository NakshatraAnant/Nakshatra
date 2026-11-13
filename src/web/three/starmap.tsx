import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Scene3D } from './core';
import { Nebula, Starfield } from './elements';
import { RING_RADIUS, layoutStars, type MapStar } from '../lib/starmap';
import { environmentFor } from '../../shared/circleEnvironments';

/**
 * Star map scene (see lib/starmap.ts): a centre, three faint rings and the stars on them. Choosing a star turns
 * the map to bring it to the front. Sphere and ring geometry are shared; one material per colour.
 */
const TAU = Math.PI * 2;

function Orbits({ stars, centre, progress, selected, onSelect, animate }: { stars: MapStar[]; centre: string; progress: number | null; selected: string | null; onSelect: (id: string) => void; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const turn = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  const placed = useMemo(() => layoutStars(stars), [stars]);
  const res = useMemo(() => {
    const sphere = new THREE.SphereGeometry(0.16, 16, 12);
    const band = new THREE.TorusGeometry(0.27, 0.022, 6, 32);
    const pick = new THREE.TorusGeometry(0.4, 0.02, 6, 40);
    const white = new THREE.MeshBasicMaterial({ color: '#f2ece1' });
    const mats = new Map<string, THREE.MeshBasicMaterial>();
    const mat = (color: string, bright: boolean) => {
      const k = `${color}:${bright}`;
      if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ color, transparent: !bright, opacity: bright ? 1 : 0.38 }));
      return mats.get(k)!;
    };
    const pts: number[] = [];
    for (const p of placed) if (p.linked) pts.push(0, 0, 0, Math.cos(p.angle) * p.radius, p.lift, Math.sin(p.angle) * p.radius);
    const links = new THREE.BufferGeometry();
    links.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const linkMat = new THREE.LineBasicMaterial({ color: centre, transparent: true, opacity: 0.28 });
    const dispose = () => { sphere.dispose(); band.dispose(); pick.dispose(); white.dispose(); links.dispose(); linkMat.dispose(); mats.forEach((m) => m.dispose()); };
    return { sphere, band, pick, white, mat, links, linkMat, dispose };
  }, [placed, centre]);
  useEffect(() => () => res.dispose(), [res]);
  useEffect(() => { invalidate(); }, [selected, invalidate]);

  const target = placed.find((p) => p.id === selected);
  useFrame((_, dt) => {
    if (!group.current) return;
    const step = Math.min(dt, 0.05);
    if (target) {
      const want = target.angle - Math.PI / 2;
      let d = (want - turn.current) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      turn.current = animate ? turn.current + d * Math.min(1, step * 5) : want;
      if (animate && Math.abs(d) > 0.001) invalidate();
    } else if (animate) turn.current += step * 0.06;
    group.current.rotation.y = turn.current;
  });
  const used = [0, 1, 2].filter((r) => placed.some((p) => p.ring === r));
  // A small map (inner rings only) is drawn larger so it still fills the stage.
  const fit = Math.min(1.6, RING_RADIUS[2] / RING_RADIUS[used.length ? used[used.length - 1] : 0]);
  return (
    <group ref={group} position={[0, 0.3, -1.2]} scale={fit}>
      <mesh>
        <sphereGeometry args={[0.5, 24, 16]} />
        <meshBasicMaterial color={centre} />
      </mesh>
      {progress !== null && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.95, 0.05, 8, 64, Math.max(0.04, Math.min(1, progress)) * TAU]} />
          <meshBasicMaterial color={centre} />
        </mesh>
      )}
      {used.map((r) => (
        <mesh key={r} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RING_RADIUS[r], 0.008, 6, 128]} />
          <meshBasicMaterial color={centre} transparent opacity={0.22} />
        </mesh>
      ))}
      <lineSegments geometry={res.links} material={res.linkMat} />
      {placed.map((p) => {
        const on = p.id === selected;
        return (
          <group key={p.id} position={[Math.cos(p.angle) * p.radius, p.lift, Math.sin(p.angle) * p.radius]} scale={p.size * (on ? 1.5 : 1)}>
            <mesh geometry={res.sphere} material={on ? res.white : res.mat(p.color, p.bright)} onClick={(e) => { e.stopPropagation(); onSelect(p.id); }} />
            {(p.halo || on) && (
              <Billboard>
                {p.halo && <mesh geometry={res.band} material={res.mat(p.halo, true)} />}
                {on && <mesh geometry={res.pick} material={res.white} />}
              </Billboard>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Circle environments (shared/circleEnvironments.ts): one component, five configurations. Each adds a tinted sky
 * and a few shared-geometry props around the same star map, so the layout and interaction never change.
 */
function Environment({ kind, animate }: { kind: string; animate: boolean }) {
  const env = environmentFor(kind);
  const g = useRef<THREE.Group>(null);
  useFrame((s, dt) => {
    if (!g.current || !animate) return;
    if (env.key === 'islands') g.current.children.forEach((c, i) => { c.position.y = -1.2 + (i % 3) * 0.9 + Math.sin(s.clock.elapsedTime * 0.5 + i) * 0.15; });
    else g.current.rotation.y += Math.min(dt, 0.05) * (env.key === 'sanctuary' ? 0.05 : 0.02);
  });
  const mat = <meshBasicMaterial color={env.accent} transparent opacity={0.35} wireframe={env.key === 'observatory' || env.key === 'studio'} />;
  const around = (n: number, r: number) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + 0.4; return [Math.cos(a) * r, Math.sin(a) * r] as const; });
  return (
    <>
      <mesh><sphereGeometry args={[42, 24, 16]} /><meshBasicMaterial color={env.sky[1]} side={THREE.BackSide} transparent opacity={0.45} depthWrite={false} /></mesh>
      <group ref={g} position={[0, 0.3, -1.2]}>
        {env.key === 'observatory' && <><mesh><sphereGeometry args={[7.2, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2]} />{mat}</mesh><mesh rotation={[1.1, 0.3, 0]}><torusGeometry args={[6.2, 0.02, 6, 96]} /><meshBasicMaterial color={env.accent} transparent opacity={0.6} /></mesh></>}
        {env.key === 'garden' && around(9, 6.3).map(([x, z], i) => <group key={i} position={[x, -1.1, z]}><mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.02, 0.03, 1, 5]} /><meshBasicMaterial color="#3f8f5f" /></mesh><mesh position={[0, 1.1 + (i % 3) * 0.12, 0]}><icosahedronGeometry args={[0.22 + (i % 2) * 0.08, 0]} /><meshBasicMaterial color={env.accent} transparent opacity={0.85} /></mesh></group>)}
        {env.key === 'islands' && around(6, 6.6).map(([x, z], i) => <mesh key={i} position={[x, 0, z]}><cylinderGeometry args={[0.7 + (i % 2) * 0.3, 0.25, 0.4, 7]} /><meshStandardMaterial color="#3a5d78" emissive={env.accent} emissiveIntensity={0.18} flatShading /></mesh>)}
        {env.key === 'studio' && around(5, 6.2).map(([x, z], i) => <mesh key={i} position={[x, (i % 2) * 0.9, z]} rotation={[i * 0.4, i * 0.9, 0.2]}><boxGeometry args={[1.1, 1.5, 0.08]} />{mat}</mesh>)}
        {env.key === 'sanctuary' && [5.6, 6.4, 7.2].map((r, i) => <mesh key={r} rotation={[Math.PI / 2 + i * 0.25, i * 0.5, 0]}><torusGeometry args={[r, 0.018, 6, 120]} /><meshBasicMaterial color={env.accent} transparent opacity={0.5 - i * 0.1} /></mesh>)}
      </group>
    </>
  );
}

export function StarMap3D({ stars, centre, progress = null, selected, onSelect, label, fallback, environment = null }: {
  environment?: string | null;
  stars: MapStar[]; centre: string; progress?: number | null; selected: string | null; onSelect: (id: string) => void; label: string; fallback: React.ReactNode;
}) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 4.4, 9.2], fov: 46 }}>
      {({ quality, reducedMotion }) => (
        <>
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={46} seed={stars.length + 11} animate={!reducedMotion} />
          {environment ? <Environment kind={environment} animate={!reducedMotion} /> : <Nebula intensity={0.4} />}
          <Orbits stars={stars} centre={centre} progress={progress} selected={selected} onSelect={onSelect} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}
