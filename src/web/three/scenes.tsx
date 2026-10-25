import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Scene3D, mulberry32, Label3D } from './core';
import { BOND_COLORS, layoutGraph, type GraphEdge, type GraphNode } from '../lib/graph';
import { Emblem, Line, Nebula, OrbitRing, ParallaxRig, SceneLights, Starfield, THEME_COLORS, ZodiacRing, type RingMarker } from './elements';

/* ======================= Landing: the Cosmic Universe ======================= */

function DecorativePlanets({ animate }: { animate: boolean }) {
  // Artistic orbits (not to scale, not real positions) — labelled as decorative in the UI.
  const planets = [
    { r: 3.2, size: 0.12, color: '#c27c54', speed: 0.22, phase: 0.4 },
    { r: 4.4, size: 0.18, color: '#d9b26f', speed: 0.14, phase: 2.1 },
    { r: 5.8, size: 0.26, color: '#8d7bd8', speed: 0.09, phase: 4.0 },
    { r: 7.2, size: 0.16, color: '#6fa8dc', speed: 0.06, phase: 5.2 },
  ];
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    if (!animate) return;
    planets.forEach((p, i) => {
      const m = refs.current[i];
      if (!m) return;
      const a = p.phase + clock.elapsedTime * p.speed;
      m.position.set(Math.cos(a) * p.r, Math.sin(a) * p.r * 0.32, Math.sin(a) * p.r * 0.6);
    });
  });
  return (
    <group rotation={[0.35, 0, 0.12]}>
      {planets.map((p, i) => (
        <group key={i}>
          <OrbitRing radius={p.r} opacity={0.12} />
          <mesh ref={(el) => { refs.current[i] = el; }} position={[p.r, 0, 0]}>
            <sphereGeometry args={[p.size, 32, 32]} />
            <meshStandardMaterial color={p.color} roughness={0.7} metalness={0.1} emissive={p.color} emissiveIntensity={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Constellations({ animate }: { animate: boolean }) {
  // Decorative constellation figures (stylised, not star-chart accurate).
  const figures = useMemo(() => {
    const rand = mulberry32(42);
    return Array.from({ length: 5 }, (_, f) => {
      const cx = (rand() - 0.5) * 30;
      const cy = (rand() - 0.5) * 16;
      const cz = -18 - rand() * 10;
      const pts: [number, number, number][] = Array.from({ length: 4 + Math.floor(rand() * 3) }, () => [cx + (rand() - 0.5) * 6, cy + (rand() - 0.5) * 4, cz]);
      return { key: f, pts };
    });
  }, []);
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (animate && g.current) g.current.rotation.z += dt * 0.004; });
  return (
    <group ref={g}>
      {figures.map((f) => (
        <group key={f.key}>
          {f.pts.slice(1).map((p, i) => <Line key={i} from={f.pts[i]} to={p} color="#d9b26f" opacity={0.22} />)}
          {f.pts.map((p, i) => <mesh key={i} position={p}><sphereGeometry args={[0.07, 8, 8]} /><meshBasicMaterial color="#f3eee2" /></mesh>)}
        </group>
      ))}
    </group>
  );
}

function EntranceDolly({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const t = useRef(0);
  useEffect(() => { if (enabled) camera.position.set(0, 1.2, 22); }, [camera, enabled]);
  useFrame((_, dt) => {
    if (!enabled || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 3.2);
    const e = 1 - Math.pow(1 - t.current, 3);
    camera.position.z = 22 - (22 - 10) * e;
    camera.position.y = 1.2 - 0.6 * e;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function CosmicUniverse({ fallback }: { fallback: React.ReactNode }) {
  return (
    <Scene3D label="An animated star field with orbiting decorative planets around the Nakshatra emblem" fallback={fallback} className="absolute inset-0" camera={{ position: [0, 0.6, 10], fov: 52 }}>
      {({ quality, reducedMotion }) => (
        <>
          <SceneLights />
          <Starfield quality={quality} animate={!reducedMotion} />
          <Nebula />
          <Constellations animate={!reducedMotion} />
          <DecorativePlanets animate={!reducedMotion} />
          <Emblem spin={!reducedMotion} scale={1.1} />
          <EntranceDolly enabled={!reducedMotion} />
          <ParallaxRig enabled={!reducedMotion} strength={0.8} />
        </>
      )}
    </Scene3D>
  );
}

/* ======================= Cosmic ID ======================= */

export interface IdSection { id: string; label: string; glyph: string; longitude: number; color: string }

export function CosmicIdScene({ theme, emblem, sections, selected, onSelect, fallback }: { theme: string; emblem: string; sections: IdSection[]; selected: string | null; onSelect: (id: string) => void; fallback: React.ReactNode }) {
  const colors = THEME_COLORS[theme] ?? THEME_COLORS.midnight;
  return (
    <Scene3D label="Your Cosmic ID emblem with your Sun, Moon and Ascendant placed on a zodiac ring at their calculated longitudes" fallback={fallback} className="h-full w-full" camera={{ position: [0, -1.5, 7.5], fov: 45 }}>
      {({ quality, reducedMotion }) => (
        <>
          <SceneLights />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={40} animate={!reducedMotion} seed={11} />
          <Emblem theme={theme} emblem={emblem} spin={!reducedMotion} />
          <group rotation={[-0.25, 0, 0]}>
            <ZodiacRing radius={3} markers={sections.map((s) => ({ ...s, color: s.color, emphasis: true }))} selected={selected} onSelect={onSelect} />
            <OrbitRing radius={3.6} color={colors.b} opacity={0.25} />
          </group>
          <OrbitControls enablePan={false} enableZoom={false} autoRotate={!reducedMotion && !selected} autoRotateSpeed={0.35} minPolarAngle={Math.PI / 3} maxPolarAngle={(2 * Math.PI) / 3} />
        </>
      )}
    </Scene3D>
  );
}

/* ======================= Chart explorer ======================= */

function FocusCamera({ target }: { target: [number, number, number] | null }) {
  const { camera } = useThree();
  const dest = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (target) dest.set(target[0] * 0.6, target[1] * 0.6 - 2.5, 6.5);
    else dest.set(0, -3.5, 8.5);
    camera.position.lerp(dest, 0.05);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function ChartWheel3D({ markers, ascendant, selected, onSelect, fallback }: { markers: RingMarker[]; ascendant: number | null; selected: string | null; onSelect: (id: string) => void; fallback: React.ReactNode }) {
  const start = ascendant ?? 0;
  const sel = markers.find((m) => m.id === selected);
  const target: [number, number, number] | null = sel ? [Math.cos(((sel.longitude - start + 180) * Math.PI) / 180) * 2, Math.sin(((sel.longitude - start + 180) * Math.PI) / 180) * 2, 0] : null;
  return (
    <Scene3D label="Diagrammatic chart wheel with calculated planetary longitudes. Distances from the centre are symbolic." fallback={fallback} className="h-full w-full" camera={{ position: [0, -3.5, 8.5], fov: 45 }}>
      {({ quality, reducedMotion }) => (
        <>
          <SceneLights />
          <Starfield quality="low" radius={35} animate={!reducedMotion && quality !== 'low'} seed={3} />
          <ZodiacRing radius={3.2} markers={markers} selected={selected} onSelect={onSelect} startLongitude={start} />
          {ascendant !== null && (
            <Label3D position={[-3.75, 0, 0]} center><span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--text-2)]">ASC</span></Label3D>
          )}
          <FocusCamera target={target} />
        </>
      )}
    </Scene3D>
  );
}

/* ======================= Bonds constellation graph ======================= */

export function BondsConstellation({ nodes, edges, selected, onSelect, fallback }: { nodes: GraphNode[]; edges: GraphEdge[]; selected: string | null; onSelect: (edgeId: string | null) => void; fallback: React.ReactNode }) {
  const pos = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);
  return (
    <Scene3D label={`A constellation of your ${edges.length} Bonds. Use the list below for keyboard access.`} fallback={fallback} className="h-full w-full" camera={{ position: [0, 0, 11], fov: 50 }} onPointerMissed={() => onSelect(null)}>
      {({ reducedMotion }) => (
        <>
          <SceneLights />
          <Starfield quality="low" radius={40} animate={!reducedMotion} seed={21} />
          {edges.map((e) => {
            const a = pos.get(e.source);
            const b = pos.get(e.target);
            if (!a || !b) return null;
            return <Line key={e.id} from={a} to={b} color={BOND_COLORS[e.kind] ?? '#a9a6bd'} opacity={selected === e.id ? 1 : e.status === 'active' || e.status === 'private' ? 0.55 : 0.2} />;
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const edge = edges.find((e) => (e.target === n.id || e.source === n.id) && !n.self);
            return (
              <group key={n.id} position={p}>
                <mesh onClick={(ev) => { ev.stopPropagation(); if (edge) onSelect(edge.id); }}>
                  <sphereGeometry args={[n.self ? 0.32 : 0.2, 24, 24]} />
                  <meshStandardMaterial color={n.self ? '#d9b26f' : n.external ? '#a9a6bd' : '#f3eee2'} emissive={n.self ? '#d9b26f' : '#8d7bd8'} emissiveIntensity={n.self ? 0.7 : 0.3} />
                </mesh>
                <Label3D position={[0, -0.45, 0]} center zIndexRange={[20, 0]}>
                  <span className="whitespace-nowrap text-[12px] text-[var(--text-2)]">{n.label}</span>
                </Label3D>
              </group>
            );
          })}
          <OrbitControls enablePan={false} autoRotate={!reducedMotion && !selected} autoRotateSpeed={0.3} minDistance={6} maxDistance={18} />
        </>
      )}
    </Scene3D>
  );
}

/* ======================= Journey path ======================= */

export interface JourneyMarker { id: string; date: string; title: string; calculated: boolean }

export function JourneyPath3D({ markers, from, to, selected, onSelect, fallback }: { markers: JourneyMarker[]; from: string; to: string; selected: string | null; onSelect: (id: string) => void; fallback: React.ReactNode }) {
  const t0 = Date.parse(from);
  const span = Math.max(1, Date.parse(to) - t0);
  const curve = useMemo(() => {
    const pts = Array.from({ length: 64 }, (_, i) => {
      const u = i / 63;
      return new THREE.Vector3((u - 0.5) * 16, Math.sin(u * Math.PI * 2) * 1.2, Math.cos(u * Math.PI * 2) * 1.2);
    });
    return new THREE.CatmullRomCurve3(pts);
  }, []);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 256, 0.025, 8, false), [curve]);
  useEffect(() => () => tube.dispose(), [tube]);
  const today = Math.min(1, Math.max(0, (Date.now() - t0) / span));
  return (
    <Scene3D label="Your journey as a path through time. Gold markers are your entries; blue markers are calculated calendar events." fallback={fallback} className="h-full w-full" camera={{ position: [0, 3, 12], fov: 45 }}>
      {({ reducedMotion }) => (
        <>
          <SceneLights />
          <Starfield quality="low" radius={40} animate={!reducedMotion} seed={5} />
          <mesh geometry={tube}><meshBasicMaterial color="#d9b26f" transparent opacity={0.45} /></mesh>
          <mesh position={curve.getPoint(today)}><sphereGeometry args={[0.16, 24, 24]} /><meshStandardMaterial color="#f3eee2" emissive="#f3eee2" emissiveIntensity={1} /></mesh>
          <Label3D position={curve.getPoint(today).clone().add(new THREE.Vector3(0, 0.5, 0))} center><span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)]">Today</span></Label3D>
          {markers.map((m) => {
            const u = Math.min(1, Math.max(0, (Date.parse(m.date) - t0) / span));
            const p = curve.getPoint(u);
            const isSel = selected === m.id;
            return (
              <mesh key={m.id} position={[p.x, p.y + (m.calculated ? -0.35 : 0.35), p.z]} onClick={(e) => { e.stopPropagation(); onSelect(m.id); }}>
                {m.calculated ? <octahedronGeometry args={[isSel ? 0.18 : 0.12]} /> : <sphereGeometry args={[isSel ? 0.18 : 0.12, 16, 16]} />}
                <meshStandardMaterial color={m.calculated ? '#6fa8dc' : '#d9b26f'} emissive={m.calculated ? '#6fa8dc' : '#d9b26f'} emissiveIntensity={isSel ? 1.2 : 0.5} />
              </mesh>
            );
          })}
          <OrbitControls enablePan enableZoom maxDistance={20} minDistance={4} />
        </>
      )}
    </Scene3D>
  );
}

/* ======================= Achievement medallion ======================= */

function medallionTexture(title: string, points: number[][], lit: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 110, 10, 128, 128, 128);
  g.addColorStop(0, lit ? '#f3d49b' : '#5f5c7a');
  g.addColorStop(1, lit ? '#8a6526' : '#2a2d5c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = lit ? 'rgba(26,20,8,0.75)' : 'rgba(243,238,226,0.3)';
  ctx.lineWidth = 3;
  const maxX = Math.max(...points.map((p) => p[0]), 1);
  const maxY = Math.max(...points.map((p) => p[1]), 1);
  ctx.beginPath();
  points.forEach(([x, y], i) => { const px = 64 + (x / maxX) * 128; const py = 60 + (y / maxY) * 90; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  points.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(64 + (x / maxX) * 128, 60 + (y / maxY) * 90, 6, 0, Math.PI * 2); ctx.fill(); });
  ctx.font = '600 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(title.slice(0, 18), 128, 205);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function MedallionMesh({ title, points, lit, unlocking, reducedMotion }: { title: string; points: number[][]; lit: boolean; unlocking: boolean; reducedMotion: boolean }) {
  const tex = useMemo(() => medallionTexture(title, points, lit), [title, points, lit]);
  useEffect(() => () => tex.dispose(), [tex]);
  const ref = useRef<THREE.Group>(null);
  const t = useRef(unlocking && !reducedMotion ? 0 : 1);
  const spin = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (t.current < 1) t.current = Math.min(1, t.current + dt / 1.4);
    const e = 1 - Math.pow(1 - t.current, 3);
    if (!reducedMotion) spin.current += dt * 0.4;
    ref.current.scale.setScalar(0.4 + 0.6 * e);
    // Unlock: a few fast turns that ease into a slow idle rotation.
    ref.current.rotation.y = (1 - e) * Math.PI * 4 + spin.current;
  });
  return (
    <group ref={ref}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.4, 1.4, 0.16, 64]} />
        <meshStandardMaterial attach="material-0" color={lit ? '#c39a51' : '#3c4078'} metalness={0.85} roughness={0.3} />
        <meshStandardMaterial attach="material-1" map={tex} metalness={0.5} roughness={0.45} />
        <meshStandardMaterial attach="material-2" map={tex} metalness={0.5} roughness={0.45} />
      </mesh>
    </group>
  );
}

