import { Suspense, lazy, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { Button, Card, Select, Switch, cx } from './ui/primitives';
import { ArchetypeArt, ResponsiveArt } from './visual';
import { archetypeAccent, envArt } from '../lib/visual';
import type { Persona } from '../lib/persona';
import { publicEvent } from '../lib/cosmic';
import { REVEAL_STAGES, worldFor } from '../three/archetypeWorlds';
import { GRAPHICS_LEVELS, getGraphicsLevel, onGraphicsChange, setGraphicsLevel, type GraphicsLevel } from '../three/quality';
import { getSoundOn, onSoundChange, playCue, setSoundOn } from '../lib/sound';
import type { IdentitySceneData } from '../three/identity';

/* All three.js code is behind this import: pages only pay for it when a scene is actually shown. */
const IdentityScene3D = lazy(() => import('../three/identity').then((m) => ({ default: m.IdentityScene3D })));

export function sceneData(p: Persona): IdentitySceneData {
  return {
    archetypeKey: p.key, accent: archetypeAccent(p.key),
    dimensions: p.dimensions.map((d) => ({ key: d.key, name: d.name, score: d.score })),
    // Only a stored blended result shows a companion; a plain "secondary" match does not.
    blend: p.blend ? { secondaryKey: p.blend.secondaryKey, accent: archetypeAccent(p.blend.secondaryKey), primaryWeight: p.blend.primaryWeight } : null,
  };
}

const scoresOf = (p: Persona) => Object.fromEntries(p.dimensions.map((d) => [d.key, d.score]));
const Backdrop = () => <ResponsiveArt landscape={envArt('identity-reveal', 'landscape')} portrait={envArt('identity-reveal', 'portrait')} landscapePosition="50% 50%" portraitPosition="50% 40%" eager />;

/** What the scene shows, in words — for screen readers and for anyone curious what the shapes mean. */
export function worldDescription(p: Persona): string {
  const w = worldFor(p.key);
  const strongest = [...p.dimensions].sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0];
  const blend = p.blend ? ` A smaller second shape orbits it: ${p.blend.secondaryName ?? 'your second archetype'}, sized by how closely the two matched.` : '';
  return `${w.caption} Five rings stand for your five dimensions; the brightest is ${strongest.name}.${blend}`;
}

/**
 * Identity Reveal Theatre. The scene assembles from the person's own result: five dimension rings, then the
 * archetype's shell around its sigil, then what orbits it. Plays once per result on this device; Skip and Replay
 * are ordinary buttons. With reduced motion, Eco graphics or no WebGL it shows the finished picture at once.
 */
export function RevealTheatre({ persona }: { persona: Persona }) {
  const seenKey = `nk_reveal_seen:${persona.key}:${persona.takenAt}`;
  const [intro, setIntro] = useState(() => { try { return sessionStorage.getItem(seenKey) !== '1' && localStorage.getItem(seenKey) !== '1'; } catch { return true; } });
  const [runId, setRunId] = useState(0);
  const [skip, setSkip] = useState(false);
  const [stage, setStage] = useState(intro ? 0 : REVEAL_STAGES.length - 1);
  const data = useMemo(() => sceneData(persona), [persona]);
  const done = stage >= REVEAL_STAGES.length - 1;
  useEffect(() => { if (done) try { if (localStorage.getItem(seenKey) !== '1') publicEvent('reveal_completed'); localStorage.setItem(seenKey, '1'); } catch { /* storage unavailable */ } }, [done, seenKey]);
  // Chapter five says what is true for this result: a stored blend, a nearby second archetype, or neither.
  const chapter = REVEAL_STAGES[stage].key === 'blend'
    ? (persona.blend ? `Blending with ${persona.blend.secondaryName ?? 'a second archetype'}` : persona.secondary ? `An echo of ${persona.secondary.name}` : 'One clear archetype')
    : REVEAL_STAGES[stage].label;
  const onStage = (t: number) => {
    let i = 0;
    REVEAL_STAGES.forEach((s, k) => { if (t >= s.at) i = k; });
    setStage((prev) => (prev === i ? prev : i));
  };
  const replay = () => { setSkip(false); setIntro(true); setStage(0); setRunId((n) => n + 1); };
  const still = <><div className="absolute inset-0"><Backdrop /></div></>;
  return (
    <div className="space-y-2">
      <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-[var(--radius-xl)] border border-line bg-canvas-deep" data-theme="dark" data-testid="reveal-theatre" data-reveal-stage={stage}>
        <div className="absolute inset-0">
          <Suspense fallback={still}>
            <IdentityScene3D data={data} intro={intro} runId={runId} skip={skip} onStage={onStage} label={worldDescription(persona)} fallback={still} />
          </Suspense>
        </div>
        {/* The sigil artwork stays an image in the page; it arrives with the shell. */}
        <div className={cx('pointer-events-none absolute inset-[27%] transition-opacity duration-700', stage >= 3 || skip ? 'opacity-100' : 'opacity-0')}>
          <ArchetypeArt archetypeKey={persona.key} scores={scoresOf(persona)} eager />
        </div>
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs uppercase tracking-[0.16em] text-fg-2" aria-live="polite"><span className="sr-only">Chapter {stage + 1} of {REVEAL_STAGES.length}: </span>{chapter}</p>
      </div>
      <div className="mx-auto flex max-w-[420px] flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs text-fg-3">{worldFor(persona.key).caption}</p>
        {!done && !skip ? <Button size="sm" variant="ghost" onClick={() => { setSkip(true); setStage(REVEAL_STAGES.length - 1); }}>Skip</Button>
          : <Button size="sm" variant="ghost" onClick={replay}>Replay</Button>}
      </div>
    </div>
  );
}

