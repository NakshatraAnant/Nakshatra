import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Celebrations (XP gained, quest done, badge unlocked). Non-blocking: a small card slides in near the
 * bottom of the screen, is announced politely to screen readers, and disappears on its own. Under
 * reduced motion it simply appears and disappears — no movement, no burst.
 */
interface Celebration { id: number; title: string; detail?: string; xp?: number }
const Ctx = createContext<(c: Omit<Celebration, 'id'>) => void>(() => undefined);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Celebration[]>([]);
  const seq = useRef(0);
  const celebrate = useCallback((c: Omit<Celebration, 'id'>) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { ...c, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <Ctx.Provider value={celebrate}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-8" aria-live="polite" role="status">
        {items.map((c) => (
          <div key={c.id} className="motion-celebrate relative flex items-center gap-3 overflow-visible rounded-[var(--radius-lg)] border border-accent/40 bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-md">
            <span className="motion-burst pointer-events-none absolute -left-2 -top-2 h-10 w-10 rounded-full border-2 border-accent/60" aria-hidden="true" />
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 text-accent" aria-hidden="true">✦</span>
            <div>
              <p className="text-sm font-semibold text-fg">{c.title}</p>
              {c.detail && <p className="text-xs text-fg-2">{c.detail}</p>}
            </div>
            {c.xp ? <span className="motion-xp ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink numeric">+{c.xp} XP</span> : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useCelebrate = () => useContext(Ctx);

/** Progress bar that fills once on mount (static under reduced motion). */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="motion-fill h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Re-keys children on change so the page-in motion runs on navigation. */
export function PageTransition({ k, children }: { k: string; children: ReactNode }) {
  const [key, setKey] = useState(k);
  useEffect(() => { setKey(k); }, [k]);
  return <div key={key} className="motion-page">{children}</div>;
}
