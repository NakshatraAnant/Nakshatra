import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Skeleton, cx } from './primitives';
import { Icon, type IconName } from './icons';
import { ApiError, get } from '../../lib/api';

/** Ink & Ember empty-state illustrations (public/visual/empty-states) for the common cases; other icons stay small. */
const EMPTY_ART: Partial<Record<IconName, string>> = { bonds: 'circle', social: 'feed', search: 'no-results', bell: 'notifications', alert: 'unavailable' };

export function EmptyState({ icon = 'sparkle', title, body, action, art }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode; art?: 'circle' | 'feed' | 'no-results' | 'notifications' | 'offline' | 'unavailable' }) {
  const illustration = art ?? EMPTY_ART[icon];
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-line-strong px-6 py-12 text-center">
      {illustration
        ? <img src={`/visual/empty-states/empty-${illustration}.svg`} alt="" aria-hidden="true" width={160} height={120} loading="lazy" decoding="async" className="mb-4 h-[120px] w-[160px] object-contain" />
        : <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-fg-2"><Icon name={icon} size={26} /></span>}
      <h3 className="font-display text-2xl text-fg">{title}</h3>
      {body && <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Astrology pages need birth details, which are optional on Nakshatra; explain instead of erroring. */
export function BirthDetailsNeeded() {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-line bg-surface px-6 py-12 text-center">
      <Icon name="chart" size={28} className="text-accent" />
      <h3 className="mt-3 font-display text-2xl">This part uses your birth details</h3>
      <p className="mt-2 max-w-md text-sm text-fg-2">Nakshatra works without them — your archetype, circles and games don’t need astrology. Add your birth date, time and place whenever you want your Cosmic ID, chart and daily sky.</p>
      <a href="/settings/birth" className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink">Add birth details</a>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'We couldn’t load this' }: { error: unknown; onRetry?: () => void; title?: string }) {
  if (error instanceof ApiError && error.status === 404 && /^Birth profile not found/.test(error.message)) return <BirthDetailsNeeded />;
  const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Unexpected error.';
  return (
    <div role="alert" className="flex flex-col items-center rounded-[var(--radius-lg)] border border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <Icon name="alert" size={26} className="text-danger" />
      <h3 className="mt-3 font-display text-2xl">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-fg-2">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" icon="refresh" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function LoadingBlock({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-3', className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className="h-4" />)}
    </div>
  );
}

/** Wraps a query result into consistent loading / error / empty / success states. */
export function QueryState<T>({ q, children, empty, loading }: { q: { data?: T; isLoading: boolean; error: unknown; refetch: () => unknown }; children: (data: T) => ReactNode; empty?: (data: T) => ReactNode | null; loading?: ReactNode }) {
  if (q.isLoading) return <>{loading ?? <LoadingBlock />}</>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  const e = empty?.(q.data);
  if (e) return <>{e}</>;
  return <>{children(q.data)}</>;
}

export function Notice({ tone = 'info', title, children, className }: { tone?: 'info' | 'warning' | 'danger' | 'success' | 'dev'; title?: ReactNode; children: ReactNode; className?: string }) {
  const map = {
    info: 'border-celestial/30 bg-celestial/5 text-fg-2',
    warning: 'border-accent/35 bg-accent/5 text-fg-2',
    danger: 'border-danger/35 bg-danger/5 text-fg-2',
    success: 'border-success/35 bg-success/5 text-fg-2',
    dev: 'border-violet/40 bg-violet/10 text-fg-2',
  };
  const icon: IconName = tone === 'danger' ? 'alert' : tone === 'success' ? 'check' : tone === 'dev' ? 'cube' : 'info';
  return (
    <div className={cx('flex gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm leading-relaxed', map[tone], className)} role={tone === 'danger' ? 'alert' : 'note'}>
      <Icon name={icon} size={18} className="mt-0.5 shrink-0 text-accent" />
      <div>{title && <p className="font-semibold text-fg">{title}</p>}{children}</div>
    </div>
  );
}

/** Shows when an external integration is simulated or unavailable, so nothing is presented as real when it is not. */
export function IntegrationNotice({ kind }: { kind: 'payments' | 'email' | 'video' | 'voice' | 'push' }) {
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => get<{ integrations: Record<string, { status: string; label: string }> }>('integrations'), staleTime: Infinity });
  const i = q.data?.integrations[kind];
  if (!i || i.status === 'configured') return null;
  return <Notice tone={i.status === 'development' ? 'dev' : 'warning'}>{i.label}</Notice>;
}

export function SampleBadge({ className }: { className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border border-violet/40 bg-violet/10 px-2 py-0.5 text-[11px] font-medium text-violet', className)} title="Development sample data — not a real listing">Sample data</span>;
}
