import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post, upload } from '../lib/api';
import { useMe } from '../lib/session';
import { Avatar, Badge, Button, ButtonLink, Card, PageHeader, Select, Field, Input, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice } from '../components/ui/feedback';
import { Dialog, Segmented, useToast } from '../components/ui/overlays';
import { Icon } from '../components/ui/icons';
import { Constellation } from '../components/ui/data';
import type { ChartResult } from '../../astro/types';
import { PLANETS, SIGNS } from '../../astro/constants';
import { ACHIEVEMENTS } from '../../shared/gamification';
import { CosmicSigil } from '../components/CosmicSigil';
import { ShareCardActions } from './discover';
import type { CosmicIdentity } from '../lib/cosmic';
import { ProfileCollections } from './collections';
import { ProfileWorld } from '../components/Worlds';

const CosmicIdScene = lazy(() => import('../three/scenes').then((m) => ({ default: m.CosmicIdScene })));

interface ChartResponse { chart: ChartResult; vedic?: { interpretations: Interp[]; activeDasha: { lord: string }[] }; western?: { interpretations: Interp[]; elements: { dominantElement: string; dominantModality: string } } }
export interface Interp { key: string; title: string; body: string; caveat?: string; factor: string; group: string; importance: number; version: number }

const THEMES = ['midnight', 'dawn', 'aurora', 'saffron', 'nebula', 'eclipse'] as const;
const EMBLEMS = ['orbit', 'lotus', 'star', 'crescent', 'mandala'] as const;
const THEME_SWATCH: Record<string, string> = { midnight: 'linear-gradient(135deg,#0b0c1f,#5d4bb0)', dawn: 'linear-gradient(135deg,#ecb98a,#c98a96)', aurora: 'linear-gradient(135deg,#7fb69a,#6fa8dc)', saffron: 'linear-gradient(135deg,#e9a23b,#c27c54)', nebula: 'linear-gradient(135deg,#b9adf0,#c98a96)', eclipse: 'linear-gradient(135deg,#07081a,#d9b26f)' };

function useCharts() {
  const v = useQuery({ queryKey: ['chart', 'vedic_default'], queryFn: () => get<ChartResponse>('charts/me?config=vedic_default') });
  const w = useQuery({ queryKey: ['chart', 'western_default'], queryFn: () => get<ChartResponse>('charts/me?config=western_default') });
  return { v, w };
}

interface Layer { id: string; label: string; system: 'Western' | 'Vedic'; value: string; detail: string; glyph: string; longitude: number | null; reliability: string; interp?: Interp }

function buildLayers(v: ChartResponse, w: ChartResponse): Layer[] {
  const wp = (id: string) => w.chart.placements.find((p) => p.id === id)!;
  const vp = (id: string) => v.chart.placements.find((p) => p.id === id)!;
  const vi = v.vedic?.interpretations ?? [];
  const wi = w.western?.interpretations ?? [];
  const moonNak = vp('moon').nakshatra!;
  const layers: Layer[] = [
    { id: 'sun', label: 'Sun sign', system: 'Western', value: SIGNS[wp('sun').sign].name, detail: `${wp('sun').dms} ${SIGNS[wp('sun').sign].glyph}`, glyph: '☉', longitude: wp('sun').longitude, reliability: 'reliable', interp: wi.find((i) => i.group === 'sun_sign') },
    { id: 'moon', label: 'Moon sign', system: 'Western', value: SIGNS[wp('moon').sign].name, detail: wp('moon').dms, glyph: '☽', longitude: wp('moon').longitude, reliability: w.chart.reliability.moonSign, interp: wi.find((i) => i.group === 'moon_sign') },
    { id: 'rising', label: 'Rising', system: 'Western', value: w.chart.ascendant ? SIGNS[w.chart.ascendant.sign].name : 'Unknown', detail: w.chart.ascendant ? w.chart.ascendant.dms : 'Needs a birth time', glyph: 'AC', longitude: w.chart.ascendant?.longitude ?? null, reliability: w.chart.reliability.ascendant, interp: wi.find((i) => i.group === 'ascendant') },
    { id: 'rashi', label: 'Rashi', system: 'Vedic', value: SIGNS[vp('moon').sign].vedic, detail: `Moon ${vp('moon').dms}`, glyph: '☾', longitude: null, reliability: v.chart.reliability.moonSign, interp: vi.find((i) => i.group === 'rashi') },
    { id: 'lagna', label: 'Lagna', system: 'Vedic', value: v.chart.ascendant ? SIGNS[v.chart.ascendant.sign].vedic : 'Unknown', detail: v.chart.ascendant ? v.chart.ascendant.dms : 'Needs a birth time', glyph: 'La', longitude: null, reliability: v.chart.reliability.ascendant, interp: vi.find((i) => i.group === 'lagna') },
    { id: 'nakshatra', label: 'Janma Nakshatra', system: 'Vedic', value: moonNak.name, detail: `Pada ${moonNak.pada} · lord ${PLANETS[moonNak.lord].vedic}`, glyph: '✦', longitude: null, reliability: v.chart.reliability.moonNakshatra, interp: vi.find((i) => i.group === 'janma_nakshatra') },
  ];
  return layers;
}

