import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../../lib/api';
import { useI18n, type I18nKey } from '../../lib/i18n';
import { isStaff, useMe } from '../../lib/session';
import { Icon, Logo, type IconName } from '../ui/icons';
import { Avatar, IconButton, cx } from '../ui/primitives';
import { Drawer } from '../ui/overlays';
import { MaskIcon } from '../MaskIcon';
import { uiIcon } from '../../lib/visual';
import { ModuleUnavailable, useModules } from '../../lib/modules';
import { PageTransition } from '../motion';

function PublicGate({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const mods = useModules();
  return mods.pageAllowed(loc.pathname) ? <>{children}</> : <ModuleUnavailable />;
}

/** pkg: an Ink & Ember icon (public/visual/icons) used instead of the built-in icon set. */
interface NavItem { to: string; key: I18nKey; icon: IconName; staff?: boolean; pkg?: string }

/**
 * Six primary destinations — Home, Discover, Create, Circles, Play, Profile — the same on desktop and
 * phone. Everything else sits in clearly labelled secondary groups. Legacy modules appear in Labs only
 * when an admin has switched them on.
 */
const PRIMARY: NavItem[] = [
  { to: '/home', key: 'nav.home', icon: 'sparkle', pkg: 'home' },
  { to: '/explore', key: 'nav.discover', icon: 'search', pkg: 'search' },
  { to: '/create', key: 'nav.create', icon: 'plus', pkg: 'compose' },
  { to: '/circles', key: 'nav.circles', icon: 'bonds', pkg: 'circles' },
  { to: '/play', key: 'nav.play', icon: 'rewards', pkg: 'play' },
  { to: '/identity', key: 'nav.profile', icon: 'id', pkg: 'profile' },
];

const GROUPS: { label: string; items: NavItem[]; labs?: boolean }[] = [
  { label: 'Nakshatra', items: PRIMARY },
  { label: 'You', items: [
    { to: '/progress', key: 'nav.progress', icon: 'rewards' },
    { to: '/journal', key: 'nav.journal', icon: 'edit' },
    { to: '/year', key: 'nav.year', icon: 'star' },
    { to: '/thoughts', key: 'nav.thoughts', icon: 'social', pkg: 'network' },
    { to: '/saved', key: 'nav.saved', icon: 'bookmark' },
    { to: '/close-friends', key: 'nav.closeFriends', icon: 'users' },
    { to: '/invite', key: 'nav.invite', icon: 'share', pkg: 'gift' },
    { to: '/journey', key: 'nav.journey', icon: 'journey' },
    { to: '/shop', key: 'nav.shop', icon: 'shop' },
    { to: '/merch', key: 'nav.merch', icon: 'shop' },
    { to: '/membership', key: 'nav.membership', icon: 'star' },
    { to: '/creator-studio', key: 'nav.creatorStudio', icon: 'sparkle' },
    { to: '/perks', key: 'nav.perks', icon: 'star' },
    { to: '/orgs', key: 'nav.orgs', icon: 'users' },
  ] },
  { label: 'Optional · astrology', items: [
    { to: '/cosmic-id', key: 'nav.cosmicId', icon: 'star' },
    { to: '/today', key: 'nav.today', icon: 'today' },
    { to: '/chart', key: 'nav.chart', icon: 'chart' },
    { to: '/calendar', key: 'nav.calendar', icon: 'calendar' },
    { to: '/bonds', key: 'nav.bonds', icon: 'heart' },
  ] },
  { label: 'Nakshatra Labs', labs: true, items: [
    { to: '/social', key: 'nav.social', icon: 'social' },
    { to: '/messages', key: 'nav.messages', icon: 'messages' },
    { to: '/dating', key: 'nav.dating', icon: 'heart' },
    { to: '/matchmaking', key: 'nav.matchmaking', icon: 'rings' },
    { to: '/experts', key: 'nav.experts', icon: 'expert' },
    { to: '/weddings', key: 'nav.weddings', icon: 'wedding' },
    { to: '/learn', key: 'nav.learn', icon: 'learn' },
  ] },
  { label: 'Account', items: [
    { to: '/journey/rewards', key: 'nav.rewards', icon: 'rewards' },
    { to: '/settings', key: 'nav.settings', icon: 'settings' },
    { to: '/admin', key: 'nav.admin', icon: 'admin', staff: true },
  ] },
];

const MOBILE = PRIMARY;

function NavIcon({ item, size, className }: { item: NavItem; size: number; className?: string }) {
  return item.pkg ? <MaskIcon src={uiIcon(item.pkg)} size={size} className={className} /> : <Icon name={item.icon} size={size} className={className} />;
}

function useCounts(enabled: boolean, messagesOn: boolean) {
  // Polling pauses while the tab is hidden (TanStack Query default) and messages are polled only if that module is on.
  const notifications = useQuery({ queryKey: ['notif-count'], queryFn: () => get<{ unreadCount: number }>('notifications?unread=true'), refetchInterval: 60_000, enabled });
  const messages = useQuery({ queryKey: ['msg-count'], queryFn: () => get<{ unread: number }>('conversations/unread-count'), refetchInterval: 30_000, enabled: enabled && messagesOn });
  return { notifications: notifications.data?.unreadCount ?? 0, messages: messages.data?.unread ?? 0 };
}

function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-accent-ink numeric" aria-label={`${n} unread`}>{n > 99 ? '99+' : n}</span>;
}

