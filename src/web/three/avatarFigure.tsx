import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D } from './core';
import { Starfield } from './elements';
import { AVATAR_COLORS, type AvatarConfig } from '../../shared/avatar';

/**
 * The Avatar Studio figure: a stylised character built entirely from code, from the same fixed options as the
 * drawn avatar (shared/avatar.ts) — no downloaded models, no member-supplied geometry. Head, hair, face, extras,
 * outfit and arms are separate parts, so each option changes one part.
 *
 * Asset slot: `Figure` is the only thing that knows the character is procedural. A licensed rigged model can
 * replace it later by rendering that model inside `AvatarFigure3D` instead (the stage, lighting, pose names and
 * the saved configuration stay the same).
 */
const INK = '#1f1a17';
const FACE_SCALE: Record<string, [number, number, number]> = { oval: [1, 1.08, 0.97], round: [1.07, 1, 1], long: [0.93, 1.17, 0.94] };
const R = 0.62;

function Hair({ kind, color }: { kind: string; color: string }) {
  const mat = <meshStandardMaterial color={color} roughness={0.75} />;
  const cap = (theta: number, scale = 1.045) => <mesh rotation={[-0.18, 0, 0]} scale={scale}><sphereGeometry args={[R, 32, 16, 0, Math.PI * 2, 0, Math.PI * theta]} />{mat}</mesh>;
  switch (kind) {
    case 'none': return null;
    case 'crop': return cap(0.36);
    case 'bun': return <>{cap(0.46)}<mesh position={[0, R * 1.12, -0.12]}><sphereGeometry args={[0.26, 20, 14]} />{mat}</mesh></>;
    case 'long': return <>{cap(0.5)}<mesh position={[0, -0.28, -0.26]} scale={[1.08, 1.45, 0.62]}><sphereGeometry args={[R * 0.98, 24, 16]} />{mat}</mesh></>;
    case 'waves': return <>{cap(0.5)}{[-1, 1].map((s) => <mesh key={s} position={[s * 0.5, -0.18, -0.12]} scale={[0.5, 1, 0.62]}><sphereGeometry args={[R * 0.8, 20, 14]} />{mat}</mesh>)}</>;
    case 'curly': return <>{cap(0.42)}{Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI; return <mesh key={i} position={[Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.86 + 0.06, -0.05 + (i % 2) * 0.12]}><sphereGeometry args={[0.2, 14, 10]} />{mat}</mesh>; })}</>;
    case 'headwrap': return <>{cap(0.5, 1.09)}<mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2 - 0.18, 0, 0]}><torusGeometry args={[R * 0.93, 0.05, 8, 40]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh></>;
    default: return cap(0.5);
  }
}

function Face({ c, hair, blink }: { c: AvatarConfig; hair: string; blink: React.RefObject<THREE.Group | null> }) {
  const z = R * 0.93;
  const eye = (x: number) => {
    if (c.eyes === 'round') return <group key={x} position={[x, 0.06, z]}><mesh><sphereGeometry args={[0.09, 16, 12]} /><meshStandardMaterial color="#ffffff" roughness={0.3} /></mesh><mesh position={[0, 0, 0.06]}><sphereGeometry args={[0.045, 12, 10]} /><meshBasicMaterial color={INK} /></mesh></group>;
    if (c.eyes === 'smile' || c.eyes === 'sleepy') return <mesh key={x} position={[x, 0.05, z + 0.02]} rotation={[0, 0, c.eyes === 'smile' ? 0 : Math.PI]}><torusGeometry args={[0.075, 0.018, 6, 16, Math.PI]} /><meshBasicMaterial color={INK} /></mesh>;
    return <mesh key={x} position={[x, 0.06, z + 0.02]}><sphereGeometry args={[0.05, 12, 10]} /><meshBasicMaterial color={INK} /></mesh>;
  };
  return (
    <>
      <group ref={blink}>{eye(-0.22)}{eye(0.22)}</group>
      {c.brows !== 'none' && [-1, 1].map((s) => <mesh key={s} position={[s * 0.22, 0.25, z - 0.01]} rotation={[0, 0, c.brows === 'arched' ? -s * 0.28 : 0]}><boxGeometry args={[0.17, 0.035, 0.03]} /><meshStandardMaterial color={hair} /></mesh>)}
      {c.mouth === 'smile' && <mesh position={[0, -0.2, z]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.13, 0.02, 6, 20, Math.PI]} /><meshBasicMaterial color={INK} /></mesh>}
      {c.mouth === 'grin' && <group position={[0, -0.17, z + 0.01]}><mesh rotation={[0, 0, Math.PI]}><circleGeometry args={[0.15, 20, 0, Math.PI]} /><meshBasicMaterial color={INK} /></mesh><mesh position={[0, -0.025, 0.005]}><planeGeometry args={[0.22, 0.04]} /><meshBasicMaterial color="#ffffff" /></mesh></group>}
      {c.mouth === 'neutral' && <mesh position={[0, -0.24, z]}><boxGeometry args={[0.2, 0.03, 0.02]} /><meshBasicMaterial color={INK} /></mesh>}
      {c.mouth === 'open' && <mesh position={[0, -0.24, z - 0.02]} scale={[1, 0.85, 0.5]}><sphereGeometry args={[0.085, 14, 10]} /><meshBasicMaterial color={INK} /></mesh>}
      {(c.accessory === 'glasses' || c.accessory === 'roundGlasses') && (
        <group position={[0, 0.06, z + 0.07]}>
          {[-0.22, 0.22].map((x) => <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, c.accessory === 'glasses' ? Math.PI / 4 : 0]}><torusGeometry args={[0.135, 0.016, 6, c.accessory === 'glasses' ? 4 : 24]} /><meshStandardMaterial color={INK} metalness={0.4} roughness={0.4} /></mesh>)}
          <mesh><boxGeometry args={[0.16, 0.018, 0.018]} /><meshStandardMaterial color={INK} /></mesh>
        </group>
      )}
      {c.accessory === 'earrings' && [-1, 1].map((s) => <mesh key={s} position={[s * R * 1.02, -0.22, 0]}><sphereGeometry args={[0.055, 12, 10]} /><meshStandardMaterial color="#e4ac59" metalness={0.85} roughness={0.25} /></mesh>)}
      {c.accessory === 'freckles' && [[-0.3, -0.05], [-0.22, -0.1], [-0.36, -0.11], [0.3, -0.05], [0.22, -0.1], [0.36, -0.11]].map(([x, y], i) => <mesh key={i} position={[x, y, Math.sqrt(Math.max(0, R * R - x * x - y * y)) * 0.99]}><circleGeometry args={[0.018, 8]} /><meshBasicMaterial color="#000000" transparent opacity={0.25} /></mesh>)}
    </>
  );
}

