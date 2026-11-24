import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { get } from './api';
import { LoadingBlock } from '../components/ui/feedback';
import { DEFAULT_APPEARANCE, appearanceVars, normaliseAppearance, type Appearance } from '../../shared/appearance';

export interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
  mfaEnabled: boolean;
  roles: string[];
  referralCode: string;
  hasBirthProfile: boolean;
  hasAssessment: boolean;
  onboardingComplete: boolean;
  profile: {
    handle: string; displayName: string; fullName: string | null; avatarUrl: string | null; theme: string; emblem: string; background: string;
    language: 'en' | 'hi'; colorScheme: 'system' | 'dark' | 'light'; appearance: Appearance; reducedMotion: boolean; preferredSystem: 'vedic' | 'western'; visibility: string;
  } | null;
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => get<{ user: Me | null; mfaRequired?: boolean }>('auth/me'), staleTime: 60_000 });
}

export function useRefreshMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['me'] });
}

export const isStaff = (me: Me | null | undefined) => Boolean(me?.roles.some((r) => ['admin', 'moderator', 'support'].includes(r)));

/** Applies theme, motion and language preferences to the document. */
export function usePreferenceEffects(me: Me | null | undefined) {
  useEffect(() => {
    const scheme = me?.profile?.colorScheme ?? (localStorage.getItem('nk_scheme') as Me['profile'] extends null ? never : string | null) ?? 'system';
    // While the session loads, reuse this device's last look to avoid a flash; signed out means the default look.
    const appearance = me === undefined ? cachedAppearance() : normaliseAppearance(me?.profile?.appearance);
    if (me?.profile) try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); } catch { /* storage unavailable */ }
    const apply = () => {
      const dark = scheme === 'dark' || (scheme === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
      const el = document.documentElement;
      el.dataset.theme = dark ? 'dark' : 'light';
      for (const [k, v] of Object.entries(appearanceVars(appearance, dark ? 'dark' : 'light'))) el.style.setProperty(k, v);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [me === undefined, me?.profile?.colorScheme, me?.profile?.appearance?.accent, me?.profile?.appearance?.textSize, me?.profile?.appearance?.corners]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const reduced = me?.profile?.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  }, [me?.profile?.reducedMotion]);
  useEffect(() => {
    document.documentElement.lang = me?.profile?.language ?? 'en';
  }, [me?.profile?.language]);
}

const APPEARANCE_KEY = 'nk_appearance';
function cachedAppearance(): Appearance {
  try { return normaliseAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null')); } catch { return DEFAULT_APPEARANCE; }
}

export function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduced';
}

/** Route guard: requires a session; optionally requires completed onboarding or a staff role. */
export function RequireAuth({ children, onboarding = true, staff = false }: { children: ReactNode; onboarding?: boolean; staff?: boolean }) {
  const q = useMe();
  const loc = useLocation();
  if (q.isLoading) return <div className="mx-auto max-w-3xl p-8"><LoadingBlock /></div>;
  const me = q.data?.user;
  if (q.data?.mfaRequired) return <Navigate to={`/signin?mfa=1&next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!me) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (onboarding && !me.onboardingComplete) return <Navigate to="/onboarding" replace />;
  if (staff && !isStaff(me)) return <Navigate to="/today" replace />;
  return <>{children}</>;
}
