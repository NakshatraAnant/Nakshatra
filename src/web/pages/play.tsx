import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from '../lib/api';
import { Badge, Button, Card, Checkbox, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { Dialog, useToast } from '../components/ui/overlays';
import { ReportDialog } from './thoughts';
import { Art } from '../components/visual';
import { gameArt } from '../lib/visual';
import { hashSeed } from '../../shared/play/engine';

interface GameMeta { key: string; name: string; tagline: string; category: string; minPlayers: number; maxPlayers: number; howToPlay: string[]; safety: string; consents: string[]; solo: boolean }

const CATEGORY: Record<string, { label: string; color: string }> = {
  guessing: { label: 'Guessing', color: '#6fa8dc' }, opinions: { label: 'Opinions', color: '#e9a23b' }, storytelling: { label: 'Storytelling', color: '#c98a96' },
  identity: { label: 'Identity', color: '#8d7bd8' }, prediction: { label: 'Prediction', color: '#7fb69a' },
};

/** Procedural mark for each game: category colour, game-specific geometry. Original, licence-free, works offline. */
export function GameMark({ gameKey, category, size = 56 }: { gameKey: string; category: string; size?: number }) {
  const art = gameArt(gameKey, 'symbol');
  if (art) return <Art src={art} width={size} height={size} className="shrink-0" fallback={<ProceduralMark gameKey={gameKey} category={category} size={size} />} />;
  return <ProceduralMark gameKey={gameKey} category={category} size={size} />;
}

function ProceduralMark({ gameKey, category, size = 56 }: { gameKey: string; category: string; size?: number }) {
  const color = CATEGORY[category]?.color ?? '#d9b26f';
  const h = hashSeed(gameKey);
  const n = 3 + (h % 5);
  const rot = (h >> 3) % 360;
  const pts = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * 16, Math.sin(a) * 16]; });
  const inner = Array.from({ length: n }, (_, i) => { const a = ((i + 0.5) / n) * Math.PI * 2; return [Math.cos(a) * 8, Math.sin(a) * 8]; });
  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect x="-24" y="-24" width="48" height="48" rx="12" fill="#10122a" />
      <g transform={`rotate(${rot})`}>
        <polygon points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="1.4" />
        <polygon points={inner.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill={color} fillOpacity=".25" stroke={color} strokeWidth="1" />
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill={color} />)}
      </g>
    </svg>
  );
}

function useGames() {
  return useQuery({ queryKey: ['games'], queryFn: () => get<{ games: GameMeta[]; note: string }>('play/games'), staleTime: Infinity });
}

