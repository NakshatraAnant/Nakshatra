import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, post } from '../lib/api';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { QUIZ_LIMITS as L, QuizError, validateQuiz, type QuizDefinition, type QuizKind, type QuizQuestion } from '../../shared/quiz';

interface QuizCard { id: string; kind: QuizKind; title: string; description: string; author: string; isMine: boolean; takes: number; taken: boolean }

export function QuizzesPage() {
  const q = useQuery({ queryKey: ['quizzes'], queryFn: () => get<{ quizzes: QuizCard[] }>('play/quizzes') });
  return (
    <div className="space-y-6">
      <PageHeader kicker="Play" title="Quizzes" subtitle="Made by members, for friends. Just for fun — not personality tests." actions={<ButtonLink to="/play/quizzes/new">Make a quiz</ButtonLink>} />
      <QueryState q={q} empty={(d) => (!d.quizzes.length ? <EmptyState icon="rewards" title="No quizzes yet" body="Make the first one — “How well do you know me?” is a classic." action={<ButtonLink to="/play/quizzes/new" size="sm">Make a quiz</ButtonLink>} /> : null)}>{(d) => (
        <ul className="grid gap-3 sm:grid-cols-2">{d.quizzes.map((z) => (
          <li key={z.id}><Link to={`/play/quizzes/${z.id}`} className="card block h-full p-4 hover:border-line-strong">
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-fg">{z.title}</p><Badge tone="neutral">{z.kind === 'trivia' ? 'Trivia' : 'Which one are you?'}</Badge>{z.taken && <Badge tone="success">Taken</Badge>}</div>
            {z.description && <p className="mt-1 text-sm text-fg-2">{z.description}</p>}
            <p className="mt-2 text-xs text-fg-3">by {z.isMine ? 'you' : z.author} · {z.takes} {z.takes === 1 ? 'take' : 'takes'}</p>
          </Link></li>
        ))}</ul>
      )}</QueryState>
    </div>
  );
}

const blankQuestion = (kind: QuizKind): QuizQuestion => ({ text: '', options: [{ text: '', ...(kind === 'trivia' ? { correct: true } : { outcome: 0 }) }, { text: '', ...(kind === 'trivia' ? { correct: false } : { outcome: 1 }) }] });

