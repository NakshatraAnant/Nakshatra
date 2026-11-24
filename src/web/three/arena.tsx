import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D } from './core';
import { Nebula, Starfield } from './elements';
import { arenaLayout, seasonLayout, seasonPoint, seasonProgress, type ArenaRun, type SeasonStop } from '../lib/arena';

/* ======================= Tournament arena ======================= */

/**
 * Finished runs as pillars of light: the podium in front, everyone else on an arc behind. Pillars rise into
 * place once; yours is the bright one. It shows exactly the standings below it, nothing more.
 */
function Pillars({ runs, questions, animate }: { runs: ArenaRun[]; questions: number; animate: boolean }) {
  const placed = useMemo(() => arenaLayout(runs, questions), [runs, questions]);
  const geo = useMemo(() => ({ pillar: new THREE.CylinderGeometry(0.28, 0.32, 1, 6), step: new THREE.CylinderGeometry(0.62, 0.7, 0.18, 6), cap: new THREE.OctahedronGeometry(0.16, 0) }), []);
  useEffect(() => () => { geo.pillar.dispose(); geo.step.dispose(); geo.cap.dispose(); }, [geo]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(animate ? 0 : 1);
  useFrame((s, dt) => {
    if (t.current < 1) t.current = Math.min(1, t.current + Math.min(dt, 0.05) / 1.4);
    placed.forEach((p, i) => {
      const g = refs.current[i];
      if (!g) return;
      // Podium first, then the rest, each rising a beat after the one before.
      const k = Math.max(0, Math.min(1, t.current * 1.6 - i * 0.04));
      const e = 1 - Math.pow(1 - k, 3);
      g.scale.set(1, Math.max(0.001, e), 1);
      const cap = g.children[1];
      if (cap && animate) cap.rotation.y = s.clock.elapsedTime * 0.8;
    });
  });
  return (
    <group position={[0, -1.4, 0]}>
      {placed.map((p, i) => {
        const color = p.you ? '#f3e4c0' : p.rank === 1 ? '#d9b26f' : p.rank === 2 ? '#c9c5d8' : p.rank === 3 ? '#c27c54' : '#6c6a8f';
        return (
          <group key={i} position={[p.x, 0, p.z]}>
            {p.podium && <mesh geometry={geo.step} position={[0, 0.09, 0]}><meshStandardMaterial color="#2a2d5c" metalness={0.6} roughness={0.4} /></mesh>}
            <group ref={(el) => { refs.current[i] = el; }}>
              <mesh geometry={geo.pillar} position={[0, p.height / 2 + 0.18, 0]} scale={[1, p.height, 1]}>
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={p.you ? 0.7 : 0.3} transparent opacity={p.you ? 0.95 : 0.75} roughness={0.5} />
              </mesh>
              <mesh geometry={geo.cap} position={[0, p.height + 0.45, 0]}>
                <meshBasicMaterial color={color} />
              </mesh>
            </group>
          </group>
        );
      })}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.8]}>
        <ringGeometry args={[2.2, 4.9, 64, 1, 0, Math.PI]} />
        <meshBasicMaterial color="#d9b26f" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function TournamentArena3D({ runs, questions, label, fallback }: { runs: ArenaRun[]; questions: number; label: string; fallback: React.ReactNode }) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 1.6, 8.2], fov: 46 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.6} />
          <pointLight position={[0, 6, 5]} intensity={70} color="#f3e4c0" />
          <spotLight position={[0, 8, 2]} angle={0.5} penumbra={0.8} intensity={60} color="#f3e4c0" />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={46} seed={83} animate={!reducedMotion} />
          <Nebula intensity={0.35} />
          <Pillars runs={runs} questions={questions} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}

/* ======================= Season path ======================= */

/**
 * The season as a rising path: one world per milestone, lit once claimed, ringed while its reward is waiting.
 * A comet marks your season points along the path. Colours come from the season, never from who you are.
 */
function Path({ stops, points, color, animate }: { stops: SeasonStop[]; points: number; color: string; animate: boolean }) {
  const placed = useMemo(() => seasonLayout(stops), [stops]);
  const target = seasonProgress(points, stops);
  const line = useMemo(() => {
    const pts = Array.from({ length: 81 }, (_, i) => new THREE.Vector3(...seasonPoint(i / 80)));
    const all = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.3, dashSize: 0.12, gapSize: 0.1 }));
    all.computeLineDistances();
    const done = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.filter((_, i) => i / 80 <= target + 1e-6)), new THREE.LineBasicMaterial({ color }));
    return { all, done };
  }, [target, color]);
  useEffect(() => () => { for (const l of [line.all, line.done]) { l.geometry.dispose(); (l.material as THREE.Material).dispose(); } }, [line]);
  const comet = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const t = useRef(animate ? 0 : target);
  useFrame((s, dt) => {
    if (t.current < target) t.current = Math.min(target, t.current + Math.min(dt, 0.05) * 0.4);
    if (comet.current) comet.current.position.set(...seasonPoint(t.current));
    if (animate) rings.current.forEach((r) => { if (r) r.scale.setScalar(1 + 0.12 * Math.sin(s.clock.elapsedTime * 3)); });
  });
  return (
    <group position={[0, 0.2, 0]}>
      <primitive object={line.all} />
      <primitive object={line.done} />
      <mesh position={seasonPoint(0)}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {placed.map((p, i) => (
        <group key={p.at} position={[p.x, p.y, p.z]}>
          <mesh>
            <icosahedronGeometry args={[0.32, 1]} />
            <meshStandardMaterial color={p.claimed || p.reached ? color : '#3c4078'} emissive={color} emissiveIntensity={p.claimed ? 0.8 : p.reached ? 0.45 : 0.05} flatShading />
          </mesh>
          {p.claimable && (
            <mesh ref={(el) => { rings.current[i] = el; }} rotation={[Math.PI / 2.2, 0, 0]}>
              <torusGeometry args={[0.52, 0.025, 6, 40]} />
              <meshBasicMaterial color="#f2ece1" />
            </mesh>
          )}
        </group>
      ))}
      <group ref={comet}>
        <mesh>
          <sphereGeometry args={[0.14, 14, 10]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <pointLight intensity={6} distance={3} color="#ffffff" />
      </group>
    </group>
  );
}

export function SeasonPath3D({ stops, points, color, label, fallback }: { stops: SeasonStop[]; points: number; color: string; label: string; fallback: React.ReactNode }) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 0.5, 6.8], fov: 46 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.6} />
          <pointLight position={[3, 5, 6]} intensity={40} color="#f3e4c0" />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={46} seed={97} animate={!reducedMotion} />
          <Nebula intensity={0.45} />
          <Path stops={stops} points={points} color={color} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}
