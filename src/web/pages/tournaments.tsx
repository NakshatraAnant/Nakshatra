import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post, put } from '../lib/api';
import { Badge, Button, ButtonLink, Card, Checkbox, Field, Input, PageHeader, Select, Switch, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { QuestionCards, blankQuestion } from './quizzes';
import { ReportDialog } from './thoughts';
import { QuizError, validateQuiz, type QuizQuestion } from '../../shared/quiz';
import { TOURNAMENT_RULES as R, type TournamentStatus } from '../../shared/tournament';
import { TournamentArena } from '../components/Arena';
import { remaining, runOutcome } from '../lib/tournamentMoments';
import { prefersReducedMotion } from '../lib/session';

const STATUS: Record<TournamentStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  open: { label: 'Open now', tone: 'success' },
  upcoming: { label: 'Starts soon', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
  cancelled: { label: 'Called off', tone: 'danger' },
};

const secs = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`);
const when = (d: string) => new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

interface Row { id: string; title: string; status: TournamentStatus; host: string; isHost: boolean; access: string; questions: number; entrants: number; myState: string | null; opensAt: string; closesAt: string }
interface HistoryRow { id: string; title: string; status: TournamentStatus; score: number; total: number; rank: number | null; ranked: number; held: boolean }

export function TournamentsPage() {
  const list = useQuery({ queryKey: ['tournaments'], queryFn: () => get<{ tournaments: Row[] }>('play/tournaments') });
  const history = useQuery({ queryKey: ['tournament-history'], queryFn: () => get<{ history: HistoryRow[] }>('play/tournaments/history') });
  return (
    <div className="space-y-6">
      <PageHeader kicker="Play" title="Tournaments" subtitle="Trivia rounds with your circle or friends. Everyone plays once, on their own time, against the same clock." actions={<><ButtonLink to="/play/leaderboard" variant="secondary" size="sm">Season leaderboard</ButtonLink><ButtonLink to="/play/tournaments/new" size="sm">Host a tournament</ButtonLink></>} />
      <QueryState q={list} empty={(d) => (!d.tournaments.length ? <EmptyState icon="rewards" title="No tournaments yet" body="Write a few questions, pick a circle or invite friends, and set a closing time." action={<ButtonLink to="/play/tournaments/new" size="sm">Host a tournament</ButtonLink>} /> : null)}>{(d) => (
        <ul className="grid gap-3 sm:grid-cols-2">{d.tournaments.map((x) => (
          <li key={x.id}><Link to={`/play/tournaments/${x.id}`} className="card block h-full p-4 hover:border-line-strong">
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-fg">{x.title}</p><Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge>
              {x.myState === 'invited' && <Badge tone="accent">Invited</Badge>}{x.myState === 'finished' && <Badge tone="success">Played</Badge>}</div>
            <p className="mt-2 text-xs text-fg-3">{x.isHost ? 'You host' : `Hosted by ${x.host}`} · {x.questions} questions · {x.entrants} playing · {x.status === 'upcoming' ? `opens ${when(x.opensAt)}` : `closes ${when(x.closesAt)}`}</p>
          </Link></li>
        ))}</ul>
      )}</QueryState>
      <section aria-labelledby="history-h" className="space-y-3">
        <h2 id="history-h" className="font-display text-2xl">Your match history</h2>
        <QueryState q={history} empty={(d) => (!d.history.length ? <p className="text-sm text-fg-3">Tournaments you finish will show here with your placing.</p> : null)}>{(d) => (
          <ul className="divide-y divide-line rounded-[var(--radius)] border border-line">{d.history.map((h) => (
            <li key={h.id}><Link to={`/play/tournaments/${h.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-surface-2">
              <span className="text-fg">{h.title}</span>
              <span className="text-sm text-fg-2 numeric">{h.score}/{h.total} · {h.held ? 'held for review' : h.rank ? `#${h.rank} of ${h.ranked}` : '—'}{h.status !== 'closed' ? ' · still open' : ''}</span>
            </Link></li>
          ))}</ul>
        )}</QueryState>
      </section>
    </div>
  );
}

const WINDOWS = [['1', '1 hour'], ['24', '1 day'], ['72', '3 days'], ['168', '1 week']] as const;

