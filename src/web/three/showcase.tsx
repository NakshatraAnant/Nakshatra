import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene3D } from './core';
import { Nebula, Starfield } from './elements';

/* ======================= Avatar stage ======================= */

/**
 * The avatar as a medallion on a plinth. Its face is the same picture as the 2D preview — an SVG built only
 * from the fixed option lists in shared/avatar.ts, never from user-supplied markup. Each change flips the
 * medallion once; at rest it sways gently and blinks now and then (or stays still with reduced motion). The blink is
 * the same avatar with its eyes closed, also built from the fixed options.
 */
/** Draw the SVG onto a canvas first: browsers upload rasterised canvases to WebGL reliably, SVG images less so. */
function useSvgTexture(src: string | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!src) { setTex(null); return; }
    let alive = true;
    let made: THREE.Texture | null = null;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!alive) return;
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      c.getContext('2d')?.drawImage(img, 0, 0, 512, 512);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      made = t;
      setTex(t);
      invalidate();
    };
    img.src = src;
    return () => { alive = false; made?.dispose(); };
  }, [src, invalidate]);
  return tex;
}

/** Seconds between blinks, and how long the eyes stay closed. */
export const BLINK_EVERY = 4.2;
export const BLINK_FOR = 0.14;

function Medallion({ src, blinkSrc, rim, animate }: { src: string; blinkSrc: string | null; rim: string; animate: boolean }) {
  const tex = useSvgTexture(src);
  const closed = useSvgTexture(animate ? blinkSrc : null);
  const face = useRef<THREE.MeshStandardMaterial>(null);
  const invalidate = useThree((s) => s.invalidate);
  const g = useRef<THREE.Group>(null);
  const flip = useRef(animate ? 0 : 1);
  useEffect(() => { flip.current = animate ? 0 : 1; invalidate(); }, [src, animate, invalidate]);
  useFrame((s, dt) => {
    if (!g.current) return;
    if (flip.current < 1) { flip.current = Math.min(1, flip.current + Math.min(dt, 0.05) / 0.7); invalidate(); }
    const e = 1 - Math.pow(1 - flip.current, 3);
    g.current.rotation.y = (1 - e) * Math.PI * 2 + (animate ? Math.sin(s.clock.elapsedTime * 0.6) * 0.35 : 0);
    g.current.position.y = 0.35 + (animate ? Math.sin(s.clock.elapsedTime * 1.1) * 0.06 : 0);
    if (face.current && tex) {
      const blinking = animate && closed !== null && flip.current >= 1 && s.clock.elapsedTime % BLINK_EVERY < BLINK_FOR;
      const want = blinking ? closed : tex;
      if (face.current.map !== want) { face.current.map = want; face.current.needsUpdate = true; }
    }
  });
  return (
    <group ref={g}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.32, 1.32, 0.14, 64, 1, true]} />
        <meshStandardMaterial color={rim} metalness={0.8} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.071]}>
        <circleGeometry args={[1.3, 64]} />
        <meshStandardMaterial ref={face} map={tex} color={tex ? '#ffffff' : '#3c4078'} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, -0.071]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[1.3, 64]} />
        <meshStandardMaterial color={rim} metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

export function AvatarStage3D({ src, blinkSrc = null, rim, label, fallback }: { src: string; blinkSrc?: string | null; rim: string; label: string; fallback: React.ReactNode }) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 0.3, 5.4], fov: 44 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.9} />
          <pointLight position={[2, 3, 4]} intensity={30} color="#fff4dd" />
          <pointLight position={[-3, -1, 2]} intensity={12} color={rim} />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={40} seed={113} animate={!reducedMotion} />
          <Medallion src={src} blinkSrc={blinkSrc} rim={rim} animate={!reducedMotion} />
          <mesh position={[0, -1.25, 0]}>
            <cylinderGeometry args={[0.9, 1.05, 0.22, 6]} />
            <meshStandardMaterial color="#2a2d5c" metalness={0.5} roughness={0.5} />
          </mesh>
        </>
      )}
    </Scene3D>
  );
}

