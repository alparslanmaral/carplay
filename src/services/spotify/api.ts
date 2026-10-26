import { create } from 'zustand';
import { log } from '../../core/logger';
import { getAccessToken, refreshToken } from './auth';

const BASE = 'https://api.spotify.com/v1';
const MAX_RETRIES = 2;
/** Never sleep longer than this inline; longer limits are surfaced as `rate-limited` instead. */
const MAX_INLINE_WAIT_S = 20;

export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
  get premiumRequired(): boolean {
    return this.status === 403 && this.reason === 'PREMIUM_REQUIRED';
  }
  get noActiveDevice(): boolean {
    return (
      this.status === 404 && (this.reason === 'NO_ACTIVE_DEVICE' || /no active device/i.test(this.message))
    );
  }
}

interface RateState {
  /** epoch ms until which no request should be sent (from Retry-After) */
  blockedUntil: number;
  lastStatus: number | null;
  lastAt: number | null;
}

export const useSpotifyApiState = create<RateState>(() => ({
  blockedUntil: 0,
  lastStatus: null,
  lastAt: null,
}));

/** Swappable for tests. */
export const deps = {
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

export function isRateLimited(): boolean {
  return useSpotifyApiState.getState().blockedUntil > deps.now();
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  if (!query) return url;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `${url}${url.includes('?') ? '&' : '?'}${s}` : url;
}

async function errorFrom(res: Response): Promise<SpotifyError> {
  let message = res.statusText;
  let reason: string | undefined;
  try {
    const j = (await res.json()) as {
      error?: { message?: string; reason?: string; status?: number } | string;
    };
    if (typeof j.error === 'object' && j.error) {
      message = j.error.message ?? message;
      reason = j.error.reason;
    } else if (typeof j.error === 'string') message = j.error;
  } catch {
    /* empty or non-JSON body */
  }
  const retryAfter = Number(res.headers.get('Retry-After'));
  return new SpotifyError(
    message || `HTTP ${res.status}`,
    res.status,
    reason,
    Number.isFinite(retryAfter) ? retryAfter : undefined,
  );
}

/**
 * Spotify Web API call with bearer auth.
 * - 401: refresh the token once and retry.
 * - 429: honour Retry-After (short waits inline, up to MAX_RETRIES; long ones throw so the UI can say so).
 * - 204/202 and empty bodies resolve to null.
 */
export async function spotifyFetch<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T | null> {
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const wait = useSpotifyApiState.getState().blockedUntil - deps.now();
    if (wait > 0) {
      if (wait > MAX_INLINE_WAIT_S * 1000)
        throw new SpotifyError('Rate limited', 429, 'RATE_LIMITED', Math.ceil(wait / 1000));
      await deps.sleep(wait);
    }
    const token = await getAccessToken();
    const res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    useSpotifyApiState.setState({ lastStatus: res.status, lastAt: deps.now() });

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await refreshToken();
      continue;
    }
    if (res.status === 429) {
      const err = await errorFrom(res);
      const seconds = Math.max(1, err.retryAfter ?? 1);
      useSpotifyApiState.setState({ blockedUntil: deps.now() + seconds * 1000 });
      log.warn('spotify', `429, retry after ${seconds}s`);
      if (attempt >= MAX_RETRIES || seconds > MAX_INLINE_WAIT_S) {
        throw new SpotifyError('Rate limited', 429, 'RATE_LIMITED', seconds);
      }
      continue;
    }
    if (!res.ok) throw await errorFrom(res);
    if (res.status === 204 || res.status === 202) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  }
}