export function TournamentBuilder() {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => [blankQuestion('trivia'), blankQuestion('trivia'), blankQuestion('trivia')]);
  const [access, setAccess] = useState<'circle' | 'invite'>('circle');
  const [circleId, setCircleId] = useState('');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [hours, setHours] = useState('24');
  const [seconds, setSeconds] = useState(String(R.secondsPerQuestion.default));
  const [error, setError] = useState<string | null>(null);
  const circles = useQuery({ queryKey: ['circles'], queryFn: () => get<{ circles: { id: string; name: string }[] }>('circles') });
  const people = useQuery({ queryKey: ['tournament-invitable'], queryFn: () => get<{ people: { userId: string; name: string; handle: string }[] }>('play/tournaments/invitable'), enabled: access === 'invite' });
  const chosenCircle = circleId || circles.data?.circles[0]?.id || '';
  const create = useMutation({
    mutationFn: () => post<{ tournament: { id: string } }>('play/tournaments', { title, questions, access, circleId: access === 'circle' ? chosenCircle : undefined, inviteeIds: access === 'invite' ? invitees : [], closesAt: new Date(Date.now() + Number(hours) * 3600e3).toISOString(), secondsPerQuestion: Number(seconds) }),
    onSuccess: (r) => nav(`/play/tournaments/${r.tournament.id}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not start the tournament'),
  });
  const submit = () => {
    try { validateQuiz({ kind: 'trivia', title, description: '', outcomes: [], questions }); } catch (e) { setError(e instanceof QuizError ? e.message : 'Check the questions'); return; }
    if (access === 'circle' && !chosenCircle) { setError('Join or create a circle first, or invite friends instead.'); return; }
    if (access === 'invite' && !invitees.length) { setError('Invite at least one person.'); return; }
    setError(null); create.mutate();
  };
  return (
    <div className="space-y-6">
      <PageHeader kicker="Play" title="Host a tournament" subtitle="You write the questions, so you host rather than play. Answers stay hidden from everyone until it closes." />
      <Card className="space-y-4">
        <Field label="Title">{(id) => <Input id={id} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday film trivia" />}</Field>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who can play">
          {([['circle', 'A circle'], ['invite', 'Friends I invite']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={access === k} onClick={() => setAccess(k)} className={cx('min-h-9 rounded-full border px-3 text-sm', access === k ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2')}>{label}</button>
          ))}
        </div>
        {access === 'circle' ? (
          <Field label="Circle">{(id) => <Select id={id} value={chosenCircle} onChange={(e) => setCircleId(e.target.value)}>{circles.data?.circles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-sm text-fg-2">Invite (people you follow or who follow you, up to {R.maxInvitees})</legend>
            {people.data && !people.data.people.length && <p className="text-sm text-fg-3">No connections yet — follow someone first, or use a circle.</p>}
            <div className="grid gap-1 sm:grid-cols-2">{people.data?.people.map((p) => (
              <Checkbox key={p.userId} label={p.name} checked={invitees.includes(p.userId)} onChange={(v) => setInvitees(v ? [...invitees, p.userId].slice(0, R.maxInvitees) : invitees.filter((x) => x !== p.userId))} />
            ))}</div>
          </fieldset>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Open for">{(id) => <Select id={id} value={hours} onChange={(e) => setHours(e.target.value)}>{WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          <Field label="Seconds per question">{(id) => <Select id={id} value={seconds} onChange={(e) => setSeconds(e.target.value)}>{[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} seconds</option>)}</Select>}</Field>
        </div>
      </Card>
      <QuestionCards kind="trivia" outcomes={[]} questions={questions} setQuestions={setQuestions} />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" loading={create.isPending} onClick={submit}>Start tournament</Button>
    </div>
  );
}

interface Detail {
  tournament: { id: string; title: string; status: TournamentStatus; host: string; isHost: boolean; access: string; questions: number; secondsPerQuestion: number; timeLimitSeconds: number; opensAt: string; closesAt: string; entrants: number; maxEntrants: number };
  me: { state: string | null; score: number | null; durationMs: number | null; flag: string | null; rank: number | null; canJoin: boolean };
  standings: { rank: number; name: string; you: boolean; score: number; durationMs: number }[];
  heldForReview: number | { userId: string; name: string; flag: string; score: number; durationMs: number }[];
  review: { question: string; chosen: string; correct: string; right: boolean }[] | null;
}
interface Run { questions: { text: string; options: string[] }[]; deadline: string }

/** Time until the tournament opens or closes, from its real timestamps. Refreshes the page data when it reaches zero. */
function Clock({ to, label, onZero }: { to: string; label: string; onZero: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const left = Date.parse(to) - now;
  useEffect(() => {
    if (left <= 0) { onZero(); return; }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return <p className="text-sm text-fg-2" role="timer" aria-label={label}><span className="text-fg-3">{label}</span> <span className="font-display text-2xl text-fg numeric" data-testid="tournament-clock">{remaining(left)}</span></p>;
}

/** Three, two, one before the questions arrive — the clock only starts when the server hands them over. */
function ReadyCount({ onGo, onCancel }: { onGo: () => void; onCancel: () => void }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    if (n === 0) { onGo(); return; }
    const id = window.setTimeout(() => setN(n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="space-y-3 text-center" aria-label="Get ready" role="status">
      <p className="eyebrow">Get ready</p>
      <p key={n} className="m-enter font-display text-7xl numeric text-fg">{n || 'Go'}</p>
      <p className="text-sm text-fg-2">Your time starts when the first question appears.</p>
      {n > 0 && <Button size="sm" variant="ghost" onClick={onCancel}>Not yet</Button>}
    </Card>
  );
}

export function TournamentPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['tournament', id], queryFn: () => get<Detail>(`play/tournaments/${id}`) });
  const [run, setRun] = useState<Run | null>(null);
  const [reporting, setReporting] = useState(false);
  const [counting, setCounting] = useState(false);
  const begin = () => { if (prefersReducedMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) start.mutate(); else setCounting(true); };
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['tournament', id] }); void qc.invalidateQueries({ queryKey: ['tournaments'] }); void qc.invalidateQueries({ queryKey: ['tournament-history'] }); };
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error');
  const act = useMutation({ mutationFn: (what: 'join' | 'decline' | 'cancel') => post(`play/tournaments/${id}/${what}`), onSuccess: refresh, onError: fail });
  const start = useMutation({ mutationFn: () => post<Run>(`play/tournaments/${id}/start`), onSuccess: (r) => setRun(r), onError: fail, onSettled: () => setCounting(false) });
  const clear = useMutation({ mutationFn: (userId: string) => post(`admin/tournaments/${id}/entries/${userId}/clear`), onSuccess: refresh, onError: fail });
  return (
    <QueryState q={q}>{(d) => {
      const t = d.tournament;
      const playing = run || d.me.state === 'playing';
      const outcome = runOutcome({ status: t.status, rank: d.me.rank, ranked: d.standings.length, flag: d.me.flag });
      return (
        <div className="mx-auto max-w-2xl space-y-6">
          <PageHeader kicker={<span className="inline-flex items-center gap-2">Tournament <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge></span>} title={t.title}
            subtitle={`${t.isHost ? 'You host' : `Hosted by ${t.host}`} · ${t.questions} questions · ${t.secondsPerQuestion}s each · ${t.status === 'upcoming' ? `opens ${when(t.opensAt)}` : `closes ${when(t.closesAt)}`}`} />

          {t.status === 'upcoming' && <Clock to={t.opensAt} label="Opens in" onZero={refresh} />}
          {t.status === 'open' && !run && <Clock to={t.closesAt} label="Closes in" onZero={refresh} />}

          {counting ? <ReadyCount onGo={() => start.mutate()} onCancel={() => setCounting(false)} />
          : start.isPending && !run ? <Card role="status"><p className="text-fg">Getting your questions…</p></Card>
          : t.status === 'open' && playing && d.me.state !== 'finished' ? (
            run ? <PlayRun id={id!} run={run} onDone={() => { setRun(null); refresh(); }} /> : (
              <Card className="space-y-3"><p className="text-fg">Your run is in progress — the clock kept going.</p><Button loading={start.isPending} onClick={() => start.mutate()}>Back to my questions</Button></Card>
            )
          ) : d.me.state === 'finished' ? (
            <Card className={cx('space-y-2', outcome.tone === 'win' && 'm-success border-accent/60')} aria-label="Your run">
              <p className="eyebrow">Your run · {outcome.final ? 'final result' : 'not final yet'}</p>
              <h2 className="font-display text-3xl text-fg">{outcome.title}</h2>
              <p className="font-display text-4xl numeric">{d.me.score} / {t.questions}</p>
              <p className="text-sm text-fg-2">{secs(d.me.durationMs)} · {d.me.flag ? 'Held for a quick review — that was faster (or later) than the rules allow. A moderator will check it.' : d.me.rank ? `Currently #${d.me.rank}` : ''}</p>
              {!d.review && t.status !== 'closed' && <p className="text-xs text-fg-3">Answers are revealed when the tournament closes.</p>}
              <p className="text-xs text-fg-3">The standings are the result: tournaments are free and give no XP or prizes, so there is nothing to claim.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <ButtonLink to="/play/tournaments" size="sm" variant="secondary">All tournaments</ButtonLink>
                <ButtonLink to="/play/tournaments/new" size="sm" variant="ghost">Host one</ButtonLink>
                <ButtonLink to="/play" size="sm" variant="ghost">Back to Play</ButtonLink>
              </div>
            </Card>
          ) : t.isHost ? (
            <Card className="space-y-3">
              <p className="text-fg">{t.entrants} of {t.maxEntrants} joined. You wrote the questions, so you don’t play — you’ll see the standings fill in here.</p>
              {(t.status === 'open' || t.status === 'upcoming') && <Button size="sm" variant="ghost" loading={act.isPending} onClick={() => act.mutate('cancel')}>Call it off</Button>}
            </Card>
          ) : d.me.state === 'joined' ? (
            <Card className="space-y-3">
              <p className="text-fg">You’re in. When you press Start you get {t.questions} questions and {Math.round(t.timeLimitSeconds)} seconds in total. One go only — the clock doesn’t pause.</p>
              {t.status === 'open' ? <Button size="lg" loading={start.isPending} onClick={begin}>Start</Button> : <p className="text-sm text-fg-3">{t.status === 'upcoming' ? `Opens ${when(t.opensAt)}.` : 'This tournament is no longer running.'}</p>}
            </Card>
          ) : d.me.canJoin ? (
            <Card className="flex flex-wrap items-center gap-2">
              <p className="w-full text-fg">{d.me.state === 'invited' ? 'You’re invited.' : 'Your circle is playing.'} Free to enter, nothing to buy, one go each.</p>
              <Button loading={act.isPending} onClick={() => act.mutate('join')}>Join</Button>
              {d.me.state === 'invited' && <Button variant="ghost" onClick={() => act.mutate('decline')}>Not this time</Button>}
            </Card>
          ) : t.status !== 'closed' && t.status !== 'cancelled' ? <Notice tone="info">This tournament is full.</Notice> : null}

          {d.review && (
            <Card className="space-y-2" aria-label="Answers">
              <h2 className="font-display text-2xl">Answers</h2>
              <ul className="space-y-2 text-sm">{d.review.map((r) => <li key={r.question}><p className="text-fg">{r.question}</p><p className={r.right ? 'text-success' : 'text-fg-2'}>{r.right ? `✓ ${r.chosen}` : `You said ${r.chosen} · answer: ${r.correct}`}</p></li>)}</ul>
            </Card>
          )}

          <TournamentArena standings={d.standings} questions={t.questions} closed={t.status === 'closed'} />

          <Card aria-label="Standings">
            <h2 className="font-display text-2xl">Standings</h2>
            {d.standings.length ? (
              <ol className="mt-3 divide-y divide-line">{d.standings.map((r, i) => (
                <li key={i} className={cx('flex items-center gap-3 py-2', r.you && 'font-semibold')}>
                  <span className="w-8 text-fg-3 numeric">#{r.rank}</span><span className="flex-1 text-fg">{r.you ? 'You' : r.name}</span>
                  <span className="numeric text-fg-2">{r.score}/{t.questions}</span><span className="w-16 text-right text-xs text-fg-3 numeric">{secs(r.durationMs)}</span>
                </li>
              ))}</ol>
            ) : <p className="mt-2 text-sm text-fg-3">Nobody has finished yet.</p>}
            <p className="mt-3 text-xs text-fg-3">Ranked by score, then time. Same score and time share a place.{typeof d.heldForReview === 'number' && d.heldForReview ? ` ${d.heldForReview} run${d.heldForReview === 1 ? ' is' : 's are'} held for review.` : ''}</p>
          </Card>

          {Array.isArray(d.heldForReview) && d.heldForReview.length > 0 && (
            <Card className="space-y-2" aria-label="Held for review">
              <h2 className="font-display text-xl">Held for review (moderators)</h2>
              <ul className="space-y-2 text-sm">{d.heldForReview.map((h) => (
                <li key={h.userId} className="flex flex-wrap items-center justify-between gap-2"><span>{h.name} · {h.score}/{t.questions} in {secs(h.durationMs)} · {h.flag === 'too_fast' ? 'too fast' : 'over time'}</span><Button size="sm" variant="secondary" loading={clear.isPending} onClick={() => clear.mutate(h.userId)}>Release into ranking</Button></li>
              ))}</ul>
            </Card>
          )}

          <div className="flex gap-3 text-sm">
            <Link to="/play/tournaments" className="text-accent underline underline-offset-2">All tournaments</Link>
            {!t.isHost && <button type="button" className="text-fg-3 underline underline-offset-2" onClick={() => setReporting(true)}>Report</button>}
          </div>
          <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="tournament" targetId={t.id} />
        </div>
      );
    }}</QueryState>
  );
}

