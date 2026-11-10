import { MembershipPanel } from './membership';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post, put } from '../lib/api';
import { cap, civilDate, relative } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/session';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Switch, Textarea } from '../components/ui/primitives';
import { QueryState, Notice, IntegrationNotice } from '../components/ui/feedback';
import { ConfirmDialog, Tabs, useToast } from '../components/ui/overlays';
import { BirthForm, type BirthValues } from '../components/BirthForm';
import { PlaceSearch, type Place } from '../components/PlaceSearch';

type Tab = 'profile' | 'birth' | 'privacy' | 'notifications' | 'security' | 'subscription' | 'data' | 'appeals';

export function SettingsPage() {
  const { tab = 'profile' } = useParams();
  const nav = useNavigate();
  const tabs: { value: Tab; label: string }[] = [
    { value: 'profile', label: 'Profile & display' }, { value: 'birth', label: 'Birth details' }, { value: 'privacy', label: 'Privacy' }, { value: 'notifications', label: 'Notifications' },
    { value: 'security', label: 'Security' }, { value: 'subscription', label: 'Membership' }, { value: 'data', label: 'Your data' }, { value: 'appeals', label: 'Appeals' },
  ];
  return (
    <div>
      <PageHeader kicker="Settings" title="Your account" />
      <Tabs tabs={tabs} value={tab as Tab} onChange={(t) => nav(`/settings/${t}`)} className="mb-6" />
      {tab === 'profile' && <ProfileSettings />}
      {tab === 'birth' && <BirthSettings />}
      {tab === 'privacy' && <PrivacySettings />}
      {tab === 'notifications' && <NotificationSettings />}
      {tab === 'security' && <SecuritySettings />}
      {tab === 'subscription' && <SubscriptionSettings />}
      {tab === 'data' && <DataSettings />}
      {tab === 'appeals' && <Appeals />}
    </div>
  );
}

function ProfileSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe().data?.user;
  const loc = useQuery({ queryKey: ['location'], queryFn: () => get<{ location: { placeName: string; timezone: string } | null }>('location') });
  const [place, setPlace] = useState<Place | null>(null);
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => patch('profile', body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); toast('Saved', 'success'); } });
  const setLoc = useMutation({ mutationFn: () => put('location', { placeId: place!.id }), onSuccess: () => { qc.invalidateQueries(); toast('Location updated', 'success'); } });
  if (!me?.profile) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="font-display text-2xl">Display</h2>
        <Field label="Display name">{(id) => <Input id={id} defaultValue={me.profile!.displayName} onBlur={(e) => e.target.value !== me.profile!.displayName && save.mutate({ displayName: e.target.value })} />}</Field>
        <Field label="Language">{(id) => <Select id={id} value={me.profile!.language} onChange={(e) => save.mutate({ language: e.target.value })}><option value="en">English</option><option value="hi">हिन्दी (Hindi)</option></Select>}</Field>
        <Field label="Appearance">{(id) => <Select id={id} value={me.profile!.colorScheme} onChange={(e) => save.mutate({ colorScheme: e.target.value })}><option value="system">Match my device</option><option value="dark">Midnight (dark)</option><option value="light">Ivory (light)</option></Select>}</Field>
        <Link to="/theme" className="text-sm text-accent hover:underline">Accent colour, text size and corners in Theme studio →</Link>
        <Switch label="Reduce motion" description="Turns off 3D animation and transitions everywhere." checked={me.profile.reducedMotion} onChange={(v) => save.mutate({ reducedMotion: v })} />
        <Field label="Default astrology system">{(id) => <Select id={id} value={me.profile!.preferredSystem} onChange={(e) => save.mutate({ preferredSystem: e.target.value })}><option value="vedic">Vedic</option><option value="western">Western</option></Select>}</Field>
        <p className="text-xs text-fg-3">Hindi currently covers navigation, actions and astrological terms; longer interpretive content is shown in English until translated.</p>
      </Card>
      <Card className="space-y-4">
        <h2 className="font-display text-2xl">Current location</h2>
        <p className="text-sm text-fg-2">Used for your daily Panchang, sunrise times and festival dates. Currently: <strong className="text-fg">{loc.data?.location?.placeName ?? '—'}</strong> ({loc.data?.location?.timezone})</p>
        <PlaceSearch value={place} onChange={setPlace} label="New location" />
        <Button disabled={!place} loading={setLoc.isPending} onClick={() => setLoc.mutate()}>Update location</Button>
        <p className="text-xs text-fg-3">Your location is private and never shown on your profile.</p>
      </Card>
    </div>
  );
}

function BirthSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { dateLocale } = useI18n();
  const q = useQuery({ queryKey: ['birth-profile'], queryFn: () => get<{ birthProfile: { date: string; time: string | null; timePrecision: 'exact' | 'within_15m' | 'within_1h' | 'unknown'; placeName: string; latitude: number; longitude: number; timezone: string; utcOffsetMinutes: number; birthUtc: string; updatedAt: string } | null }>('birth-profile') });
  const save = async (v: BirthValues) => {
    const r = await put<{ warnings: string[] }>('birth-profile', v);
    qc.invalidateQueries();
    toast(r.warnings.length ? `Saved. ${r.warnings[0]}` : 'Birth details updated — charts recalculated', 'success');
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <QueryState q={q}>{({ birthProfile: b }) => b ? (
        <Card>
          <h2 className="font-display text-2xl">Saved details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-fg-3">Date</dt><dd>{civilDate(b.date, dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
            <div className="flex justify-between"><dt className="text-fg-3">Time</dt><dd>{b.time ?? 'Unknown'} ({b.timePrecision.replace('_', ' ')})</dd></div>
            <div className="flex justify-between"><dt className="text-fg-3">Place</dt><dd className="text-right">{b.placeName}<br /><span className="text-xs text-fg-3 numeric">{b.latitude.toFixed(4)}°, {b.longitude.toFixed(4)}°</span></dd></div>
            <div className="flex justify-between"><dt className="text-fg-3">Time zone</dt><dd>{b.timezone} (UTC{b.utcOffsetMinutes >= 0 ? '+' : '−'}{Math.floor(Math.abs(b.utcOffsetMinutes) / 60)}:{String(Math.abs(b.utcOffsetMinutes) % 60).padStart(2, '0')} at birth)</dd></div>
            <div className="flex justify-between"><dt className="text-fg-3">UTC moment</dt><dd className="numeric">{new Date(b.birthUtc).toISOString().replace('T', ' ').slice(0, 16)}</dd></div>
          </dl>
          <Notice tone="info" className="mt-4">These details are private. Changing them recalculates your charts; saved chart snapshots keep their original calculations.</Notice>
        </Card>
      ) : <Notice tone="info">No birth details saved.</Notice>}</QueryState>
      <Card><h2 className="mb-4 font-display text-2xl">Update birth details</h2><BirthForm onSubmit={save} submitLabel="Save and recalculate" /></Card>
    </div>
  );
}

const FIELDS: [string, string][] = [['sunSign', 'Sun sign'], ['moonSign', 'Moon sign / Rashi'], ['rising', 'Rising / Lagna'], ['nakshatra', 'Janma Nakshatra'], ['bio', 'Bio'], ['interests', 'Interests'], ['badges', 'Badges'], ['level', 'Journey level'], ['birthDate', 'Birth date']];

function PrivacySettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['profile'], queryFn: () => get<{ profile: { visibility: string; fieldVisibility: Record<string, string>; interests: string[] } }>('profile') });
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: () => get<{ blocked: { userId: string; displayName?: string }[]; muted: { userId: string; displayName?: string }[]; mutedPenNames: { ref: string; penName: string }[] }>('blocks') });
  const unmutePen = useMutation({ mutationFn: (ref: string) => del(`pen-mutes/${ref}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }) });
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => patch('profile', body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: ['me'] }); toast('Privacy updated', 'success'); } });
  const unblock = useMutation({ mutationFn: (id: string) => del(`blocks/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }) });
  const unmute = useMutation({ mutationFn: (id: string) => del(`mutes/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }) });
  const [interests, setInterests] = useState('');
  useEffect(() => { if (q.data) setInterests(q.data.profile.interests.join(', ')); }, [q.data]);
  return (
    <QueryState q={q}>{({ profile: p }) => (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="font-display text-2xl">Profile visibility</h2>
          <Field label="Who can see your profile">{(id) => <Select id={id} value={p.visibility} onChange={(e) => save.mutate({ visibility: e.target.value })}><option value="private">Private — only connections see details</option><option value="public">Public — anyone with the link</option></Select>}</Field>
          <div className="orbit-rule" />
          <h3 className="text-sm font-semibold text-fg">Per-field visibility</h3>
          {FIELDS.map(([k, l]) => (
            <div key={k} className="flex items-center justify-between gap-3"><label htmlFor={`fv-${k}`} className="text-sm text-fg-2">{l}</label><Select id={`fv-${k}`} className="h-9 w-44 text-sm" value={p.fieldVisibility[k] ?? 'private'} onChange={(e) => save.mutate({ fieldVisibility: { ...p.fieldVisibility, [k]: e.target.value } })}><option value="public">Everyone</option><option value="connections">Connections</option><option value="private">Only me</option></Select></div>
          ))}
          <p className="text-xs text-fg-3">Your birth time, birthplace and coordinates can never be made public.</p>
          <Switch label="Save my search history" checked={p.fieldVisibility.searchHistory !== 'off'} onChange={(on) => save.mutate({ fieldVisibility: { ...p.fieldVisibility, searchHistory: on ? 'on' : 'off' } })} />
        </Card>
        <div className="space-y-5">
          <Card className="space-y-3"><h2 className="font-display text-2xl">Interests</h2><p className="text-sm text-fg-2">Used only to order your feed and suggest courses.</p><Input aria-label="Interests" value={interests} onChange={(e) => setInterests(e.target.value)} /><Button size="sm" onClick={() => save.mutate({ interests: interests.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12) })}>Save interests</Button></Card>
          <Card><h2 className="font-display text-2xl">Blocked & muted</h2><QueryState q={blocks}>{(b) => (<ul className="mt-3 space-y-2 text-sm">{b.blocked.map((u) => <li key={u.userId} className="flex justify-between"><span>{u.displayName} <Badge>blocked</Badge></span><button type="button" className="text-accent" onClick={() => unblock.mutate(u.userId)}>Unblock</button></li>)}{b.muted.map((u) => <li key={u.userId} className="flex justify-between"><span>{u.displayName} <Badge>muted</Badge></span><button type="button" className="text-accent" onClick={() => unmute.mutate(u.userId)}>Unmute</button></li>)}{b.mutedPenNames.map((p) => <li key={p.ref} className="flex justify-between"><span>{p.penName} <Badge>pen name muted</Badge></span><button type="button" className="text-accent" onClick={() => unmutePen.mutate(p.ref)}>Unmute</button></li>)}{!b.blocked.length && !b.muted.length && !b.mutedPenNames.length && <li className="text-fg-3">No one.</li>}</ul>)}</QueryState></Card>
          <Consents />
        </div>
      </div>
    )}</QueryState>
  );
}

function Consents() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['consents'], queryFn: () => get<{ consents: { purpose: string; granted: boolean; policyVersion: string; createdAt: string }[] }>('consents') });
  const [withdraw, setWithdraw] = useState(false);
  const set = useMutation({ mutationFn: ({ purpose, granted }: { purpose: string; granted: boolean }) => post('consents', { purpose, granted }), onSuccess: (_r, v) => { qc.invalidateQueries(); if (v.purpose === 'birth_data_processing' && !v.granted) nav('/onboarding'); } });
  const LABEL: Record<string, string> = { terms: 'Terms of service', privacy: 'Privacy policy', birth_data_processing: 'Processing my birth data', marketing_email: 'Product emails', analytics: 'Product analytics', dating_terms: 'Dating rules', matchmaking_terms: 'Matchmaking rules' };
  return (
    <Card>
      <h2 className="font-display text-2xl">Consents</h2>
      <QueryState q={q}>{(d) => <ul className="mt-3 space-y-2 text-sm">{d.consents.map((c) => <li key={c.purpose} className="flex items-center justify-between gap-3"><span>{LABEL[c.purpose] ?? c.purpose} <span className="text-xs text-fg-3">({c.granted ? 'given' : 'withdrawn'} {relative(c.createdAt)}, v{c.policyVersion})</span></span>{c.purpose === 'birth_data_processing' && c.granted && <button type="button" className="text-xs text-danger" onClick={() => setWithdraw(true)}>Withdraw</button>}</li>)}</ul>}</QueryState>
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => set.mutate({ purpose: 'marketing_email', granted: true })}>Allow product emails</Button><Button size="sm" variant="ghost" onClick={() => set.mutate({ purpose: 'marketing_email', granted: false })}>Decline product emails</Button></div>
      <ConfirmDialog open={withdraw} onClose={() => setWithdraw(false)} danger title="Withdraw birth-data consent?" confirmLabel="Withdraw and delete" body="Your birth details and every chart calculated from them will be deleted immediately, and chart sharing with others ends. You can add them again later." onConfirm={() => { set.mutate({ purpose: 'birth_data_processing', granted: false }); setWithdraw(false); }} />
    </Card>
  );
}

function NotificationSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['notif-prefs'], queryFn: () => get<{ preferences: { category: string; inApp: boolean; email: boolean }[]; settings: { quietStart: string | null; quietEnd: string | null; dailyCap: number; timezone: string; unsubscribedAllEmail: boolean }; essential: string[]; pushNote: string }>('notification-preferences') });
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => put('notification-preferences', body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-prefs'] }); toast('Saved', 'success'); } });
  return (
    <QueryState q={q}>{(d) => (
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <h2 className="font-display text-2xl">What we notify you about</h2>
          <IntegrationNotice kind="email" />
          <table className="mt-3 w-full text-sm"><thead className="eyebrow"><tr><th className="py-1 text-left">Category</th><th>In app</th><th>Email</th></tr></thead>
            <tbody className="divide-y divide-[var(--line)]">{d.preferences.map((p) => {
              const essential = d.essential.includes(p.category);
              return (
                <tr key={p.category}><td className="py-2 text-fg">{cap(p.category)}{essential && <span className="block text-xs text-fg-3">Essential — always shown in app</span>}</td>
                  <td className="text-center"><input type="checkbox" aria-label={`${p.category} in app`} disabled={essential} checked={essential || p.inApp} onChange={(e) => save.mutate({ preferences: [{ ...p, inApp: e.target.checked }] })} className="h-4 w-4 accent-[var(--accent)]" /></td>
                  <td className="text-center"><input type="checkbox" aria-label={`${p.category} email`} checked={p.email} onChange={(e) => save.mutate({ preferences: [{ ...p, email: e.target.checked }] })} className="h-4 w-4 accent-[var(--accent)]" /></td></tr>
              );
            })}</tbody></table>
          <p className="mt-3 text-xs text-fg-3">{d.pushNote}</p>
        </Card>
        <Card className="space-y-4">
          <h2 className="font-display text-2xl">Quiet hours & limits</h2>
          <div className="grid grid-cols-2 gap-3"><Field label="Quiet from">{(id) => <Input id={id} type="time" defaultValue={d.settings.quietStart ?? ''} onBlur={(e) => save.mutate({ settings: { quietStart: e.target.value || null, quietEnd: d.settings.quietEnd } })} />}</Field><Field label="Until">{(id) => <Input id={id} type="time" defaultValue={d.settings.quietEnd ?? ''} onBlur={(e) => save.mutate({ settings: { quietStart: d.settings.quietStart, quietEnd: e.target.value || null } })} />}</Field></div>
          <Field label="Maximum non-essential notifications per day">{(id) => <Input id={id} type="number" min={1} max={50} defaultValue={d.settings.dailyCap} onBlur={(e) => save.mutate({ settings: { dailyCap: Number(e.target.value) } })} />}</Field>
          <Switch label="Unsubscribe from all email" checked={d.settings.unsubscribedAllEmail} onChange={(v) => save.mutate({ settings: { unsubscribedAllEmail: v } })} />
          <p className="text-xs text-fg-3">Times use {d.settings.timezone}.</p>
        </Card>
      </div>
    )}</QueryState>
  );
}

function SecuritySettings() {
  const me = useMe().data?.user;
  const qc = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => get<{ sessions: { id: string; createdAt: string; lastSeenAt: string; userAgent: string | null; current: boolean }[] }>('auth/sessions') });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [mfa, setMfa] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [regen, setRegen] = useState({ password: '', code: '' });
  const remaining = useQuery({ queryKey: ['mfa-recovery'], queryFn: () => get<{ remaining: number }>('auth/mfa/recovery-codes'), enabled: !!me?.mfaEnabled });
  const change = useMutation({ mutationFn: () => post('auth/change-password', pw), onSuccess: () => { setPw({ currentPassword: '', newPassword: '' }); toast('Password changed. Other sessions were signed out.', 'success'); qc.invalidateQueries({ queryKey: ['sessions'] }); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  const revoke = useMutation({ mutationFn: (id: string) => del(`auth/sessions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });
  const setup = useMutation({ mutationFn: () => post<{ secret: string; qrDataUrl: string }>('auth/mfa/setup'), onSuccess: setMfa });
  const enable = useMutation({ mutationFn: () => post<{ recoveryCodes: string[] }>('auth/mfa/enable', { code }), onSuccess: (r) => { setMfa(null); setCode(''); setCodes(r.recoveryCodes); qc.invalidateQueries({ queryKey: ['mfa-recovery'] }); qc.invalidateQueries({ queryKey: ['me'] }); toast('Two-step verification is on', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  const disable = useMutation({ mutationFn: () => post('auth/mfa/disable', { password: disablePw, code: disableCode }), onSuccess: () => { setDisablePw(''); setDisableCode(''); qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['sessions'] }); toast('Two-step verification turned off', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  const regenerate = useMutation({ mutationFn: () => post<{ recoveryCodes: string[] }>('auth/mfa/recovery-codes', regen), onSuccess: (r) => { setRegen({ password: '', code: '' }); setCodes(r.recoveryCodes); qc.invalidateQueries({ queryKey: ['mfa-recovery'] }); toast('New recovery codes created — the old ones no longer work', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  const resend = useMutation({ mutationFn: () => post('auth/resend-verification'), onSuccess: () => toast('Verification email sent', 'success') });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Email</h2>
          <p className="text-sm text-fg-2">{me?.email} {me?.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}</p>
          {!me?.emailVerified && <Button size="sm" variant="secondary" onClick={() => resend.mutate()}>Resend verification email</Button>}
          {!me?.emailVerified && <p className="text-xs text-fg-3">In local development, emails appear in the <Link to="/dev/mailbox" className="underline">development mailbox</Link>.</p>}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Change password</h2>
          <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}</Field>
          <Field label="New password" hint="At least 10 characters.">{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}</Field>
          <Button size="sm" loading={change.isPending} onClick={() => change.mutate()}>Change password</Button>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Two-step verification</h2>
          {me?.mfaEnabled ? (<>
            <p className="text-sm text-success">On — an authenticator code is required when you sign in.</p>
            {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
            <div className="rounded-lg border border-line p-3 text-sm">
              <p className="text-fg">Recovery codes: {remaining.data ? <strong>{remaining.data.remaining} unused</strong> : '…'}</p>
              {remaining.data && remaining.data.remaining <= 3 && <p className="mt-1 text-warning">You are running low. Create a new set below.</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-fg-2">Create new recovery codes</summary>
                <div className="mt-3 space-y-3">
                  <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={regen.password} onChange={(e) => setRegen({ ...regen, password: e.target.value })} />}</Field>
                  <Field label="Current 6-digit code" hint="Your old recovery codes stop working.">{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={regen.code} onChange={(e) => setRegen({ ...regen, code: e.target.value.replace(/\D/g, '') })} />}</Field>
                  <Button size="sm" variant="secondary" disabled={!regen.password || regen.code.length !== 6} loading={regenerate.isPending} onClick={() => regenerate.mutate()}>Create new codes</Button>
                </div>
              </details>
            </div>
            <h3 className="pt-2 text-sm font-semibold text-fg">Turn off</h3>
            <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />}</Field>
            <Field label="Authenticator or recovery code" hint="A current 6-digit code, or an unused recovery code if you lost your device. Turning this off signs out your other sessions.">{(id, d) => <Input id={id} aria-describedby={d} autoComplete="one-time-code" spellCheck={false} maxLength={20} value={disableCode} onChange={(e) => setDisableCode(e.target.value.trim())} />}</Field>
            <Button size="sm" variant="danger" disabled={!disablePw || disableCode.length < 6} loading={disable.isPending} onClick={() => disable.mutate()}>Turn off</Button>
          </>) : mfa ? (<>
            <img src={mfa.qrDataUrl} alt="QR code for your authenticator app" className="w-40" />
            <p className="text-xs text-fg-3">Or enter this key manually: <code className="break-all">{mfa.secret}</code></p>
            <Field label="Enter the 6-digit code">{(id) => <Input id={id} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />}</Field>
            <Button size="sm" disabled={code.length !== 6} onClick={() => enable.mutate()}>Turn on</Button>
          </>) : <Button size="sm" variant="secondary" onClick={() => setup.mutate()}>Set up with an authenticator app</Button>}
        </Card>
      </div>
      <Card>
        <h2 className="font-display text-2xl">Active sessions</h2>
        <QueryState q={sessions}>{(d) => <ul className="mt-3 space-y-3">{d.sessions.map((s) => <li key={s.id} className="flex items-start justify-between gap-3 text-sm"><div><p className="text-fg">{s.userAgent?.slice(0, 60) ?? 'Unknown device'} {s.current && <Badge tone="accent">This device</Badge>}</p><p className="text-xs text-fg-3">Signed in {relative(s.createdAt)} · last active {relative(s.lastSeenAt)}</p></div>{!s.current && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>Sign out</Button>}</li>)}</ul>}</QueryState>
      </Card>
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const toast = useToast();
  const text = `Nakshatra recovery codes (each works once)\n\n${codes.join('\n')}\n`;
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Copied', 'success'); } catch { toast('Copy failed — select the codes and copy them manually', 'error'); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'nakshatra-recovery-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div role="region" aria-label="Your recovery codes" className="space-y-3 rounded-lg border border-warning/50 bg-warning/5 p-3">
      <p className="text-sm text-fg"><strong>Save these recovery codes now.</strong> They are shown only once. If you lose your authenticator, each code lets you sign in one time.</p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="recovery-codes">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>Copy</Button>
        <Button size="sm" variant="secondary" onClick={download}>Download .txt</Button>
        <Button size="sm" onClick={onDone}>I have saved them</Button>
      </div>
    </div>
  );
}

function SubscriptionSettings() {
  return <MembershipPanel />;
}

function DataSettings() {
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const exp = useMutation({
    mutationFn: () => post<{ data: unknown }>('privacy/export'),
    onSuccess: (r) => {
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `nakshatra-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Your data export has downloaded', 'success');
    },
  });
  const delAcc = useMutation({ mutationFn: () => post('privacy/delete-account', { password, confirm: 'DELETE', reason: reason || undefined }), onSuccess: () => { qc.clear(); nav('/'); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Export your data</h2>
        <p className="text-sm text-fg-2">Download everything we hold about you — profile, birth details, charts, insights, journey, Bonds, posts, messages you sent, purchases and consents — as a JSON file.</p>
        <Button icon="download" loading={exp.isPending} onClick={() => exp.mutate()}>Export my data</Button>
      </Card>
      <Card className="space-y-3 border-danger/30">
        <h2 className="font-display text-2xl">Delete your account</h2>
        <p className="text-sm text-fg-2">Deletion is immediate and permanent. We delete your birth details, charts, insights, journey, Bonds, dating and matchmaking profiles and family links, and remove the content of your posts, comments and messages.</p>
        <p className="text-sm text-fg-2">We keep orders, payments, refunds and bookings for accounting and legal reasons, linked to a de-identified record.</p>
        <Field label="Why are you leaving? (optional)">{(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <Field label="Your password">{(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Button variant="danger" disabled={!password} onClick={() => setConfirm(true)}>Delete my account</Button>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} danger requireText="DELETE" title="Delete your account permanently?" confirmLabel="Delete account" loading={delAcc.isPending} body="This cannot be undone." onConfirm={() => delAcc.mutate()} />
      </Card>
    </div>
  );
}

function Appeals() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['appeals'], queryFn: () => get<{ actions: { id: string; action: string; reason: string; createdAt: string }[]; appeals: { id: string; status: string; body: string; decisionNote: string | null; createdAt: string }[] }>('appeals') });
  const [body, setBody] = useState('');
  const [actionId, setActionId] = useState('');
  const m = useMutation({ mutationFn: () => post('appeals', { body, moderationActionId: actionId || undefined }), onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['appeals'] }); toast('Appeal submitted', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl">Moderation actions on your account</h2>
          <ul className="mt-3 space-y-2 text-sm">{d.actions.map((a) => <li key={a.id}><strong>{cap(a.action)}</strong> — {a.reason} <span className="text-xs text-fg-3">{relative(a.createdAt)}</span></li>)}{!d.actions.length && <li className="text-fg-3">None.</li>}</ul>
          <h3 className="mt-5 font-display text-2xl">Your appeals</h3>
          <ul className="mt-2 space-y-2 text-sm">{d.appeals.map((a) => <li key={a.id}><Badge>{a.status}</Badge> {a.body.slice(0, 80)}{a.decisionNote && <p className="text-xs text-fg-3">Decision: {a.decisionNote}</p>}</li>)}</ul>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Submit an appeal</h2>
          <Field label="Which action?">{(id) => <Select id={id} value={actionId} onChange={(e) => setActionId(e.target.value)}><option value="">General appeal</option>{d.actions.map((a) => <option key={a.id} value={a.id}>{cap(a.action)} — {civilDate(a.createdAt.slice(0, 10))}</option>)}</Select>}</Field>
          <Field label="Explain why it should be reviewed" hint="At least 20 characters.">{(id, h) => <Textarea id={id} aria-describedby={h} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
          <Button disabled={body.length < 20} loading={m.isPending} onClick={() => m.mutate()}>Submit appeal</Button>
          <p className="text-xs text-fg-3">A different moderator from the one who took the action reviews every appeal.</p>
        </Card>
      </div>
    )}</QueryState>
  );
}
