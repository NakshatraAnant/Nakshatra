import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, patch, post, put } from '../lib/api';
import { useMe } from '../lib/session';
import { BirthForm, type BirthValues } from '../components/BirthForm';
import { Button, Checkbox, Field, Input, cx } from '../components/ui/primitives';
import { Notice } from '../components/ui/feedback';
import { Logo } from '../components/ui/icons';
import { useI18n } from '../lib/i18n';
import { clearPendingBirth, takePendingBirth } from '../lib/cosmic';
import { clearPendingAnswers, takePendingAnswers } from '../lib/persona';
import { Assessment } from './studio';

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-md rise-in">
      <div className="mb-6 flex justify-center"><Logo size={44} /></div>
      <div className="card p-7">
        <h1 className="font-display text-4xl text-center">{title}</h1>
        {subtitle && <p className="mt-2 text-center text-sm text-fg-2">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function useAuthSuccess() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params] = useSearchParams();
  return async (user: { onboardingComplete: boolean }) => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    const next = params.get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) { try { sessionStorage.setItem('nk_after_onboarding', next); } catch { /* storage unavailable */ } }
    nav(!user.onboardingComplete ? '/onboarding' : next && next.startsWith('/') && !next.startsWith('//') ? next : '/home', { replace: true });
  };
}

export function SignIn() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [mfa, setMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = useAuthSuccess();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ user?: { onboardingComplete: boolean }; mfaRequired?: boolean }>('auth/login', { email, password, totp: mfa ? totp : undefined });
      if (r.mfaRequired) setMfa(true);
      else if (r.user) await done(r.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    }
    setBusy(false);
  };
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to continue your journey.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        {mfa && <Field label="Authenticator code" hint="Enter the 6-digit code from your authenticator app.">{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} autoFocus />}</Field>}
        <Button type="submit" size="lg" loading={busy} block>{t('action.signIn')}</Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-fg-2 hover:text-fg">Forgot password?</Link>
          <Link to="/signup" className="text-accent underline underline-offset-2">Create an account</Link>
        </div>
      </form>
    </AuthCard>
  );
}