export function AppShell() {
  const { t } = useI18n();
  const me = useMe().data?.user;
  const mods = useModules();
  const counts = useCounts(Boolean(me), mods.enabled('messages'));
  const visible = (i: NavItem) => (!i.staff || isStaff(me)) && mods.pageAllowed(i.to);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();

  const signOut = async () => {
    await post('auth/logout');
    qc.clear();
    nav('/');
  };

  const link = (item: NavItem, onClick?: () => void) => (
    <NavLink key={item.to} to={item.to} end={item.to === '/journey'} onClick={onClick}
      className={({ isActive }) => cx('group flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[14px] transition-colors', isActive ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:text-fg hover:bg-surface-2/60')}>
      {({ isActive }) => (<>
        <NavIcon item={item} size={18} className={isActive ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2'} />
        <span>{t(item.key)}</span>
        {item.to === '/messages' && <Count n={counts.messages} />}
      </>)}
    </NavLink>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-canvas-deep/40 px-3 py-5 md:flex">
        <Link to="/home" className="mb-6 flex items-center gap-2.5 px-2">
          <Logo size={30} />
          <span className="font-display text-2xl tracking-tight text-fg">Nakshatra</span>
        </Link>
        <nav aria-label="Primary" className="flex-1 space-y-5 overflow-y-auto scrollbar-thin">
          {groups.map((g) => g.labs ? (
            <details key={g.label} className="group/labs" open={g.items.some((i) => loc.pathname.startsWith(i.to)) || undefined}>
              <summary className="mb-1 flex cursor-pointer list-none items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-fg-3 hover:text-fg-2">
                <Icon name="chevronRight" size={12} className="transition-transform group-open/labs:rotate-90" />{g.label}
              </summary>
              <p className="px-3 pb-1 text-[11px] leading-snug text-fg-3">Earlier experiments, switched on by an admin.</p>
              <div className="flex flex-col gap-0.5">{g.items.map((i) => link(i))}</div>
            </details>
          ) : (
            <div key={g.label}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-fg-3">{g.label}</p>
              <div className="flex flex-col gap-0.5">{g.items.map((i) => link(i))}</div>
            </div>
          ))}
        </nav>
        {me && (
          <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-line p-2.5">
            <Avatar name={me.profile?.displayName} src={me.profile?.avatarUrl} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{me.profile?.displayName}</p>
              <p className="truncate text-xs text-fg-3">@{me.profile?.handle}</p>
            </div>
            <IconButton icon="logout" label={t('action.signOut')} size={34} onClick={signOut} />
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 flex h-16 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur-md md:px-8" style={{ zIndex: 'var(--z-nav)' as never }}>
          <Link to="/home" className="flex items-center gap-2 md:hidden" aria-label="Nakshatra home"><Logo size={28} /><span className="font-display text-2xl">Nakshatra</span></Link>
          <form role="search" className="hidden max-w-md flex-1 md:block" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <label className="relative block">
              <span className="sr-only">{t('nav.search')}</span>
              <Icon name="search" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, Thought Drops, circles…" className="h-10 w-full rounded-full border border-line bg-surface-2 pl-9 pr-4 text-sm placeholder:text-fg-3 focus:border-accent/60" />
            </label>
          </form>
          <div className="ml-auto flex items-center gap-1">
            <IconButton icon="search" label={t('nav.search')} className="md:hidden" onClick={() => nav('/search')} />
            <IconButton icon="menu" label={t('nav.more')} className="md:hidden" aria-haspopup="dialog" onClick={() => setMore(true)} />
            {mods.enabled('messages') && <Link to="/messages" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg md:hidden" aria-label={`${t('nav.messages')}${counts.messages ? `, ${counts.messages} unread` : ''}`}>
              <Icon name="messages" size={20} />
              {counts.messages > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />}
            </Link>}
            <Link to="/notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg" aria-label={`${t('nav.notifications')}${counts.notifications ? `, ${counts.notifications} unread` : ''}`}>
              <Icon name="bell" size={20} />
              {counts.notifications > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-4 text-accent-ink numeric">{counts.notifications > 9 ? '9+' : counts.notifications}</span>}
            </Link>
            {mods.payments.enabled && <Link to="/shop/cart" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg" aria-label="Cart"><Icon name="cart" size={20} /></Link>}
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-10">
          <PageTransition k={loc.pathname}>{mods.pageAllowed(loc.pathname) ? <Outlet /> : <ModuleUnavailable />}</PageTransition>
        </main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 flex border-t border-line bg-canvas/95 px-2 pt-1.5 backdrop-blur-md safe-bottom md:hidden" style={{ zIndex: 'var(--z-nav)' as never }}>
        {MOBILE.filter(visible).map((i) => i.to === '/create' ? (
          <NavLink key={i.to} to={i.to} aria-label={t(i.key)} className="flex min-h-11 flex-1 flex-col items-center justify-center py-1">
            {({ isActive }) => <span className={cx('flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink shadow-sm motion-press', isActive && 'ring-2 ring-accent/40 ring-offset-2 ring-offset-canvas')}><NavIcon item={i} size={20} /></span>}
          </NavLink>
        ) : (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => cx('flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] py-1.5 text-[10.5px]', isActive ? 'font-semibold text-fg' : 'text-fg-3')}>
            <NavIcon item={i} size={21} /><span className="max-w-full truncate">{t(i.key)}</span>
          </NavLink>
        ))}
      </nav>

      <Drawer open={more} onClose={() => setMore(false)} title="Menu">
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-fg-3">{g.label}</p>
              <div className="grid grid-cols-2 gap-1">{g.items.map((i) => link(i, () => setMore(false)))}</div>
            </div>
          ))}
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-danger hover:bg-surface-2"><Icon name="logout" size={18} />{t('action.signOut')}</button>
        </div>
      </Drawer>
    </div>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2"><Logo size={30} /><span className="font-display text-2xl">Nakshatra</span></Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/about/methodology" className="hidden rounded-full px-3 py-2 text-fg-2 hover:text-fg sm:inline">How we calculate</Link>
          <Link to="/signin" className="rounded-full px-3 py-2 text-fg-2 hover:text-fg">Sign in</Link>
          <Link to="/personality" className="rounded-full bg-accent px-4 py-2 font-semibold text-accent-ink">Find your archetype</Link>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 md:px-8"><PublicGate>{children}</PublicGate></main>
      <footer className="mx-auto max-w-6xl border-t border-line px-4 py-8 text-xs text-fg-3 md:px-8">
        <div className="flex flex-wrap gap-4">
          <Link to="/legal/terms" className="hover:text-fg-2">Terms</Link>
          <Link to="/legal/privacy" className="hover:text-fg-2">Privacy</Link>
          <Link to="/about/methodology" className="hover:text-fg-2">Methodology</Link>
          <span>Archetypes describe tendencies from your own answers; they are not a psychological test. Astrology, where you add it, is a cultural and reflective framework.</span>
        </div>
      </footer>
    </div>
  );
}
