import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BUDGET, cssVar, mulberry32, type Quality, Label3D } from './core';

/* ---------------- Starfield (single draw call, custom twinkle shader) ---------------- */

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.65 + 0.35 * sin(uTime * 0.8 + aPhase);
    vAlpha = tw;
    gl_PointSize = aSize * uPixelRatio * (60.0 / -mv.z);
  }
`;
const starFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * vAlpha);
  }
`;

export function Starfield({ quality, radius = 60, seed = 7, animate = true }: { quality: Quality; radius?: number; seed?: number; animate?: boolean }) {
  const count = BUDGET.maxStars[quality];
  const { gl } = useThree();
  const geom = useMemo(() => {
    const rand = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform points on a thick spherical shell.
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = radius * (0.45 + rand() * 0.55);
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
      size[i] = 0.6 + Math.pow(rand(), 3) * 3.2;
      phase[i] = rand() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, [count, radius, seed]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: starVertex, fragmentShader: starFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) }, uColor: { value: new THREE.Color('#f3eee2') } },
  }), [gl]);
  useEffect(() => () => { geom.dispose(); mat.dispose(); }, [geom, mat]);
  const ref = useRef<THREE.Points>(null);
  useFrame((_, dt) => {
    if (!animate) return;
    mat.uniforms.uTime.value += dt;
    if (ref.current) ref.current.rotation.y += dt * 0.004;
  });
  return <points ref={ref} geometry={geom} material={mat} />;
}

/* ---------------- Nebula (soft additive sprites from a canvas gradient) ---------------- */

