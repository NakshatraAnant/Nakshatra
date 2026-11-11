import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D, mulberry32 } from './core';
import { Nebula, Starfield } from './elements';
import { REVEAL_LENGTH, worldFor, type ArchetypeWorld, type WorldForm } from './archetypeWorlds';

/**
 * The identity scene engine. One component draws every archetype's world from its data (archetypeWorlds.ts):
 *
 *  - five rings, one per identity dimension; each ring's weight follows how strong that score is, and a marker
 *    sits on the ring at the score's position (left = low pole, right = high pole);
 *  - the archetype's shell (form + build + motion) around the sigil artwork, which stays in the page as an image;
 *  - what orbits it (satellites, particles), and — only when the stored result is a blend — the secondary
 *    archetype's shell as a companion whose size follows the stored blend weight.
 *
 * Nothing is random per visit: every layout value is seeded from the archetype key. The reveal is a timeline
 * over the same scene (rings → shell → companions → rest); skip and reduced motion show the finished state.
 */
export interface IdentitySceneData {
  archetypeKey: string;
  accent: string;
  dimensions: { key: string; name: string; score: number }[];
  blend: { secondaryKey: string; accent: string; primaryWeight: number } | null;
}

type Clock = { t: number; idle: number };
const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const span = (t: number, from: number, to: number) => ease((t - from) / (to - from));

function formGeometry(form: WorldForm, r: number): THREE.BufferGeometry {
  switch (form) {
    case 'octahedron': return new THREE.OctahedronGeometry(r * 1.05, 0);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(r, 0);
    case 'tetrahedron': return new THREE.TetrahedronGeometry(r * 1.2, 0);
    case 'knot': return new THREE.TorusKnotGeometry(r * 0.72, r * 0.07, 96, 6, 2, 3);
    case 'sphere': return new THREE.SphereGeometry(r, 20, 12);
    case 'prism': return new THREE.CylinderGeometry(r * 0.72, r * 0.72, r * 1.9, 6, 1);
    case 'lattice': return new THREE.BoxGeometry(r * 1.45, r * 1.45, r * 1.45, 3, 3, 3);
    default: return new THREE.IcosahedronGeometry(r, 0);
  }
}

/** The archetype's shell. Geometry and materials are created once per (form, build, colour) and disposed on unmount. */
function Shell({ world, accent, radius, clock, animate, appearAt, opacityScale = 1 }: { world: ArchetypeWorld; accent: string; radius: number; clock: React.RefObject<Clock>; animate: boolean; appearAt: [number, number]; opacityScale?: number }) {
  const group = useRef<THREE.Group>(null);
  const { solid, lines, fill, stroke } = useMemo(() => {
    const solid = formGeometry(world.form, radius);
    // Curved or subdivided forms read best as a full wireframe; flat-faced forms as clean edges.
    const lines = ['sphere', 'knot', 'lattice'].includes(world.form) ? new THREE.WireframeGeometry(solid) : new THREE.EdgesGeometry(solid);
    const c = new THREE.Color(accent);
    const fill = world.build === 'wire' ? null : new THREE.MeshStandardMaterial({
      color: c.clone().multiplyScalar(world.build === 'glass' ? 0.9 : 0.55), emissive: c, emissiveIntensity: world.build === 'glass' ? 0.28 : 0.14,
      transparent: true, opacity: (world.build === 'glass' ? 0.08 : 0.15) * opacityScale, flatShading: world.build === 'facets', metalness: world.build === 'glass' ? 0.1 : 0.4,
      roughness: world.build === 'glass' ? 0.08 : 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    const stroke = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: (world.build === 'wire' ? 0.75 : world.build === 'facets' ? 0.5 : 0.3) * opacityScale });
    return { solid, lines, fill, stroke };
  }, [world.form, world.build, accent, radius, opacityScale]);
  useEffect(() => () => { solid.dispose(); lines.dispose(); fill?.dispose(); stroke.dispose(); }, [solid, lines, fill, stroke]);
  const base = useRef({ fill: fill?.opacity ?? 0, stroke: stroke.opacity });
  useEffect(() => { base.current = { fill: fill?.opacity ?? 0, stroke: stroke.opacity }; }, [fill, stroke]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { t, idle } = clock.current;
    const a = span(t, appearAt[0], appearAt[1]);
    let scale = 0.2 + 0.8 * a;
    // Arrives turning, settles into its own motion.
    let ry = (1 - a) * Math.PI * 1.5;
    let rx = world.tilt, rz = 0, flick = 1;
    if (animate) {
      switch (world.motion) {
        case 'spin': ry += idle * 0.35; break;
        case 'drift': ry += idle * 0.08; rx += Math.sin(idle * 0.2) * 0.08; break;
        case 'pulse': scale *= 1 + 0.045 * Math.sin(idle * 2.1); ry += idle * 0.05; break;
        case 'sway': rz = Math.sin(idle * 0.6) * 0.16; ry += idle * 0.04; break;
        case 'flicker': flick = 0.78 + 0.22 * Math.sin(idle * 7.3) * Math.sin(idle * 2.9); ry += idle * 0.2; break;
        case 'breathe': scale *= 1 + 0.025 * Math.sin(idle * 0.9); ry += idle * 0.05; break;
      }
    }
    g.scale.setScalar(scale);
    g.rotation.set(rx, ry, rz);
    stroke.opacity = base.current.stroke * a * flick;
    if (fill) fill.opacity = base.current.fill * a * flick;
  });
  return (
    <group ref={group}>
      {fill && <mesh geometry={solid} material={fill} />}
      <lineSegments geometry={lines} material={stroke} />
    </group>
  );
}

