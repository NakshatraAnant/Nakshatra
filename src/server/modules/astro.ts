import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { track } from '../lib/context';
import { badRequest, notFound, parse } from '../lib/http';
import { requireAuth } from '../lib/auth';
import { awardXp, evaluateAchievements, grantAchievement } from '../lib/rewards';
import {
  activeDasha, ashtakavarga, buildChart, detectYogas, divisionalChart, festivalsForYear, findMuhurats, gochar,
  kaalSarp, manglik, natalAspects, bodiesFromPlacements, elementSummary, chartPatterns, numerology, panchang, placement,
  retrogradePeriods, secondaryProgressions, solarReturn, transitsToNatal, vimshottari, nextMoonPhase,
  type ChartResult, type MuhuratPurpose, type Varga, ENGINE_VERSION,
} from '../../astro';
import { CONTENT_PACK_VERSION, interpret } from '../../content/interpretations';
import { composeBriefing } from '../../content/briefing';
import { DAILY_LESSONS, RITUALS } from '../../content/daily';
import { CONFIGS, currentChart, primaryBirth } from '../services/identity';
import { activeRules } from '../services/content';

const VARGAS: Varga[] = ['D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12', 'D16', 'D20', 'D24', 'D30', 'D60'];
const VEDIC_DRISHTI: Record<string, number[]> = { mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10] };

export function vedicExtras(chart: ChartResult, at = new Date()) {
  const dasha = vimshottari(placement(chart, 'moon').longitude, new Date(chart.utc), 2);
  const yogas = detectYogas(chart);
  const m = manglik(chart);
  const active = activeDasha(dasha, at);
  return {
    dasha,
    activeDasha: active.map((p) => ({ lord: p.lord, start: p.start, end: p.end })),
    vargas: VARGAS.map((v) => divisionalChart(chart, v)),
    yogas,
    manglik: m,
    kaalSarp: kaalSarp(chart),
    ashtakavarga: ashtakavarga(chart),
    drishti: chart.placements.filter((p) => !['rahu', 'ketu'].includes(p.id))
      .flatMap((p) => (VEDIC_DRISHTI[p.id] ?? [7]).map((h) => ({ from: p.id, toSign: (p.sign + h - 1) % 12, offset: h }))),
    interpretations: interpret({ chart, yogas, manglik: m, currentDashaLord: active[0]?.lord }, 'en', activeRules()),
    unsupported: [{ feature: 'Shadbala', reason: 'Not implemented in engine v1; omitted rather than approximated.' }],
  };
}

export function westernExtras(chart: ChartResult) {
  return {
    aspects: natalAspects(bodiesFromPlacements(chart.placements, { asc: chart.ascendant?.longitude, mc: chart.midheaven?.longitude }), true),
    elements: elementSummary(chart.placements, chart.ascendant?.longitude ?? null),
    patterns: chartPatterns(chart.placements),
    interpretations: interpret({ chart }, 'en', activeRules()),
  };
}

async function locationFor(ctx: Ctx, userId: string | null, q: { lat?: number; lon?: number; tz?: string }) {
  if (q.lat !== undefined && q.lon !== undefined && q.tz) return { latitude: q.lat, longitude: q.lon, timezone: q.tz, placeName: 'Selected location' };
  if (userId) {
    const [l] = await ctx.db.select().from(s.userLocations).where(eq(s.userLocations.userId, userId));
    if (l) return l;
  }
  return { latitude: 28.6139, longitude: 77.209, timezone: 'Asia/Kolkata', placeName: 'New Delhi, India (default)' };
}

const festivalCache = new Map<string, ReturnType<typeof festivalsForYear>>();
export function cachedFestivals(year: number, lat: number, lon: number, tz: string) {
  const key = `${year}:${lat.toFixed(1)}:${lon.toFixed(1)}:${tz}`;
  if (!festivalCache.has(key)) festivalCache.set(key, festivalsForYear(year, lat, lon, tz));
  return festivalCache.get(key)!;
}