export function QuizBuilder() {
  const nav = useNavigate();
  const [kind, setKind] = useState<QuizKind>('trivia');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [outcomes, setOutcomes] = useState([{ title: '', description: '' }, { title: '', description: '' }]);
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => [blankQuestion('trivia'), blankQuestion('trivia')]);
  const [where, setWhere] = useState('members');
  const [error, setError] = useState<string | null>(null);
  const circles = useQuery({ queryKey: ['circles'], queryFn: () => get<{ circles: { id: string; name: string }[] }>('circles') });
  const def: QuizDefinition = { kind, title, description, outcomes: kind === 'outcome' ? outcomes : [], questions };
  const publish = useMutation({
    mutationFn: () => post<{ quiz: { id: string } }>('play/quizzes', { definition: def, visibility: where === 'members' ? 'members' : 'circle', circleId: where === 'members' ? undefined : where }),
    onSuccess: (r) => nav(`/play/quizzes/${r.quiz.id}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not publish'),
  });
  const submit = () => { try { validateQuiz(def); setError(null); publish.mutate(); } catch (e) { setError(e instanceof QuizError ? e.message : 'Check the quiz'); } };
  const switchKind = (k: QuizKind) => { setKind(k); setQuestions(questions.map((q) => ({ ...q, options: q.options.map((o, i) => (k === 'trivia' ? { text: o.text, correct: i === 0 } : { text: o.text, outcome: Math.min(i, outcomes.length - 1) })) }))); };
  const setQ = (i: number, patch: Partial<QuizQuestion>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const setO = (qi: number, oi: number, patch: Record<string, unknown>) => setQ(qi, { options: questions[qi].options.map((o, j) => (j === oi ? { ...o, ...patch } : patch.correct ? { ...o, correct: false } : o)) });
  return (
    <div className="space-y-6">
      <PageHeader kicker="Play" title="Make a quiz" subtitle="Your friends answer; you see how they did. Nothing here changes anyone’s archetype." />
      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quiz type">
          {([['trivia', 'Trivia — right or wrong answers'], ['outcome', 'Which one are you? — answers lead to results']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => switchKind(k)} className={cx('min-h-9 rounded-full border px-3 text-sm', kind === k ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2')}>{label}</button>
          ))}
        </div>
        <Field label="Title">{(id) => <Input id={id} maxLength={L.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'trivia' ? 'How well do you know me?' : 'Which snack are you?'} />}</Field>
        <Field label="Description (optional)">{(id) => <Textarea id={id} rows={2} maxLength={L.description} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label="Who can take it">{(id) => <Select id={id} value={where} onChange={(e) => setWhere(e.target.value)}><option value="members">Any Nakshatra member</option>{circles.data?.circles.map((c) => <option key={c.id} value={c.id}>Only circle: {c.name}</option>)}</Select>}</Field>
      </Card>

      {kind === 'outcome' && (
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Results</h2>
          {outcomes.map((o, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <Input aria-label={`Result ${i + 1} title`} placeholder={`Result ${i + 1}`} maxLength={L.title} value={o.title} onChange={(e) => setOutcomes(outcomes.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Input aria-label={`Result ${i + 1} description`} placeholder="One line about it" maxLength={L.description} value={o.description} onChange={(e) => setOutcomes(outcomes.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              {outcomes.length > L.minOutcomes && <Button size="sm" variant="ghost" onClick={() => { setOutcomes(outcomes.filter((_, j) => j !== i)); setQuestions(questions.map((q) => ({ ...q, options: q.options.map((op) => ({ ...op, outcome: Math.min(op.outcome ?? 0, outcomes.length - 2) })) }))); }}>Remove</Button>}
            </div>
          ))}
          {outcomes.length < L.maxOutcomes && <Button size="sm" variant="secondary" onClick={() => setOutcomes([...outcomes, { title: '', description: '' }])}>Add a result</Button>}
        </Card>
      )}

      {questions.map((q, i) => (
        <Card key={i} className="space-y-3" aria-label={`Question ${i + 1}`}>
          <div className="flex items-center justify-between gap-2"><h2 className="font-display text-xl">Question {i + 1}</h2>{questions.length > L.minQuestions && <Button size="sm" variant="ghost" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove</Button>}</div>
          <Input aria-label={`Question ${i + 1} text`} maxLength={L.text} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="Ask something" />
          {q.options.map((o, j) => (
            <div key={j} className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Question ${i + 1} answer ${j + 1}`} className="min-w-0 flex-1" maxLength={L.option} value={o.text} onChange={(e) => setO(i, j, { text: e.target.value })} placeholder={`Answer ${j + 1}`} />
              {kind === 'trivia'
                ? <label className="flex items-center gap-1 text-sm text-fg-2"><input type="radio" name={`correct-${i}`} aria-label={`Question ${i + 1}: answer ${j + 1} is correct`} checked={!!o.correct} onChange={() => setO(i, j, { correct: true })} />Correct</label>
                : <Select aria-label={`Question ${i + 1} answer ${j + 1} leads to`} className="w-40" value={o.outcome ?? 0} onChange={(e) => setO(i, j, { outcome: Number(e.target.value) })}>{outcomes.map((oc, k) => <option key={k} value={k}>{oc.title || `Result ${k + 1}`}</option>)}</Select>}
              {q.options.length > L.minOptions && <Button size="sm" variant="ghost" aria-label={`Remove answer ${j + 1}`} onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== j) })}>✕</Button>}
            </div>
          ))}
          {q.options.length < L.maxOptions && <Button size="sm" variant="ghost" onClick={() => setQ(i, { options: [...q.options, kind === 'trivia' ? { text: '', correct: false } : { text: '', outcome: 0 }] })}>Add an answer</Button>}
        </Card>
      ))}
      {questions.length < L.maxQuestions && <Button variant="secondary" onClick={() => setQuestions([...questions, blankQuestion(kind)])}>Add a question</Button>}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" loading={publish.isPending} onClick={submit}>Publish quiz</Button>
    </div>
  );
}