/** Start a game: from a circle (all games) or solo (solo games only). */
export function GameLauncher({ circleId }: { circleId?: string }) {
  const g = useGames();
  const nav = useNavigate();
  const toast = useToast();
  const [info, setInfo] = useState<GameMeta | null>(null);
  const [consents, setConsents] = useState({ allowReuse: false, shareIdentity: false });
  const circles = useQuery({ queryKey: ['circles'], queryFn: () => get<{ circles: { id: string; name: string }[] }>('circles'), enabled: !circleId });
  const [target, setTarget] = useState<string>(circleId ?? '');
  const start = useMutation({
    mutationFn: (game: GameMeta) => post<{ session: { id: string } }>('play/sessions', { gameKey: game.key, circleId: (circleId ?? target) || undefined, ...consents }),
    onSuccess: (r) => nav(`/play/${r.session.id}`),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not start the game', 'error'),
  });
  return (
    <section aria-labelledby="game-library">
      <h2 id="game-library" className="font-display text-2xl">{circleId ? 'Start a game' : 'Game library'}</h2>
      <QueryState q={g}>{(d) => (
        <>
          <ul className={cx('mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3', circleId ? 'xl:grid-cols-4' : 'lg:grid-cols-4')}>
            {d.games.map((game) => (
              <li key={game.key}>
                <button type="button" onClick={() => { setInfo(game); setConsents({ allowReuse: false, shareIdentity: false }); setTarget(circleId ?? (game.solo ? '' : circles.data?.circles[0]?.id ?? '')); }}
                  className="group relative block w-full overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface text-left transition-colors hover:border-line-strong">
                  <span className="block aspect-[3/4]"><Art src={gameArt(game.key, 'card') ?? ''} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" position="50% 30%" /></span>
                  <span className="scrim-bottom absolute inset-0" aria-hidden="true" />
                  <span className="absolute inset-x-3 bottom-3 block">
                    <span className="block text-[15px] font-semibold leading-tight text-[#f2ece1]">{game.name}</span>
                    <span className="mt-1 block text-[11px] text-[#cfc8bb]">{CATEGORY[game.category]?.label} · {game.solo ? 'Solo or group' : `${game.minPlayers}+ players`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-3">{d.note}</p>
        </>
      )}</QueryState>
      <Dialog open={Boolean(info)} onClose={() => setInfo(null)} title={info?.name ?? ''} description={info?.tagline}
        footer={<><Button variant="ghost" onClick={() => setInfo(null)}>Cancel</Button><Button loading={start.isPending} disabled={!info || (!info.solo && !(circleId ?? target))} onClick={() => info && start.mutate(info)}>{(circleId ?? target) ? 'Open lobby' : 'Play solo'}</Button></>}>
        {info && (
          <div className="space-y-4">
            <div className="relative -mx-1 aspect-[16/9] overflow-hidden rounded-[var(--radius-md)] bg-surface-2"><Art src={gameArt(info.key, 'cover') ?? ''} className="absolute inset-0 h-full w-full object-cover" position="70% 50%" /></div>
            <p className="text-sm text-fg-2">{info.tagline}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-2">{info.howToPlay.map((s) => <li key={s}>{s}</li>)}</ol>
            <Notice tone="info" title="Safety">{info.safety}</Notice>
            {!circleId && (
              <label className="block text-sm text-fg-2">Play with
                <Select className="mt-1" value={target} onChange={(e) => setTarget(e.target.value)}>
                  {info.solo && <option value="">Just me (solo)</option>}
                  {circles.data?.circles.map((c) => <option key={c.id} value={c.id}>Circle: {c.name}</option>)}
                </Select>
                {!info.solo && !circles.data?.circles.length && <span className="mt-2 block text-xs text-fg-3">This game needs a circle. <Link to="/circles" className="text-accent underline underline-offset-2">Start one</Link>.</span>}
              </label>
            )}
            {info.consents.includes('allowReuse') && <Checkbox checked={consents.allowReuse} onChange={(v) => setConsents({ ...consents, allowReuse: v })} label="Allow my lines to be reused later in this circle (Memory Lane)" description="Optional. You can still withdraw a line before guessing starts." />}
            {info.consents.includes('shareIdentity') && <Checkbox checked={consents.shareIdentity} onChange={(v) => setConsents({ ...consents, shareIdentity: v })} label="Let others in this game guess or compare my archetype" description="Optional. Only your archetype name and dimension scores are used, only in this game." />}
          </div>
        )}
      </Dialog>
    </section>
  );
}

interface SessionRow { id: string; gameKey: string; name: string; status: string; circleName: string | null; players: number; joined: boolean; round: number; rounds: number; isHost: boolean }

export function SessionList({ circleId }: { circleId?: string }) {
  const q = useQuery({ queryKey: ['sessions', circleId ?? 'mine'], queryFn: () => get<{ sessions: SessionRow[] }>(`play/sessions${circleId ? `?circleId=${circleId}` : ''}`), refetchInterval: 15000 });
  const label: Record<string, string> = { lobby: 'In lobby', active: 'In progress', completed: 'Finished', abandoned: 'Abandoned' };
  return (
    <section aria-labelledby="sessions-title">
      <h2 id="sessions-title" className="font-display text-2xl">{circleId ? 'Games in this circle' : 'Your games'}</h2>
      <QueryState q={q} empty={(d) => d.sessions.length ? null : <p className="mt-3 text-sm text-fg-3">No games yet. Pick one above.</p>}>{(d) => (
        <ul className="mt-3 divide-y divide-line rounded-[var(--radius-lg)] border border-line">
          {d.sessions.map((s) => (
            <li key={s.id}>
              <Link to={`/play/${s.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                <span className="min-w-0 flex-1"><span className="block text-sm text-fg">{s.name}</span><span className="block text-xs text-fg-3">{s.circleName ?? 'Solo'} · {s.players} player{s.players === 1 ? '' : 's'}{s.status === 'active' ? ` · round ${s.round} of ${s.rounds}` : ''}</span></span>
                <Badge tone={s.status === 'active' ? 'success' : s.status === 'lobby' ? 'warning' : 'neutral'}>{label[s.status]}</Badge>
                {!s.joined && s.status === 'lobby' && <Badge tone="accent">Join</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}</QueryState>
    </section>
  );
}

export function PlayPage() {
  return (
    <div className="space-y-10">
      <PageHeader kicker="Play" title="Games that start conversations" subtitle="Twelve games with real rules — guess who wrote it, vote honestly, write a story together. Play solo where it makes sense, or with a circle." />
      <GameLauncher />
      <SessionList />
    </div>
  );
}

interface Line { label: string; detail?: string; value?: number; ref?: string }
interface SessionView {
  session: { id: string; status: string; gameKey: string; circleId: string | null; circleName: string | null; hostId: string; roundIndex: number; totalRounds: number };
  game: GameMeta;
  me: { joined: boolean; isHost: boolean; allowReuse: boolean; shareIdentity: boolean; canAct: boolean; submission: { id: string; payload: Record<string, unknown> } | null };
  players: { userId: string; name: string; score: number; left: boolean; waitingOn: boolean }[];
  round: null | { index: number; kind: string; title: string; prompt: string; ref?: string; options?: { id: string; label: string }[]; maxLength?: number; actorId?: string; excludeId?: string; aboutId?: string; submitted: number; waitingFor: number; hidesAuthor?: boolean };
  history: { index: number; title: string; prompt: string; reveal: { headline: string; lines: Line[]; note?: string } }[];
  summary: { headline: string; lines: Line[]; note?: string } | null;
  payouts: { name: string; playPoints: number }[] | null;
}

function RevealCard({ title, prompt, reveal, gameKey }: { title: string; prompt: string; reveal: SessionView['history'][number]['reveal']; gameKey: string }) {
  const max = Math.max(1, ...reveal.lines.map((l) => l.value ?? 0));
  const [reporting, setReporting] = useState<string | null>(null);
  return (
    <Card>
      <p className="eyebrow">{title}</p>
      {gameKey !== 'plot_twist' && <p className="mt-1 text-sm text-fg-2">{prompt}</p>}
      <h3 className="mt-2 font-display text-2xl">{reveal.headline}</h3>
      {reveal.lines.length > 0 && (
        <ul className="mt-3 space-y-2">
          {reveal.lines.map((l, i) => (
            <li key={i} className="text-sm">
              <div className="flex justify-between gap-3"><span className="text-fg">{l.label}</span>{l.value !== undefined && <span className="numeric text-fg-3">{l.value}</span>}</div>
              {l.detail && <p className="text-xs text-fg-3">{l.detail}</p>}
              {l.ref && <button type="button" className="text-[11px] text-fg-3 hover:text-danger" onClick={() => setReporting(l.ref!)}>Report this line</button>}
              {l.value !== undefined && <div className="mt-1 h-1.5 rounded-full bg-surface-3"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${((l.value ?? 0) / max) * 100}%` }} /></div>}
            </li>
          ))}
        </ul>
      )}
      {reveal.note && <p className="mt-2 text-xs text-fg-3">{reveal.note}</p>}
      {reporting && <ReportDialog open onClose={() => setReporting(null)} targetType="game_submission" targetId={reporting} />}
    </Card>
  );
}

function RoundInput({ v, onSubmit, busy }: { v: SessionView; onSubmit: (payload: Record<string, unknown>) => void; busy: boolean }) {
  const r = v.round!;
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string>('');
  const [stake, setStake] = useState(3);
  useEffect(() => { setText(''); setChoice(''); }, [r.index]);
  const mine = v.me.submission?.payload;
  if (r.kind === 'submit' || r.kind === 'turn') {
    return (
      <div className="space-y-2">
        <label className="block"><span className="sr-only">Your line</span><Textarea rows={3} maxLength={r.maxLength} value={text} onChange={(e) => setText(e.target.value)} placeholder={mine ? `You wrote: ${String(mine.text)}` : 'Write your line'} /></label>
        <div className="flex items-center justify-between text-xs text-fg-3"><span>{text.length}/{r.maxLength}</span></div>
        <Button loading={busy} disabled={!text.trim()} onClick={() => onSubmit({ text })}>{mine ? 'Change my line' : 'Submit'}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={r.prompt}>
        {r.options!.map((o) => {
          const selected = (choice || (mine?.optionId as string)) === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={selected} onClick={() => setChoice(o.id)}
              className={cx('min-h-12 rounded-[var(--radius-md)] border px-4 py-3 text-left text-[15px] transition-colors', selected ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2 hover:border-line-strong')}>{o.label}</button>
          );
        })}
      </div>
      {r.kind === 'stake' && (
        <label className="block text-sm text-fg-2">Stake (play points, 1–10): <span className="numeric text-fg">{stake}</span>
          <input type="range" min={1} max={10} value={stake} onChange={(e) => setStake(Number(e.target.value))} className="mt-1 w-full accent-[var(--accent)]" aria-label="Stake in play points" />
        </label>
      )}
      <Button loading={busy} disabled={!(choice || mine)} onClick={() => onSubmit({ optionId: choice || mine?.optionId, ...(r.kind === 'stake' ? { stake } : {}) })}>{r.kind === 'resolve' ? 'Record outcome' : mine ? 'Change answer' : 'Lock in'}</Button>
    </div>
  );
}

function RoundReport({ refId }: { refId: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="text-xs text-fg-3 hover:text-danger" onClick={() => setOpen(true)}>Report this line</button>{open && <ReportDialog open onClose={() => setOpen(false)} targetType="game_submission" targetId={refId} />}</>;
}

export function GameSession() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['session', id], queryFn: () => get<SessionView>(`play/sessions/${id}`), refetchInterval: (query) => (query.state.data && ['completed', 'abandoned'].includes(query.state.data.session.status) ? false : 3000), retry: false });
  const [consents, setConsents] = useState<{ allowReuse: boolean; shareIdentity: boolean } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['session', id] });
  const call = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => post(`play/sessions/${id}/${path}`, body ?? {}), onSuccess: refresh, onError: (e) => { toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error'); refresh(); } });
  return (
    <QueryState q={q}>{(v) => {
      const c = consents ?? { allowReuse: v.me.allowReuse, shareIdentity: v.me.shareIdentity };
      const r = v.round;
      return (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <GameMark gameKey={v.game.key} category={v.game.category} size={52} />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">{v.session.circleName ?? 'Solo'} · {{ lobby: 'Lobby', active: `Round ${v.session.roundIndex + 1} of ${v.session.totalRounds}`, completed: 'Finished', abandoned: 'Abandoned' }[v.session.status]}</p>
              <h1 className="font-display text-4xl">{v.game.name}</h1>
            </div>
            {v.session.circleId && <Link to={`/circles/${v.session.circleId}`} className="text-sm text-fg-2 hover:text-fg">Back to circle</Link>}
          </div>

          {v.session.status === 'lobby' && (
            <Card className="space-y-4 overflow-hidden">
              <div className="relative -mx-5 -mt-5 aspect-[16/9] bg-surface-2"><Art src={gameArt(v.game.key, 'cover') ?? ''} eager className="absolute inset-0 h-full w-full object-cover" position="70% 50%" /></div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-2">{v.game.howToPlay.map((s) => <li key={s}>{s}</li>)}</ol>
              <p className="text-xs text-fg-3">{v.game.safety}</p>
              {v.game.consents.includes('allowReuse') && <Checkbox checked={c.allowReuse} onChange={(x) => setConsents({ ...c, allowReuse: x })} label="Allow my lines to be reused later in this circle" />}
              {v.game.consents.includes('shareIdentity') && <Checkbox checked={c.shareIdentity} onChange={(x) => setConsents({ ...c, shareIdentity: x })} label="Let others guess or compare my archetype in this game" />}
              <div className="flex flex-wrap gap-2">
                {!v.me.joined ? <Button loading={call.isPending} onClick={() => call.mutate({ path: 'join', body: c })}>Join game</Button>
                  : consents && <Button variant="secondary" loading={call.isPending} onClick={() => call.mutate({ path: 'join', body: c })}>Update my choices</Button>}
                {v.me.isHost && <Button loading={call.isPending} disabled={v.players.filter((p) => !p.left).length < v.game.minPlayers} onClick={() => call.mutate({ path: 'start' })}>Start game</Button>}
                {v.me.joined && <Button variant="ghost" onClick={() => call.mutate({ path: 'leave' })}>{v.me.isHost ? 'Cancel game' : 'Leave'}</Button>}
              </div>
              {v.me.isHost && v.players.length < v.game.minPlayers && <p className="text-sm text-fg-3">Waiting for at least {v.game.minPlayers} players. Share the circle link or ask friends to open Play in the circle.</p>}
            </Card>
          )}

          {v.session.status === 'active' && r && (
            <Card className="relative space-y-4 overflow-hidden" aria-live="polite">
              {/* Calm in-game artwork behind the round; the question and answers stay fully legible on top. */}
              <Art src={gameArt(v.game.key, 'active') ?? ''} eager className="pointer-events-none absolute inset-x-0 top-0 h-48 w-full object-cover opacity-40" position="50% 0%" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-transparent to-surface" aria-hidden="true" />
              <div className="relative space-y-4">
              <p className="eyebrow">{r.title}</p>
              <h2 className="font-display text-3xl leading-tight">{r.prompt}</h2>
              {r.ref && <RoundReport refId={r.ref} />}
              {v.me.canAct ? <RoundInput v={v} busy={call.isPending} onSubmit={(payload) => call.mutate({ path: 'submit', body: { payload } })} />
                : !v.me.joined ? <Notice tone="info">This game started without you. You can watch the results here.</Notice>
                  : <Notice tone="info">{r.actorId ? `Waiting for ${v.players.find((p) => p.userId === r.actorId)?.name ?? 'the next player'}.` : r.hidesAuthor ? 'This one is yours — sit back while the others guess. Nobody else can see that.' : r.excludeId ? 'This round is about you — sit back while the others guess.' : 'Waiting for the others.'}</Notice>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-fg-3">
                <span>{r.submitted} in · waiting for {r.waitingFor}</span>
                <span className="flex gap-2">
                  {v.me.submission && r.kind === 'submit' && <Button size="sm" variant="ghost" onClick={() => call.mutate({ path: 'withdraw' })}>Withdraw my line</Button>}
                  {v.me.isHost && r.kind !== 'resolve' && <Button size="sm" variant="secondary" onClick={() => call.mutate({ path: 'advance' })}>Move on</Button>}
                </span>
              </div>
              </div>
            </Card>
          )}

          {v.session.status === 'completed' && (
            <Card className="space-y-3 overflow-hidden">
              <div className="relative -mx-5 -mt-5 aspect-[2/1] bg-surface-2">
                <Art src={gameArt(v.game.key, 'result') ?? ''} eager className="result-pop absolute inset-0 h-full w-full object-cover" />
                <Art src={gameArt(v.game.key, 'celebration') ?? ''} eager className="result-pop absolute inset-0 h-full w-full object-contain opacity-80" />
              </div>
              <h2 className="font-display text-3xl">{v.summary?.headline ?? 'Game complete'}</h2>
              {v.summary && <ul className="space-y-1 text-sm">{v.summary.lines.map((l, i) => <li key={i} className={v.game.key === 'plot_twist' ? 'text-fg' : 'flex justify-between gap-3'}><span>{l.label}</span>{l.detail && <span className="text-fg-3">{l.detail}</span>}</li>)}</ul>}
              {v.summary?.note && <p className="text-xs text-fg-3">{v.summary.note}</p>}
              {v.payouts && <Notice tone="info" title="Play points (not money)">{v.payouts.map((p) => `${p.name}: ${p.playPoints}`).join(' · ')}</Notice>}
              {v.me.joined && <RematchButton id={v.session.id} />}
            </Card>
          )}
          {v.session.status === 'abandoned' && <EmptyState icon="alert" title="This game was abandoned" body="It was cancelled or idle for a week. Start a fresh one any time." />}

          <section aria-labelledby="players-title">
            <h2 id="players-title" className="font-display text-2xl">Players</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {[...v.players].sort((a, b) => b.score - a.score).map((p) => (
                <li key={p.userId} className={cx('rounded-full border px-3 py-1.5 text-sm', p.waitingOn ? 'border-warning/60' : 'border-line', p.left && 'opacity-50')}>
                  {p.name}{v.game.key !== 'prediction_market' && <span className="ml-1 numeric text-fg-3">{p.score}</span>}{p.waitingOn && <span className="ml-1 text-xs text-fg-3">· thinking</span>}{p.left && ' · left'}
                </li>
              ))}
            </ul>
          </section>

          {v.history.length > 0 && (
            <section aria-labelledby="results-title" className="space-y-3">
              <h2 id="results-title" className="font-display text-2xl">Results so far</h2>
              {[...v.history].reverse().map((h) => <RevealCard key={h.index} title={h.title} prompt={h.prompt} reveal={h.reveal} gameKey={v.game.key} />)}
            </section>
          )}
        </div>
      );
    }}</QueryState>
  );
}

/** Opens a fresh lobby of the same game and invites the other players (they choose to join). */
function RematchButton({ id }: { id: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => post<{ session: { id: string }; invited: number }>(`play/sessions/${id}/rematch`),
    onSuccess: (r) => { toast(r.invited ? `Invited ${r.invited} player${r.invited === 1 ? '' : 's'}` : 'New lobby open', 'success'); nav(`/play/${r.session.id}`); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not start a rematch', 'error'),
  });
  return <Button className="motion-press" loading={m.isPending} onClick={() => m.mutate()}>Rematch</Button>;
}
