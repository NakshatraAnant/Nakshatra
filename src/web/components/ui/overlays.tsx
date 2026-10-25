import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton, cx } from './primitives';
import { Icon } from './icons';

/**
 * Dialog built on the native <dialog> element: focus is trapped and restored by the
 * browser, Escape closes, and the backdrop click closes unless `dismissible` is false.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', dismissible = true, sheetOnMobile = true }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; dismissible?: boolean; sheetOnMobile?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const widths = { sm: 'md:max-w-sm', md: 'md:max-w-lg', lg: 'md:max-w-3xl' };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); if (dismissible) onClose(); }}
      onClick={(e) => { if (dismissible && e.target === ref.current) onClose(); }}
      className={cx('m-0 max-h-[100dvh] w-full max-w-none bg-transparent p-0 text-fg md:m-auto', sheetOnMobile ? 'mt-auto md:mt-auto' : '', widths[size])}
      style={{ zIndex: 'var(--z-dialog)' as never }}
    >
      {open && (
        <div className={cx('card rise-in flex max-h-[92dvh] flex-col overflow-hidden', sheetOnMobile ? 'rounded-b-none md:rounded-b-[var(--radius-lg)]' : '')}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="font-display text-2xl text-fg">{title}</h2>
              {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
            </div>
            {dismissible && <IconButton icon="x" label="Close" onClick={onClose} />}
          </div>
          <div className="overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 safe-bottom">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger, loading, requireText }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; requireText?: string;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!open) setTyped(''); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} disabled={Boolean(requireText) && typed !== requireText} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <div className="text-sm text-fg-2 leading-relaxed">{body}</div>
      {requireText && (
        <label className="mt-4 block text-sm text-fg-2">
          Type <strong className="text-fg">{requireText}</strong> to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-2 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 text-fg" />
        </label>
      )}
    </Dialog>
  );
}

/** Slide-over drawer (desktop) that becomes a bottom sheet on small screens. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-0 mt-auto h-auto max-h-[85dvh] w-full max-w-none bg-transparent p-0 text-fg md:ml-auto md:mt-0 md:h-[100dvh] md:max-h-none md:w-[440px]">
      {open && (
        <div className="flex h-full flex-col rounded-t-[var(--radius-xl)] border border-line bg-surface md:rounded-none md:border-y-0 md:border-r-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id={titleId} className="font-display text-2xl">{title}</h2>
            <IconButton icon="x" label="Close" onClick={onClose} />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin safe-bottom">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)} aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className={cx('pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-3 px-2 py-1 text-xs text-fg shadow transition-opacity', show ? 'opacity-100' : 'opacity-0')}>{label}</span>
    </span>
  );
}

/* ---------------- Toasts ---------------- */

interface ToastItem { id: number; message: string; tone: 'info' | 'success' | 'error' }
const ToastCtx = createContext<(message: string, tone?: ToastItem['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 flex flex-col items-center gap-2 px-4 md:bottom-6" style={{ zIndex: 'var(--z-toast)' as never }}>
          {items.map((t) => (
            <div key={t.id} className={cx('pointer-events-auto rise-in flex max-w-md items-center gap-2 rounded-full border px-4 py-2.5 text-sm shadow-[var(--shadow-lift)]',
              t.tone === 'error' ? 'bg-surface border-danger/50 text-fg' : t.tone === 'success' ? 'bg-surface border-success/50 text-fg' : 'bg-surface border-line-strong text-fg')}>
              <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} size={16} className={t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-success' : 'text-accent'} />
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------------- Tabs & segmented control ---------------- */

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = tabs.findIndex((t) => t.value === value);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (idx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" onKeyDown={onKey} className={cx('flex gap-1 overflow-x-auto border-b border-line scrollbar-thin', className)}>
      {tabs.map((t, i) => (
        <button key={t.value} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" aria-selected={t.value === value} tabIndex={t.value === value ? 0 : -1} onClick={() => onChange(t.value)}
          className={cx('relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors', t.value === value ? 'text-fg' : 'text-fg-3 hover:text-fg-2')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-xs text-fg-3">{t.count}</span>}
          {t.value === value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cx('rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors', o.value === value ? 'bg-accent text-accent-ink' : 'text-fg-2 hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