export function Medallion3D({ title, points, lit, unlocking, fallback }: { title: string; points: number[][]; lit: boolean; unlocking?: boolean; fallback: React.ReactNode }) {
  return (
    <Scene3D label={`${title} medallion${lit ? '' : ' (locked)'}`} fallback={fallback} className="h-full w-full" camera={{ position: [0, 0, 4.2], fov: 45 }}>
      {({ reducedMotion }) => (
        <>
          <SceneLights />
          <MedallionMesh title={title} points={points} lit={lit} unlocking={Boolean(unlocking)} reducedMotion={reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}

/* ======================= Product viewer (only with a real model asset) ======================= */

function Model({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
}

export function ProductViewer3D({ modelUrl, fallback, title }: { modelUrl: string; fallback: React.ReactNode; title: string }) {
  const [ok] = useState(true);
  return (
    <Scene3D label={`3D model of ${title}. Drag to rotate, scroll or pinch to zoom.`} fallback={fallback} disabled={!ok} className="h-full w-full" camera={{ position: [0, 0.5, 3], fov: 40 }}>
      {() => (
        <>
          <SceneLights />
          <Model url={modelUrl} />
          <OrbitControls enablePan={false} minDistance={1.2} maxDistance={6} />
        </>
      )}
    </Scene3D>
  );
}