/** One ring per dimension. Thickness and brightness follow |score|; the marker shows where the score sits. */
function DimensionRings({ data, clock, selected, onSelect }: { data: IdentitySceneData; clock: React.RefObject<Clock>; selected: string | null; onSelect?: (key: string) => void }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { invalidate(); }, [selected, invalidate]);
  useFrame(() => {
    data.dimensions.forEach((_, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = span(clock.current.t, i * 0.4, i * 0.4 + 0.9);
      g.scale.setScalar(0.5 + 0.5 * a);
      g.visible = a > 0.001;
    });
  });
  return (
    <>
      {data.dimensions.map((d, i) => {
        const strength = Math.min(1, Math.abs(d.score));
        const on = selected === d.key;
        const dim = selected !== null && !on;
        const radius = 2.95 + i * 0.3;
        // Score −1…+1 → marker from the far left of the ring to the far right, over the top.
        const angle = Math.PI / 2 - Math.max(-1, Math.min(1, d.score)) * (Math.PI / 2);
        const tilt = (i - 2) * 0.2;
        return (
          <group key={d.key} ref={(el) => { refs.current[i] = el; }} rotation={[tilt, 0, (i - 2) * 0.12]}>
            <mesh onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(d.key); } : undefined}>
              <torusGeometry args={[radius, on ? 0.034 : 0.01 + strength * 0.018, 8, 160]} />
              <meshBasicMaterial color={on ? '#f2ece1' : data.accent} transparent opacity={dim ? 0.1 : on ? 0.95 : 0.18 + strength * 0.5} />
            </mesh>
            <mesh position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]} onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(d.key); } : undefined}>
              <sphereGeometry args={[on ? 0.13 : 0.085, 16, 12]} />
              <meshBasicMaterial color={on ? '#f2ece1' : data.accent} transparent opacity={dim ? 0.25 : 1} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

const PARTICLES = { dust: { n: 140, size: 0.035, speed: 0.02, spread: 5.2 }, motes: { n: 90, size: 0.06, speed: 0.05, spread: 4.4 }, sparks: { n: 70, size: 0.05, speed: 0.16, spread: 4.0 }, embers: { n: 80, size: 0.07, speed: 0.07, spread: 3.6 } } as const;