export function CosmicId() {
  const { v, w } = useCharts();
  const me = useMe().data?.user;
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'3d' | '2d'>(() => (localStorage.getItem('nk_view') as '3d' | '2d') ?? '3d');
  const [customise, setCustomise] = useState(false);
  const [share, setShare] = useState(false);
  const loading = v.isLoading || w.isLoading;
  const layers = useMemo(() => (v.data && w.data ? buildLayers(v.data, w.data) : []), [v.data, w.data]);
  const theme = me?.profile?.theme ?? 'midnight';
  const emblem = me?.profile?.emblem ?? 'orbit';
  const sel = layers.find((l) => l.id === selected);
  const setViewP = (x: '3d' | '2d') => { setView(x); try { localStorage.setItem('nk_view', x); } catch { /* storage unavailable */ } };

  return (
    <div>
      <PageHeader kicker={params.get('welcome') ? 'Your Cosmic ID is ready' : 'Cosmic ID'} title={<>The sky at <em className="text-accent">your</em> first breath</>}
        subtitle="Six identity layers from two traditions, calculated from your birth moment. Select any layer to read what it traditionally means — and how it was calculated."
        actions={<>
          <Segmented label="View" value={view} onChange={setViewP} options={[{ value: '3d', label: '3D' }, { value: '2d', label: '2D' }]} />
          <Button variant="secondary" icon="edit" onClick={() => setCustomise(true)}>Customise</Button>
          <Button icon="share" onClick={() => setShare(true)}>Share</Button>
        </>} />
      <ArchetypePanel />
      <QueryState q={{ ...v, isLoading: loading, error: v.error ?? w.error }}>{() => (
        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-line bg-canvas-deep" style={{ minHeight: 440 }}>
            {view === '3d' ? (
              <Suspense fallback={<IdCard2D layers={layers} theme={theme} name={me?.profile?.displayName ?? ''} />}>
                <div className="absolute inset-0">
                  <CosmicIdScene theme={theme} emblem={emblem} selected={selected} onSelect={setSelected}
                    sections={layers.filter((l) => l.longitude !== null).map((l) => ({ id: l.id, label: `${l.label}: ${l.value}`, glyph: l.glyph, longitude: l.longitude!, color: l.id === 'sun' ? '#d9b26f' : l.id === 'moon' ? '#f3eee2' : '#8d7bd8' }))}
                    fallback={<IdCard2D layers={layers} theme={theme} name={me?.profile?.displayName ?? ''} />} />
                </div>
              </Suspense>
            ) : <IdCard2D layers={layers} theme={theme} name={me?.profile?.displayName ?? ''} />}
            <p className="absolute bottom-3 left-4 right-4 text-[11px] text-fg-3">Western markers sit at their calculated tropical longitudes on a symbolic ring; distance from the centre has no physical meaning.</p>
          </div>
          <div className="flex flex-col gap-3">
            <ul className="grid grid-cols-2 gap-3" aria-label="Identity layers">
              {layers.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => { setSelected(l.id); void post('charts/explored', { factor: l.id }).catch(() => undefined); }} aria-pressed={selected === l.id}
                    className={cx('card w-full p-4 text-left transition-colors', selected === l.id ? 'border-accent' : 'hover:border-line-strong')}>
                    <p className="eyebrow">{l.system} · {l.label}</p>
                    <p className="mt-1 font-display text-2xl text-fg">{l.value}</p>
                    <p className="text-xs text-fg-3 numeric">{l.detail}</p>
                    {l.reliability !== 'reliable' && <Badge tone="warning" className="mt-2">{l.reliability === 'unknown' ? 'Needs birth time' : 'Uncertain'}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
            {sel ? <LayerPanel layer={sel} chartId={sel.system === 'Vedic' ? 'vedic_default' : 'western_default'} /> : <Notice tone="info">Select a layer to read its interpretation.</Notice>}
          </div>
          <div className="lg:col-span-2 grid gap-4 md:grid-cols-3">
            <MethodCard chart={v.data!.chart} title="Vedic method" />
            <MethodCard chart={w.data!.chart} title="Western method" />
            <Card>
              <h3 className="font-display text-2xl">More of your chart</h3>
              <p className="mt-1 text-sm text-fg-2">Placements, houses, dashas, divisional charts and aspects.</p>
              <ButtonLink to="/chart" variant="secondary" size="sm" className="mt-3">Open chart explorer</ButtonLink>
            </Card>
          </div>
        </div>
      )}</QueryState>
      <CustomiseDialog open={customise} onClose={() => setCustomise(false)} />
      <ShareDialog open={share} onClose={() => setShare(false)} layers={layers} theme={theme} name={me?.profile?.displayName ?? ''} />
    </div>
  );
}

/** Archetype, sigil and share cards — the identity summary above the six detailed layers. */
function ArchetypePanel() {
  const q = useQuery({ queryKey: ['cosmic-id-me'], queryFn: () => get<CosmicIdentity>('cosmic-id/me') });
  const [how, setHow] = useState(false);
  if (!q.data) return null;
  const id = q.data;
  const a = id.archetype;
  return (
    <section aria-labelledby="archetype-title" className="card mb-8 grid items-center gap-8 overflow-hidden p-6 md:grid-cols-[minmax(0,320px)_1fr] md:p-8">
      <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-full border border-line"><CosmicSigil identity={id} animate /></div>
      <div>
        <p className="eyebrow">Your archetype · {a.element} × {a.modality}</p>
        <h2 id="archetype-title" className="mt-1 font-display text-5xl text-fg">{a.name}</h2>
        <p className="mt-2 font-display text-2xl italic text-fg-2">{a.essence}</p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fg-2">{a.portrait}</p>
        <p className="mt-3 text-sm text-fg-2"><span className="text-fg">Growth edge:</span> {a.growthEdge}</p>
        <div className="mt-5"><ShareCardActions identity={id} onShared={(format) => { void post('cosmic-id/shared', { format }).catch(() => undefined); }} /></div>
        <button type="button" className="mt-4 text-xs text-accent underline-offset-4 hover:underline" aria-expanded={how} onClick={() => setHow(!how)}>{how ? 'Hide how this was derived' : 'How was this derived?'}</button>
        {how && <p className="mt-2 max-w-2xl text-xs leading-relaxed text-fg-3">{a.elementMeaning} {a.modalityMeaning} {a.method}{a.blendName ? ` Close secondary: ${a.blendName}.` : ''} {a.disclaimer}</p>}
      </div>
    </section>
  );
}

function MethodCard({ chart, title }: { chart: ChartResult; title: string }) {
  return (
    <Card>
      <h3 className="font-display text-2xl">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-fg-3">{chart.methodology.map((m) => <li key={m}>{m}</li>)}</ul>
      {chart.warnings.length > 0 && <Notice tone="warning" className="mt-3">{chart.warnings.map((x) => <p key={x}>{x}</p>)}</Notice>}
    </Card>
  );
}

function LayerPanel({ layer, chartId }: { layer: Layer; chartId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const save = useMutation({ mutationFn: () => post('insights', { ruleKey: layer.interp!.key, configKey: chartId }), onSuccess: () => { toast('Saved to your insights', 'success'); qc.invalidateQueries({ queryKey: ['insights'] }); } });
  return (
    <Card className="rise-in" aria-live="polite">
      <p className="eyebrow">{layer.system} · {layer.label}</p>
      <h2 className="mt-1 font-display text-3xl">{layer.interp?.title ?? layer.value}</h2>
      {layer.interp ? <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{layer.interp.body}</p> : <p className="mt-3 text-sm text-fg-2">{layer.reliability === 'unknown' ? 'This layer needs a known birth time.' : 'No authored interpretation applies.'}</p>}
      {layer.interp?.caveat && <p className="mt-2 text-xs text-fg-3">{layer.interp.caveat}</p>}
      {layer.interp && <p className="mt-2 text-xs text-fg-3">Factor: {layer.interp.factor} · content v{layer.interp.version}</p>}
      {layer.interp && <Button size="sm" variant="secondary" icon="bookmark" className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>Save insight</Button>}
    </Card>
  );
}

/** Pure-SVG Cosmic ID card: 2D fallback, accessible view and the source of the PNG export. */
export function IdCard2D({ layers, theme, name, svgRef }: { layers: Layer[]; theme: string; name: string; svgRef?: React.Ref<SVGSVGElement> }) {
  const [a, b] = (THEME_SWATCH[theme] ?? THEME_SWATCH.midnight).match(/#[0-9a-f]{6}/gi) ?? ['#0b0c1f', '#5d4bb0'];
  return (
    <svg ref={svgRef} viewBox="0 0 600 440" role="img" aria-label={`Cosmic ID card for ${name}: ${layers.map((l) => `${l.label} ${l.value}`).join(', ')}`} className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="idbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#07081a" /><stop offset="1" stopColor={b} stopOpacity=".55" /></linearGradient>
      </defs>
      <rect width="600" height="440" fill="url(#idbg)" />
      {Array.from({ length: 70 }).map((_, i) => <circle key={i} cx={(i * 97) % 600} cy={(i * 61) % 440} r={(i % 4) * 0.4 + 0.4} fill="#f3eee2" opacity={0.2 + (i % 5) * 0.1} />)}
      <circle cx="150" cy="220" r="110" fill="none" stroke={a} strokeOpacity=".7" />
      <circle cx="150" cy="220" r="78" fill="none" stroke={b} strokeOpacity=".8" />
      <circle cx="150" cy="220" r="12" fill={a} />
      {layers.filter((l) => l.longitude !== null).map((l) => {
        const ang = ((l.longitude! + 180) * Math.PI) / 180;
        return <g key={l.id}><circle cx={150 + Math.cos(ang) * 110} cy={220 - Math.sin(ang) * 110} r="7" fill="#f3eee2" /><text x={150 + Math.cos(ang) * 132} y={224 - Math.sin(ang) * 132} textAnchor="middle" fontSize="15" fill="#f3eee2" fontFamily="Georgia, serif">{l.glyph}</text></g>;
      })}
      <text x="300" y="70" fontSize="13" letterSpacing="4" fill={a} fontFamily="'Hanken Grotesk', sans-serif">NAKSHATRA · COSMIC ID</text>
      <text x="300" y="108" fontSize="34" fill="#f3eee2" fontFamily="'Instrument Serif', Georgia, serif">{name}</text>
      {layers.map((l, i) => (
        <g key={l.id} transform={`translate(${300 + (i % 2) * 150}, ${150 + Math.floor(i / 2) * 82})`}>
          <text fontSize="10" letterSpacing="2" fill="#a9a6bd" fontFamily="'Hanken Grotesk', sans-serif">{l.label.toUpperCase()}</text>
          <text y="28" fontSize="24" fill="#f3eee2" fontFamily="'Instrument Serif', Georgia, serif">{l.value}</text>
          <text y="46" fontSize="10" fill="#85829c" fontFamily="'Hanken Grotesk', sans-serif">{l.system}{l.reliability !== 'reliable' ? ' · uncertain' : ''}</text>
        </g>
      ))}
    </svg>
  );
}

async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = 600 * scale;
  canvas.height = 440 * scale;
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}

function ShareDialog({ open, onClose, layers, theme, name }: { open: boolean; onClose: () => void; layers: Layer[]; theme: string; name: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const toast = useToast();
  const share = useQuery({ queryKey: ['share-link'], queryFn: () => post<{ url: string; qrDataUrl: string; publicProfile: boolean }>('profile/share'), enabled: open, staleTime: Infinity });
  const download = async () => {
    if (!svgRef.current) return;
    const blob = await svgToPng(svgRef.current);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nakshatra-cosmic-id.png';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Dialog open={open} onClose={onClose} title="Share your Cosmic ID" size="lg" description="The card shows only your sign-level identity — never your birth date, time or place.">
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-line"><IdCard2D svgRef={svgRef} layers={layers} theme={theme} name={name} /></div>
        <div className="flex flex-col gap-3">
          {share.data && (<>
            <img src={share.data.qrDataUrl} alt="QR code linking to your public profile" className="w-40 self-center rounded-md" />
            <Input readOnly value={share.data.url} aria-label="Profile link" onFocus={(e) => e.target.select()} />
            <Button variant="secondary" icon="copy" onClick={async () => { await navigator.clipboard.writeText(share.data!.url); toast('Link copied', 'success'); }}>Copy link</Button>
            {!share.data.publicProfile && <Notice tone="info">Your profile is private, so visitors see only your name and emblem. Make it public in Settings → Privacy.</Notice>}
          </>)}
          <Button icon="download" onClick={download}>Download card (PNG)</Button>
        </div>
      </div>
    </Dialog>
  );
}

function CustomiseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe().data?.user;
  const qc = useQueryClient();
  const toast = useToast();
  const journey = useQuery({ queryKey: ['journey'], queryFn: () => get<{ collectibles: { key: string; unlocked: boolean; kind: string }[] }>('journey'), enabled: open });
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => get<{ profile: { bio: string; statusText: string; interests: string[]; featuredBadges: string[] } }>('profile'), enabled: open });
  const [theme, setTheme] = useState(me?.profile?.theme ?? 'midnight');
  const [emblem, setEmblem] = useState(me?.profile?.emblem ?? 'orbit');
  const [status, setStatus] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const unlocked = (k: string) => journey.data?.collectibles.find((c) => c.key === `theme_${k}`)?.unlocked ?? (k === 'midnight' || k === 'dawn');
  const save = useMutation({
    mutationFn: () => patch('profile', { theme, emblem, ...(status !== null ? { statusText: status } : {}), ...(bio !== null ? { bio } : {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['profile'] }); toast('Cosmic ID updated', 'success'); onClose(); },
  });
  const avatar = useMutation({ mutationFn: (f: File) => upload('profile/avatar', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); toast('Photo updated', 'success'); } });
  return (
    <Dialog open={open} onClose={onClose} title="Customise your Cosmic ID" size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-fg">Theme</h3>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {THEMES.map((t) => {
              const ok = unlocked(t);
              return (
                <button key={t} type="button" disabled={!ok} aria-pressed={theme === t} onClick={() => setTheme(t)} className={cx('flex flex-col items-center gap-1 rounded-[var(--radius-sm)] border p-2 text-xs capitalize disabled:opacity-45', theme === t ? 'border-accent' : 'border-line')}>
                  <span className="h-10 w-full rounded" style={{ background: THEME_SWATCH[t] }} />{t}{!ok && <Icon name="lock" size={12} />}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-fg-3">Locked themes unlock through your Journey (earned) or Nakshatra+ (purchased) — always labelled which is which.</p>
        </section>
        <section>
          <h3 className="text-sm font-semibold text-fg">Emblem</h3>
          <div className="mt-2 flex flex-wrap gap-2">{EMBLEMS.map((e) => <button key={e} type="button" aria-pressed={emblem === e} onClick={() => setEmblem(e)} className={cx('rounded-full border px-4 py-2 text-sm capitalize', emblem === e ? 'border-accent bg-accent/10' : 'border-line text-fg-2')}>{e}</button>)}</div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">{(id) => <Input id={id} maxLength={80} defaultValue={profile.data?.profile.statusText} onChange={(e) => setStatus(e.target.value)} placeholder="Learning my nakshatra ✦" />}</Field>
          <Field label="Profile photo">{(id) => <Input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} />}</Field>
          <Link to="/avatar" className="text-sm text-accent hover:underline">Or build a drawn avatar — no photo needed →</Link>
          <Field label="Bio" className="sm:col-span-2">{(id) => <Textarea id={id} maxLength={500} rows={3} defaultValue={profile.data?.profile.bio} onChange={(e) => setBio(e.target.value)} />}</Field>
        </section>
        <p className="text-xs text-fg-3">Interests, field visibility and public/private mode are in <Link to="/settings/privacy" className="text-accent underline">Settings → Privacy</Link>.</p>
      </div>
    </Dialog>
  );
}