/** Home: the person's identity world at rest, with the usual links right beside it. */
export function HomeWorld({ persona }: { persona: Persona }) {
  const data = useMemo(() => sceneData(persona), [persona]);
  const still = <div className="absolute inset-0"><Backdrop /></div>;
  return (
    <Card className="grid items-center gap-4 overflow-hidden p-0 sm:grid-cols-[minmax(0,260px)_1fr]" aria-label="Your identity world">
      <div className="relative aspect-square w-full bg-canvas-deep sm:aspect-auto sm:h-full sm:min-h-[220px]" data-theme="dark">
        <div className="absolute inset-0">
          <Suspense fallback={still}>
            <IdentityScene3D data={data} label={worldDescription(persona)} fallback={still} />
          </Suspense>
        </div>
        <div className="pointer-events-none absolute inset-[30%]"><ArchetypeArt archetypeKey={persona.key} scores={scoresOf(persona)} decorative /></div>
      </div>
      <div className="space-y-2 p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-fg-3">Your identity world</p>
        <p className="font-display text-3xl leading-tight">{persona.name}</p>
        <p className="text-sm text-fg-2">{worldFor(persona.key).caption}</p>
        {persona.blend && <p className="text-sm text-fg-2">Blended with {persona.blend.secondaryName ?? 'a second archetype'} — the smaller shape in orbit.</p>}
        <div className="flex flex-wrap gap-3 pt-1 text-sm">
          <Link to="/identity" className="text-accent hover:underline">Explore your five dimensions →</Link>
          <Link to="/theme" className="text-fg-2 hover:underline">Graphics &amp; theme</Link>
        </div>
      </div>
    </Card>
  );
}

function lean(d: { low: string; high: string; score: number }): string {
  const m = Math.abs(d.score);
  if (m < 0.15) return `Balanced between ${d.low.toLowerCase()} and ${d.high.toLowerCase()}.`;
  return `${m >= 0.6 ? 'Strongly' : m >= 0.35 ? 'Clearly' : 'Slightly'} toward ${(d.score > 0 ? d.high : d.low).toLowerCase()}.`;
}

/**
 * Five-dimension explorer. Pick a dimension from the list (or tap its ring): the ring lights up and the panel
 * says where you sit on it. Everything the scene shows is also in the list, so it works without the scene.
 */
