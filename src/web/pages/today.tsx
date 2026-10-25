import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../lib/api';
import { useMe } from '../lib/session';
import { useI18n } from '../lib/i18n';
import { civilDate, time } from '../lib/format';
import { Badge, Button, ButtonLink, Card, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice } from '../components/ui/feedback';
import { Icon } from '../components/ui/icons';
import { useToast } from '../components/ui/overlays';
import type { PanchangResult } from '../../astro/vedic/panchang';
import { PLANETS, type PlanetId } from '../../astro/constants';

interface DailyResponse {
  location: { placeName: string; timezone: string };
  panchang: PanchangResult;
  briefing: {
    date: string; personalised: boolean; contentVersion: string;
    sections: { key: string; title: string; body: string; factor: string; kind: string }[];
    ritual: { key: string; title: string; description: string; steps: string[]; durationMinutes: number; tradition: string };
    ritualReason: string; reflectionPrompt: string;
    lesson: { key: string; title: string; body: string; quiz?: { question: string; options: string[]; answer: number } };
    colourOfDay: { colour: string; note: string };
  };
  ritualCompletedToday: boolean;
  dasha: { lord: string; end: string }[];
  festivalsToday: { key: string; name: string; description: string; rule: string }[];
  upcomingFestivals: { key: string; name: string; date: string }[];
  lessonCompleted: boolean;
}

export function MoonGlyph({ angle, size = 56 }: { angle: number; size?: number }) {
  // Illumination silhouette from the Moon–Sun elongation (0 = new, 180 = full).
  const r = size / 2 - 2;
  const k = Math.cos((angle * Math.PI) / 180);
  const waxing = angle < 180;
  const rx = Math.abs(k) * r;
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = (k > 0) === waxing ? 0 : 1;
  const d = `M ${size / 2} 2 A ${r} ${r} 0 0 ${sweepOuter} ${size / 2} ${size - 2} A ${rx} ${r} 0 0 ${sweepInner} ${size / 2} 2`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="var(--surface-3)" />
      <path d={d} fill="var(--text)" opacity=".92" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" />
    </svg>
  );
}

function greetingKey(): 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening' {
  const h = new Date().getHours();
  return h < 12 ? 'greeting.morning' : h < 17 ? 'greeting.afternoon' : 'greeting.evening';
}

