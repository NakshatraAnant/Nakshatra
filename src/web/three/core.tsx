import { Component, createContext, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';
import { AdaptiveDpr, Html, PerformanceMonitor } from '@react-three/drei';
import type { ComponentProps } from 'react';
import { prefersReducedMotion } from '../lib/session';
import { reportClientError } from '../lib/api';
import { getGraphicsLevel, onGraphicsChange, profileFor } from './quality';

/** Performance budget for all scenes (documented in docs/3D_EXPERIENCE_SPECIFICATION.md). */
/**
 * DOM labels inside scenes are portalled into an overlay element that React renders empty and never reconciles.
 * Without this, drei's <Html> appends into the canvas container React owns, and client-side navigation can
 * remove that container first, causing "removeChild: not a child of this node" errors.
 */
const OverlayCtx = createContext<React.RefObject<HTMLDivElement | null> | null>(null);
export function Label3D(props: ComponentProps<typeof Html>) {
  const overlay = useContext(OverlayCtx);
  return <Html {...props} portal={(overlay ?? undefined) as React.RefObject<HTMLElement> | undefined} />;
}

export const BUDGET = { maxStars: { high: 6000, medium: 3500, low: 1500 }, maxDpr: 1.75, targetFps: 50 } as const;
export type Quality = 'high' | 'medium' | 'low';

let webglCache: boolean | null = null;
export function webglAvailable(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement('canvas');
    webglCache = Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export function initialQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const small = window.innerWidth < 640;
  if (cores <= 4 || mem <= 3) return 'low';
  if (small || cores <= 6) return 'medium';
  return 'high';
}

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: Error) {
    reportClientError('webgl_scene', err.message);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** True while the element is on screen and the tab is visible — used to pause rendering. */
function useOnScreen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let inView = true;
    const update = () => setVisible(inView && document.visibilityState === 'visible');
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); }, { threshold: 0.01 });
    io.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  return [ref, visible];
}

export interface SceneProps extends Omit<CanvasProps, 'children'> {
  children: (q: { quality: Quality; reducedMotion: boolean; density: number }) => ReactNode;
  fallback: ReactNode;
  label: string;
  className?: string;
  /** Force the 2D fallback (user preference). */
  disabled?: boolean;
}

/**
 * Guarded canvas: WebGL capability detection, error boundary with 2D fallback,
 * reduced-motion (render on demand), visibility-aware pausing, adaptive DPR and
 * quality step-down via PerformanceMonitor. Three.js resources created inside
 * scenes are disposed automatically by react-three-fiber on unmount.
 */
export function Scene3D({ children, fallback, label, className, disabled, camera, ...rest }: SceneProps) {
  const [ref, visible] = useOnScreen<HTMLDivElement>();
  const [level, setLevel] = useState(() => getGraphicsLevel());
  useEffect(() => onGraphicsChange(() => setLevel(getGraphicsLevel())), []);
  const profile = profileFor(level);
  const [quality, setQuality] = useState<Quality>(() => profile.tier ?? initialQuality());
  useEffect(() => { setQuality(profile.tier ?? initialQuality()); }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  const [contextLost, setContextLost] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  // Eco draws on demand, exactly like reduced motion: a still scene with no idle GPU work.
  const reduced = prefersReducedMotion() || profile.onDemand;
  // GPU resets, driver crashes or too many contexts: switch to the 2D view instead of a frozen canvas.
  if (disabled || !webglAvailable() || contextLost) return <>{fallback}</>;
  return (
    <div ref={ref} className={className} role="group" aria-roledescription="3D scene" aria-label={label} data-scene-quality={quality} data-scene-level={level}>
      <OverlayCtx.Provider value={overlay}>
      <div className="relative h-full w-full">
      <SceneErrorBoundary fallback={fallback}>
        <Canvas
          dpr={[1, profile.maxDpr]}
          frameloop={!visible ? 'never' : reduced ? 'demand' : 'always'}
          gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', alpha: true }}
          camera={camera ?? { position: [0, 0, 8], fov: 50 }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              reportClientError('webgl_context_lost', label);
              setContextLost(true);
            }, { once: true });
          }}
          {...rest}
        >
          {profile.adaptive && <PerformanceMonitor onDecline={() => setQuality((q) => (q === 'high' ? 'medium' : 'low'))} flipflops={3} />}
          <AdaptiveDpr pixelated={false} />
          <Suspense fallback={null}>{children({ quality, reducedMotion: reduced, density: profile.density })}</Suspense>
        </Canvas>
      </SceneErrorBoundary>
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
      </div>
      </OverlayCtx.Provider>
    </div>
  );
}

export { mulberry32 } from '../lib/random';

export function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