export function DimensionExplorer({ persona }: { persona: Persona }) {
  const [selected, setSelected] = useState<string | null>(null);
  const data = useMemo(() => sceneData(persona), [persona]);
  const pick = (k: string) => setSelected((s) => (s === k ? null : k));
  const d = persona.dimensions.find((x) => x.key === selected);
  const still = <div className="absolute inset-0"><Backdrop /></div>;
  return (
    <Card className="grid gap-5 md:grid-cols-[minmax(0,340px)_1fr]" aria-label="Dimension explorer">
      <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-[var(--radius-lg)] bg-canvas-deep" data-theme="dark">
        <div className="absolute inset-0">
          <Suspense fallback={still}>
            <IdentityScene3D data={data} selected={selected} onSelect={pick} label="Five rings, one for each of your identity dimensions. Use the list beside it to explore them." fallback={still} />
          </Suspense>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-2xl">Your five dimensions</h2>
          <p className="text-sm text-fg-2">Each ring is one dimension. A brighter, thicker ring is a stronger lean; the dot shows which way.</p>
        </div>
        <ul className="space-y-1.5">
          {persona.dimensions.map((x) => {
            const on = selected === x.key;
            const pct = Math.round(((Math.max(-1, Math.min(1, x.score)) + 1) / 2) * 100);
            return (
              <li key={x.key}>
                <button type="button" aria-pressed={on} onClick={() => pick(x.key)} className={cx('w-full rounded-[var(--radius-sm)] border px-3 py-2 text-left', on ? 'border-fg' : 'border-line hover:border-line-strong')}>
                  <span className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold text-fg">{x.name}</span><span className="text-xs text-fg-3">{x.low} ↔ {x.high}</span></span>
                  <span className="relative mt-2 block h-1 rounded-full bg-line" aria-hidden="true"><span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${pct}%` }} /></span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="min-h-10 text-sm text-fg" role="status">{d ? `${d.name}: ${lean(d)}` : 'Pick a dimension to see where you sit on it.'}</p>
      </div>
    </Card>
  );
}

/** Graphics quality for this device (Theme studio). */
export function GraphicsQualitySetting() {
  const level = useSyncExternalStore(onGraphicsChange, getGraphicsLevel, () => 'auto' as GraphicsLevel);
  const notes: Record<GraphicsLevel, string> = {
    auto: 'Picks a level for this device and lowers it if things get slow.',
    eco: 'Still scenes only — no idle animation, lightest on battery.',
    balanced: 'Gentle motion with fewer particles.',
    high: 'Full scenes.',
    ultra: 'Densest scenes at the sharpest resolution. Best on a desktop.',
  };
  return (
    <section className="space-y-2">
      <label htmlFor="gfx-level" className="block text-sm font-semibold text-fg">3D graphics</label>
      <Select id="gfx-level" className="max-w-xs" value={level} onChange={(e) => setGraphicsLevel(e.target.value as GraphicsLevel)}>{GRAPHICS_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</Select>
      <p className="text-xs text-fg-3">{notes[level]} Saved on this device only.</p>
    </section>
  );
}

/** Interface sounds for this device (Theme studio). Off unless the person switches them on. */
export function SoundSetting() {
  const on = useSyncExternalStore(onSoundChange, getSoundOn, () => false);
  return (
    <Switch label="Interface sounds" description="Soft ticks when you react or finish something. Off by default, never music, saved on this device only." checked={on}
      onChange={(v) => { setSoundOn(v); if (v) playCue('select'); }} />
  );
}

/* ---------------- Quest constellation (SVG: light enough for any phone) ---------------- */

interface QuestStar { key: string; title: string; period: string; complete: boolean; claimed: boolean; claimable: boolean; xp: number; steps: { done?: boolean; progress?: number; target?: number }[] }

/**
 * Quests as a constellation: one star per real quest, joined in order within Today / This week / Explore.
 * A star is hollow until the quest is complete, filled when complete, and ringed when its reward is waiting.
 */
export function QuestConstellation({ quests }: { quests: QuestStar[] }) {
  const [active, setActive] = useState<string | null>(null);
  const rows: [string, QuestStar[]][] = [['Today', quests.filter((q) => q.period === 'daily')], ['This week', quests.filter((q) => q.period === 'weekly')], ['Explore', quests.filter((q) => q.period === 'once')]];
  const shown = rows.filter(([, list]) => list.length > 0);
  if (!shown.length) return null;
  const W = 640, rowH = 78, H = shown.length * rowH + 16;
  const pos = (ri: number, i: number, n: number) => ({ x: 96 + ((W - 130) * (i + 0.5)) / n, y: 44 + ri * rowH + (i % 2 ? 12 : -10) });
  const current = quests.find((q) => q.key === active);
  const doneCount = quests.filter((q) => q.complete).length;
  return (
    <Card className="space-y-2" aria-label="Quest constellation">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">Quest constellation</h2>
        <p className="text-sm text-fg-2 numeric">{doneCount} of {quests.length} lit</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label={`Quest map: ${doneCount} of ${quests.length} quests complete`}>
        {shown.map(([label, list], ri) => (
          <g key={label}>
            <text x="8" y={48 + ri * rowH} className="fill-fg-3" fontSize="12" style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</text>
            {list.slice(1).map((q, i) => {
              const a = pos(ri, i, list.length), b = pos(ri, i + 1, list.length);
              return <line key={q.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent)" strokeWidth="1" strokeOpacity={list[i].complete && q.complete ? 0.8 : 0.2} strokeDasharray={list[i].complete && q.complete ? undefined : '3 5'} />;
            })}
            {list.map((q, i) => {
              const p = pos(ri, i, list.length);
              const on = active === q.key;
              return (
                <g key={q.key} role="button" tabIndex={0} aria-pressed={on} aria-label={`${q.title}: ${q.claimed ? 'done, reward collected' : q.claimable ? 'done, reward waiting' : q.complete ? 'done' : 'in progress'}`}
                  onClick={() => setActive(on ? null : q.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(on ? null : q.key); } }} style={{ cursor: 'pointer' }}>
                  <circle cx={p.x} cy={p.y} r="18" fill="transparent" />
                  {q.claimable && <circle cx={p.x} cy={p.y} r="12" fill="none" stroke="var(--accent)" strokeWidth="1.5" className="quest-ring" />}
                  <circle cx={p.x} cy={p.y} r={on ? 8 : 6} fill={q.complete ? 'var(--accent)' : 'var(--bg)'} stroke={on ? 'var(--text)' : 'var(--accent)'} strokeWidth="1.5" strokeOpacity={q.complete ? 1 : 0.55} />
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <p className="min-h-5 text-sm text-fg" role="status">{current ? `${current.title} — ${current.claimed ? 'done, reward collected' : current.claimable ? `done: collect ${current.xp} XP below` : current.complete ? 'done' : 'in progress'}` : 'Tap a star to see the quest. Filled stars are done; a ring means a reward is waiting.'}</p>
    </Card>
  );
}