function Companions({ world, accent, seed, clock, animate, density }: { world: ArchetypeWorld; accent: string; seed: number; clock: React.RefObject<Clock>; animate: boolean; density: number }) {
  const sats = useRef<THREE.Group>(null);
  const pts = useRef<THREE.Points>(null);
  const cfg = PARTICLES[world.particles];
  const { geom, mat, orbits } = useMemo(() => {
    const rand = mulberry32(seed);
    const n = Math.round(cfg.n * density);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 2.6 + rand() * cfg.spread, th = rand() * Math.PI * 2, u = rand() * 2 - 1, s = Math.sqrt(1 - u * u);
      // Embers gather low and rise; the others fill a shell.
      pos.set([r * s * Math.cos(th), world.particles === 'embers' ? -2 + rand() * 4 : r * u * 0.7, r * s * Math.sin(th) * 0.6], i * 3);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: accent, size: cfg.size, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const orbits = Array.from({ length: world.satellites }, (_, i) => ({ r: 2.45 + rand() * 0.35, phase: (i / Math.max(1, world.satellites)) * Math.PI * 2, tilt: (rand() - 0.5) * 1.1, size: 0.07 + rand() * 0.06, speed: 0.25 + rand() * 0.25 }));
    return { geom, mat, orbits };
  }, [seed, cfg, density, accent, world.particles, world.satellites]);
  useEffect(() => () => { geom.dispose(); mat.dispose(); }, [geom, mat]);
  useFrame(() => {
    const { t, idle } = clock.current;
    const a = span(t, 3.6, 4.8);
    mat.opacity = 0.75 * a;
    if (pts.current && animate) pts.current.rotation.y = idle * cfg.speed;
    if (sats.current) {
      sats.current.visible = a > 0.001;
      sats.current.children.forEach((child, i) => {
        const o = orbits[i];
        const ang = o.phase + (animate ? idle * o.speed : 0);
        child.position.set(Math.cos(ang) * o.r * a, Math.sin(ang) * o.r * Math.sin(o.tilt) * a, Math.sin(ang) * o.r * Math.cos(o.tilt) * a);
      });
    }
  });
  return (
    <>
      <points ref={pts} geometry={geom} material={mat} />
      <group ref={sats}>
        {orbits.map((o, i) => (
          <mesh key={i}>
            <sphereGeometry args={[o.size, 12, 10]} />
            <meshBasicMaterial color={accent} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** The secondary archetype of a blended result: its own shell, sized by the stored blend weight, in slow orbit. */
function BlendCompanion({ blend, clock, animate }: { blend: NonNullable<IdentitySceneData['blend']>; clock: React.RefObject<Clock>; animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  const world = useMemo(() => ({ ...worldFor(blend.secondaryKey), build: 'wire' as const }), [blend.secondaryKey]);
  // primaryWeight 0.5 → an equal partner (0.62 of the main shell); 0.6 → clearly the smaller one.
  const size = 0.3 + (1 - blend.primaryWeight) * 0.65;
  useFrame(() => {
    if (!g.current) return;
    const { t, idle } = clock.current;
    const a = span(t, 3.6, 4.8);
    const ang = 0.6 + (animate ? idle * 0.12 : 0);
    const r = 3.3 + (1 - a) * 5;
    g.current.position.set(Math.cos(ang) * r, 0.9 * Math.sin(ang * 0.7), Math.sin(ang) * r * 0.45);
    g.current.visible = a > 0.001;
  });
  return (
    <group ref={g} scale={size}>
      <Shell world={world} accent={blend.accent} radius={1.5} clock={clock} animate={animate} appearAt={[3.6, 4.8]} />
    </group>
  );
}

function Timeline({ clock, intro, skip, animate, onStage }: { clock: React.RefObject<Clock>; intro: boolean; skip: boolean; animate: boolean; onStage?: (t: number) => void }) {
  const camera = useThree((s) => s.camera);
  const last = useRef(-1);
  useFrame((_, dt) => {
    const c = clock.current;
    const step = Math.min(dt, 0.05);
    if (!intro || skip || !animate) c.t = REVEAL_LENGTH;
    else if (c.t < REVEAL_LENGTH) c.t = Math.min(REVEAL_LENGTH, c.t + step);
    if (animate) c.idle += step;
    // One slow push-in while the scene assembles.
    camera.position.z = 12.5 - 3 * span(c.t, 0, 4.8);
    const whole = Math.floor(c.t * 4);
    if (onStage && whole !== last.current) { last.current = whole; onStage(c.t); }
  });
  return null;
}

export function IdentityScene3D({ data, intro = false, runId = 0, skip = false, selected = null, onSelect, onStage, label, fallback, className = 'h-full w-full' }: {
  data: IdentitySceneData; intro?: boolean; runId?: number; skip?: boolean; selected?: string | null; onSelect?: (key: string) => void;
  onStage?: (t: number) => void; label: string; fallback: React.ReactNode; className?: string;
}) {
  const world = worldFor(data.archetypeKey);
  const seed = useMemo(() => [...data.archetypeKey].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7), [data.archetypeKey]);
  const clock = useRef<Clock>({ t: 0, idle: 0 });
  // A replay restarts the same deterministic timeline.
  useEffect(() => { clock.current = { t: 0, idle: 0 }; }, [runId, data.archetypeKey]);
  return (
    <Scene3D label={label} fallback={fallback} className={className} camera={{ position: [0, 0, 12.5], fov: 50 }}>
      {({ quality, reducedMotion, density }) => (
        <>
          <ambientLight intensity={0.5} />
          <pointLight position={[4, 5, 6]} intensity={40} color="#f3e4c0" />
          <pointLight position={[-5, -3, 4]} intensity={18} color={data.accent} />
          <Timeline clock={clock} intro={intro} skip={skip} animate={!reducedMotion} onStage={onStage} />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={46} seed={seed % 997} animate={!reducedMotion} />
          <Nebula intensity={0.5} />
          <DimensionRings data={data} clock={clock} selected={selected} onSelect={onSelect} />
          <Shell world={world} accent={data.accent} radius={2.5} clock={clock} animate={!reducedMotion} appearAt={[2.2, 3.6]} />
          <Companions world={world} accent={data.accent} seed={seed} clock={clock} animate={!reducedMotion} density={density} />
          {data.blend && <BlendCompanion blend={data.blend} clock={clock} animate={!reducedMotion} />}
        </>
      )}
    </Scene3D>
  );
}
