import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, patch, post, upload, api } from '../lib/api';
import { cap, money } from '../lib/format';
import { useMe } from '../lib/session';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { RoleGate } from '../components/RoleApplication';
import { QueryState, Notice, EmptyState, SampleBadge } from '../components/ui/feedback';
import { Dialog, Tabs, useToast } from '../components/ui/overlays';
import { ProgressRing, DataTable } from '../components/ui/data';
import { Icon } from '../components/ui/icons';

interface CourseItem { id: string; slug: string; title: string; subtitle: string; level: string; topics: string[]; pricePaise: number; isSample: boolean; creator?: { displayName: string }; lessonCount: number; minutes: number; rating: { avg: number; n: number } | null; enrolled: boolean }

export function LearnPage() {
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const q = useQuery({ queryKey: ['courses', topic, level], queryFn: () => get<{ courses: CourseItem[]; recommendedIds: string[]; recommendationExplanation: string }>(`courses?${new URLSearchParams({ ...(topic && { topic }), ...(level && { level }) })}`) });
  const mine = useQuery({ queryKey: ['learning-me'], queryFn: () => get<{ enrollments: { course: { id: string; slug: string; title: string }; status: string; progress: number; done: number; total: number }[]; certificates: { serial: string; courseTitle: string }[]; bookmarks: { id: string; title: string }[] }>('learning/me') });
  const me = useMe().data?.user;
  return (
    <div>
      <PageHeader kicker="Learn" title="Understand the sky" subtitle="Structured courses with quizzes and certificates that reflect real completion." actions={me?.roles.some((r) => ['creator', 'expert', 'admin'].includes(r)) ? <ButtonLink to="/creator" variant="secondary" icon="edit">Creator studio</ButtonLink> : <ButtonLink to="/creator" variant="ghost" icon="edit">Teach on Nakshatra</ButtonLink>} />
      <QueryState q={mine}>{(m) => m.enrollments.length > 0 ? (
        <section className="mb-8"><h2 className="mb-3 font-display text-2xl">Continue learning</h2>
          <ul className="grid gap-3 md:grid-cols-3">{m.enrollments.map((e) => <li key={e.course.id}><Link to={`/learn/${e.course.slug}`} className="card flex items-center gap-4 p-4 hover:border-line-strong"><ProgressRing value={e.progress} size={56} label={e.course.title} /><div><p className="text-fg">{e.course.title}</p><p className="text-xs text-fg-3">{e.done}/{e.total} lessons · {e.status}</p></div></Link></li>)}</ul>
          {m.certificates.length > 0 && <p className="mt-3 text-sm text-fg-2">Certificates: {m.certificates.map((c) => <Link key={c.serial} to={`/learn/certificates/${c.serial}`} className="mr-3 text-accent underline">{c.courseTitle}</Link>)}</p>}
        </section>
      ) : null}</QueryState>
      <div className="mb-5 flex flex-wrap gap-3">
        <Select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-48"><option value="">All topics</option>{['vedic', 'western', 'panchang', 'learning', 'transits', 'nakshatras', 'tarot', 'numerology'].map((t) => <option key={t} value={t}>{cap(t)}</option>)}</Select>
        <Select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)} className="w-44"><option value="">All levels</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select>
      </div>
      <QueryState q={q} empty={(d) => (!d.courses.length ? <EmptyState icon="learn" title="No courses yet" /> : null)}>{(d) => (
        <>
          {d.recommendedIds.length > 0 && <p className="mb-3 text-xs text-fg-3">✦ Recommended for you: {d.recommendationExplanation}</p>}
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{d.courses.map((c) => (
            <li key={c.id}><Link to={`/learn/${c.slug}`} className={cx('card flex h-full flex-col p-5 hover:border-line-strong', d.recommendedIds.includes(c.id) && 'border-accent/50')}>
              <div className="flex flex-wrap items-center gap-2"><Badge tone="violet">{cap(c.level)}</Badge>{c.isSample && <SampleBadge />}{d.recommendedIds.includes(c.id) && <Badge tone="accent">Recommended</Badge>}{c.enrolled && <Badge tone="success">Enrolled</Badge>}</div>
              <h2 className="mt-3 font-display text-2xl">{c.title}</h2>
              <p className="mt-1 flex-1 text-sm text-fg-2">{c.subtitle}</p>
              <p className="mt-3 text-xs text-fg-3">{c.lessonCount} lessons · {c.minutes} min · by {c.creator?.displayName}{c.rating ? ` · ★ ${Number(c.rating.avg).toFixed(1)}` : ''}</p>
              <p className="mt-2 font-semibold text-fg">{c.pricePaise ? money(c.pricePaise) : 'Free'}</p>
            </Link></li>
          ))}</ul>
        </>
      )}</QueryState>
    </div>
  );
}