/* ======================= Creator showcase ======================= */

export interface ShowcaseItem { id: string; kind: string; title: string; owned: boolean }

function kindGeometry(kind: string): THREE.BufferGeometry {
  switch (kind) {
    case 'membership': return new THREE.TorusGeometry(0.34, 0.11, 10, 32);
    case 'digital': return new THREE.BoxGeometry(0.5, 0.62, 0.08);
    case 'session': return new THREE.SphereGeometry(0.36, 20, 14);
    case 'workshop': return new THREE.ConeGeometry(0.38, 0.6, 6);
    case 'newsletter': return new THREE.OctahedronGeometry(0.4, 0);
    default: return new THREE.DodecahedronGeometry(0.36, 0);
  }
}

/**
 * A creator's offerings as objects on a slow carousel — one shape per kind of offering, so a membership never
 * looks like a download. Unlocked ones glow. Prices and buttons stay in the page; the scene sells nothing.
 */
function Carousel({ items, selected, onSelect, accent, animate }: { items: ShowcaseItem[]; selected: string | null; onSelect: (id: string) => void; accent: string; animate: boolean }) {
  const g = useRef<THREE.Group>(null);
  const turn = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  const geos = useMemo(() => Object.fromEntries([...new Set(items.map((i) => i.kind))].map((k) => [k, kindGeometry(k)])), [items]);
  useEffect(() => () => Object.values(geos).forEach((x) => x.dispose()), [geos]);
  useEffect(() => { invalidate(); }, [selected, invalidate]);
  const R = items.length === 1 ? 0 : Math.min(2.6, 0.9 + items.length * 0.3);
  const idx = items.findIndex((i) => i.id === selected);
  useFrame((s, dt) => {
    if (!g.current) return;
    const step = Math.min(dt, 0.05);
    if (idx >= 0) {
      const want = -(idx / items.length) * Math.PI * 2;
      let d = (want - turn.current) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      turn.current = animate ? turn.current + d * Math.min(1, step * 5) : want;
      if (animate && Math.abs(d) > 0.001) invalidate();
    } else if (animate) turn.current += step * 0.15;
    g.current.rotation.y = turn.current;
    if (animate) g.current.children.forEach((c, i) => { c.rotation.y = s.clock.elapsedTime * 0.5 + i; });
  });
  return (
    <group ref={g} position={[0, 0.1, 0]}>
      {items.map((it, i) => {
        const a = (i / items.length) * Math.PI * 2;
        const on = it.id === selected;
        const color = on ? '#ffffff' : it.owned ? accent : '#9a98b8';
        return (
          <mesh key={it.id} geometry={geos[it.kind]} position={[Math.sin(a) * R, 0, Math.cos(a) * R]} scale={on ? 1.4 : 1}
            onClick={(e) => { e.stopPropagation(); onSelect(it.id); }}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={it.owned || on ? 0.55 : 0.12} metalness={0.4} roughness={0.45} flatShading />
          </mesh>
        );
      })}
    </group>
  );
}

export function CreatorShowcase3D({ items, selected, onSelect, accent, label, fallback }: { items: ShowcaseItem[]; selected: string | null; onSelect: (id: string) => void; accent: string; label: string; fallback: React.ReactNode }) {
  return (
    <Scene3D label={label} fallback={fallback} className="h-full w-full" camera={{ position: [0, 3.4, 5.6], fov: 42 }}>
      {({ quality, reducedMotion }) => (
        <>
          <ambientLight intensity={0.6} />
          <pointLight position={[0, 4, 5]} intensity={45} color="#f3e4c0" />
          <pointLight position={[-4, -1, 2]} intensity={15} color={accent} />
          <Starfield quality={quality === 'high' ? 'medium' : 'low'} radius={40} seed={127} animate={!reducedMotion} />
          <Nebula intensity={0.35} />
          <Carousel items={items} selected={selected} onSelect={onSelect} accent={accent} animate={!reducedMotion} />
        </>
      )}
    </Scene3D>
  );
}