interface QuizView {
  quiz: { id: string; kind: QuizKind; title: string; description: string; author: string; isMine: boolean; total: number; questions: { text: string; options: string[] }[] };
  result: null | { kind: 'trivia'; score: number; total: number; review: { question: string; chosen: string; correct: string; right: boolean }[] } | { kind: 'outcome'; outcome: { title: string; description: string }; total: number };
  summary: null | { takes: number; averageScore?: number; outcomes?: { title: string; n: number }[] };
}

export function QuizTake() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['quiz', id], queryFn: () => get<QuizView>(`play/quizzes/${id}`) });
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [retake, setRetake] = useState(false);
  const submit = useMutation({
    mutationFn: (total: number) => post(`play/quizzes/${id}/attempts`, { answers: Array.from({ length: total }, (_, i) => answers[i]) }),
    onSuccess: () => { setRetake(false); setAnswers({}); void qc.invalidateQueries({ queryKey: ['quiz', id] }); void qc.invalidateQueries({ queryKey: ['quizzes'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not submit', 'error'),
  });
  const remove = useMutation({ mutationFn: () => del(`play/quizzes/${id}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['quizzes'] }); nav('/play/quizzes'); } });
  return (
    <QueryState q={q}>{(d) => (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader kicker={d.quiz.kind === 'trivia' ? 'Trivia' : 'Which one are you?'} title={d.quiz.title} subtitle={`${d.quiz.description ? `${d.quiz.description} · ` : ''}by ${d.quiz.isMine ? 'you' : d.quiz.author}`} />
        {d.quiz.isMine ? (
          <Card className="space-y-3">
            <h2 className="font-display text-2xl">How people did</h2>
            <p className="text-sm text-fg-2">{d.summary?.takes ?? 0} {d.summary?.takes === 1 ? 'person has' : 'people have'} taken it.{d.summary?.averageScore !== undefined && d.summary.takes ? ` Average ${d.summary.averageScore} of ${d.quiz.total}.` : ''}</p>
            {d.summary?.outcomes && <ul className="space-y-1 text-sm">{d.summary.outcomes.map((o) => <li key={o.title} className="flex justify-between"><span>{o.title}</span><span className="numeric text-fg-3">{o.n}</span></li>)}</ul>}
            <p className="text-xs text-fg-3">You see totals only — never who answered what.</p>
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(location.href).then(() => toast('Link copied', 'success'))}>Copy link</Button><Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>Remove quiz</Button></div>
          </Card>
        ) : d.result && !retake ? (
          <Card className="space-y-3" aria-label="Your result">
            {d.result.kind === 'trivia' ? (<>
              <h2 className="font-display text-3xl">{d.result.score} / {d.result.total}</h2>
              <ul className="space-y-2 text-sm">{d.result.review.map((r) => <li key={r.question}><p className="text-fg">{r.question}</p><p className={r.right ? 'text-success' : 'text-fg-2'}>{r.right ? `✓ ${r.chosen}` : `You said ${r.chosen} · answer: ${r.correct}`}</p></li>)}</ul>
            </>) : (<>
              <p className="eyebrow">You got</p>
              <h2 className="font-display text-4xl">{d.result.outcome.title}</h2>
              {d.result.outcome.description && <p className="text-fg-2">{d.result.outcome.description}</p>}
            </>)}
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setRetake(true)}>Take it again</Button><ButtonLink to="/play/quizzes" size="sm" variant="ghost">More quizzes</ButtonLink></div>
          </Card>
        ) : (
          <div className="space-y-4">
            {d.quiz.questions.map((qq, i) => (
              <fieldset key={i} className="card p-4">
                <legend className="px-1 text-fg">{i + 1}. {qq.text}</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">{qq.options.map((o, j) => (
                  <label key={j} className={cx('flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 text-sm', answers[i] === j ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-2')}>
                    <input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} />{o}
                  </label>
                ))}</div>
              </fieldset>
            ))}
            <Button size="lg" disabled={Object.keys(answers).length !== d.quiz.total} loading={submit.isPending} onClick={() => submit.mutate(d.quiz.total)}>See my result</Button>
          </div>
        )}
      </div>
    )}</QueryState>
  );
}