function PlayRun({ id, run, onDone }: { id: string; run: Run; onDone: () => void }) {
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [left, setLeft] = useState(() => Math.max(0, Math.round((Date.parse(run.deadline) - Date.now()) / 1000)));
  useEffect(() => {
    const h = setInterval(() => setLeft(Math.max(0, Math.round((Date.parse(run.deadline) - Date.now()) / 1000))), 1000);
    return () => clearInterval(h);
  }, [run.deadline]);
  const submit = useMutation({
    mutationFn: () => post<{ score: number; total: number; flag: string | null }>(`play/tournaments/${id}/submit`, { answers: run.questions.map((_, i) => answers[i] ?? 0) }),
    onSuccess: (r) => { toast(r.flag ? 'Submitted — held for a quick review.' : `Submitted: ${r.score} / ${r.total}`, r.flag ? 'info' : 'success'); onDone(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not submit', 'error'),
  });
  const done = Object.keys(answers).length === run.questions.length;
  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-10 flex items-center justify-between rounded-[var(--radius)] border border-line bg-surface px-4 py-2" role="timer" aria-live="off" aria-label="Time left">
        <span className="text-sm text-fg-2">{Object.keys(answers).length} of {run.questions.length} answered</span>
        <span className={cx('font-display text-2xl numeric', left <= 10 && 'text-danger')}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      </div>
      {left === 0 && <Notice tone="warning">Time’s up — submit what you have. Late runs are kept but don’t count in the standings.</Notice>}
      {run.questions.map((qq, i) => (
        <fieldset key={i} className="card p-4">
          <legend className="px-1 text-fg">{i + 1}. {qq.text}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{qq.options.map((o, j) => (
            <label key={j} className={cx('flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-sm', answers[i] === j ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-2')}>
              <input type="radio" name={`t${i}`} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} />{o}
            </label>
          ))}</div>
        </fieldset>
      ))}
      <Button size="lg" disabled={!done && left > 0} loading={submit.isPending} onClick={() => submit.mutate()}>Submit answers</Button>
    </div>
  );
}

interface Board { season: { key: string; name: string; endsOn: string } | null; rows: { rank: number; name: string; handle: string | null; points: number; you: boolean }[]; me: { rank: number; points: number; of: number; visible: boolean } | null }

export function SeasonLeaderboard() {
  const qc = useQueryClient();
  const [scope, setScope] = useState('following');
  const circles = useQuery({ queryKey: ['circles'], queryFn: () => get<{ circles: { id: string; name: string }[] }>('circles') });
  const query = scope === 'following' ? 'scope=following' : `scope=circle&circleId=${scope}`;
  const q = useQuery({ queryKey: ['season-board', scope], queryFn: () => get<Board>(`play/leaderboards/season?${query}`) });
  const vis = useMutation({ mutationFn: (visible: boolean) => put('play/leaderboards/settings', { visible }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['season-board'] }) });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader kicker="Play" title="Season leaderboard" subtitle="Season points are the XP you earn this season. Only people you follow or share a circle with — there is no global board, and nothing here can be bought." />
      <Field label="Compare with">{(id) => <Select id={id} value={scope} onChange={(e) => setScope(e.target.value)}><option value="following">People I follow</option>{circles.data?.circles.map((c) => <option key={c.id} value={c.id}>Circle: {c.name}</option>)}</Select>}</Field>
      <QueryState q={q}>{(d) => !d.season ? <EmptyState icon="rewards" title="No season running" body="The next season’s board appears when it starts." /> : (
        <>
          <Card aria-label="Leaderboard">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-display text-2xl">{d.season.name}</h2><p className="text-xs text-fg-3">Ends {new Date(d.season.endsOn).toLocaleDateString()}</p></div>
            {d.me && <p className="mt-1 text-sm text-fg-2">You’re #{d.me.rank} of {d.me.of} with {d.me.points} points.</p>}
            <ol className="mt-3 divide-y divide-line">{d.rows.map((r, i) => (
              <li key={i} className={cx('flex items-center gap-3 py-2', r.you && 'font-semibold')}>
                <span className="w-8 text-fg-3 numeric">#{r.rank}</span>
                <span className="flex-1 text-fg">{r.you ? 'You' : r.handle ? <Link to={`/i/${r.handle}`} className="hover:underline">{r.name}</Link> : r.name}</span>
                <span className="numeric text-fg-2">{r.points}</span>
              </li>
            ))}</ol>
            {d.rows.length <= 1 && <p className="mt-2 text-sm text-fg-3">Follow people or join a circle to have someone to compare with.</p>}
          </Card>
          {d.me && <Switch label="Show me on leaderboards" description="When off, other people won’t see you on their boards. You still see your own points." checked={d.me.visible} onChange={(v) => vis.mutate(v)} />}
        </>
      )}</QueryState>
    </div>
  );
}
