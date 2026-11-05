import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '../lib/api';
import { Button, Card } from '../components/ui/primitives';
import { QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { ArchetypeArt } from '../components/visual';
import { archetypeAccent } from '../lib/visual';
import type { Persona } from '../lib/persona';

/* ---------- attribution (session only; never sent anywhere except our own signup call) ---------- */

const SHARE_KEY = 'nk_share_slug';
const REF_KEY = 'nk_ref';

export function rememberAttribution(slug: string | null, ref: string | null) {
  try {
    if (slug) sessionStorage.setItem(SHARE_KEY, slug);
    if (ref) sessionStorage.setItem(REF_KEY, ref);
  } catch { /* storage unavailable */ }
}

export function readAttribution(): { shareSlug?: string; referralCode?: string } {
  try {
    return { shareSlug: sessionStorage.getItem(SHARE_KEY) ?? undefined, referralCode: sessionStorage.getItem(REF_KEY) ?? undefined };
  } catch { return {}; }
}

interface ShareResp { share: { slug: string; url: string; displayName: string | null; archetype: string } }

/** Copy / native-share a link. Works on desktop (clipboard) and phones (share sheet). */
async function shareLink(url: string, text: string): Promise<'shared' | 'copied'> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (window.matchMedia?.('(pointer: coarse)').matches && nav.share) {
    try { await nav.share({ url, text }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'shared'; }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}

/**
 * Creates a public archetype link. Signed out: from the preview answers (scored by the server; nothing
 * identifies you). Signed in: from your saved result, with your display name only if you tick the box.
 */
export function ShareLinkPanel({ archetypeName, answers, signedIn }: { archetypeName: string; answers?: Record<string, number>; signedIn: boolean }) {
  const toast = useToast();
  const [showName, setShowName] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const r = await post<ShareResp>('share/identity', signedIn ? { showName } : { answers });
      setLink(r.share.url);
      const how = await shareLink(r.share.url, `I'm ${archetypeName}. What are you?`);
      toast(how === 'shared' ? 'Shared' : 'Link copied', 'success');
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button icon="share" variant="secondary" loading={busy} onClick={create}>{link ? 'Share again' : 'Share a link'}</Button>
        {signedIn && (
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
            Show my name on the page
          </label>
        )}
      </div>
      {link && <p className="break-all rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-xs text-fg-2" data-testid="share-url">{link}</p>}
      <p className="text-xs text-fg-3">The page shows your archetype and its five dimensions{signedIn ? ' — your name only if ticked' : ''}. Never your answers, handle, pen name, email or birth details. {signedIn ? 'You can switch links off in Identity Studio.' : ''}</p>
    </div>
  );
}

interface PublicShare { share: { slug: string; displayName: string | null; cardStyle: string; referralCode: string | null; persona: Omit<Persona, 'confidence' | 'version' | 'takenAt'> } }

/** Public archetype page at /s/:slug — no sign-in needed. */
export function SharedIdentity() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const q = useQuery({ queryKey: ['share', slug], queryFn: () => get<PublicShare>(`share/${slug}`), retry: false, staleTime: 60_000 });
  useEffect(() => { rememberAttribution(slug, params.get('ref') ?? q.data?.share.referralCode ?? null); }, [slug, params, q.data]);
  return (
    <div className="mx-auto max-w-4xl py-10">
      <QueryState q={q}>{(d) => <SharedCard d={d.share} />}</QueryState>
    </div>
  );
}

function SharedCard({ d }: { d: PublicShare['share'] }) {
  const p = d.persona;
  const scores = useMemo(() => Object.fromEntries(p.dimensions.map((x) => [x.key, x.score])), [p]);
  const accent = archetypeAccent(p.key);
  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(0,360px)_1fr]">
      <div className="relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface">
        <div className="absolute inset-[12%]"><ArchetypeArt archetypeKey={p.key} scores={scores} eager /></div>
      </div>
      <div>
        <p className="eyebrow">{d.displayName ? `${d.displayName}'s archetype` : 'A friend shared their archetype'}</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.02] md:text-6xl">{p.name}</h1>
        <p className="mt-3 font-display text-2xl italic text-fg-2">{p.signature}</p>
        <ul className="mt-4 flex flex-wrap gap-2">{p.traits.map((t) => <li key={t} className="rounded-full border px-3 py-1 text-sm" style={{ borderColor: `${accent}66` }}>{t}</li>)}</ul>
        <p className="mt-4 text-fg-2"><span className="text-fg">In circles:</span> {p.inCircles}</p>
        <Card className="mt-6 space-y-3">
          <p className="font-display text-2xl">Which kind of person are you?</p>
          <p className="text-sm text-fg-2">Twenty quick statements, about two minutes, no account needed. Compare with {d.displayName ?? 'your friend'} after.</p>
          <Link to="/personality" className="inline-flex rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink">Find my archetype</Link>
        </Card>
        <p className="mt-4 text-xs text-fg-3">Archetypes describe tendencies from someone's own answers. They are not a psychological test.</p>
      </div>
    </div>
  );
}