export function Today() {
  const { t, dateLocale } = useI18n();
  const me = useMe().data?.user;
  const q = useQuery({ queryKey: ['daily'], queryFn: () => get<DailyResponse>('daily') });
  return (
    <div>
      <header className="mb-8 rise-in">
        <p className="eyebrow">{new Intl.DateTimeFormat(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">{t(greetingKey())}, {me?.profile?.displayName?.split(' ')[0]}.</h1>
        {q.data && <p className="mt-2 flex items-center gap-1.5 text-sm text-fg-3"><Icon name="pin" size={14} />{q.data.location.placeName} · <Link to="/settings/profile" className="underline-offset-4 hover:underline">change location</Link></p>}
      </header>
      <QueryState q={q}>{(d) => <TodayBody d={d} />}</QueryState>
    </div>
  );
}

function TodayBody({ d }: { d: DailyResponse }) {
  const { t, dateLocale } = useI18n();
  const p = d.panchang;
  const tz = d.location.timezone;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
      <div className="flex flex-col gap-5">
        {d.festivalsToday.length > 0 && (
          <Card className="border-accent/40 bg-[linear-gradient(135deg,rgb(217_178_111/0.12),transparent)]">
            <p className="eyebrow">Today’s observance</p>
            {d.festivalsToday.map((f) => <div key={f.key} className="mt-2"><h2 className="font-display text-3xl">{f.name}</h2><p className="mt-1 text-sm text-fg-2">{f.description}</p><p className="mt-1 text-xs text-fg-3">Date rule: {f.rule}</p></div>)}
          </Card>
        )}
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">{t('today.briefing')}</p>
              <h2 className="mt-1 font-display text-3xl">{p.tithi.paksha === 'shukla' ? 'Shukla' : 'Krishna'} {p.tithi.name} · {p.moon.phaseName}</h2>
            </div>
            <MoonGlyph angle={p.moon.phaseAngle} />
          </div>
          <div className="orbit-rule my-5" />
          <ul className="space-y-5">
            {d.briefing.sections.map((s) => (
              <li key={s.key}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-fg">{s.title}</h3>
                  <Badge tone={s.kind === 'calculated' ? 'celestial' : 'neutral'}>{s.kind === 'calculated' ? 'Calculated' : 'Traditional'}</Badge>
                </div>
                <p className="mt-1 text-[15px] leading-relaxed text-fg-2">{s.body}</p>
                <p className="mt-1 text-xs text-fg-3">Why you’re seeing this: {s.factor}</p>
              </li>
            ))}
          </ul>
          {!d.briefing.personalised && <Notice tone="info" className="mt-4">This is a general briefing. Complete your Cosmic ID for chart-specific context.</Notice>}
          <p className="mt-5 text-xs text-fg-3">Selected by documented rules from Nakshatra’s authored content ({d.briefing.contentVersion}). Reflective, not predictive.</p>
        </Card>
        <RitualCard d={d} />
        <ReflectionCard prompt={d.briefing.reflectionPrompt} date={d.briefing.date} />
        <LessonCard lesson={d.briefing.lesson} completed={d.lessonCompleted} />
      </div>

      <aside className="flex flex-col gap-5">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">{t('today.panchang')}</h2>
            <Link to="/calendar" className="text-sm text-accent hover:underline">Calendar →</Link>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="eyebrow">{t('term.tithi')}</dt><dd className="text-fg">{p.tithi.name}{p.tithi.endsAt && <span className="block text-xs text-fg-3">until {time(p.tithi.endsAt, dateLocale, tz)}</span>}</dd></div>
            <div><dt className="eyebrow">{t('term.nakshatra')}</dt><dd className="text-fg">{p.nakshatra.name} {p.nakshatra.pada}{p.nakshatra.endsAt && <span className="block text-xs text-fg-3">until {time(p.nakshatra.endsAt, dateLocale, tz)}</span>}</dd></div>
            <div><dt className="eyebrow">Yoga</dt><dd className="text-fg">{p.yoga.name}</dd></div>
            <div><dt className="eyebrow">Karana</dt><dd className="text-fg">{p.karana.name}</dd></div>
            <div><dt className="eyebrow">Vara</dt><dd className="text-fg">{p.vara.name}</dd></div>
            <div><dt className="eyebrow">Month</dt><dd className="text-fg">{p.lunarMonth.amanta}{p.lunarMonth.adhika ? ' (Adhika)' : ''}</dd></div>
            <div><dt className="eyebrow">Sunrise</dt><dd className="text-fg numeric">{p.sunrise ? time(p.sunrise, dateLocale, tz) : '—'}</dd></div>
            <div><dt className="eyebrow">Sunset</dt><dd className="text-fg numeric">{p.sunset ? time(p.sunset, dateLocale, tz) : '—'}</dd></div>
          </dl>
          <div className="orbit-rule my-4" />
          <ul className="space-y-1.5 text-sm">
            {p.windows.map((w) => (
              <li key={w.name} className="flex justify-between gap-3"><span className="text-fg-2">{w.name}</span><span className="text-fg numeric">{time(w.start, dateLocale, tz)}–{time(w.end, dateLocale, tz)}</span></li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-fg-3">{d.briefing.colourOfDay.colour}: {d.briefing.colourOfDay.note}</p>
        </Card>
        {d.dasha[0] && (
          <Card>
            <p className="eyebrow">{t('term.dasha')}</p>
            <p className="mt-1 font-display text-2xl">{PLANETS[d.dasha[0].lord as PlanetId].vedic} mahadasha</p>
            {d.dasha[1] && <p className="text-sm text-fg-2">{PLANETS[d.dasha[1].lord as PlanetId].vedic} antardasha until {civilDate(d.dasha[1].end.slice(0, 10), dateLocale)}</p>}
            <Link to="/chart?tab=dasha" className="mt-3 inline-block text-sm text-accent hover:underline">See your timeline →</Link>
          </Card>
        )}
        <Card>
          <h2 className="font-display text-2xl">{t('today.upcoming')}</h2>
          <ul className="mt-3 space-y-2">
            {d.upcomingFestivals.map((f) => <li key={f.key + f.date} className="flex justify-between gap-3 text-sm"><span className="text-fg">{f.name}</span><span className="text-fg-3 numeric">{civilDate(f.date, dateLocale, { day: 'numeric', month: 'short' })}</span></li>)}
            {!d.upcomingFestivals.length && <li className="text-sm text-fg-3">No major observances in the coming weeks.</li>}
          </ul>
        </Card>
        <Card className="bg-[linear-gradient(160deg,rgb(141_123_216/0.14),transparent)]">
          <h2 className="font-display text-2xl">Share the sky</h2>
          <p className="mt-1 text-sm text-fg-2">Invite someone to a Bond and explore your connection — only with their consent.</p>
          <ButtonLink to="/bonds?new=1" variant="secondary" size="sm" className="mt-3" icon="bonds">Create a Bond</ButtonLink>
        </Card>
      </aside>
    </div>
  );
}

function RitualCard({ d }: { d: DailyResponse }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => post<{ xpAwarded: number; alreadyCompleted: boolean }>('rituals/complete', { ritualKey: d.briefing.ritual.key }),
    onSuccess: (r) => { toast(r.alreadyCompleted ? 'Already completed today' : `Ritual complete ✦ +${r.xpAwarded} XP`, 'success'); qc.invalidateQueries({ queryKey: ['daily'] }); qc.invalidateQueries({ queryKey: ['journey'] }); },
  });
  const r = d.briefing.ritual;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{t('today.ritual')} · {r.durationMinutes} min</p>
          <h2 className="mt-1 font-display text-2xl">{r.title}</h2>
        </div>
        <Icon name="sparkle" className="text-accent" />
      </div>
      <p className="mt-2 text-sm text-fg-2">{r.description}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-fg-2">{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <p className="mt-3 text-xs text-fg-3">{r.tradition} {d.briefing.ritualReason}</p>
      <Button className="mt-4" icon={d.ritualCompletedToday ? 'check' : undefined} variant={d.ritualCompletedToday ? 'secondary' : 'primary'} disabled={d.ritualCompletedToday} loading={m.isPending} onClick={() => m.mutate()}>
        {d.ritualCompletedToday ? 'Completed today' : 'Mark complete'}
      </Button>
      <p className="mt-2 text-xs text-fg-3">Skipping a day never costs you anything.</p>
    </Card>
  );
}

function ReflectionCard({ prompt, date }: { prompt: string; date: string }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => post('timeline', { kind: 'reflection', title: prompt, body: text, eventDate: date, mood: mood ?? undefined }),
    onSuccess: () => { setText(''); setMood(null); toast('Reflection saved to your Journey', 'success'); qc.invalidateQueries({ queryKey: ['journey'] }); },
  });
  const moods = ['calm', 'hopeful', 'tender', 'restless', 'tired', 'grateful'];
  return (
    <Card>
      <p className="eyebrow">{t('today.reflect')}</p>
      <h2 className="mt-1 font-display text-2xl leading-snug">{prompt}</h2>
      <label className="sr-only" htmlFor="reflection">Your reflection</label>
      <Textarea id="reflection" className="mt-3" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a few lines, only for you…" />
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Mood (optional)">
        {moods.map((x) => <button key={x} type="button" aria-pressed={mood === x} onClick={() => setMood(mood === x ? null : x)} className={cx('rounded-full border px-3 py-1 text-xs capitalize', mood === x ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-3')}>{x}</button>)}
      </div>
      <Button className="mt-4" size="sm" disabled={!text.trim()} loading={m.isPending} onClick={() => m.mutate()}>Save privately</Button>
    </Card>
  );
}

function LessonCard({ lesson, completed }: { lesson: DailyResponse['briefing']['lesson']; completed: boolean }) {
  const { t } = useI18n();
  const [answer, setAnswer] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean | null; explanation: string | null } | null>(null);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => post<{ correct: boolean | null; explanation: string | null; xpAwarded: number }>(`daily/lesson/${lesson.key}/complete`, { answer: answer ?? undefined }),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['journey'] }); },
  });
  return (
    <Card>
      <p className="eyebrow">{t('today.lesson')}</p>
      <h2 className="mt-1 font-display text-2xl">{lesson.title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{lesson.body}</p>
      {lesson.quiz && !completed && !result && (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-fg">{lesson.quiz.question}</legend>
          <div className="mt-2 flex flex-col gap-2">
            {lesson.quiz.options.map((o, i) => (
              <label key={o} className={cx('flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2 text-sm', answer === i ? 'border-accent bg-accent/10' : 'border-line')}>
                <input type="radio" name="daily-quiz" checked={answer === i} onChange={() => setAnswer(i)} className="accent-[var(--accent)]" />{o}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {result && <Notice tone={result.correct === false ? 'warning' : 'success'} className="mt-4">{result.correct === false ? 'Not quite. ' : result.correct ? 'Correct! ' : 'Lesson complete. '}{result.explanation}</Notice>}
      {!completed && !result && <Button size="sm" className="mt-4" disabled={Boolean(lesson.quiz) && answer === null} loading={m.isPending} onClick={() => m.mutate()}>Complete lesson</Button>}
      {completed && !result && <p className="mt-3 text-sm text-success">✓ Completed — a new lesson appears tomorrow.</p>}
    </Card>
  );
}
