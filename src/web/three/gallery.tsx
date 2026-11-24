import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D } from './core';
import { Nebula, Starfield } from './elements';

/**
 * Achievement gallery: every achievement is a medallion on one slow carousel. Earned medallions are gold with
 * their constellation engraved; the rest stay dark until earned. Selecting one (from the page list or by
 * tapping it) turns the carousel to bring it to the front. Geometry and materials are shared across medallions.
 */
export interface GalleryItem { key: string; title: string; earned: boolean; points: number[][] }

const RADIUS = 5;
const TAU = Math.PI * 2;

function engraving(points: number[][]): THREE.BufferGeometry {
  const maxX = Math.max(...points.map((p) => p[0]), 1);
  const maxY = Math.max(...points.map((p) => p[1]), 1);
  const xy = points.map(([x, y]) => [(x / maxX - 0.5) * 0.5, (0.5 - y / maxY) * 0.5]);
  const seg: number[] = [];
  for (let i = 1; i < xy.length; i++) seg.push(xy[i - 1][0], xy[i - 1][1], 0.05, xy[i][0], xy[i][1], 0.05);
  // A single point still shows as a star.
  if (xy.length === 1) seg.push(xy[0][0], xy[0][1], 0.05, xy[0][0], xy[0][1], 0.05);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  return g;
}

function Carousel({ items, selected, onSelect, animate }: { items: GalleryItem[]; selected: string | null; onSelect: (key: string) => void; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const turn = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  const shared = useMemo(() => ({
    disc: new THREE.CylinderGeometry(0.42, 0.42, 0.07, 40),
    halo: new THREE.TorusGeometry(0.5, 0.018, 8, 48),
    gold: new THREE.MeshStandardMaterial({ color: '#c39a51', metalness: 0.85, roughness: 0.32, emissive: '#5a3f12', emissiveIntensity: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2d5c', metalness: 0.4, roughness: 0.7, transparent: true, opacity: 0.7 }),
    inkLine: new THREE.LineBasicMaterial({ color: '#1a1408' }),
    paleLine: new THREE.LineBasicMaterial({ color: '#9a98b8', transparent: true, opacity: 0.45 }),
    inkDot: new THREE.PointsMaterial({ color: '#1a1408', size: 0.07 }),
    paleDot: new THREE.PointsMaterial({ color: '#9a98b8', size: 0.06, transparent: true, opacity: 0.5 }),
    haloMat: new THREE.MeshBasicMaterial({ color: '#f2ece1' }),
  }), []);
  const engravings = useMemo(() => items.map((it) => engraving(it.points)), [items]);
  useEffect(() => () => { Object.values(shared).forEach((r) => r.dispose()); }, [shared]);
  useEffect(() => () => { engravings.forEach((g) => g.dispose()); }, [engravings]);
  useEffect(() => { invalidate(); }, [selected, invalidate]);

  const index = selected ? items.findIndex((i) => i.key === selected) : -1;
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const step = Math.min(dt, 0.05);
    if (index >= 0) {
      // Shortest way round to bring the chosen medallion to the front.
      const target = (index / items.length) * TAU - Math.PI / 2;
      let d = (target - turn.current) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      turn.current = animate ? turn.current + d * Math.min(1, step * 5) : target;
      if (animate && Math.abs(d) > 0.001) invalidate();
    } else if (animate) turn.current += step * 0.1;
    g.rotation.y = turn.current;
  });

  return (
    <group ref={group} position={[0, 0.7, -2.4]}>
      {items.map((it, i) => {
        const a = (i / items.length) * TAU;
        const on = it.key === selected;
        return (
          <group key={it.key} position={[Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS]} rotation={[0, Math.PI / 2 - a, 0]} scale={on ? 2 : 1}>
            <mesh geometry={shared.disc} material={it.earned ? shared.gold : shared.dark} rotation={[Math.PI / 2, 0, 0]} onClick={(e) => { e.stopPropagation(); onSelect(it.key); }} />
            <lineSegments geometry={engravings[i]} material={it.earned ? shared.inkLine : shared.paleLine} />
            <points geometry={engravings[i]} material={it.earned ? shared.inkDot : shared.paleDot} />
            {on && <mesh geometry={shared.halo} material={shared.haloMat} />}
          </group>
        );
      })}
    </group>
  );
}

export function AchievementGallery3D({ items, selected, onSelect, label, fallback }: { items: GalleryItem[]; selected: string | null; onSelect: (key: string) => void; label: string; fallback: React.ReactNode }) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 3.6, 8.8], fov: 46 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.7} />
          <pointLight position={[0, 4, 9]} intensity={90} color="#f3e4c0" />
          <pointLight position={[-6, -2, 2]} intensity={25} color="#8d7bd8" />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={46} seed={29} animate={!reducedMotion} />
          <Nebula intensity={0.4} />
          <Carousel items={items} selected={selected} onSelect={onSelect} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}