const LocQuery = z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lon: z.coerce.number().min(-180).max(180).optional(), tz: z.string().optional() });

export async function astroRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/charts/me', async (req) => {
    const a = requireAuth(req);
    const { config = 'vedic_default' } = parse(z.object({ config: z.enum(Object.keys(CONFIGS) as [string, ...string[]]).optional() }), req.query);
    const c = await currentChart(ctx.db, a.userId, config);
    if (!c) throw notFound('Birth profile');
    const extras = c.result.system === 'vedic' ? { vedic: vedicExtras(c.result) } : { western: westernExtras(c.result) };
    return { chartId: c.id, configKey: config, chart: c.result, ...extras, contentVersion: CONTENT_PACK_VERSION };
  });

  app.get('/api/v1/charts/configs', async () => ({
    configs: Object.entries(CONFIGS).map(([key, c]) => ({ key, ...c })),
    engineVersion: ENGINE_VERSION,
  }));

  app.post('/api/v1/charts/explored', async (req) => {
    const a = requireAuth(req);
    const { factor } = parse(z.object({ factor: z.string().max(40) }), req.body);
    const [loc] = await ctx.db.select().from(s.userLocations).where(eq(s.userLocations.userId, a.userId));
    const today = DateTime.now().setZone(loc?.timezone ?? 'Asia/Kolkata').toISODate()!;
    const xp = await awardXp(ctx, ctx.db, a.userId, 'chart_explored', { localDate: today });
    await track(ctx.db, a.userId, 'chart_explored', { factor });
    return { xpAwarded: xp };
  });

  app.post('/api/v1/charts/snapshots', async (req) => {
    const a = requireAuth(req);
    const { configKey, label } = parse(z.object({ configKey: z.string(), label: z.string().trim().min(1).max(80) }), req.body);
    const c = await currentChart(ctx.db, a.userId, configKey);
    const bp = await primaryBirth(ctx.db, a.userId);
    if (!c || !bp) throw notFound('Chart');
    const [row] = await ctx.db.insert(s.charts).values({
      userId: a.userId, birthProfileId: bp.id, system: c.result.system, configKey, config: c.result.config as unknown as Record<string, unknown>,
      engineVersion: c.result.engineVersion, contentVersion: CONTENT_PACK_VERSION, result: c.result as unknown as Record<string, unknown>, isSnapshot: true, label,
    }).returning({ id: s.charts.id, createdAt: s.charts.createdAt });
    return { snapshot: row };
  });

  app.get('/api/v1/charts/snapshots', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select({ id: s.charts.id, label: s.charts.label, system: s.charts.system, configKey: s.charts.configKey, engineVersion: s.charts.engineVersion, contentVersion: s.charts.contentVersion, createdAt: s.charts.createdAt })
      .from(s.charts).where(and(eq(s.charts.userId, a.userId), eq(s.charts.isSnapshot, true))).orderBy(desc(s.charts.createdAt));
    return { snapshots: rows };
  });

  app.get('/api/v1/charts/snapshots/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const [row] = await ctx.db.select().from(s.charts).where(and(eq(s.charts.id, id), eq(s.charts.userId, a.userId), eq(s.charts.isSnapshot, true)));
    if (!row) throw notFound('Snapshot');
    return { snapshot: row };
  });

  app.delete('/api/v1/charts/snapshots/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const res = await ctx.db.delete(s.charts).where(and(eq(s.charts.id, id), eq(s.charts.userId, a.userId), eq(s.charts.isSnapshot, true))).returning({ id: s.charts.id });
    if (!res.length) throw notFound('Snapshot');
    return { ok: true };
  });

  /** Ad-hoc chart for arbitrary data (not stored) — e.g. learning or checking an event time. */
  app.post('/api/v1/charts/calculate', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    requireAuth(req);
    const body = parse(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
      timePrecision: z.enum(['exact', 'within_15m', 'within_1h', 'unknown']), latitude: z.number(), longitude: z.number(), timezone: z.string(),
      configKey: z.string().default('vedic_default'),
    }), req.body);
    const config = CONFIGS[body.configKey];
    if (!config) throw badRequest('Unknown configuration');
    try {
      const chart = buildChart(body, config);
      return { chart, ...(chart.system === 'vedic' ? { vedic: vedicExtras(chart) } : { western: westernExtras(chart) }) };
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  });

  app.get('/api/v1/charts/me/transits', async (req) => {
    const a = requireAuth(req);
    const { at } = parse(z.object({ at: z.iso.datetime().optional() }), req.query);
    const when = at ? new Date(at) : new Date();
    const [w, v] = await Promise.all([currentChart(ctx.db, a.userId, 'western_default'), currentChart(ctx.db, a.userId, 'vedic_default')]);
    if (!w || !v) throw notFound('Birth profile');
    const t = transitsToNatal(w.result, when);
    return {
      at: when.toISOString(),
      western: { positions: t.positions, aspects: t.aspects.slice(0, 25) },
      gochar: gochar(placement(v.result, 'moon').sign, v.result.ascendant?.sign ?? null, when),
      retrogrades: (['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const).flatMap((id) =>
        retrogradePeriods(id, new Date(when.getTime() - 120 * 86400000), new Date(when.getTime() + 240 * 86400000))),
    };
  });

  app.get('/api/v1/charts/me/progressions', async (req) => {
    const a = requireAuth(req);
    const w = await currentChart(ctx.db, a.userId, 'western_default');
    if (!w) throw notFound('Birth profile');
    return { progressions: secondaryProgressions(w.result, new Date()) };
  });

  app.get('/api/v1/charts/me/solar-return', async (req) => {
    const a = requireAuth(req);
    const { year } = parse(z.object({ year: z.coerce.number().int().min(1900).max(2150) }), req.query);
    const w = await currentChart(ctx.db, a.userId, 'western_default');
    if (!w) throw notFound('Birth profile');
    const [loc] = await ctx.db.select().from(s.userLocations).where(eq(s.userLocations.userId, a.userId));
    const sr = solarReturn(w.result, year, loc ? { latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone, placeName: loc.placeName } : undefined);
    return { solarReturn: sr, extras: westernExtras(sr) };
  });

  app.get('/api/v1/numerology/me', async (req) => {
    const a = requireAuth(req);
    const bp = await primaryBirth(ctx.db, a.userId);
    if (!bp) throw notFound('Birth profile');
    const [p] = await ctx.db.select().from(s.profiles).where(eq(s.profiles.userId, a.userId));
    return { numerology: numerology(bp.birthDate, p.fullName ?? p.displayName, new Date().getFullYear()), note: 'Numerology is a separate, optional system and is not part of astrological calculations.' };
  });

  /* -------- Panchang, calendar, festivals, muhurat -------- */

  app.get('/api/v1/panchang', async (req) => {
    const q = parse(LocQuery.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query);
    const loc = await locationFor(ctx, req.auth?.userId ?? null, q);
    const date = q.date ?? DateTime.now().setZone(loc.timezone).toISODate()!;
    return { location: loc, panchang: panchang(date, loc.latitude, loc.longitude, loc.timezone) };
  });

  app.get('/api/v1/calendar/month', async (req) => {
    const q = parse(LocQuery.extend({ month: z.string().regex(/^\d{4}-\d{2}$/) }), req.query);
    const loc = await locationFor(ctx, req.auth?.userId ?? null, q);
    const start = DateTime.fromISO(`${q.month}-01`, { zone: loc.timezone });
    const days = [];
    for (let d = start; d.month === start.month; d = d.plus({ days: 1 })) {
      const p = panchang(d.toISODate()!, loc.latitude, loc.longitude, loc.timezone);
      days.push({ date: p.date, tithi: p.tithi, nakshatra: { name: p.nakshatra.name, index: p.nakshatra.index }, moon: p.moon, vara: p.vara.name, sunrise: p.sunrise, sunset: p.sunset });
    }
    const festivals = cachedFestivals(start.year, loc.latitude, loc.longitude, loc.timezone).filter((f) => f.date.startsWith(q.month));
    return { location: loc, days, festivals };
  });

  app.get('/api/v1/calendar/festivals', async (req) => {
    const q = parse(LocQuery.extend({ year: z.coerce.number().int().min(1900).max(2100) }), req.query);
    const loc = await locationFor(ctx, req.auth?.userId ?? null, q);
    return { location: loc, festivals: cachedFestivals(q.year, loc.latitude, loc.longitude, loc.timezone), disclaimer: 'Dates follow the stated rules for this location; regional traditions may observe some festivals on a different day.' };
  });

  app.get('/api/v1/calendar/export.ics', async (req, reply) => {
    const q = parse(LocQuery.extend({ year: z.coerce.number().int().min(1900).max(2100) }), req.query);
    const loc = await locationFor(ctx, req.auth?.userId ?? null, q);
    const fest = cachedFestivals(q.year, loc.latitude, loc.longitude, loc.timezone).filter((f) => f.kind !== 'recurring');
    const esc = (t: string) => t.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
    const stamp = DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'");
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nakshatra//Festival Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Nakshatra festivals ${q.year}`];
    for (const f of fest) {
      const d = f.date.replace(/-/g, '');
      const next = DateTime.fromISO(f.date).plus({ days: 1 }).toFormat('yyyyMMdd');
      lines.push('BEGIN:VEVENT', `UID:${f.key}-${f.date}@nakshatra`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${esc(f.name)}`, `DESCRIPTION:${esc(`${f.description} Rule: ${f.rule}. Location: ${loc.placeName}.`)}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    reply.header('content-type', 'text/calendar; charset=utf-8').header('content-disposition', `attachment; filename="nakshatra-${q.year}.ics"`);
    return lines.join('\r\n');
  });

  app.get('/api/v1/muhurat', async (req) => {
    const q = parse(LocQuery.extend({
      purpose: z.enum(['marriage', 'griha_pravesh', 'new_venture', 'general']),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.coerce.number().int().min(1).max(90).default(30),
    }), req.query);
    const loc = await locationFor(ctx, req.auth?.userId ?? null, q);
    return { location: loc, result: findMuhurats(q.purpose as MuhuratPurpose, q.from, q.days, loc.latitude, loc.longitude, loc.timezone) };
  });

  app.get('/api/v1/moon-phases', async (req) => {
    const { from } = parse(z.object({ from: z.iso.datetime().optional() }), req.query);
    let t = from ? new Date(from) : new Date();
    const out: { phase: string; at: string }[] = [];
    const names = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];
    for (let i = 0; i < 8; i++) {
      const candidates = [0, 90, 180, 270].map((p, k) => ({ k, at: nextMoonPhase(t, p)! }));
      const next = candidates.sort((a, b) => a.at.getTime() - b.at.getTime())[0];
      out.push({ phase: names[next.k], at: next.at.toISOString() });
      t = new Date(next.at.getTime() + 3600000);
    }
    return { phases: out };
  });

  /* -------- Daily briefing -------- */

  app.get('/api/v1/daily', async (req) => {
    const a = requireAuth(req);
    const loc = await locationFor(ctx, a.userId, {});
    const date = DateTime.now().setZone(loc.timezone).toISODate()!;
    const p = panchang(date, loc.latitude, loc.longitude, loc.timezone);
    const [v, w] = await Promise.all([currentChart(ctx.db, a.userId, 'vedic_default'), currentChart(ctx.db, a.userId, 'western_default')]);
    const transitAspects = w ? transitsToNatal(w.result, new Date()).aspects : [];
    const done = await ctx.db.select({ k: s.lessonProgressDaily.lessonKey }).from(s.lessonProgressDaily).where(eq(s.lessonProgressDaily.userId, a.userId));
    const nextLesson = DAILY_LESSONS.findIndex((l) => !done.some((d) => d.k === l.key));
    const briefing = composeBriefing({ date, userSeed: a.userId, panchang: p, vedic: v?.result ?? null, transitAspects, lessonIndex: nextLesson >= 0 ? nextLesson : undefined });
    const [ritualDone] = await ctx.db.select().from(s.ritualCompletions).where(and(eq(s.ritualCompletions.userId, a.userId), eq(s.ritualCompletions.localDate, date)));
    const dasha = v ? activeDasha(vimshottari(placement(v.result, 'moon').longitude, new Date(v.result.utc), 2), new Date()) : [];
    const todayFestivals = cachedFestivals(Number(date.slice(0, 4)), loc.latitude, loc.longitude, loc.timezone).filter((f) => f.date === date);
    const upcoming = cachedFestivals(Number(date.slice(0, 4)), loc.latitude, loc.longitude, loc.timezone).filter((f) => f.date > date && f.kind !== 'recurring').slice(0, 4);
    await track(ctx.db, a.userId, 'briefing_viewed', { personalised: briefing.personalised });
    return {
      location: loc, panchang: p, briefing, ritualCompletedToday: Boolean(ritualDone),
      dasha: dasha.map((d) => ({ lord: d.lord, end: d.end })),
      festivalsToday: todayFestivals, upcomingFestivals: upcoming,
      lessonCompleted: done.some((d) => d.k === briefing.lesson.key),
    };
  });

  app.post('/api/v1/daily/lesson/:key/complete', async (req) => {
    const a = requireAuth(req);
    const { key } = parse(z.object({ key: z.string() }), req.params);
    const { answer } = parse(z.object({ answer: z.number().int().optional() }), req.body ?? {});
    const lesson = DAILY_LESSONS.find((l) => l.key === key);
    if (!lesson) throw notFound('Lesson');
    const correct = lesson.quiz ? answer === lesson.quiz.answer : null;
    if (lesson.quiz && answer === undefined) throw badRequest('Answer the question to complete this lesson.');
    await ctx.db.insert(s.lessonProgressDaily).values({ userId: a.userId, lessonKey: key, quizCorrect: correct }).onConflictDoNothing();
    const xp = await awardXp(ctx, ctx.db, a.userId, 'daily_lesson_completed', { sourceId: key });
    await evaluateAchievements(ctx, ctx.db, a.userId, ['lessons']);
    await track(ctx.db, a.userId, 'lesson_completed', { daily: true });
    return { correct, xpAwarded: xp, explanation: lesson.quiz ? `The answer is: ${lesson.quiz.options[lesson.quiz.answer]}.` : null };
  });

  app.get('/api/v1/rituals', async () => ({ rituals: RITUALS }));

  app.post('/api/v1/rituals/complete', async (req) => {
    const a = requireAuth(req);
    const { ritualKey, note } = parse(z.object({ ritualKey: z.string(), note: z.string().max(500).default('') }), req.body);
    if (!RITUALS.some((r) => r.key === ritualKey)) throw notFound('Ritual');
    const loc = await locationFor(ctx, a.userId, {});
    const date = DateTime.now().setZone(loc.timezone).toISODate()!;
    const res = await ctx.db.insert(s.ritualCompletions).values({ userId: a.userId, ritualKey, localDate: date, note }).onConflictDoNothing().returning();
    let xp = 0;
    if (res.length) {
      xp = await awardXp(ctx, ctx.db, a.userId, 'ritual_completed', { localDate: date });
      await evaluateAchievements(ctx, ctx.db, a.userId, ['rituals']);
      if (cachedFestivals(Number(date.slice(0, 4)), loc.latitude, loc.longitude, loc.timezone).some((f) => f.date === date && f.kind === 'lunar')) {
        await grantAchievement(ctx, ctx.db, a.userId, 'festival_observer');
      }
      await track(ctx.db, a.userId, 'ritual_completed', { ritualKey });
    }
    return { completed: true, alreadyCompleted: !res.length, xpAwarded: xp, date };
  });

  app.get('/api/v1/rituals/history', async (req) => {
    const a = requireAuth(req);
    const { from, to } = parse(z.object({ from: z.string(), to: z.string() }), req.query);
    const rows = await ctx.db.select().from(s.ritualCompletions).where(and(eq(s.ritualCompletions.userId, a.userId), gte(s.ritualCompletions.localDate, from), lte(s.ritualCompletions.localDate, to))).orderBy(asc(s.ritualCompletions.localDate));
    return { completions: rows, note: 'Rest days are never penalised; totals count any days you choose.' };
  });

  /* -------- Saved insights & timeline -------- */

  app.get('/api/v1/insights', async (req) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.savedInsights).where(eq(s.savedInsights.userId, a.userId)).orderBy(desc(s.savedInsights.createdAt));
    return { insights: rows };
  });

  app.post('/api/v1/insights', async (req) => {
    const a = requireAuth(req);
    const body = parse(z.object({ ruleKey: z.string(), configKey: z.string().default('vedic_default'), note: z.string().max(1000).default('') }), req.body);
    const c = await currentChart(ctx.db, a.userId, body.configKey);
    if (!c) throw notFound('Chart');
    const extras = c.result.system === 'vedic' ? vedicExtras(c.result) : westernExtras(c.result);
    const item = extras.interpretations.find((i) => i.key === body.ruleKey);
    if (!item) throw badRequest('That interpretation does not apply to your chart.');
    const [row] = await ctx.db.insert(s.savedInsights).values({
      userId: a.userId, chartId: c.id, ruleKey: item.key, ruleVersion: item.version, title: item.title, body: item.body, factor: item.factor, note: body.note,
    }).onConflictDoUpdate({ target: [s.savedInsights.userId, s.savedInsights.ruleKey, s.savedInsights.chartId], set: { note: body.note } }).returning();
    await awardXp(ctx, ctx.db, a.userId, 'insight_saved', { sourceId: row.id });
    await track(ctx.db, a.userId, 'insight_saved', { group: item.group });
    return { insight: row };
  });

  app.patch('/api/v1/insights/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const { note } = parse(z.object({ note: z.string().max(1000) }), req.body);
    const [row] = await ctx.db.update(s.savedInsights).set({ note }).where(and(eq(s.savedInsights.id, id), eq(s.savedInsights.userId, a.userId))).returning();
    if (!row) throw notFound('Insight');
    return { insight: row };
  });

  app.delete('/api/v1/insights/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const res = await ctx.db.delete(s.savedInsights).where(and(eq(s.savedInsights.id, id), eq(s.savedInsights.userId, a.userId))).returning();
    if (!res.length) throw notFound('Insight');
    return { ok: true };
  });

  const TimelineBody = z.object({
    kind: z.enum(['milestone', 'reflection', 'intention', 'annotation']),
    title: z.string().trim().min(1).max(120), body: z.string().max(4000).default(''),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), mood: z.string().max(20).optional(), tags: z.array(z.string().max(24)).max(8).default([]),
  });

  app.get('/api/v1/timeline', async (req) => {
    const a = requireAuth(req);
    const { from, to } = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query);
    const personal = await ctx.db.select().from(s.timelineEvents)
      .where(and(eq(s.timelineEvents.userId, a.userId), gte(s.timelineEvents.eventDate, from), lte(s.timelineEvents.eventDate, to))).orderBy(asc(s.timelineEvents.eventDate));
    // Calculated landmarks — clearly separated from personal entries.
    const calculated: { date: string; kind: string; title: string; detail: string }[] = [];
    const v = await currentChart(ctx.db, a.userId, 'vedic_default');
    if (v) {
      const d = vimshottari(placement(v.result, 'moon').longitude, new Date(v.result.utc), 2);
      for (const md of d.mahadashas) for (const ad of md.sub ?? []) {
        const day = ad.start.slice(0, 10);
        if (day >= from && day <= to) calculated.push({ date: day, kind: 'dasha', title: `${cap(ad.lord)} antardasha begins (${cap(md.lord)} mahadasha)`, detail: 'Vimshottari period boundary (calculated).' });
      }
      const y0 = Number(from.slice(0, 4));
      const y1 = Number(to.slice(0, 4));
      const loc = await locationFor(ctx, a.userId, {});
      for (let y = y0; y <= Math.min(y1, y0 + 2); y++) {
        for (const f of cachedFestivals(y, loc.latitude, loc.longitude, loc.timezone)) {
          if (f.date >= from && f.date <= to && (f.kind === 'lunar' || f.key === 'sankranti_9' || f.key === 'sankranti_0')) calculated.push({ date: f.date, kind: 'festival', title: f.name, detail: f.rule });
        }
      }
    }
    const bp = await primaryBirth(ctx.db, a.userId);
    if (bp) {
      for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
        const bd = `${y}${bp.birthDate.slice(4)}`;
        if (bd >= from && bd <= to) calculated.push({ date: bd, kind: 'birthday', title: 'Your birthday (civil date)', detail: 'Solar return occurs near this date.' });
      }
    }
    return {
      personal, calculated: calculated.sort((x, y) => x.date.localeCompare(y.date)),
      note: 'Calculated landmarks are astronomical or calendar facts. They are shown alongside your entries for reflection, not as causes of personal events.',
    };
  });

  app.post('/api/v1/timeline', async (req) => {
    const a = requireAuth(req);
    const body = parse(TimelineBody, req.body);
    const [row] = await ctx.db.insert(s.timelineEvents).values({ ...body, userId: a.userId }).returning();
    if (body.kind === 'reflection' || body.kind === 'intention') {
      await awardXp(ctx, ctx.db, a.userId, 'reflection_written', { localDate: body.eventDate });
      await evaluateAchievements(ctx, ctx.db, a.userId, ['reflections']);
      await track(ctx.db, a.userId, 'reflection_written', { kind: body.kind });
    }
    return { event: row };
  });

  app.patch('/api/v1/timeline/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(TimelineBody.partial(), req.body);
    const [row] = await ctx.db.update(s.timelineEvents).set({ ...body, updatedAt: new Date() }).where(and(eq(s.timelineEvents.id, id), eq(s.timelineEvents.userId, a.userId))).returning();
    if (!row) throw notFound('Entry');
    return { event: row };
  });

  app.delete('/api/v1/timeline/:id', async (req) => {
    const a = requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const res = await ctx.db.delete(s.timelineEvents).where(and(eq(s.timelineEvents.id, id), eq(s.timelineEvents.userId, a.userId))).returning();
    if (!res.length) throw notFound('Entry');
    return { ok: true };
  });

  app.get('/api/v1/timeline/export', async (req, reply) => {
    const a = requireAuth(req);
    const rows = await ctx.db.select().from(s.timelineEvents).where(eq(s.timelineEvents.userId, a.userId)).orderBy(asc(s.timelineEvents.eventDate));
    const md = ['# My Cosmic Journey', '', ...rows.map((r) => `## ${r.eventDate} — ${r.title}\n_${r.kind}${r.mood ? ` · ${r.mood}` : ''}_\n\n${r.body}\n`)].join('\n');
    reply.header('content-type', 'text/markdown; charset=utf-8').header('content-disposition', 'attachment; filename="cosmic-journey.md"');
    return md;
  });

  /* -------- Recaps & Cosmic Wrapped -------- */

  app.get('/api/v1/recap', async (req) => {
    const a = requireAuth(req);
    const { period, anchor } = parse(z.object({ period: z.enum(['week', 'month', 'year']), anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.query);
    const loc = await locationFor(ctx, a.userId, {});
    const base = anchor ? DateTime.fromISO(anchor, { zone: loc.timezone }) : DateTime.now().setZone(loc.timezone);
    const start = base.startOf(period === 'week' ? 'week' : period);
    const end = start.endOf(period === 'week' ? 'week' : period);
    const from = start.toUTC().toJSDate();
    const to = end.toUTC().toJSDate();
    const n = sql<number>`count(*)::int`;
    const between = (col: typeof s.xpLedger.createdAt) => and(gte(col, from), lte(col, to));
    const [xp] = await ctx.db.select({ total: sql<number>`coalesce(sum(${s.xpLedger.amount}),0)::int` }).from(s.xpLedger).where(and(eq(s.xpLedger.userId, a.userId), between(s.xpLedger.createdAt)));
    const [rituals] = await ctx.db.select({ n }).from(s.ritualCompletions).where(and(eq(s.ritualCompletions.userId, a.userId), gte(s.ritualCompletions.localDate, start.toISODate()!), lte(s.ritualCompletions.localDate, end.toISODate()!)));
    const [reflections] = await ctx.db.select({ n }).from(s.timelineEvents).where(and(eq(s.timelineEvents.userId, a.userId), inArray(s.timelineEvents.kind, ['reflection', 'intention']), gte(s.timelineEvents.eventDate, start.toISODate()!), lte(s.timelineEvents.eventDate, end.toISODate()!)));
    const [insights] = await ctx.db.select({ n }).from(s.savedInsights).where(and(eq(s.savedInsights.userId, a.userId), gte(s.savedInsights.createdAt, from), lte(s.savedInsights.createdAt, to)));
    const [bondsN] = await ctx.db.select({ n }).from(s.bonds).where(and(eq(s.bonds.ownerId, a.userId), gte(s.bonds.createdAt, from), lte(s.bonds.createdAt, to)));
    const [lessonsN] = await ctx.db.select({ n }).from(s.lessonProgress).where(and(eq(s.lessonProgress.userId, a.userId), gte(s.lessonProgress.completedAt, from), lte(s.lessonProgress.completedAt, to)));
    const achievements = await ctx.db.select().from(s.userAchievements).where(and(eq(s.userAchievements.userId, a.userId), gte(s.userAchievements.awardedAt, from), lte(s.userAchievements.awardedAt, to)));
    const moods = await ctx.db.select({ mood: s.timelineEvents.mood, n }).from(s.timelineEvents)
      .where(and(eq(s.timelineEvents.userId, a.userId), gte(s.timelineEvents.eventDate, start.toISODate()!), lte(s.timelineEvents.eventDate, end.toISODate()!), sql`${s.timelineEvents.mood} is not null`))
      .groupBy(s.timelineEvents.mood).orderBy(sql`count(*) desc`).limit(3);
    const fests = period === 'year' ? cachedFestivals(start.year, loc.latitude, loc.longitude, loc.timezone).filter((f) => f.kind === 'lunar').length : null;
    const v = await currentChart(ctx.db, a.userId, 'vedic_default');
    const highlights: string[] = [];
    if (v && period === 'year') {
      const d = vimshottari(placement(v.result, 'moon').longitude, new Date(v.result.utc), 2);
      const changes = d.mahadashas.flatMap((m) => m.sub ?? []).filter((p) => p.start >= from.toISOString() && p.start <= to.toISOString());
      if (changes.length) highlights.push(`${changes.length} antardasha change${changes.length > 1 ? 's' : ''} this year (calculated).`);
    }
    if (period === 'year') await grantAchievement(ctx, ctx.db, a.userId, 'wrapped');
    return {
      period, start: start.toISODate(), end: end.toISODate(),
      stats: { xp: xp.total, rituals: rituals.n, reflections: reflections.n, insightsSaved: insights.n, bondsCreated: bondsN.n, lessons: lessonsN.n, achievements: achievements.map((x) => x.achievementKey), topMoods: moods, festivalsInYear: fests },
      highlights,
      note: 'Your recap is built only from your own recorded activity and calculated calendar facts.',
    };
  });
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

