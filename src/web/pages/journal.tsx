import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post } from '../lib/api';
import { Button, Card, PageHeader, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { JOURNAL_RULES } from '../../shared/journal';

interface Entry { id: string; date: string; prompt: string | null; body: string; createdAt: string; updatedAt: string }
interface Day { date: string; mood: string | null; journal: number; posts: number; events: number; games: number }
interface Cal { month: string; label: string; today: string; days: Day[]; summary: { moodDays: number; topMood: string | null; journalDays: number; posts: number; events: number; games: number } }

const shiftMonth = (m: string, by: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const nice = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function JournalPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [usePrompt, setUsePrompt] = useState(true);
  const [text, setText] = useState('');
  const recent = useQuery({ queryKey: ['journal', 'recent'], queryFn: () => get<{ today: string; prompt: { key: string; text: string }; entries: Entry[]; privacy: string }>('journal') });
  const cal = useQuery({ queryKey: ['me-calendar', month], queryFn: () => get<Cal>(`me/calendar${month ? `?month=${month}` : ''}`) });
  const monthEntries = useQuery({ queryKey: ['journal', 'month', cal.data?.month], queryFn: () => get<{ entries: Entry[] }>(`journal?month=${cal.data!.month}`), enabled: !!cal.data });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['journal'] }); void qc.invalidateQueries({ queryKey: ['me-calendar'] }); };
  const write = useMutation({
    mutationFn: () => post('journal', { body: text, promptKey: usePrompt ? recent.data?.prompt.key : undefined, date: selected && selected !== recent.data?.today ? selected : undefined }),
    onSuccess: () => { setText(''); refresh(); toast('Saved — only you can read it', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });
  const writingFor = selected ?? recent.data?.today ?? '';
  const shown = selected ? (monthEntries.data?.entries ?? []).filter((e) => e.date === selected) : recent.data?.entries ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader kicker="You" title="Journal" subtitle="A private place to think out loud, and your month at a glance." />
      {recent.data && <Notice tone="info">{recent.data.privacy}</Notice>}

      <Card className="space-y-3" aria-label="Write">
        {recent.data && usePrompt && writingFor === recent.data.today && <p className="font-display text-2xl text-fg">{recent.data.prompt.text}</p>}
        <p className="text-xs text-fg-3">Writing for {writingFor ? nice(writingFor) : 'today'}{selected && selected !== recent.data?.today ? ' (an earlier day)' : ''}</p>
        <Textarea aria-label="Journal entry" rows={5} maxLength={JOURNAL_RULES.maxChars} value={text} onChange={(e) => setText(e.target.value)} placeholder={usePrompt ? 'Start anywhere…' : 'Whatever’s on your mind…'} />
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!text.trim()} loading={write.isPending} onClick={() => write.mutate()}>Save entry</Button>
          {writingFor === recent.data?.today && <Button variant="ghost" size="sm" onClick={() => setUsePrompt(!usePrompt)}>{usePrompt ? 'Write without the prompt' : 'Use today’s prompt'}</Button>}
          <span className="ml-auto text-xs text-fg-3 numeric">{text.length}/{JOURNAL_RULES.maxChars}</span>
        </div>
      </Card>

      <QueryState q={cal}>{(c) => (
        <Card aria-label="Your month">
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => { setMonth(shiftMonth(c.month, -1)); setSelected(null); }}>←</Button>
            <h2 className="font-display text-2xl">{c.label}</h2>
            <Button size="sm" variant="ghost" aria-label="Next month" disabled={c.month >= c.today.slice(0, 7)} onClick={() => { setMonth(shiftMonth(c.month, 1)); setSelected(null); }}>→</Button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-fg-3" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
          <ol className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: (new Date(`${c.days[0].date}T12:00:00`).getDay() + 6) % 7 }, (_, i) => <li key={`pad-${i}`} aria-hidden="true" />)}
            {c.days.map((d) => {
              const future = d.date > c.today;
              const parts = [d.mood && `mood ${d.mood}`, d.journal && `${d.journal} journal`, d.posts && `${d.posts} drop${d.posts > 1 ? 's' : ''}`, d.events && `${d.events} event${d.events > 1 ? 's' : ''}`, d.games && `${d.games} game${d.games > 1 ? 's' : ''}`].filter(Boolean).join(', ');
              return (
                <li key={d.date}>
                  <button type="button" disabled={future} aria-pressed={selected === d.date} aria-label={`${nice(d.date)}${parts ? `: ${parts}` : ''}`} onClick={() => setSelected(selected === d.date ? null : d.date)}
                    className={cx('flex aspect-square w-full flex-col items-center justify-center rounded-[var(--radius-sm)] border text-xs', selected === d.date ? 'border-fg' : 'border-line', d.date === c.today && 'font-semibold', future && 'opacity-40')}>
                    <span className="numeric text-fg">{Number(d.date.slice(8))}</span>
                    <span className="mt-0.5 flex gap-0.5" aria-hidden="true">
                      {d.journal > 0 && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      {d.mood && <span className="h-1.5 w-1.5 rounded-full bg-celestial" />}
                      {(d.posts > 0 || d.events > 0 || d.games > 0) && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-fg-3"><span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" /> journal · <span className="inline-block h-1.5 w-1.5 rounded-full bg-celestial" /> mood check-in · <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" /> drops, events or games</p>
          <p className="mt-1 text-sm text-fg-2">{c.summary.journalDays} journal day{c.summary.journalDays === 1 ? '' : 's'} · {c.summary.moodDays} check-in{c.summary.moodDays === 1 ? '' : 's'}{c.summary.topMood ? ` (mostly ${c.summary.topMood})` : ''} · {c.summary.posts} drops · {c.summary.events} events · {c.summary.games} games</p>
        </Card>
      )}</QueryState>

      <section aria-labelledby="entries-h" className="space-y-3">
        <h2 id="entries-h" className="font-display text-2xl">{selected ? nice(selected) : 'Recent entries'}</h2>
        {shown.length === 0 ? <EmptyState icon="edit" title={selected ? 'Nothing written that day' : 'No entries yet'} body="A few lines is plenty." /> : shown.map((e) => <EntryCard key={e.id} e={e} onChanged={refresh} />)}
      </section>
    </div>
  );
}

function EntryCard({ e, onChanged }: { e: Entry; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(e.body);
  const fail = (err: unknown) => toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
  const save = useMutation({ mutationFn: () => patch(`journal/${e.id}`, { body: draft }), onSuccess: () => { setEditing(false); onChanged(); }, onError: fail });
  const remove = useMutation({ mutationFn: () => del(`journal/${e.id}`), onSuccess: onChanged, onError: fail });
  return (
    <article className="card space-y-2 p-4" aria-label={`Entry from ${nice(e.date)}`}>
      <p className="text-xs uppercase tracking-[0.14em] text-fg-3">{nice(e.date)}</p>
      {e.prompt && <p className="text-sm italic text-fg-2">{e.prompt}</p>}
      {editing ? <Textarea aria-label="Edit entry" rows={4} maxLength={JOURNAL_RULES.maxChars} value={draft} onChange={(ev) => setDraft(ev.target.value)} /> : <p className="whitespace-pre-wrap text-fg">{e.body}</p>}
      <div className="flex gap-2">
        {editing ? <><Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></>
          : <><Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => remove.mutate()}>Delete</Button></>}
      </div>
    </article>
  );
}
