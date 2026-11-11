import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D } from './core';
import { Nebula, Starfield } from './elements';
import { bridgeLayout, type Bridge } from '../lib/bridges';

/**
 * Compatibility visualiser: you on the left, the other person on the right, and one bridge between you for each
 * compatibility dimension. A bridge's thickness and brightness follow that dimension's own score (0–100); the
 * dimensions are never merged into one figure. A light travels each bridge, faster on the stronger ones.
 */
const YOU = '#f3e4c0';
const THEM = '#b9adf0';

function Bridges({ bridges, selected, onSelect, animate }: { bridges: Bridge[]; selected: string | null; onSelect: (key: string) => void; animate: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { invalidate(); }, [selected, invalidate]);
  const placed = useMemo(() => bridgeLayout(bridges), [bridges]);
  const built = useMemo(() => placed.map((b) => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...b.from), new THREE.Vector3(...b.control), new THREE.Vector3(...b.to));
    const tube = new THREE.TubeGeometry(curve, 48, b.width, 6, false);
    // A wider invisible tube makes thin bridges easy to tap.
    const hit = new THREE.TubeGeometry(curve, 24, 0.16, 4, false);
    return { curve, tube, hit };
  }), [placed]);
  useEffect(() => () => built.forEach((b) => { b.tube.dispose(); b.hit.dispose(); }), [built]);
  const sparks = useRef<(THREE.Mesh | null)[]>([]);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (animate) t.current += Math.min(dt, 0.05);
    placed.forEach((b, i) => {
      const m = sparks.current[i];
      if (!m) return;
      const u = animate ? (t.current * (0.08 + 0.32 * b.strength) + i * 0.17) % 1 : 0.5;
      m.position.copy(built[i].curve.getPoint(u));
    });
  });
  return (
    <>
      {placed.map((b, i) => {
        const on = b.key === selected;
        const dim = selected !== null && !on;
        return (
          <group key={b.key}>
            <mesh geometry={built[i].tube} onClick={(e) => { e.stopPropagation(); onSelect(b.key); }}>
              <meshBasicMaterial color={on ? '#ffffff' : YOU} transparent opacity={dim ? 0.08 : on ? 0.95 : 0.15 + 0.7 * b.strength} />
            </mesh>
            <mesh geometry={built[i].hit} visible={false} onClick={(e) => { e.stopPropagation(); onSelect(b.key); }} />
            <mesh ref={(el) => { sparks.current[i] = el; }}>
              <sphereGeometry args={[on ? 0.09 : 0.06, 10, 8]} />
              <meshBasicMaterial color={on ? '#ffffff' : THEM} transparent opacity={dim ? 0.15 : 1} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Body({ x, color, animate }: { x: number; color: string; animate: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (ref.current && animate) ref.current.scale.setScalar(1 + 0.03 * Math.sin(s.clock.elapsedTime * 1.2 + x)); });
  return (
    <group position={[x, 0, 0]}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.55, 32, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 2.3, 0, 0]}>
        <torusGeometry args={[0.85, 0.012, 6, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

export function CompatibilityBridges3D({ bridges, selected, onSelect, label, fallback }: { bridges: Bridge[]; selected: string | null; onSelect: (key: string) => void; label: string; fallback: React.ReactNode }) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 1.2, 8.6], fov: 44 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.6} />
          <pointLight position={[0, 4, 6]} intensity={40} color="#f3e4c0" />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={46} seed={53} animate={!reducedMotion} />
          <Nebula intensity={0.35} />
          <Body x={-3.2} color={YOU} animate={!reducedMotion} />
          <Body x={3.2} color={THEM} animate={!reducedMotion} />
          <Bridges bridges={bridges} selected={selected} onSelect={onSelect} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}
