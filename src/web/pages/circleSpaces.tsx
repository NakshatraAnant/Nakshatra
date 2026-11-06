import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, post } from '../lib/api';
import { Badge, Button, Card, Field, Input, Select, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { FREQUENCIES, FREQUENCY_LABEL, type Frequency } from '../../shared/recurrence';

const fmt = (d: string) => new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const failWith = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error');

/* ---------------- Events ---------------- */

interface CircleEvent { id: string; title: string; description: string; startsAt: string; endsAt: string; mode: string; location: string | null; liveUrl: string | null; capacity: number | null; status: string; host: string; going: number; myRsvp: string | null; seriesId: string | null; repeats: Frequency | null }
interface EventsResp { canManage: boolean; events: CircleEvent[]; series: { id: string; title: string; frequency: Frequency; until: string | null }[] }

export function CircleEvents({ circleId }: { circleId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['circle-events', circleId], queryFn: () => get<EventsResp>(`circles/${circleId}/events`) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['circle-events', circleId] });
  const rsvp = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => post(`events/${id}/rsvp`, { status }), onSuccess: refresh, onError: failWith(toast) });
  const cancel = useMutation({ mutationFn: (id: string) => post(`circles/${circleId}/events/${id}/cancel`), onSuccess: () => { refresh(); toast('Cancelled — people going were told', 'success'); }, onError: failWith(toast) });
  const end = useMutation({ mutationFn: (id: string) => post<{ cancelled: number }>(`circles/${circleId}/series/${id}/end`), onSuccess: (r) => { refresh(); toast(`Stopped repeating; ${r.cancelled} upcoming cancelled`, 'success'); }, onError: failWith(toast) });
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-4">
        {d.canManage && (creating ? <NewEvent circleId={circleId} onDone={() => { setCreating(false); refresh(); }} /> : <Button onClick={() => setCreating(true)}>Schedule an event</Button>)}
        {d.events.length === 0 ? <EmptyState icon="calendar" title="Nothing scheduled" body={d.canManage ? 'Set up a one-off meetup or a weekly ritual — members get a reminder an hour before.' : 'Circle admins can schedule meetups here.'} /> : (
          <ul className="space-y-3">{d.events.map((e) => (
            <li key={e.id} className={cx('card p-4', e.status === 'cancelled' && 'opacity-60')} aria-label={`${e.title}, ${fmt(e.startsAt)}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-fg-3">{fmt(e.startsAt)}{e.repeats ? ` · ${FREQUENCY_LABEL[e.repeats].toLowerCase()}` : ''}</p>
                  <h3 className="font-display text-xl">{e.title}</h3>
                  <p className="text-sm text-fg-2">{e.mode === 'online' ? 'Online' : e.location ?? 'In person'} · hosted by {e.host} · {e.going} going{e.capacity ? ` of ${e.capacity}` : ''}</p>
                  {e.description && <p className="mt-1 text-sm text-fg-2">{e.description}</p>}
                  {e.liveUrl && <a href={e.liveUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex text-sm text-accent underline underline-offset-2">Join link ↗</a>}
                </div>
                {e.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : (
                  <div className="flex flex-wrap gap-1">
                    {e.myRsvp === 'going'
                      ? <Button size="sm" variant="secondary" aria-pressed onClick={() => rsvp.mutate({ id: e.id, status: 'cancelled' })}>✓ Going</Button>
                      : <Button size="sm" onClick={() => rsvp.mutate({ id: e.id, status: 'going' })}>I’m going</Button>}
                    {d.canManage && <Button size="sm" variant="ghost" onClick={() => cancel.mutate(e.id)}>Cancel{e.seriesId ? ' this one' : ''}</Button>}
                  </div>
                )}
              </div>
            </li>
          ))}</ul>
        )}
        {d.canManage && d.series.length > 0 && (
          <Card aria-label="Repeating events">
            <h3 className="font-display text-xl">Repeating</h3>
            <ul className="mt-2 divide-y divide-line">{d.series.map((sr) => (
              <li key={sr.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{sr.title} · {FREQUENCY_LABEL[sr.frequency]}{sr.until ? ` until ${new Date(sr.until).toLocaleDateString()}` : ''}</span><Button size="sm" variant="ghost" onClick={() => end.mutate(sr.id)}>Stop repeating</Button></li>
            ))}</ul>
          </Card>
        )}
      </div>
    )}</QueryState>
  );
}

function NewEvent({ circleId, onDone }: { circleId: string; onDone: () => void }) {
  const toast = useToast();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('60');
  const [mode, setMode] = useState<'online' | 'in_person'>('online');
  const [place, setPlace] = useState('');
  const [repeat, setRepeat] = useState<'none' | Frequency>('none');
  const [until, setUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => post(`circles/${circleId}/events`, {
      title, description, startsAt: new Date(when).toISOString(), durationMinutes: Number(duration), mode, timezone: tz,
      ...(mode === 'online' ? (place ? { liveUrl: place } : {}) : { location: place || undefined }),
      repeat, ...(repeat !== 'none' && until ? { until: new Date(`${until}T23:59:59`).toISOString() } : {}),
    }),
    onSuccess: () => { toast('Scheduled — members were notified', 'success'); onDone(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not schedule'),
  });
  return (
    <Card className="space-y-3" aria-label="New event">
      <Field label="Event title">{(id) => <Input id={id} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday book club" />}</Field>
      <Field label="Details (optional)">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts">{(id) => <Input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
        <Field label="Length">{(id) => <Select id={id} value={duration} onChange={(e) => setDuration(e.target.value)}>{[['30', '30 minutes'], ['60', '1 hour'], ['90', '1½ hours'], ['120', '2 hours'], ['180', '3 hours']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
        <Field label="Where">{(id) => <Select id={id} value={mode} onChange={(e) => setMode(e.target.value as 'online' | 'in_person')}><option value="online">Online</option><option value="in_person">In person</option></Select>}</Field>
        <Field label={mode === 'online' ? 'Join link (https, optional)' : 'Place (optional)'}>{(id) => <Input id={id} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={mode === 'online' ? 'https://' : 'Cubbon Park gate 2'} />}</Field>
        <Field label="Repeats">{(id) => <Select id={id} value={repeat} onChange={(e) => setRepeat(e.target.value as 'none' | Frequency)}><option value="none">Doesn’t repeat</option>{FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}</Select>}</Field>
        {repeat !== 'none' && <Field label="Until (optional)">{(id) => <Input id={id} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>}
      </div>
      {repeat !== 'none' && <p className="text-xs text-fg-3">Keeps the same local time ({tz}). The next few are scheduled ahead; members RSVP to each one.</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2"><Button disabled={title.trim().length < 3 || !when} loading={create.isPending} onClick={() => { setError(null); create.mutate(); }}>Schedule</Button><Button variant="ghost" onClick={onDone}>Cancel</Button></div>
    </Card>
  );
}

/* ---------------- Moderation ---------------- */

interface ModResp {
  role: string;
  stats: { members: number; newMembers: number; postsThisWeek: number; openReports: number; activeTimeouts: number };
  reports: { id: string; reason: string; targetType: string; postId: string; preview: string; author: string; authorId: string; createdAt: string }[];
  timeouts: { userId: string; name: string; until: string; reason: string }[];
  banned: { userId: string; name: string }[];
  log: { action: string; by: string; about: string | null; at: string }[];
}

export function CircleModeration({ circleId }: { circleId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['circle-mod', circleId], queryFn: () => get<ModResp>(`circles/${circleId}/moderation`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['circle-mod', circleId] }); void qc.invalidateQueries({ queryKey: ['circle-feed', circleId] }); void qc.invalidateQueries({ queryKey: ['circle', circleId] }); };
  const fail = failWith(toast);
  const decide = useMutation({ mutationFn: ({ id, decision }: { id: string; decision: 'remove' | 'keep' }) => post(`circles/${circleId}/moderation/reports/${id}`, { decision }), onSuccess: (_r, v) => { refresh(); toast(v.decision === 'remove' ? 'Removed from the circle' : 'Kept', 'success'); }, onError: fail });
  const pause = useMutation({ mutationFn: ({ userId, hours, reason }: { userId: string; hours: number; reason: string }) => post(`circles/${circleId}/timeouts`, { userId, hours, reason }), onSuccess: () => { refresh(); toast('Posting paused', 'success'); }, onError: fail });
  const unpause = useMutation({ mutationFn: (userId: string) => del(`circles/${circleId}/timeouts/${userId}`), onSuccess: refresh, onError: fail });
  const ban = useMutation({ mutationFn: ({ userId, on }: { userId: string; on: boolean }) => post(`circles/${circleId}/bans`, { userId, ban: on }), onSuccess: (_r, v) => { refresh(); toast(v.on ? 'Banned from the circle' : 'Unbanned — they can be invited again', 'success'); }, onError: fail });
  const [hours, setHours] = useState<Record<string, string>>({});
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['Members', d.stats.members], ['New this week', d.stats.newMembers], ['Posts this week', d.stats.postsThisWeek], ['Open reports', d.stats.openReports]] as const).map(([k, v]) => (
            <Card key={k} className="p-3"><p className="text-xs text-fg-3">{k}</p><p className={cx('font-display text-3xl numeric', k === 'Open reports' && v > 0 && 'text-danger')}>{v}</p></Card>
          ))}
        </div>

        <Card aria-label="Reports">
          <h3 className="font-display text-2xl">Reports in this circle</h3>
          <p className="text-xs text-fg-3">Reporters are never shown. Your decision applies to this circle; Nakshatra’s team still reviews every report.</p>
          {d.reports.length === 0 ? <p className="mt-2 text-sm text-fg-2">Nothing to review.</p> : (
            <ul className="mt-3 space-y-3">{d.reports.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                <p className="text-xs text-fg-3">{r.targetType === 'comment' ? 'Comment' : 'Post'} by {r.author} · reported for {r.reason.replace('_', ' ')} · {fmt(r.createdAt)}</p>
                <p className="mt-1 text-fg">“{r.preview}”</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="danger" onClick={() => decide.mutate({ id: r.id, decision: 'remove' })}>Remove</Button>
                  <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: r.id, decision: 'keep' })}>Keep</Button>
                  <Select aria-label={`Pause ${r.author}`} className="w-40" value={hours[r.id] ?? ''} onChange={(e) => setHours({ ...hours, [r.id]: e.target.value })}>
                    <option value="">Pause posting…</option><option value="1">1 hour</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">1 week</option>
                  </Select>
                  {hours[r.id] && <Button size="sm" variant="secondary" onClick={() => pause.mutate({ userId: r.authorId, hours: Number(hours[r.id]), reason: `Reported for ${r.reason.replace('_', ' ')}` })}>Pause {r.author}</Button>}
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => ban.mutate({ userId: r.authorId, on: true })}>Ban</Button>
                </div>
              </li>
            ))}</ul>
          )}
        </Card>

        {(d.timeouts.length > 0 || d.banned.length > 0) && (
          <Card aria-label="Paused and banned">
            <h3 className="font-display text-xl">Paused and banned</h3>
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.timeouts.map((t) => <li key={t.userId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{t.name} · paused until {fmt(t.until)} · {t.reason}</span><Button size="sm" variant="ghost" onClick={() => unpause.mutate(t.userId)}>Lift</Button></li>)}
              {d.banned.map((b) => <li key={b.userId} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{b.name} · banned</span><Button size="sm" variant="ghost" onClick={() => ban.mutate({ userId: b.userId, on: false })}>Unban</Button></li>)}
            </ul>
          </Card>
        )}

        <Card aria-label="Moderation log">
          <h3 className="font-display text-xl">Log</h3>
          {d.log.length === 0 ? <p className="mt-2 text-sm text-fg-2">No actions yet.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{d.log.map((l, i) => <li key={i} className="text-fg-2"><span className="text-fg">{l.by}</span> · {l.action}{l.about ? ` · ${l.about}` : ''} <span className="text-xs text-fg-3">· {fmt(l.at)}</span></li>)}</ul>
          )}
          <p className="mt-3 text-xs text-fg-3">Every action here is recorded. <Link to="/legal/terms" className="underline underline-offset-2">Community rules (Terms)</Link></p>
        </Card>
      </div>
    )}</QueryState>
  );
}