export function SignUp() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const done = useAuthSuccess();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.displayName.trim()) errs.displayName = 'What should we call you?';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    if (form.password.length < 10) errs.password = 'Use at least 10 characters.';
    if (!adult) errs.adult = 'Nakshatra is available to adults (18+) only.';
    if (!terms) errs.terms = 'Please accept the terms and privacy policy.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await post<{ user: { onboardingComplete: boolean } }>('auth/signup', { ...form, confirmAdult: true, acceptTerms: true, referralCode: params.get('ref') ?? undefined });
      await done(r.user);
    } catch (err) {
      const fe: Record<string, string> = {};
      if (err instanceof ApiError) for (const d of err.details ?? []) fe[d.path] = d.message;
      setErrors({ form: err instanceof ApiError ? err.message : 'Could not create the account.', ...fe });
    }
    setBusy(false);
  };
  const strength = form.password.length >= 14 ? 'strong' : form.password.length >= 10 ? 'good' : form.password ? 'too short' : '';
  return (
    <AuthCard title={params.get('from') === 'discover' ? 'Save your Cosmic ID' : params.get('from') === 'personality' ? 'Save your archetype' : params.get('next')?.startsWith('/c/join/') ? 'Join your friends on Nakshatra' : 'Begin your journey'} subtitle={params.get('from') === 'discover' ? 'Create an account to keep your archetype, explore your full chart and invite someone to compare.' : 'Create your account — your Cosmic ID comes next.'}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {errors.form && <Notice tone="danger">{errors.form}</Notice>}
        <Field label="Your name" error={errors.displayName}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={Boolean(errors.displayName)} autoComplete="nickname" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
        <Field label="Email" error={errors.email}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={Boolean(errors.email)} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Password" error={errors.password} hint={strength ? `Strength: ${strength}` : 'At least 10 characters. A passphrase works well.'}>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={Boolean(errors.password)} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <div className="space-y-3">
          <Checkbox checked={adult} onChange={setAdult} label="I am 18 or older." />
          {errors.adult && <p className="text-xs text-danger" role="alert">{errors.adult}</p>}
          <Checkbox checked={terms} onChange={setTerms} label={<>I accept the <Link to="/legal/terms" className="text-accent underline" target="_blank">terms</Link> and <Link to="/legal/privacy" className="text-accent underline" target="_blank">privacy policy</Link>.</>} />
          {errors.terms && <p className="text-xs text-danger" role="alert">{errors.terms}</p>}
        </div>
        <Button type="submit" size="lg" loading={busy} block>Create account</Button>
        <p className="text-center text-sm text-fg-2">Already have an account? <Link to="/signin" className="text-accent underline underline-offset-2">Sign in</Link></p>
      </form>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthCard title="Reset your password" subtitle="We’ll email you a link that works for one hour.">
      {sent ? (
        <Notice tone="success">If an account exists for {email}, a reset link is on its way. In local development, open the <Link to="/dev/mailbox" className="underline">development mailbox</Link>.</Notice>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await post('auth/forgot-password', { email }).catch(() => undefined); setBusy(false); setSent(true); }}>
          <Field label="Email">{(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button type="submit" loading={busy} block>Send reset link</Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'done' | string>('idle');
  const nav = useNavigate();
  return (
    <AuthCard title="Choose a new password">
      {status === 'done' ? (
        <div className="space-y-4"><Notice tone="success">Your password was changed and all sessions were signed out.</Notice><Button block onClick={() => nav('/signin')}>Sign in</Button></div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={async (e) => {
          e.preventDefault();
          try { await post('auth/reset-password', { token: params.get('token'), password }); setStatus('done'); } catch (err) { setStatus(err instanceof ApiError ? err.message : 'Reset failed'); }
        }}>
          {status !== 'idle' && <Notice tone="danger">{status}</Notice>}
          <Field label="New password" hint="At least 10 characters.">{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Button type="submit" block>Update password</Button>
        </form>
      )}
    </AuthCard>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'pending' | 'ok' | string>('pending');
  const qc = useQueryClient();
  useEffect(() => {
    post('auth/verify-email', { token: params.get('token') })
      .then(() => { setState('ok'); qc.invalidateQueries({ queryKey: ['me'] }); })
      .catch((e) => setState(e instanceof ApiError ? e.message : 'Verification failed.'));
  }, [params, qc]);
  return (
    <AuthCard title="Email verification">
      {state === 'pending' && <p className="text-center text-fg-2">Verifying…</p>}
      {state === 'ok' && <div className="space-y-4"><Notice tone="success">Your email is verified. You can now post, join dating and book experts.</Notice><Link to="/today"><Button block>Continue</Button></Link></div>}
      {state !== 'pending' && state !== 'ok' && <Notice tone="danger">{state}</Notice>}
    </AuthCard>
  );
}

const STEPS = ['Welcome', 'Your identity', 'Your interests'];

/** Where to go after onboarding: a pending circle invite (or other deep link) wins. */
function afterOnboarding(fallback: string): string {
  try {
    const next = sessionStorage.getItem('nk_after_onboarding');
    if (next) { sessionStorage.removeItem('nk_after_onboarding'); if (next.startsWith('/') && !next.startsWith('//')) return next; }
  } catch { /* storage unavailable */ }
  return fallback;
}
const SOCIAL_INTERESTS = ['friendship', 'music', 'film', 'food', 'travel', 'tech', 'sport', 'fun', 'study', 'work', 'life', 'relationships'];
const INTERESTS = ['vedic', 'western', 'tarot', 'numerology', 'panchang', 'festivals', 'rituals', 'relationships', 'learning', 'meditation', 'mythology', 'nakshatras', 'transits', 'wellbeing'];

export function Onboarding() {
  const me = useMe().data?.user;
  // Details carried over from the account-free preview skip the welcome step; consent is asked again for storage.
  const [pending] = useState(() => (me?.hasBirthProfile ? null : takePendingBirth()));
  const [pendingAnswers] = useState(() => (me?.hasAssessment ? null : takePendingAnswers()));
  // Step 1 has two paths: 'assess' (personality, no birth data) or 'birth' (Cosmic ID).
  const [path, setPath] = useState<'assess' | 'birth'>(pending || (me?.hasBirthProfile && !me?.hasAssessment) ? 'birth' : 'assess');
  const [step, setStep] = useState(me?.hasBirthProfile || me?.hasAssessment ? 2 : pending || pendingAnswers ? 1 : 0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [system, setSystem] = useState<'vedic' | 'western'>('vedic');
  const qc = useQueryClient();
  const nav = useNavigate();
  const saveBirth = async (v: BirthValues) => {
    const { placeObject: _placeObject, ...body } = v;
    const r = await put<{ warnings: string[] }>('birth-profile', body);
    clearPendingBirth();
    setWarnings(r.warnings);
    setStep(2);
  };
  const finish = async () => {
    await patch('profile', { interests, preferredSystem: system });
    await qc.invalidateQueries({ queryKey: ['me'] });
    nav(afterOnboarding(path === 'birth' ? '/cosmic-id?welcome=1' : '/identity?welcome=1'), { replace: true });
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <ol className="mb-10 flex gap-2" aria-label="Onboarding progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={cx('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-surface-3')} />
            <p className={cx('mt-2 text-xs', i === step ? 'text-fg' : 'text-fg-3')} aria-current={i === step ? 'step' : undefined}>{s}</p>
          </li>
        ))}
      </ol>
      {step === 0 && (
        <section className="rise-in">
          <p className="eyebrow">Namaste{me?.profile ? `, ${me.profile.displayName}` : ''}</p>
          <h1 className="mt-3 font-display text-5xl leading-tight">First, what kind of person are you?</h1>
          <p className="mt-4 text-fg-2 leading-relaxed">Pick how you want to start. You can add the other one any time — circles, Thoughts and games work either way.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="card overflow-hidden">
              <img src="/visual/onboarding/onb-discover-identity.svg" alt="" aria-hidden="true" width={640} height={480} className="aspect-[16/9] w-full bg-surface-2 object-cover" />
              <div className="p-5">
              <p className="font-display text-2xl">Discover my archetype</p>
              <p className="mt-1 text-sm text-fg-2">Twenty quick statements, about two minutes. No birth details needed.</p>
              <Button size="lg" className="mt-4" onClick={() => { setPath('assess'); setStep(1); }}>Discover my archetype</Button>
              </div>
            </div>
            <div className="card overflow-hidden">
              <img src="/visual/onboarding/onb-complete-assessment.svg" alt="" aria-hidden="true" width={640} height={480} className="aspect-[16/9] w-full bg-surface-2 object-cover" />
              <div className="p-5">
              <p className="font-display text-2xl">Read my sky</p>
              <p className="mt-1 text-sm text-fg-2">Your Cosmic ID from your birth date, time and place — Vedic and Western, with every method shown. Unknown birth time is fine.</p>
              <Button size="lg" variant="secondary" className="mt-4" onClick={() => { setPath('birth'); setStep(1); }}>Continue with birth details</Button>
              </div>
            </div>
          </div>
        </section>
      )}
      {step === 1 && path === 'assess' && (
        <section className="rise-in">
          <h1 className="font-display text-4xl">{pendingAnswers ? 'Save your archetype' : 'Discover your archetype'}</h1>
          <p className="mt-2 mb-6 text-fg-2">{pendingAnswers ? 'These are your answers from the preview. Review them, then save.' : 'Go with your first instinct — there are no right answers.'}</p>
          <Assessment initial={pendingAnswers} submitLabel="Save my archetype" onDone={async (answers) => { await post('personality/assessment', { answers }); clearPendingAnswers(); setStep(2); }} />
          <button type="button" className="mt-6 text-sm text-accent hover:underline" onClick={() => setPath('birth')}>Use birth details instead</button>
        </section>
      )}
      {step === 1 && path === 'birth' && (
        <section className="rise-in">
          <h1 className="font-display text-4xl">{pending ? 'Save your Cosmic ID' : 'When did your story begin?'}</h1>
          <p className="mt-2 mb-6 text-fg-2">{pending ? 'These are the details from your preview. Check them, then agree to store them so your Cosmic ID is kept in your account.' : 'Enter the details from your birth certificate if you have it.'}</p>
          <BirthForm onSubmit={saveBirth} initial={pending ?? undefined} submitLabel={pending ? 'Save my Cosmic ID' : undefined} />
        </section>
      )}
      {step === 2 && (
        <section className="rise-in">
          <h1 className="font-display text-4xl">{path === 'birth' ? 'What draws you to the sky?' : 'What are you into?'}</h1>
          <p className="mt-2 text-fg-2">Your choices shape your feed, course suggestions and community — and nothing else. Change them any time.</p>
          {warnings.length > 0 && <Notice tone="warning" className="mt-4" title="About your birth time">{warnings.map((w) => <p key={w}>{w}</p>)}</Notice>}
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Interests">
            {(path === 'birth' ? INTERESTS : SOCIAL_INTERESTS).map((i) => {
              const on = interests.includes(i);
              return <button key={i} type="button" aria-pressed={on} onClick={() => setInterests(on ? interests.filter((x) => x !== i) : [...interests, i])} className={cx('rounded-full border px-4 py-2 text-sm capitalize transition-colors', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2 hover:border-line-strong')}>{i}</button>;
            })}
          </div>
          {path === 'birth' && <>
          <h2 className="mt-8 font-display text-2xl">Which system should lead?</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['vedic', 'western'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={system === s} onClick={() => setSystem(s)} className={cx('card p-4 text-left transition-colors', system === s ? 'border-accent' : '')}>
                <p className="font-display text-2xl capitalize">{s === 'vedic' ? 'Vedic (Jyotish)' : 'Western'}</p>
                <p className="mt-1 text-sm text-fg-2">{s === 'vedic' ? 'Sidereal zodiac, Rashi, Lagna, nakshatras and dashas.' : 'Tropical zodiac, Sun–Moon–Rising, houses and aspects.'}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-3">You’ll always see both — this only sets the default.</p>
          </>}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={finish}>Reveal my Cosmic ID ✦</Button>
            <Button variant="ghost" onClick={finish}>Skip — choose later in Settings</Button>
          </div>
        </section>
      )}
    </div>
  );
}
