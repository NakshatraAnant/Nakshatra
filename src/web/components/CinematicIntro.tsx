import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from './ui/primitives';
import { publicEvent } from '../lib/cosmic';
import { INTRO_LENGTH, INTRO_SCENES, introSceneAt, markIntroSeen } from '../lib/intro';

/* three.js stays behind this import: the landing page is usable before it arrives. */
const IntroScene3D = lazy(() => import('../three/intro').then((m) => ({ default: m.IntroScene3D })));

/** Without WebGL (or while the scene loads): the same story as a still — one light on a dark sky. */
function Still() {
  return <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 46%, rgba(243,228,192,0.28) 0, rgba(141,123,216,0.12) 18%, transparent 46%), #05060f' }} aria-hidden="true" />;
}

/**
 * The first-visit introduction, as an overlay over the already-loaded landing page. About fifteen seconds, silent,
 * with Skip always on screen (Escape works too). It ends on the invitation and waits there; nothing is forced.
 * `still` shows the final frame at once — used when someone replays it with reduced motion on.
 */
export function CinematicIntro({ still, onClose }: { still: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const startedAt = useRef(performance.now()).current;
  const [t, setT] = useState(still ? INTRO_LENGTH : 0);
  const done = t >= INTRO_LENGTH;
  const skipRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { markIntroSeen(); publicEvent('intro_viewed'); skipRef.current?.focus(); }, []);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setT(Math.min(INTRO_LENGTH, (performance.now() - startedAt) / 1000)), 200);
    return () => window.clearInterval(id);
  }, [still, startedAt]);
  useEffect(() => { if (done && !still) publicEvent('intro_completed'); }, [done, still]);
  const close = (skipped: boolean) => { if (skipped && !done) publicEvent('intro_skipped'); onClose(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  });
  const i = introSceneAt(t);
  const scene = INTRO_SCENES[i];
  return (
    <div role="dialog" aria-modal="true" aria-label="Introduction" data-testid="cinematic-intro" data-intro-scene={scene.key} className="fixed inset-0 z-[200] bg-[#05060f] text-[#f2ece1]" data-theme="dark">
      <div className="absolute inset-0">
        <Suspense fallback={<Still />}>
          <IntroScene3D startedAt={startedAt} still={still} fallback={<Still />} />
        </Suspense>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <div key={scene.key} className="m-enter" aria-live="polite">
          {scene.title && <p className="font-display text-[56px] leading-none tracking-[0.02em] md:text-[104px]">{scene.title}</p>}
          {scene.line && <p className={scene.title ? 'mt-5 font-display text-2xl italic text-[#e6dcc8] md:text-3xl' : 'font-display text-2xl italic text-[#e6dcc8] md:text-4xl'}>{scene.line}</p>}
        </div>
        {done && (
          <div className="pointer-events-auto m-enter mt-9 flex flex-col items-center gap-3">
            <Button size="lg" onClick={() => { close(false); nav('/personality'); }}>Enter Your Universe</Button>
            <button type="button" className="min-h-11 text-sm text-[#cfc8bb] underline underline-offset-4 hover:text-white" onClick={() => close(false)}>See what’s inside first</button>
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 md:p-6">
        <Link to="/signin" className="min-h-11 content-center text-sm text-[#cfc8bb] underline underline-offset-4 hover:text-white" onClick={() => close(false)}>Sign in</Link>
        {!done && <Button ref={skipRef} size="sm" variant="ghost" className="!text-[#f2ece1]" onClick={() => close(true)}>Skip intro</Button>}
      </div>
      {!done && (
        <div className="absolute inset-x-6 bottom-6 mx-auto h-0.5 max-w-md overflow-hidden rounded-full bg-white/15" aria-hidden="true">
          <div className="h-full bg-[#f2ece1] transition-[width] duration-200 ease-linear" style={{ width: `${(t / INTRO_LENGTH) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
