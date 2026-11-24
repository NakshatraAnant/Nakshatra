import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './icons';
import { initials } from '../../lib/format';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_8px_24px_-12px_rgb(217_178_111/0.7)]',
  secondary: 'bg-surface-2 text-fg border border-line-strong hover:bg-surface-3',
  ghost: 'bg-transparent text-fg-2 hover:text-fg hover:bg-surface-2',
  subtle: 'bg-surface-2 text-fg-2 hover:text-fg',
  danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
};
const SIZES: Record<Size, string> = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-11 px-4 text-[15px] gap-2', lg: 'h-12 px-6 text-base gap-2' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', icon, loading, block, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('inline-flex items-center justify-center rounded-[var(--radius-md)] font-semibold transition-colors duration-150 disabled:opacity-55 disabled:cursor-not-allowed select-none', VARIANTS[variant], SIZES[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({ to, variant = 'primary', size = 'md', icon, className, children, block }: { to: string; variant?: Variant; size?: Size; icon?: IconName; className?: string; children: ReactNode; block?: boolean }) {
  return (
    <Link to={to} className={cx('inline-flex items-center justify-center rounded-[var(--radius-md)] font-semibold transition-colors duration-150', VARIANTS[variant], SIZES[size], block && 'w-full', className)}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </Link>
  );
}

export function IconButton({ icon, label, className, size = 40, ...rest }: { icon: IconName; label: string; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex items-center justify-center rounded-full text-fg-2 hover:text-fg hover:bg-surface-2 transition-colors', className)} style={{ width: size, height: size }} {...rest}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </button>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

interface FieldProps { label: string; hint?: ReactNode; error?: string | null; children: (id: string, describedBy: string | undefined) => ReactNode; required?: boolean; className?: string }

export function Field({ label, hint, error, children, required, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg-2">
        {label}
        {required && <span className="text-danger" aria-hidden="true"> *</span>}
      </label>
      {children(id, [hintId, errId].filter(Boolean).join(' ') || undefined)}
      {hint && !error && <p id={hintId} className="text-xs text-fg-3">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const inputBase = 'w-full rounded-[var(--radius-sm)] bg-surface-2 border border-line text-fg placeholder:text-fg-3 px-3.5 transition-colors focus:border-accent/70 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, 'h-11', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(inputBase, 'py-2.5 leading-relaxed resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cx(inputBase, 'h-11 appearance-none pr-9', className)} {...rest}>{children}</select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-3" />
    </div>
  );
});

export function Checkbox({ label, description, checked, onChange, disabled }: { label: ReactNode; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 rounded accent-[var(--accent)] cursor-pointer" />
      <label htmlFor={id} className="text-sm text-fg-2 cursor-pointer">
        <span className="text-fg">{label}</span>
        {description && <span className="block text-xs text-fg-3 mt-0.5">{description}</span>}
      </label>
    </div>
  );
}

export function Switch({ label, checked, onChange, description, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="text-sm text-fg">{label}</label>
        {description && <p className="text-xs text-fg-3">{description}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-50', checked ? 'bg-accent border-accent' : 'bg-surface-3 border-line-strong')}>
        {/* Track is 48px wide with 1px borders: the 22px knob travels from 2px to 22px. */}
        <span aria-hidden className="absolute left-0 top-0.5 rounded-full bg-[var(--surface)] shadow transition-transform motion-reduce:transition-none" style={{ width: 22, height: 22, transform: `translateX(${checked ? 22 : 2}px)` }} />
      </button>
    </div>
  );
}

export function Card({ children, className, as: As = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' } & Record<string, unknown>) {
  return <As className={cx('card p-5', className)} {...rest}>{children}</As>;
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'violet' | 'success' | 'danger' | 'celestial' | 'warning'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-3 text-fg-2',
    accent: 'bg-accent/15 text-accent border border-accent/30',
    violet: 'bg-violet/15 text-violet border border-violet/30',
    celestial: 'bg-celestial/15 text-celestial border border-celestial/30',
    success: 'bg-success/15 text-success border border-success/30',
    danger: 'bg-danger/15 text-danger border border-danger/30',
    warning: 'bg-accent/10 text-accent border border-accent/25',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function Avatar({ name, src, size = 40, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  return src ? (
    <img src={src} alt="" width={size} height={size} className={cx('rounded-full object-cover border border-line', className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className={cx('inline-flex items-center justify-center rounded-full font-semibold text-accent-ink', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(135deg, var(--accent), var(--violet))' }}>
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />;
}

export function SectionTitle({ title, kicker, action, as: As = 'h2' }: { title: ReactNode; kicker?: ReactNode; action?: ReactNode; as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {kicker && <p className="eyebrow font-semibold mb-1">{kicker}</p>}
        <As className={cx('font-display text-fg', As === 'h1' ? 'text-4xl md:text-5xl' : As === 'h2' ? 'text-2xl md:text-[28px]' : 'text-xl')}>{title}</As>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, kicker, actions }: { title: ReactNode; subtitle?: ReactNode; kicker?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between rise-in">
      <div className="max-w-2xl">
        {kicker && <p className="eyebrow font-semibold mb-2">{kicker}</p>}
        <h1 className="font-display text-4xl md:text-5xl leading-[1.05] text-fg">{title}</h1>
        {subtitle && <p className="mt-3 text-fg-2 text-[15px] leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Kv({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col', className)}>
      <dt className="eyebrow">{k}</dt>
      <dd className="text-fg mt-0.5">{v}</dd>
    </div>
  );
}
