import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D } from './core';
import { Nebula, Starfield } from './elements';
import { HUB_RADIUS as R, hubAngles, type HubGame } from '../lib/hub';

/**
 * Game hub: every game is a planet on one ring, grouped by category (each category keeps its own colour and arc
 * of the ring). Games you are playing right now carry a moon per live session. Choosing a planet does exactly
 * what choosing the game card does — it opens that game's rules.
 */
const TAU = Math.PI * 2;

function Planets({ games, selected, onSelect, animate }: { games: HubGame[]; selected: string | null; onSelect: (key: string) => void; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const moons = useRef<(THREE.Group | null)[]>([]);
  const turn = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { invalidate(); }, [selected, invalidate]);
  const angles = useMemo(() => hubAngles(games), [games]);
  const geo = useMemo(() => ({ planet: new THREE.IcosahedronGeometry(0.42, 2), moon: new THREE.SphereGeometry(0.08, 10, 8), ring: new THREE.TorusGeometry(0.66, 0.015, 6, 48) }), []);
  useEffect(() => () => { geo.planet.dispose(); geo.moon.dispose(); geo.ring.dispose(); }, [geo]);
  const idx = games.findIndex((g) => g.key === selected);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    if (idx >= 0) {
      const want = -angles[idx] + Math.PI / 2;
      let d = (want - turn.current) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      turn.current = animate ? turn.current + d * Math.min(1, step * 5) : want;
      if (animate && Math.abs(d) > 0.001) invalidate();
    } else if (animate) turn.current += step * 0.05;
    if (group.current) group.current.rotation.y = turn.current;
    if (animate) moons.current.forEach((m, i) => { if (m) m.rotation.y += step * (0.8 + (i % 3) * 0.2); });
  });
  return (
    <group ref={group} position={[0, -0.2, -1]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R, 0.01, 6, 160]} />
        <meshBasicMaterial color="#d9b26f" transparent opacity={0.25} />
      </mesh>
      {games.map((g, i) => {
        const on = g.key === selected;
        return (
          <group key={g.key} position={[Math.cos(angles[i]) * R, 0, Math.sin(angles[i]) * R]} scale={on ? 1.45 : 1}>
            <mesh geometry={geo.planet} onClick={(e) => { e.stopPropagation(); onSelect(g.key); }}>
              <meshStandardMaterial color={g.color} emissive={g.color} emissiveIntensity={on ? 0.6 : 0.25} flatShading roughness={0.6} />
            </mesh>
            {on && <mesh geometry={geo.ring} rotation={[Math.PI / 2.2, 0, 0]}><meshBasicMaterial color="#f2ece1" /></mesh>}
            {g.live > 0 && (
              <group ref={(el) => { moons.current[i] = el; }}>
                {Array.from({ length: Math.min(g.live, 4) }, (_, k) => (
                  <mesh key={k} geometry={geo.moon} position={[Math.cos((k / Math.min(g.live, 4)) * TAU) * 0.7, 0.12, Math.sin((k / Math.min(g.live, 4)) * TAU) * 0.7]}>
                    <meshBasicMaterial color="#f2ece1" />
                  </mesh>
                ))}
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

export function GameHub3D({ games, selected, onSelect, label, fallback }: { games: HubGame[]; selected: string | null; onSelect: (key: string) => void; label: string; fallback: React.ReactNode }) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 3.8, 8.4], fov: 46 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.55} />
          <pointLight position={[0, 5, 5]} intensity={60} color="#f3e4c0" />
          <pointLight position={[-6, -2, 2]} intensity={20} color="#8d7bd8" />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={46} seed={71} animate={!reducedMotion} />
          <Nebula intensity={0.4} />
          <Planets games={games} selected={selected} onSelect={onSelect} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}