interface CourseDetail { course: CourseItem & { description: string; passPercent: number; certificateEnabled: boolean; status: string; creatorId: string }; chapters: { id: string; title: string; position: number }[]; lessons: { id: string; chapterId: string; title: string; kind: string; durationMinutes: number; isPreview: boolean; completed: boolean; quizId: string | null; quizPassed: boolean; bookmarked: boolean }[]; enrollment: { status: string } | null; certificate: { serial: string } | null; product: { slug: string } | null; reviews: { id: string; rating: number; body: string; author?: string }[] }

export function CoursePage() {
  const { slug } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [review, setReview] = useState({ rating: 5, body: '' });
  const q = useQuery({ queryKey: ['course', slug], queryFn: () => get<CourseDetail>(`courses/${slug}`) });
  const enroll = useMutation({ mutationFn: () => post<{ enrolled?: boolean; requiresPurchase?: boolean; productSlug?: string | null }>(`courses/${q.data!.course.id}/enroll`), onSuccess: (r) => { if (r.requiresPurchase && r.productSlug) nav(`/shop/p/${r.productSlug}`); else { qc.invalidateQueries({ queryKey: ['course', slug] }); toast('Enrolled', 'success'); } } });
  const rev = useMutation({ mutationFn: () => post(`courses/${q.data!.course.id}/review`, review), onSuccess: () => { qc.invalidateQueries({ queryKey: ['course', slug] }); toast('Thanks for your review', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <QueryState q={q}>{(d) => {
      const done = d.lessons.filter((l) => l.completed).length;
      const next = d.lessons.find((l) => !l.completed) ?? d.lessons[0];
      return (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <PageHeader kicker={`${cap(d.course.level)} course`} title={d.course.title} subtitle={d.course.subtitle} />
            {d.course.isSample && <Notice tone="dev" className="mb-4">Development sample course.</Notice>}
            {d.course.description && <p className="mb-6 whitespace-pre-line leading-relaxed text-fg-2">{d.course.description}</p>}
            {d.chapters.map((ch) => (
              <section key={ch.id} className="mb-5">
                <h2 className="mb-2 font-display text-2xl">{ch.title}</h2>
                <ul className="divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-line">
                  {d.lessons.filter((l) => l.chapterId === ch.id).map((l) => {
                    const open = l.isPreview || d.enrollment;
                    return (
                      <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                        <span className={cx('flex h-6 w-6 items-center justify-center rounded-full border text-xs', l.completed ? 'border-success bg-success/15 text-success' : 'border-line text-fg-3')}>{l.completed ? '✓' : ''}</span>
                        {open ? <Link to={`/learn/lesson/${l.id}`} className="flex-1 text-fg hover:underline">{l.title}</Link> : <span className="flex-1 text-fg-3">{l.title}</span>}
                        <span className="text-xs text-fg-3">{l.kind} · {l.durationMinutes} min{l.quizId ? ` · quiz${l.quizPassed ? ' ✓' : ''}` : ''}</span>
                        {!open && <Icon name="lock" size={14} className="text-fg-3" />}
                        {l.isPreview && !d.enrollment && <Badge tone="celestial">Preview</Badge>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <aside className="space-y-4">
            <Card>
              {d.enrollment ? (<>
                <div className="flex items-center gap-4"><ProgressRing value={d.lessons.length ? done / d.lessons.length : 0} label="Course progress" /><div><p className="text-fg">{done}/{d.lessons.length} lessons</p><p className="text-xs text-fg-3">{d.enrollment.status === 'completed' ? 'Completed' : 'In progress'}</p></div></div>
                {next && <ButtonLink to={`/learn/lesson/${next.id}`} block className="mt-4">{done ? 'Continue' : 'Start'}</ButtonLink>}
                {d.certificate && <ButtonLink to={`/learn/certificates/${d.certificate.serial}`} variant="secondary" block className="mt-2" icon="rewards">View certificate</ButtonLink>}
              </>) : (<>
                <p className="font-display text-3xl">{d.course.pricePaise ? money(d.course.pricePaise) : 'Free'}</p>
                <Button block className="mt-3" loading={enroll.isPending} onClick={() => enroll.mutate()}>{d.course.pricePaise ? 'Buy course' : 'Enroll for free'}</Button>
              </>)}
              {d.course.certificateEnabled && <p className="mt-3 text-xs text-fg-3">Certificate requirements: complete every lesson and pass every quiz with at least {d.course.passPercent}%.</p>}
            </Card>
            {d.enrollment && (
              <Card>
                <h3 className="font-display text-2xl">Rate this course</h3>
                <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={review.rating === n} aria-label={`${n} stars`} onClick={() => setReview({ ...review, rating: n })} className={cx('text-2xl', n <= review.rating ? 'text-accent' : 'text-fg-3')}>★</button>)}</div>
                <Textarea rows={2} className="mt-2" aria-label="Review" value={review.body} onChange={(e) => setReview({ ...review, body: e.target.value })} />
                <Button size="sm" className="mt-2" onClick={() => rev.mutate()}>Submit</Button>
              </Card>
            )}
            {d.reviews.length > 0 && <Card><h3 className="font-display text-2xl">Reviews</h3><ul className="mt-2 space-y-2 text-sm">{d.reviews.map((r) => <li key={r.id}><span className="text-accent">{'★'.repeat(r.rating)}</span> <span className="text-fg-3">{r.author}</span><p className="text-fg-2">{r.body}</p></li>)}</ul></Card>}
          </aside>
        </div>
      );
    }}</QueryState>
  );
}

interface LessonResp { lesson: { id: string; title: string; kind: string; body: string; mediaUrl: string | null; durationMinutes: number }; course: { id: string; slug: string; title: string; passPercent: number }; quiz: { id: string; questions: { question: string; options: string[] }[] } | null; completed: boolean; notes: { id: string; body: string }[]; attempts: { scorePercent: number; passed: boolean }[]; prev: { id: string; title: string } | null; next: { id: string; title: string } | null }

export function LessonPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ scorePercent: number; passed: boolean; passPercent: number; review: { question: string; correct: boolean }[]; certificate: { serial: string } | null } | null>(null);
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['lesson', id], queryFn: () => get<LessonResp>(`lessons/${id}`) });
  const complete = useMutation({ mutationFn: () => post<{ xpAwarded: number; certificate: { serial: string } | null }>(`lessons/${id}/complete`), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['lesson', id] }); qc.invalidateQueries({ queryKey: ['course'] }); toast(r.certificate ? 'Course complete — certificate issued ✦' : `Lesson complete${r.xpAwarded ? ` · +${r.xpAwarded} XP` : ''}`, 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  const attempt = useMutation({ mutationFn: () => post<NonNullable<typeof result>>(`quizzes/${q.data!.quiz!.id}/attempt`, { answers: q.data!.quiz!.questions.map((_, i) => answers[i] ?? -1) }), onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['lesson', id] }); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  const addNote = useMutation({ mutationFn: () => post(`lessons/${id}/notes`, { body: note }), onSuccess: () => { setNote(''); qc.invalidateQueries({ queryKey: ['lesson', id] }); } });
  const bookmark = useMutation({ mutationFn: (on: boolean) => post(`lessons/${id}/bookmark`, { on }), onSuccess: () => toast('Bookmarks updated', 'success') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="mx-auto max-w-3xl">
        <Link to={`/learn/${d.course.slug}`} className="text-sm text-fg-3 hover:text-fg">← {d.course.title}</Link>
        <h1 className="mt-2 font-display text-4xl">{d.lesson.title}</h1>
        <p className="text-xs text-fg-3">{d.lesson.kind} · {d.lesson.durationMinutes} min</p>
        {d.lesson.mediaUrl && (d.lesson.kind === 'video' ? <video controls className="mt-5 w-full rounded-[var(--radius-md)]" src={d.lesson.mediaUrl} /> : <audio controls className="mt-5 w-full" src={d.lesson.mediaUrl} />)}
        <article className="mt-6 whitespace-pre-line text-[17px] leading-[1.8] text-fg-2">{d.lesson.body}</article>
        <div className="mt-6 flex flex-wrap gap-2">
          {!d.completed ? <Button loading={complete.isPending} onClick={() => complete.mutate()} icon="check">Mark lesson complete</Button> : <Badge tone="success">Completed</Badge>}
          <Button variant="ghost" icon="bookmark" onClick={() => bookmark.mutate(true)}>Bookmark</Button>
        </div>
        {d.quiz && (
          <Card className="mt-8">
            <h2 className="font-display text-2xl">Quiz</h2>
            <p className="text-xs text-fg-3">Pass mark {d.course.passPercent}%. {d.attempts.length ? `Best so far: ${Math.max(...d.attempts.map((a) => a.scorePercent))}%` : ''}</p>
            <ol className="mt-4 space-y-5">{d.quiz.questions.map((qq, i) => (
              <li key={i}><fieldset><legend className="text-fg">{i + 1}. {qq.question}</legend><div className="mt-2 space-y-2">{qq.options.map((o, j) => <label key={j} className={cx('flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2 text-sm', answers[i] === j ? 'border-accent bg-accent/10' : 'border-line')}><input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} className="accent-[var(--accent)]" />{o}</label>)}</div></fieldset>{result && <p className={cx('mt-1 text-xs', result.review[i]?.correct ? 'text-success' : 'text-danger')}>{result.review[i]?.correct ? 'Correct' : 'Not quite'}</p>}</li>
            ))}</ol>
            <Button className="mt-5" disabled={Object.keys(answers).length < d.quiz.questions.length} loading={attempt.isPending} onClick={() => attempt.mutate()}>Submit answers</Button>
            {result && <Notice tone={result.passed ? 'success' : 'warning'} className="mt-4">You scored {result.scorePercent}% — {result.passed ? 'passed!' : `the pass mark is ${result.passPercent}%. Review and try again.`}{result.certificate && <> Your certificate is ready: <Link className="underline" to={`/learn/certificates/${result.certificate.serial}`}>view</Link>.</>}</Notice>}
          </Card>
        )}
        <Card className="mt-6">
          <h2 className="font-display text-2xl">My notes</h2>
          <ul className="mt-2 space-y-2 text-sm text-fg-2">{d.notes.map((n) => <li key={n.id} className="whitespace-pre-line rounded bg-surface-2 p-2">{n.body}</li>)}</ul>
          <Textarea rows={2} className="mt-3" aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" className="mt-2" disabled={!note.trim()} onClick={() => addNote.mutate()}>Save note</Button>
        </Card>
        <nav className="mt-8 flex justify-between" aria-label="Lesson navigation">
          {d.prev ? <Link to={`/learn/lesson/${d.prev.id}`} className="text-sm text-accent">← {d.prev.title}</Link> : <span />}
          {d.next ? <Link to={`/learn/lesson/${d.next.id}`} className="text-sm text-accent">{d.next.title} →</Link> : <span />}
        </nav>
      </div>
    )}</QueryState>
  );
}

export function CertificateView() {
  const { serial } = useParams();
  const q = useQuery({ queryKey: ['certificate', serial], queryFn: () => get<{ certificate: { serial: string; recipientName: string; courseTitle: string; issuedAt: string; requirements: { lessons: number; quizzesPassed: number; passPercent: number }; verified: boolean } }>(`certificates/${serial}`), retry: false });
  return (
    <div className="py-10">
      <QueryState q={q}>{({ certificate: c }) => (
        <div className="mx-auto max-w-2xl rounded-[var(--radius-xl)] border-2 border-accent/50 bg-surface p-10 text-center shadow-[var(--shadow-lift)]">
          <p className="eyebrow">Nakshatra · Certificate of completion</p>
          <p className="mt-6 text-fg-2">This certifies that</p>
          <p className="mt-2 font-display text-5xl">{c.recipientName}</p>
          <p className="mt-4 text-fg-2">completed every lesson and passed every quiz of</p>
          <p className="mt-2 font-display text-3xl text-accent">{c.courseTitle}</p>
          <p className="mt-6 text-sm text-fg-3">{c.requirements.lessons} lessons · {c.requirements.quizzesPassed} quizzes passed at ≥{c.requirements.passPercent}% · issued {new Date(c.issuedAt).toLocaleDateString()}</p>
          <p className="mt-2 font-mono text-xs text-fg-3">Serial {c.serial} {c.verified && '· verified'}</p>
          <Button variant="secondary" size="sm" className="mt-6 print:hidden" onClick={() => window.print()}>Print</Button>
        </div>
      )}</QueryState>
    </div>
  );
}

interface CreatorCourse { id: string; slug: string; title: string; status: string; pricePaise: number; enrollments: number; completions: number; grossPaise: number; creatorSharePaise: number; revenueSharePercent: number; reviewNote: string | null }

export function CreatorStudio() {
  return <RoleGate role="creator"><CreatorStudioInner /></RoleGate>;
}

function CreatorStudioInner() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['creator-courses'], queryFn: () => get<{ courses: CreatorCourse[]; payouts: { id: string; amountPaise: number; status: string }[] }>('creator/courses') });
  const submit = useMutation({ mutationFn: (id: string) => post(`creator/courses/${id}/submit`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['creator-courses'] }); toast('Submitted for review', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <div>
      <PageHeader kicker="Creator studio" title="Your courses" subtitle="Draft, submit for editorial review, and track enrollments and revenue." actions={<Button icon="plus" onClick={() => setCreating(true)}>New course</Button>} />
      <QueryState q={q}>{(d) => (
        <DataTable rows={d.courses} keyOf={(c) => c.id} empty="No courses yet" columns={[
          { key: 't', header: 'Course', cell: (c) => <div><p className="text-fg">{c.title}</p>{c.reviewNote && <p className="text-xs text-fg-3">Review note: {c.reviewNote}</p>}</div> },
          { key: 's', header: 'Status', cell: (c) => <Badge tone={c.status === 'published' ? 'success' : c.status === 'in_review' ? 'warning' : c.status === 'rejected' ? 'danger' : 'neutral'}>{cap(c.status)}</Badge> },
          { key: 'e', header: 'Learners', cell: (c) => `${c.enrollments} (${c.completions} completed)` },
          { key: 'r', header: 'Your share', cell: (c) => `${money(c.creatorSharePaise)} (${c.revenueSharePercent}%)` },
          { key: 'a', header: '', cell: (c) => <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setEditing(c.id)}>Edit content</Button>{['draft', 'rejected'].includes(c.status) && <Button size="sm" onClick={() => submit.mutate(c.id)}>Submit</Button>}</div> },
        ]} />
      )}</QueryState>
      <NewCourseDialog open={creating} onClose={() => setCreating(false)} />
      {editing && <CourseContentEditor courseId={editing} slug={q.data?.courses.find((c) => c.id === editing)?.slug ?? ''} onClose={() => setEditing(null)} />}
    </div>
  );
}

function NewCourseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ title: '', subtitle: '', description: '', level: 'beginner', topics: '', price: 0 });
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ mutationFn: () => post('creator/courses', { ...v, topics: v.topics.split(',').map((t) => t.trim()).filter(Boolean), pricePaise: Math.round(v.price * 100) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['creator-courses'] }); onClose(); }, onError: (e) => setErr((e as Error).message) });
  return (
    <Dialog open={open} onClose={onClose} title="New course" footer={<Button loading={m.isPending} onClick={() => m.mutate()}>Create draft</Button>}>
      <div className="space-y-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Title">{(id) => <Input id={id} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        <Field label="Subtitle">{(id) => <Input id={id} value={v.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} />}</Field>
        <Field label="Description">{(id) => <Textarea id={id} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Level">{(id) => <Select id={id} value={v.level} onChange={(e) => setV({ ...v, level: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select>}</Field>
          <Field label="Topics">{(id) => <Input id={id} value={v.topics} onChange={(e) => setV({ ...v, topics: e.target.value })} placeholder="vedic, learning" />}</Field>
          <Field label="Price (₹, 0 = free)">{(id) => <Input id={id} type="number" min={0} value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) })} />}</Field>
        </div>
      </div>
    </Dialog>
  );
}

