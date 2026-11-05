import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { get } from './api';
import { MODULE_BY_KEY, moduleForPage } from '../../shared/modules';

export interface FeaturesResponse {
  features: Record<string, boolean>;
  modules: Record<string, boolean>;
  payments: { enabled: boolean; provider: string; testMode: boolean };
}

/**
 * Client view of the server's module registry. The server enforces availability on every API call;
 * this hook only keeps navigation and pages consistent with it. While loading, nothing is hidden
 * optimistically and nothing disabled is shown.
 */
export function useModules() {
  const q = useQuery({ queryKey: ['features'], queryFn: () => get<FeaturesResponse>('features'), staleTime: 60_000 });
  const modules = q.data?.modules;
  const enabled = (key: string) => Boolean(MODULE_BY_KEY[key]?.core || modules?.[key]);
  const pageAllowed = (path: string) => {
    const m = moduleForPage(path);
    if (!m || m.core) return true;
    if (!modules) return true; // decided once loaded; the API refuses meanwhile anyway
    return Boolean(modules[m.key]);
  };
  return { loaded: Boolean(q.data), enabled, pageAllowed, payments: q.data?.payments ?? { enabled: false, provider: 'none', testMode: false } };
}

export function ModuleUnavailable() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <p className="eyebrow">Not available</p>
      <h1 className="mt-3 font-display text-4xl">This part of Nakshatra is switched off</h1>
      <p className="mt-4 text-fg-2">Nakshatra is focusing on identity, Thought Drops, circles and games. This area is not part of the current release.</p>
      <Link to="/home" className="mt-8 inline-flex rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink">Go home</Link>
    </div>
  );
}