function Figure({ c, animate }: { c: AvatarConfig; animate: boolean }) {
  const skin = AVATAR_COLORS.skin[c.skin], hair = AVATAR_COLORS.hair[c.hairColor], outfit = AVATAR_COLORS.outfit[c.outfit];
  const root = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null), torso = useRef<THREE.Mesh>(null);
  const left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null), blink = useRef<THREE.Group>(null);
  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 }), [skin]);
  const clothMat = useMemo(() => new THREE.MeshStandardMaterial({ color: outfit, roughness: 0.8 }), [outfit]);
  useFrame((s) => {
    const t = animate ? s.clock.elapsedTime : 0;
    if (root.current) root.current.rotation.y = animate ? Math.sin(t * 0.5) * 0.3 : 0.2;
    if (torso.current) torso.current.scale.y = 1 + (animate ? Math.sin(t * 1.6) * 0.015 : 0);
    if (head.current) { head.current.rotation.z = animate ? Math.sin(t * 0.8) * 0.04 : 0; head.current.rotation.x = c.pose === 'think' ? 0.12 : 0; }
    if (blink.current) blink.current.scale.y = animate && t % 4.2 < 0.13 ? 0.1 : 1;
    // Poses: the same four names a rigged model would expose.
    const L = left.current, Rt = right.current;
    if (L && Rt) {
      L.rotation.set(0, 0, -0.16); Rt.rotation.set(0, 0, 0.16);
      if (c.pose === 'wave') Rt.rotation.set(0, 0, 2.5 + (animate ? Math.sin(t * 6) * 0.28 : 0));
      if (c.pose === 'hips') { L.rotation.set(0, 0, -0.75); Rt.rotation.set(0, 0, 0.75); }
      if (c.pose === 'think') Rt.rotation.set(-2.25, 0, -0.35);
    }
  });
  const arm = (side: number, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[side * 0.55, 0.36, 0]}>
      <mesh position={[0, -0.3, 0]} material={clothMat}><capsuleGeometry args={[0.115, 0.42, 6, 12]} /></mesh>
      <mesh position={[0, -0.63, 0]} material={skinMat}><sphereGeometry args={[0.12, 14, 10]} /></mesh>
    </group>
  );
  return (
    <group ref={root} position={[0, -0.55, 0]}>
      <mesh ref={torso} position={[0, -0.02, 0]} scale={[1.18, 1, 0.82]} material={clothMat}><capsuleGeometry args={[0.42, 0.5, 8, 20]} /></mesh>
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.05, 8, 24]} /><meshStandardMaterial color={outfit} roughness={0.6} /></mesh>
      <mesh position={[0, 0.58, 0]} material={skinMat}><cylinderGeometry args={[0.15, 0.17, 0.22, 16]} /></mesh>
      {arm(-1, left)}{arm(1, right)}
      <group ref={head} position={[0, 1.22, 0]} scale={FACE_SCALE[c.face] ?? FACE_SCALE.oval}>
        <mesh material={skinMat}><sphereGeometry args={[R, 40, 28]} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[s * R * 0.98, 0, 0]} scale={[0.5, 1, 0.8]} material={skinMat}><sphereGeometry args={[0.13, 12, 10]} /></mesh>)}
        <Hair kind={c.hair} color={hair} />
        <Face c={c} hair={hair} blink={blink} />
      </group>
    </group>
  );
}

export function AvatarFigure3D({ config, aura, label, fallback }: { config: AvatarConfig; aura: string | null; label: string; fallback: React.ReactNode }) {
  const bg = AVATAR_COLORS.background[config.background];
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 0.35, 5.2], fov: 40 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.85} />
          <directionalLight position={[2.5, 4, 5]} intensity={1.6} color="#fff4dd" />
          <pointLight position={[-3, 1, 2]} intensity={14} color={bg} />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={40} seed={131} animate={!reducedMotion} />
          {/* Stage: a disc in the chosen background colour, and the archetype's colour as a halo when there is one. */}
          <mesh position={[0, -1.52, 0]}><cylinderGeometry args={[1.25, 1.35, 0.14, 48]} /><meshStandardMaterial color={bg} roughness={0.5} metalness={0.2} /></mesh>
          {aura && <mesh position={[0, 0.55, -0.9]}><torusGeometry args={[1.25, 0.025, 8, 80]} /><meshBasicMaterial color={aura} transparent opacity={0.8} /></mesh>}
          <Figure c={config} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}
