import { useEffect, useId, useRef, useState } from 'react';
import { get } from '../lib/api';
import { Icon } from './ui/icons';
import { cx } from './ui/primitives';

export interface Place { id: string; name: string; country: string; countryCode: string; latitude: number; longitude: number; timezone: string; label: string }

/** Accessible combobox (ARIA 1.2 pattern) over the offline GeoNames index. */
export function PlaceSearch({ value, onChange, label = 'Place', placeholder = 'Start typing a city…', id: idProp, describedBy }: {
  value: Place | null; onChange: (p: Place | null) => void; label?: string; placeholder?: string; id?: string; describedBy?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-list`;
  const [q, setQ] = useState(value?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [attribution, setAttribution] = useState('');
  const abort = useRef<AbortController | null>(null);

  // Sync the text box only when the selected place changes, not while the user is typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(value?.label ?? ''); }, [value?.id]);

  useEffect(() => {
    if (q.trim().length < 2 || q === value?.label) { setResults([]); return; }
    const t = setTimeout(async () => {
      abort.current?.abort();
      abort.current = new AbortController();
      setLoading(true);
      try {
        const r = await get<{ results: Place[]; attribution: string }>(`places?q=${encodeURIComponent(q)}`);
        setResults(r.results);
        setAttribution(r.attribution);
        setOpen(true);
        setActive(0);
      } catch { /* network errors leave previous results */ }
      setLoading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [q, value?.label]);

  const choose = (p: Place) => { onChange(p); setQ(p.label); setOpen(false); };

  return (
    <div className="relative">
      <div className="relative">
        <Icon name="pin" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
        <input
          id={id} role="combobox" aria-expanded={open && results.length > 0} aria-controls={listId} aria-autocomplete="list" aria-label={label} aria-describedby={describedBy}
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          value={q} placeholder={placeholder} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); if (value) onChange(null); }}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
            if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
            if (e.key === 'Escape') setOpen(false);
          }}
          className="h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 pl-10 pr-3 text-fg placeholder:text-fg-3 focus:border-accent/70"
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-3">…</span>}
      </div>
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-[var(--radius-md)] border border-line-strong bg-surface p-1 shadow-[var(--shadow-lift)] scrollbar-thin">
          {results.map((p, i) => (
            <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setActive(i)}
              className={cx('cursor-pointer rounded-[var(--radius-sm)] px-3 py-2', i === active ? 'bg-surface-3' : '')}>
              <div className="text-sm text-fg">{p.name}<span className="text-fg-3">, {p.country}</span></div>
              <div className="text-xs text-fg-3 numeric">{p.latitude.toFixed(2)}°, {p.longitude.toFixed(2)}° · {p.timezone}</div>
            </li>
          ))}
          <li className="px-3 py-1.5 text-[10px] text-fg-3" aria-hidden="true">{attribution}</li>
        </ul>
      )}
      {value && (
        <p className="mt-1.5 text-xs text-fg-3 numeric">{value.latitude.toFixed(4)}°, {value.longitude.toFixed(4)}° · time zone {value.timezone}</p>
      )}
    </div>
  );
}