interface PublicProfileResponse {
  profile: {
    userId: string; handle: string; displayName: string; avatarUrl: string | null; theme: string; emblem: string; viewer: string; limited: boolean; visibility: string;
    bio?: string | null; statusText?: string; interests?: string[]; badges?: string[]; level?: { level: number; rank: string } | null;
    identity?: { sunSign: { western: string; vedic: string } | null; moonSign: { western: string; vedic: string } | null; rising: { western: string | null; vedic: string | null } | null; nakshatra: { name: string; pada: number } | null } | null;
    counts?: { followers: number; following: number }; followState?: string | null;
  };
}

export function PublicProfile() {
  const { handle } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['u', handle], queryFn: () => get<PublicProfileResponse>(`u/${handle}`) });
  const follow = useMutation({ mutationFn: (on: boolean) => (on ? post(`follows/${q.data!.profile.userId}`) : fetchDel(`follows/${q.data!.profile.userId}`)), onSuccess: () => qc.invalidateQueries({ queryKey: ['u', handle] }) });
  const block = useMutation({ mutationFn: () => post(`blocks/${q.data!.profile.userId}`), onSuccess: () => toast('Blocked. They can no longer see or contact you.', 'success') });
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <QueryState q={q}>{({ profile: p }) => (
      <div className="mx-auto max-w-3xl">
        <Card className="overflow-hidden p-0">
          <div className="h-32" style={{ background: THEME_SWATCH[p.theme] ?? THEME_SWATCH.midnight }} />
          <div className="-mt-12 px-6 pb-6">
            <Avatar name={p.displayName} src={p.avatarUrl} size={96} className="border-4 border-[var(--surface)]" />
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-4xl">{p.displayName}</h1>
                <p className="text-sm text-fg-3">@{p.handle}{p.statusText ? ` · ${p.statusText}` : ''}</p>
              </div>
              {p.viewer !== 'self' && (
                <div className="flex flex-wrap gap-2">
                  {p.followState !== undefined && (p.followState === 'accepted' || p.followState === 'pending'
                    ? <Button variant="secondary" size="sm" onClick={() => follow.mutate(false)}>{p.followState === 'pending' ? 'Requested' : 'Following'}</Button>
                    : <Button size="sm" onClick={() => follow.mutate(true)}>Follow</Button>)}
                  <ButtonLink to={`/bonds?new=1&handle=${p.handle}`} size="sm" variant="secondary" icon="bonds">Bond</ButtonLink>
                  <ButtonLink to={`/messages?to=${p.userId}`} size="sm" variant="ghost" icon="messages">Message</ButtonLink>
                  <Button size="sm" variant="ghost" icon="flag" onClick={() => setReportOpen(true)}>Report</Button>
                  <Button size="sm" variant="ghost" onClick={() => block.mutate()}>Block</Button>
                </div>
              )}
              {p.viewer === 'self' && <ButtonLink to="/cosmic-id" size="sm" variant="secondary">Edit Cosmic ID</ButtonLink>}
            </div>
            {p.limited ? <Notice tone="info" className="mt-5">This profile is private. Follow to request access.</Notice> : (<>
              {p.bio && <p className="mt-4 leading-relaxed text-fg-2">{p.bio}</p>}
              {p.counts && <p className="mt-3 text-sm text-fg-3"><strong className="text-fg">{p.counts.followers}</strong> followers · <strong className="text-fg">{p.counts.following}</strong> following{p.level ? ` · Level ${p.level.level} ${p.level.rank}` : ''}</p>}
              {p.identity && (
                <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {p.identity.sunSign && <IdentityTile k="Sun" v={p.identity.sunSign.western} sub={`Vedic ${p.identity.sunSign.vedic}`} />}
                  {p.identity.moonSign && <IdentityTile k="Moon" v={p.identity.moonSign.western} sub={`Rashi ${p.identity.moonSign.vedic}`} />}
                  {p.identity.rising && <IdentityTile k="Rising" v={p.identity.rising.western ?? '—'} sub={p.identity.rising.vedic ? `Lagna ${p.identity.rising.vedic}` : ''} />}
                  {p.identity.nakshatra && <IdentityTile k="Nakshatra" v={p.identity.nakshatra.name} sub={`Pada ${p.identity.nakshatra.pada}`} />}
                </dl>
              )}
              {!!p.interests?.length && <div className="mt-5 flex flex-wrap gap-2">{p.interests.map((i) => <Badge key={i}>{i}</Badge>)}</div>}
              {!!p.badges?.length && (
                <div className="mt-5 flex flex-wrap gap-3">
                  {p.badges.map((k) => { const a = ACHIEVEMENTS.find((x) => x.key === k); return a ? <div key={k} className="flex items-center gap-2 rounded-full border border-line px-3 py-1"><Constellation points={a.constellation} size={28} /><span className="text-xs text-fg-2">{a.title}</span></div> : null; })}
                </div>
              )}
            </>)}
          </div>
        </Card>
        {!p.limited && <ProfileWorld handle={p.handle} self={p.viewer === 'self'} />}
        {!p.limited && <ProfileCollections userId={p.userId} />}
        <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={p.userId} />
      </div>
    )}</QueryState>
  );
}

