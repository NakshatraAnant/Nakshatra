import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '../lib/api';
import { useModules } from '../lib/modules';
import { Button } from './ui/primitives';

interface Ad { id: string; headline: string; body: string; ctaLabel: string; url: string; disclosure: string; why: string; token: string }

/**
 * One sponsored card for a feed position. Fetched once per page view (every fetch is counted as a showing on the
 * server), clearly labelled, with "Why am I seeing this?" and "Hide". Renders nothing when ads are switched off,
 * when there is no eligible campaign, or for Nakshatra+ members.
 */
export function SponsoredCard({ topic }: { topic: string }) {
  const mods = useModules();
  const [hidden, setHidden] = useState(false);
  const [why, setWhy] = useState(false);
  const q = useQuery({
    queryKey: ['ad-slot', topic],
    queryFn: () => get<{ ad: Ad | null }>(`ads/slot?placement=feed${topic ? `&topic=${encodeURIComponent(topic)}` : ''}`),
    enabled: mods.enabled('ads'),
    staleTime: Infinity, refetchOnWindowFocus: false, retry: false,
  });
  const hide = useMutation({ mutationFn: (reason: string) => post(`ads/${q.data!.ad!.id}/hide`, { reason }), onSuccess: () => setHidden(true) });
  const ad = q.data?.ad;
  if (!ad) return null;
  if (hidden) return <p className="rounded-[var(--radius)] border border-dashed border-line p-3 text-center text-xs text-fg-3" role="status">Ad hidden. You won’t see it again.</p>;
  return (
    <aside className="card border-dashed p-5" aria-label={`Sponsored: ${ad.headline}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-2">{ad.disclosure}</p>
      <h3 className="mt-2 font-display text-2xl text-fg">{ad.headline}</h3>
      {ad.body && <p className="mt-1 text-fg-2">{ad.body}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={ad.url} target="_blank" rel="sponsored noopener noreferrer" onClick={() => { void post(`ads/${ad.id}/click`, { token: ad.token }).catch(() => undefined); }}
          className="inline-flex min-h-10 items-center rounded-full bg-fg px-4 text-sm font-semibold text-canvas">{ad.ctaLabel} ↗</a>
        <Button size="sm" variant="ghost" aria-expanded={why} onClick={() => setWhy(!why)}>Why am I seeing this?</Button>
        <Button size="sm" variant="ghost" onClick={() => hide.mutate('not_relevant')}>Hide ad</Button>
      </div>
      {why && <p className="mt-2 text-xs text-fg-3">{ad.why} Nakshatra+ members see no ads.</p>}
    </aside>
  );
}
