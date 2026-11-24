import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from '../lib/api';
import { useModules } from '../lib/modules';
import { Button, cx } from './ui/primitives';
import { useToast } from './ui/overlays';

interface Base { id: string; disclosure: string; why: string; ctaLabel: string; url: string; endsAt: string }
interface QuizItem extends Base { quiz: { title: string; description: string; questions: { text: string; options: string[] }[] }; myScore: number | null; total: number }
interface QuestItem extends Base { quest: { title: string; description: string; steps: string[] }; accepted: boolean; done: boolean }

function useSponsored<T>(placement: 'quiz' | 'quest') {
  const mods = useModules();
  return useQuery({ queryKey: ['sponsored', placement], queryFn: () => get<{ items: T[] }>(`ads/sponsored?placement=${placement}`), enabled: mods.enabled('ads'), retry: false });
}

function Frame({ item, label, children, onHidden }: { item: Base; label: string; children: React.ReactNode; onHidden: () => void }) {
  const [why, setWhy] = useState(false);
  const hide = useMutation({ mutationFn: () => post(`ads/${item.id}/hide`, { reason: 'not_relevant' }), onSuccess: onHidden });
  return (
    <aside className="card space-y-3 border-dashed p-5" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-2">{item.disclosure}</p>
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" aria-expanded={why} onClick={() => setWhy(!why)}>Why am I seeing this?</Button>
          <Button size="sm" variant="ghost" loading={hide.isPending} onClick={() => hide.mutate()}>Hide</Button>
        </span>
      </div>
      {why && <p className="text-xs text-fg-3">{item.why}</p>}
      {children}
      <a href={item.url} target="_blank" rel="noopener noreferrer sponsored" className="inline-flex text-sm text-accent hover:underline">{item.ctaLabel} ↗</a>
    </aside>
  );
}

/** Sponsored trivia on the Quizzes page. Scored on the server; no XP or rewards. */
export function SponsoredQuizzes() {
  const qc = useQueryClient();
  const q = useSponsored<QuizItem>('quiz');
  if (!q.data?.items.length) return null;
  return <section aria-label="Sponsored quizzes" className="space-y-3">{q.data.items.map((it) => <SponsoredQuiz key={it.id} item={it} onHidden={() => void qc.invalidateQueries({ queryKey: ['sponsored', 'quiz'] })} />)}</section>;
}

function SponsoredQuiz({ item, onHidden }: { item: QuizItem; onHidden: () => void }) {
  const toast = useToast();
  const [answers, setAnswers] = useState<(number | null)[]>(item.quiz.questions.map(() => null));
  const [result, setResult] = useState<{ score: number; total: number; answers: number[] } | null>(null);
  const submit = useMutation({ mutationFn: () => post<{ score: number; total: number; answers: number[] }>(`ads/${item.id}/quiz`, { answers }), onSuccess: setResult, onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not submit', 'error') });
  const taken = result ?? (item.myScore !== null ? { score: item.myScore, total: item.total, answers: [] } : null);
  return (
    <Frame item={item} label={`Sponsored quiz: ${item.quiz.title}`} onHidden={onHidden}>
      <div>
        <h3 className="font-display text-xl">{item.quiz.title}</h3>
        {item.quiz.description && <p className="text-sm text-fg-2">{item.quiz.description}</p>}
      </div>
      {taken && !result ? <p className="text-sm text-fg">You scored {taken.score} of {taken.total}.</p> : (
        <ol className="space-y-3">{item.quiz.questions.map((qq, i) => (
          <li key={i}>
            <p id={`sq-${item.id}-${i}`} className="text-sm font-semibold text-fg">{qq.text}</p>
            <div role="radiogroup" aria-labelledby={`sq-${item.id}-${i}`} className="mt-1 flex flex-wrap gap-2">{qq.options.map((o, j) => {
              const picked = answers[i] === j;
              const right = result?.answers[i] === j;
              return <button key={j} type="button" role="radio" aria-checked={picked} disabled={Boolean(result)} onClick={() => setAnswers(answers.map((x, k) => (k === i ? j : x)))}
                className={cx('rounded-full border px-3 py-1.5 text-sm', result ? (right ? 'border-success text-success' : picked ? 'border-danger text-danger' : 'border-line text-fg-3') : picked ? 'border-fg text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>{o}</button>;
            })}</div>
          </li>
        ))}</ol>
      )}
      {result && <p className="text-sm text-fg" role="status">You scored {result.score} of {result.total}.</p>}
      {!taken && <Button size="sm" disabled={answers.some((x) => x === null)} loading={submit.isPending} onClick={() => submit.mutate()}>Check my answers</Button>}
      <p className="text-xs text-fg-3">Just for fun — no points or rewards. The sponsor only sees how many people played.</p>
    </Frame>
  );
}

/** Sponsored challenges on the Progress page. Self-reported, earns nothing. */
export function SponsoredChallenges() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useSponsored<QuestItem>('quest');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['sponsored', 'quest'] });
  const act = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'accept' | 'done' | 'leave' }) => post(`ads/${id}/quest`, { action }), onSuccess: refresh, onError: (e) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error') });
  if (!q.data?.items.length) return null;
  return (
    <section aria-label="Sponsored challenges" className="space-y-3">{q.data.items.map((it) => (
      <Frame key={it.id} item={it} label={`Sponsored challenge: ${it.quest.title}`} onHidden={refresh}>
        <div>
          <h3 className="font-display text-xl">{it.quest.title}</h3>
          {it.quest.description && <p className="text-sm text-fg-2">{it.quest.description}</p>}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-2">{it.quest.steps.map((st) => <li key={st}>{st}</li>)}</ol>
        <div className="flex flex-wrap items-center gap-2">
          {it.done ? <span className="text-sm text-success">✓ Done</span>
            : it.accepted ? <Button size="sm" onClick={() => act.mutate({ id: it.id, action: 'done' })}>I did it</Button>
            : <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: it.id, action: 'accept' })}>Join the challenge</Button>}
          {(it.accepted || it.done) && <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: it.id, action: 'leave' })}>Leave</Button>}
        </div>
        <p className="text-xs text-fg-3">Just for fun — no XP or rewards. The sponsor only sees how many people joined and finished.</p>
      </Frame>
    ))}</section>
  );
}
