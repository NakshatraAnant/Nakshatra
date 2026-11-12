import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D } from './core';
import { Nebula, Starfield } from './elements';

/**
 * The Year in Review film's stage: twelve months on a ring, each a column of light as tall as that month's
 * activity. The camera follows the beat the page is on — wide for the opening, highlights and close; turning to
 * a month when a beat is about that month. The page drives the beats; this scene only follows.
 */
const R = 3.4;
const TAU = Math.PI * 2;
const angleOf = (m: number) => (m / 12) * TAU - Math.PI / 2;

function Months({ months, focus, animate }: { months: number[]; focus: number | null; animate: boolean }) {
  const max = Math.max(1, ...months);
  const geo = useMemo(() => ({ col: new THREE.CylinderGeometry(0.16, 0.2, 1, 8), base: new THREE.CircleGeometry(0.3, 20) }), []);
  useEffect(() => () => { geo.col.dispose(); geo.base.dispose(); }, [geo]);
  const cols = useRef<(THREE.Mesh | null)[]>([]);
  const grow = useRef(animate ? 0 : 1);
  useFrame((_, dt) => {
    if (grow.current < 1) grow.current = Math.min(1, grow.current + Math.min(dt, 0.05) / 2);
    cols.current.forEach((c, i) => {
      if (!c) return;
      const k = Math.max(0, Math.min(1, grow.current * 2 - i / 12));
      const h = 0.06 + (months[i] / max) * 2.6;
      c.scale.y = Math.max(0.001, h * (1 - Math.pow(1 - k, 3)));
      c.position.y = c.scale.y / 2;
    });
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R - 0.02, R + 0.02, 96]} />
        <meshBasicMaterial color="#d9b26f" transparent opacity={0.3} />
      </mesh>
      {months.map((n, i) => {
        const a = angleOf(i), on = focus === i;
        const color = on ? '#ffffff' : n ? '#d9b26f' : '#3c4078';
        return (
          <group key={i} position={[Math.cos(a) * R, 0, Math.sin(a) * R]}>
            <mesh geometry={geo.base} rotation={[-Math.PI / 2, 0, 0]}><meshBasicMaterial color={color} transparent opacity={on ? 0.5 : 0.18} /></mesh>
            <mesh ref={(el) => { cols.current[i] = el; }} geometry={geo.col}>
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={on ? 0.9 : 0.35} transparent opacity={focus !== null && !on ? 0.4 : 0.9} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Wide: high and back. Focused: low, just outside the ring, looking across at that month. */
function Camera({ focus, animate }: { focus: number | null; animate: boolean }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const want = useMemo(() => {
    if (focus === null) return { pos: new THREE.Vector3(0, 5.2, 8.2), look: new THREE.Vector3(0, 0.4, 0) };
    const a = angleOf(focus);
    return { pos: new THREE.Vector3(Math.cos(a) * 9.8, 3.4, Math.sin(a) * 9.8), look: new THREE.Vector3(Math.cos(a) * R * 0.6, 1, Math.sin(a) * R * 0.6) };
  }, [focus]);
  const look = useRef(new THREE.Vector3(0, 0.4, 0));
  useEffect(() => { invalidate(); }, [focus, invalidate]);
  useFrame((_, dt) => {
    const k = animate ? Math.min(1, Math.min(dt, 0.05) * 2.2) : 1;
    camera.position.lerp(want.pos, k);
    look.current.lerp(want.look, k);
    camera.lookAt(look.current);
    if (animate && camera.position.distanceTo(want.pos) > 0.01) invalidate();
  });
  return null;
}

export function YearFilm3D({ months, focus, label, fallback }: { months: number[]; focus: number | null; label: string; fallback: React.ReactNode }) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 5.2, 8.2], fov: 46 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.55} />
          <pointLight position={[0, 6, 0]} intensity={50} color="#f3e4c0" />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={46} seed={101} animate={!reducedMotion} />
          <Nebula intensity={0.45} />
          <Months months={months} focus={focus} animate={!reducedMotion} />
          <Camera focus={focus} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}