function IdentityTile({ k, v, sub }: { k: string; v: string; sub: string }) {
  return <div className="rounded-[var(--radius-md)] border border-line p-3"><dt className="eyebrow">{k}</dt><dd className="font-display text-2xl text-fg">{v}</dd><dd className="text-xs text-fg-3">{sub}</dd></div>;
}

async function fetchDel(path: string) {
  const { del } = await import('../lib/api');
  return del(path);
}

export function ReportDialog({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: string; targetId: string }) {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const toast = useToast();
  const m = useMutation({ mutationFn: () => post<{ message: string }>('reports', { targetType, targetId, reason, details }), onSuccess: (r) => { toast(r.message, 'success'); onClose(); } });
  return (
    <Dialog open={open} onClose={onClose} title="Report" description="Reports are confidential. The person is not told who reported them." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>Submit report</Button></>}>
      <div className="space-y-4">
        <Field label="Reason">{(id) => (
          <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
            {[['spam', 'Spam'], ['harassment', 'Harassment or bullying'], ['scam', 'Scam or asking for money'], ['impersonation', 'Impersonation'], ['underage', 'May be under 18'], ['inappropriate', 'Inappropriate content'], ['hate', 'Hate speech'], ['self_harm', 'Self-harm concern'], ['other', 'Something else']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        )}</Field>
        <Field label="Details (optional)">{(id) => <Textarea id={id} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />}</Field>
        <Notice tone="info">If someone is in immediate danger, contact local emergency services.</Notice>
      </div>
    </Dialog>
  );
}