function gradientTexture(inner: string, outer: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Nebula({ intensity = 1 }: { intensity?: number }) {
  const textures = useMemo(() => [
    gradientTexture('rgba(141,123,216,0.55)', 'rgba(141,123,216,0)'),
    gradientTexture('rgba(111,168,220,0.35)', 'rgba(111,168,220,0)'),
    gradientTexture('rgba(217,178,111,0.28)', 'rgba(217,178,111,0)'),
  ], []);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  const clouds: [number, number, number, number, number][] = [[-14, 6, -30, 40, 0], [16, -8, -36, 46, 1], [4, 12, -42, 34, 2], [-6, -12, -28, 28, 0]];
  return (
    <group>
      {clouds.map(([x, y, z, s, ti], i) => (
        <sprite key={i} position={[x, y, z]} scale={[s, s, 1]}>
          <spriteMaterial map={textures[ti]} transparent depthWrite={false} opacity={0.75 * intensity} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

/* ---------------- Orbital rings & emblem ---------------- */

export function OrbitRing({ radius, color = '#d9b26f', opacity = 0.35, tilt = 0, width = 0.012 }: { radius: number; color?: string; opacity?: number; tilt?: number; width?: number }) {
  return (
    <mesh rotation={[Math.PI / 2 + tilt, 0, 0]}>
      <torusGeometry args={[radius, width, 8, 192]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

export const THEME_COLORS: Record<string, { a: string; b: string; c: string }> = {
  midnight: { a: '#d9b26f', b: '#8d7bd8', c: '#6fa8dc' },
  dawn: { a: '#ecb98a', b: '#c98a96', c: '#f3eee2' },
  aurora: { a: '#7fb69a', b: '#6fa8dc', c: '#b9adf0' },
  saffron: { a: '#e9a23b', b: '#c27c54', c: '#f3d49b' },
  nebula: { a: '#b9adf0', b: '#c98a96', c: '#6fa8dc' },
  eclipse: { a: '#f3eee2', b: '#3c4078', c: '#d9b26f' },
};

export function Emblem({ theme = 'midnight', emblem = 'orbit', spin = true, scale = 1 }: { theme?: string; emblem?: string; spin?: boolean; scale?: number }) {
  const colors = THEME_COLORS[theme] ?? THEME_COLORS.midnight;
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!spin) return;
    if (core.current) core.current.rotation.y += dt * 0.25;
    if (shell.current) { shell.current.rotation.z += dt * 0.08; shell.current.rotation.x += dt * 0.03; }
  });
  const petals = emblem === 'lotus' ? 8 : emblem === 'mandala' ? 12 : emblem === 'star' ? 5 : 0;
  return (
    <group scale={scale}>
      <mesh ref={core}>
        {emblem === 'crescent' ? <torusGeometry args={[0.55, 0.16, 24, 64, Math.PI * 1.35]} /> : <icosahedronGeometry args={[0.62, 1]} />}
        <meshStandardMaterial color={colors.a} emissive={colors.a} emissiveIntensity={0.35} metalness={0.6} roughness={0.25} flatShading />
      </mesh>
      <group ref={shell}>
        <mesh><icosahedronGeometry args={[0.95, 1]} /><meshBasicMaterial color={colors.b} wireframe transparent opacity={0.35} /></mesh>
        {Array.from({ length: petals }).map((_, i) => (
          <mesh key={i} rotation={[0, 0, (i / petals) * Math.PI * 2]} position={[Math.cos((i / petals) * Math.PI * 2) * 1.15, Math.sin((i / petals) * Math.PI * 2) * 1.15, 0]}>
            <coneGeometry args={[0.08, 0.32, 4]} />
            <meshStandardMaterial color={colors.c} emissive={colors.c} emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
      <pointLight color={colors.a} intensity={6} distance={6} />
    </group>
  );
}

export function SceneLights() {
  const key = cssVar('--light-key', '#f3e4c0');
  const fill = cssVar('--light-fill', '#6c62c8');
  const rim = cssVar('--light-rim', '#6fa8dc');
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 6, 4]} intensity={1.4} color={key} />
      <directionalLight position={[-6, -2, -3]} intensity={0.6} color={fill} />
      <pointLight position={[0, 0, -6]} intensity={2} color={rim} distance={20} />
    </>
  );
}

/* ---------------- Zodiac ring with calculated markers ---------------- */

export interface RingMarker { id: string; label: string; glyph: string; longitude: number; color?: string; emphasis?: boolean }

const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

/**
 * A diagrammatic zodiac ring. Markers sit at their calculated ecliptic longitude
 * (0° Aries at the left, counter-clockwise, as in a conventional chart wheel).
 * Radial distance is symbolic — it does not represent physical distance.
 */
export function ZodiacRing({ markers, radius = 3, onSelect, selected, startLongitude = 0, labels = true }: { markers: RingMarker[]; radius?: number; onSelect?: (id: string) => void; selected?: string | null; startLongitude?: number; labels?: boolean }) {
  const toXY = (lon: number, r: number): [number, number] => {
    const a = ((lon - startLongitude + 180) * Math.PI) / 180;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const ticks = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = toXY(i * 30, radius * 0.86);
      const [x2, y2] = toXY(i * 30, radius * 1.08);
      pts.push(x1, y1, 0, x2, y2, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
    // toXY is derived from radius and startLongitude, which are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, startLongitude]);
  useEffect(() => () => ticks.dispose(), [ticks]);
  return (
    <group>
      <mesh><ringGeometry args={[radius * 0.86, radius * 1.08, 128]} /><meshBasicMaterial color="#d9b26f" transparent opacity={0.07} side={THREE.DoubleSide} /></mesh>
      <mesh><torusGeometry args={[radius * 1.08, 0.008, 6, 192]} /><meshBasicMaterial color="#d9b26f" transparent opacity={0.6} /></mesh>
      <mesh><torusGeometry args={[radius * 0.86, 0.006, 6, 192]} /><meshBasicMaterial color="#d9b26f" transparent opacity={0.35} /></mesh>
      <lineSegments geometry={ticks}><lineBasicMaterial color="#d9b26f" transparent opacity={0.4} /></lineSegments>
      {labels && SIGN_GLYPHS.map((g, i) => {
        const [x, y] = toXY(i * 30 + 15, radius * 0.97);
        return <Label3D key={g} position={[x, y, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}><span className="font-display text-[15px] text-[var(--accent)] opacity-80 select-none">{g}</span></Label3D>;
      })}
      {markers.map((m, i) => {
        const r = radius * (0.55 - (i % 3) * 0.08);
        const [x, y] = toXY(m.longitude, r);
        const [xe, ye] = toXY(m.longitude, radius * 0.86);
        const isSel = selected === m.id;
        return (
          <group key={m.id}>
            <Line from={[x, y, 0]} to={[xe, ye, 0]} color={m.color ?? '#a9a6bd'} opacity={isSel ? 0.9 : 0.35} />
            <mesh position={[x, y, 0]} onClick={(e) => { e.stopPropagation(); onSelect?.(m.id); }} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
              <sphereGeometry args={[m.emphasis ? 0.14 : 0.1, 20, 20]} />
              <meshStandardMaterial color={m.color ?? '#f3eee2'} emissive={m.color ?? '#f3eee2'} emissiveIntensity={isSel ? 1.4 : 0.6} />
            </mesh>
            {labels && (
              <Label3D position={[x * 1.12, y * 1.12, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'auto' }}>
                <button type="button" onClick={() => onSelect?.(m.id)} className={`whitespace-nowrap rounded-full px-1.5 text-[13px] font-semibold ${isSel ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text)]'}`} aria-label={`${m.glyph} ${m.label}`}>
                  {m.glyph}
                </button>
              </Label3D>
            )}
          </group>
        );
      })}
    </group>
  );
}

export function Line({ from, to, color = '#ffffff', opacity = 1 }: { from: [number, number, number]; to: [number, number, number]; color?: string; opacity?: number }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...from, ...to], 3));
    return g;
  // Depend on coordinate values, not array identity, so inline tuples do not rebuild geometry every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <lineSegments geometry={geom}><lineBasicMaterial color={color} transparent opacity={opacity} /></lineSegments>;
}

/** Gentle pointer parallax for the camera; disabled under reduced motion. */
export function ParallaxRig({ strength = 0.6, children, enabled = true }: { strength?: number; children?: ReactNode; enabled?: boolean }) {
  const { camera, pointer } = useThree();
  const base = useRef(camera.position.clone());
  useFrame(() => {
    if (!enabled) return;
    camera.position.x += (base.current.x + pointer.x * strength - camera.position.x) * 0.04;
    camera.position.y += (base.current.y + pointer.y * strength * 0.6 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });
  return <>{children}</>;
}
