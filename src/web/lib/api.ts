/** Typed fetch wrapper: same-origin cookies, CSRF header, normalised errors. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const m = /(?:^|;\s*)nk_csrf=([^;]+)/.exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : '';
}

let primed: Promise<void> | null = null;
async function ensureCsrf() {
  if (csrfToken()) return;
  // Cleared when done: a failed attempt (offline) or a later-removed cookie must be able to try again.
  primed ??= fetch('/api/v1/auth/csrf', { credentials: 'same-origin' }).then(() => undefined).finally(() => { primed = null; });
  await primed;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET');
  if (method !== 'GET') {
    try { await ensureCsrf(); } catch { throw new ApiError(0, 'network_error', 'We could not reach Nakshatra. Check your connection and try again.'); }
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken();
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path.startsWith('/') ? path : `/api/v1/${path}`, {
      method, headers, credentials: 'same-origin', signal: init.signal,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', 'We could not reach Nakshatra. Check your connection and try again.');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: { path: string; message: string }[] } })?.error;
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

export const get = <T = unknown>(path: string) => api<T>(path);
export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const patch = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });
export const upload = <T = unknown>(path: string, file: File, fields: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', file);
  return api<T>(path, { method: 'POST', form });
};

export function idempotencyKey(): string {
  return crypto.randomUUID();
}

/** Reports client-side errors without personal data. */
export function reportClientError(kind: string, message: string) {
  void api('client-errors', { method: 'POST', body: { kind, message: message.slice(0, 280), route: location.pathname.replace(/[0-9a-f-]{36}/g, ':id').replace(/\/(?=[\w-]*[\dA-Z_])[\w-]{16,}/g, '/:token').slice(0, 120) } }).catch(() => undefined);
}

const FIELD_LABELS: Record<string, string> = { interestedIn: 'Interested in', placeId: 'City', ageMin: 'Min age', ageMax: 'Max age', maxDistanceKm: 'Max distance', acknowledgeSafety: 'Safety guidelines' };

/** Turns a validation detail into a sentence that names the field, e.g. "Interested in: choose at least one." */
export function humanizeDetail(d: { path: string; message: string }): string {
  const key = d.path.split('.')[0];
  const label = FIELD_LABELS[key] ?? (key ? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()) : '');
  let msg = d.message;
  let m: RegExpExecArray | null;
  if (/expected array to have >=1 items/.test(msg)) msg = 'choose at least one';
  else if ((m = /expected string to have >=(\d+) characters/.exec(msg))) msg = `must be at least ${m[1]} characters`;
  else if ((m = /expected string to have <=(\d+) characters/.exec(msg))) msg = `must be at most ${m[1]} characters`;
  else if ((m = /expected number to be >=(\d+)/.exec(msg))) msg = `must be ${m[1]} or more`;
  else if ((m = /expected number to be <=(\d+)/.exec(msg))) msg = `must be ${m[1]} or less`;
  else if (/^Invalid input/.test(msg)) msg = 'is missing or invalid';
  return label ? `${label}: ${msg}.` : `${msg}.`;
}

export function describeApiError(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  return e.details?.length ? `${e.message} ${e.details.map(humanizeDetail).join(' ')}` : e.message;
}
