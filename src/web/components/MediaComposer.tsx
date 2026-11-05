import { useEffect, useRef, useState } from 'react';
import { upload } from '../lib/api';
import { Button, cx } from './ui/primitives';
import { Icon } from './ui/icons';

/** Photo picker for Thought Drops: one photo, or a 2–4 photo carousel. Uploads as each file is chosen. */
export function PhotoPicker({ urls, onChange }: { urls: string[]; onChange: (urls: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(null);
    const next = [...urls];
    for (const f of [...files].slice(0, 4 - urls.length)) {
      try { next.push((await upload<{ url: string }>('posts/image', f)).url); } catch (e) { setError((e as Error).message); }
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Chosen photos">
          {urls.map((u, i) => (
            <li key={u} className="relative overflow-hidden rounded-[var(--radius-sm)] border border-line">
              <img src={u} alt={`Photo ${i + 1}`} className="aspect-square w-full object-cover" />
              <button type="button" onClick={() => onChange(urls.filter((x) => x !== u))} className="absolute right-1 top-1 rounded-full bg-canvas/80 px-2 text-xs text-fg" aria-label={`Remove photo ${i + 1}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {urls.length < 4 && (
        <label className={cx('inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-dashed border-line px-4 text-sm text-fg-2 hover:border-line-strong', busy && 'opacity-60')}>
          <Icon name="plus" size={16} />{busy ? 'Uploading…' : urls.length ? 'Add another photo' : 'Choose photos (up to 4)'}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={busy} onChange={(e) => void add(e.target.files)} />
        </label>
      )}
      <p className="text-xs text-fg-3">PNG, JPEG or WebP. Photos are visible to whoever can see the post.</p>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

const MAX_SECONDS = 60;
function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported?.(m));
}

/**
 * Voice note recorder (≤ 60 s). Records in the browser, lets you listen back, then uploads.
 * Nothing leaves the device until you choose "Use this recording".
 */
export function VoiceRecorder({ value, onChange }: { value: { url: string; seconds: number } | null; onChange: (v: { url: string; seconds: number } | null) => void }) {
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const started = useRef(0);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const stop = () => { if (rec.current?.state === 'recording') rec.current.stop(); };
  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) window.clearInterval(timer.current);
        const b = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
        setBlob(b); setPreview(URL.createObjectURL(b)); setState('review');
        setSeconds(Math.max(1, Math.min(MAX_SECONDS, Math.round((Date.now() - started.current) / 1000))));
      };
      rec.current = r;
      started.current = Date.now();
      r.start(250);
      setState('recording'); setSeconds(0);
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - started.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      setError('Microphone access was blocked or is not available. You can allow it in your browser settings.');
      setState('idle');
    }
  };
  const use = async () => {
    if (!blob) return;
    setState('uploading'); setError(null);
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      const r = await upload<{ url: string }>('posts/audio', new File([blob], `voice.${ext}`, { type: blob.type }));
      onChange({ url: r.url, seconds });
      setState('idle');
    } catch (e) { setError((e as Error).message); setState('review'); }
  };
  const discard = () => { if (preview) URL.revokeObjectURL(preview); setPreview(null); setBlob(null); setState('idle'); onChange(null); };

  if (!supported) return <p className="text-sm text-fg-3">Voice notes need a browser that can record audio. Try a recent Chrome, Edge, Firefox or Safari.</p>;
  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <audio controls src={value.url} className="h-10 max-w-full" aria-label="Your voice note" />
        <span className="text-xs text-fg-3 numeric">{value.seconds}s</span>
        <Button size="sm" variant="ghost" onClick={discard}>Record again</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {state === 'idle' && <Button variant="secondary" onClick={() => void start()}><Icon name="mic" size={16} />Record a voice note</Button>}
      {state === 'recording' && (
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger motion-reduce:animate-none" aria-hidden="true" />
          <span className="text-sm text-fg numeric">Recording… {seconds}s / {MAX_SECONDS}s</span>
          <Button size="sm" onClick={stop}>Stop</Button>
        </div>
      )}
      {(state === 'review' || state === 'uploading') && preview && (
        <div className="flex flex-wrap items-center gap-3">
          <audio controls src={preview} className="h-10 max-w-full" aria-label="Listen back" />
          <Button size="sm" loading={state === 'uploading'} onClick={() => void use()}>Use this recording</Button>
          <Button size="sm" variant="ghost" onClick={discard}>Discard</Button>
        </div>
      )}
      <p className="text-xs text-fg-3">Up to {MAX_SECONDS} seconds. You can listen back before anything is uploaded.</p>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** Carousel display for a Thought Drop's photos (scroll-snap; keyboard-scrollable). */
export function PhotoCarousel({ urls, label }: { urls: string[]; label: string }) {
  return (
    <div className="mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-[var(--radius)] scrollbar-thin" tabIndex={0} role="region" aria-label={`${label}: ${urls.length} photos`}>
      {urls.map((u, i) => <img key={u} src={u} alt={`Photo ${i + 1} of ${urls.length}`} loading="lazy" className="aspect-square w-[85%] shrink-0 snap-center rounded-[var(--radius)] object-cover sm:w-[60%]" />)}
    </div>
  );
}