function CourseContentEditor({ courseId, slug, onClose }: { courseId: string; slug: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery({ queryKey: ['course', slug], queryFn: () => get<CourseDetail>(`courses/${slug}`), enabled: Boolean(slug) });
  const [chapter, setChapter] = useState('');
  const [lesson, setLesson] = useState({ chapterId: '', title: '', kind: 'text', body: '', durationMinutes: 5, isPreview: false, quiz: [] as { question: string; options: string[]; answer: number }[] });
  const [tab, setTab] = useState<'chapters' | 'lesson'>('lesson');
  const refresh = () => qc.invalidateQueries({ queryKey: ['course', slug] });
  const addCh = useMutation({ mutationFn: () => post(`creator/courses/${courseId}/chapters`, { title: chapter }), onSuccess: () => { setChapter(''); refresh(); } });
  const addLesson = useMutation({ mutationFn: () => post(`creator/courses/${courseId}/lessons`, { ...lesson, quiz: lesson.quiz.length ? lesson.quiz : undefined }), onSuccess: () => { setLesson({ ...lesson, title: '', body: '', quiz: [] }); refresh(); toast('Lesson added', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  const media = useMutation({ mutationFn: ({ id, f }: { id: string; f: File }) => upload(`creator/lessons/${id}/media`, f), onSuccess: () => { refresh(); toast('Media uploaded', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  const remove = useMutation({ mutationFn: (id: string) => api(`creator/lessons/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: (e) => toast((e as Error).message, 'error') });
  const unpublish = useMutation({ mutationFn: () => post(`creator/courses/${courseId}/unpublish`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['creator-courses'] }); refresh(); } });
  void patch;
  return (
    <Dialog open onClose={onClose} title="Course content" size="lg">
      <QueryState q={detail}>{(d) => (
        <div className="space-y-5">
          {d.course.status === 'published' && <Notice tone="info">Published courses must be unpublished before removing lessons. <button type="button" className="underline" onClick={() => unpublish.mutate()}>Unpublish</button></Notice>}
          <ul className="space-y-2">{d.chapters.map((ch) => <li key={ch.id}><p className="font-semibold text-fg">{ch.title}</p><ul className="ml-4 mt-1 space-y-1 text-sm">{d.lessons.filter((l) => l.chapterId === ch.id).map((l) => <li key={l.id} className="flex flex-wrap items-center gap-2"><span className="text-fg-2">{l.title}</span><span className="text-xs text-fg-3">{l.kind}{l.quizId ? ' · quiz' : ''}</span><label className="cursor-pointer text-xs text-accent">Upload audio/video<input type="file" accept="audio/mpeg,video/mp4" className="sr-only" onChange={(e) => e.target.files?.[0] && media.mutate({ id: l.id, f: e.target.files[0] })} /></label><button type="button" className="text-xs text-danger" onClick={() => remove.mutate(l.id)}>Remove</button></li>)}</ul></li>)}</ul>
          <Tabs tabs={[{ value: 'lesson', label: 'Add lesson' }, { value: 'chapters', label: 'Add chapter' }]} value={tab} onChange={setTab} />
          {tab === 'chapters' ? (
            <div className="flex gap-2"><Input aria-label="Chapter title" value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Chapter title" /><Button disabled={!chapter} onClick={() => addCh.mutate()}>Add</Button></div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Chapter">{(id) => <Select id={id} value={lesson.chapterId} onChange={(e) => setLesson({ ...lesson, chapterId: e.target.value })}><option value="">Choose…</option>{d.chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>}</Field>
                <Field label="Type">{(id) => <Select id={id} value={lesson.kind} onChange={(e) => setLesson({ ...lesson, kind: e.target.value })}><option value="text">Text</option><option value="video">Video</option><option value="audio">Audio</option></Select>}</Field>
                <Field label="Minutes">{(id) => <Input id={id} type="number" value={lesson.durationMinutes} onChange={(e) => setLesson({ ...lesson, durationMinutes: Number(e.target.value) })} />}</Field>
              </div>
              <Field label="Title">{(id) => <Input id={id} value={lesson.title} onChange={(e) => setLesson({ ...lesson, title: e.target.value })} />}</Field>
              <Field label="Lesson text">{(id) => <Textarea id={id} rows={6} value={lesson.body} onChange={(e) => setLesson({ ...lesson, body: e.target.value })} />}</Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lesson.isPreview} onChange={(e) => setLesson({ ...lesson, isPreview: e.target.checked })} className="accent-[var(--accent)]" />Free preview</label>
              <div className="rounded-[var(--radius-md)] border border-line p-3">
                <p className="text-sm font-semibold text-fg">Quiz questions</p>
                {lesson.quiz.map((qq, i) => (
                  <div key={i} className="mt-3 space-y-2">
                    <Input aria-label={`Question ${i + 1}`} value={qq.question} onChange={(e) => setLesson({ ...lesson, quiz: lesson.quiz.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} placeholder="Question" />
                    {qq.options.map((o, k) => <div key={k} className="flex items-center gap-2"><input type="radio" name={`ans${i}`} checked={qq.answer === k} onChange={() => setLesson({ ...lesson, quiz: lesson.quiz.map((x, j) => (j === i ? { ...x, answer: k } : x)) })} aria-label="Correct answer" className="accent-[var(--accent)]" /><Input aria-label={`Option ${k + 1}`} value={o} onChange={(e) => setLesson({ ...lesson, quiz: lesson.quiz.map((x, j) => (j === i ? { ...x, options: x.options.map((y, m) => (m === k ? e.target.value : y)) } : x)) })} /></div>)}
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon="plus" className="mt-2" onClick={() => setLesson({ ...lesson, quiz: [...lesson.quiz, { question: '', options: ['', '', ''], answer: 0 }] })}>Add question</Button>
              </div>
              <Button disabled={!lesson.chapterId || !lesson.title} loading={addLesson.isPending} onClick={() => addLesson.mutate()}>Add lesson</Button>
            </div>
          )}
        </div>
      )}</QueryState>
    </Dialog>
  );
}
