import { create } from 'zustand';
import { getSettings } from '../../core/settings';
import { log } from '../../core/logger';
import { clearAllCaches } from '../../core/cache';

/**
 * Google Identity Services "token model": an in-browser OAuth popup that returns a short-lived (about 1 hour)
 * access token. There is no refresh token in this flow, so an expired token is renewed with a silent request
 * (prompt: '') and only falls back to the consent popup when the user taps Sign in again.
 */

export const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const TOKEN_KEY = 'dd.youtube.token';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const REFRESH_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
  scope?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface GoogleOAuth {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

export interface YouTubeToken {
  accessToken: string;
  /** epoch ms */
  expiresAt: number;
}

interface AuthState {
  connected: boolean;
  expiresAt: number | null;
  error: string | null;
  set: (t: YouTubeToken | null) => void;
  setError: (e: string | null) => void;
}

export const useYouTubeAuth = create<AuthState>((set) => ({
  connected: false,
  expiresAt: null,
  error: null,
  set: (t) => set({ connected: !!t, expiresAt: t?.expiresAt ?? null }),
  setError: (error) => set({ error }),
}));

export function clientId(): string {
  return (
    getSettings().googleClientId ||
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
    ''
  ).trim();
}
export const isConfigured = () => clientId() !== '';

export function readToken(): YouTubeToken | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as YouTubeToken | null;
    return t?.accessToken ? t : null;
  } catch {
    return null;
  }
}

function writeToken(t: YouTubeToken | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    log.warn('youtube', 'could not persist token');
  }
  useYouTubeAuth.getState().set(t);
}

/** True when the stored token is still usable (not within the refresh margin of expiry). */
export function hasValidToken(now = Date.now()): boolean {
  const t = readToken();
  return !!t && t.expiresAt - now > REFRESH_MARGIN_MS;
}

export function initYouTubeAuthState(): void {
  // An expired token still counts as "signed in": getAccessToken() renews it silently on first use.
  useYouTubeAuth.getState().set(readToken());
}

let gisLoading: Promise<GoogleOAuth> | null = null;

function loadGis(): Promise<GoogleOAuth> {
  const w = window as unknown as { google?: GoogleOAuth };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  gisLoading ??= new Promise<GoogleOAuth>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () =>
      w.google?.accounts?.oauth2 ? resolve(w.google) : reject(new Error('Google sign-in did not load'));
    s.onerror = () => reject(new Error('Could not load Google sign-in (offline or blocked)'));
    document.head.appendChild(s);
  }).catch((e) => {
    gisLoading = null;
    throw e;
  });
  return gisLoading;
}

export class YouTubeAuthError extends Error {
  constructor(
    message: string,
    readonly kind: 'not-configured' | 'popup' | 'denied' | 'network' | 'needs-signin',
  ) {
    super(message);
    this.name = 'YouTubeAuthError';
  }
}

async function request(prompt: '' | 'consent'): Promise<YouTubeToken> {
  const id = clientId();
  if (!id) throw new YouTubeAuthError('Google Client ID is not configured', 'not-configured');
  let google: GoogleOAuth;
  try {
    google = await loadGis();
  } catch (e) {
    throw new YouTubeAuthError(e instanceof Error ? e.message : 'Google sign-in unavailable', 'network');
  }
  return new Promise<YouTubeToken>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: YT_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          const kind = prompt === '' ? 'needs-signin' : 'denied';
          return reject(new YouTubeAuthError(r.error_description ?? r.error ?? 'Sign-in failed', kind));
        }
        resolve({ accessToken: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 });
      },
      error_callback: (e) => {
        // popup_failed_to_open / popup_closed: common inside iOS home-screen apps
        const kind = e.type === 'popup_failed_to_open' ? 'popup' : prompt === '' ? 'needs-signin' : 'denied';
        reject(new YouTubeAuthError(e.message ?? e.type, kind));
      },
    });
    client.requestAccessToken({ prompt });
  });
}

/** Interactive sign-in. Must be called from a tap (popup blockers). */
export async function signIn(): Promise<void> {
  try {
    const t = await request('consent');
    writeToken(t);
    useYouTubeAuth.getState().setError(null);
  } catch (e) {
    useYouTubeAuth.getState().setError(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

let renewing: Promise<YouTubeToken> | null = null;

/** A usable access token or null when signed out. Renews silently once the old one is about to expire. */
export async function getAccessToken(): Promise<string | null> {
  const t = readToken();
  if (!t) return null;
  if (t.expiresAt - Date.now() > REFRESH_MARGIN_MS) return t.accessToken;
  renewing ??= request('')
    .then((n) => {
      writeToken(n);
      return n;
    })
    .finally(() => {
      renewing = null;
    });
  try {
    return (await renewing).accessToken;
  } catch (e) {
    log.warn('youtube', 'silent token renewal failed', e);
    writeToken(null);
    return null;
  }
}

export function signOut(): void {
  const t = readToken();
  const w = window as unknown as { google?: GoogleOAuth };
  if (t) {
    try {
      w.google?.accounts.oauth2.revoke(t.accessToken);
    } catch {
      /* revoking is best effort */
    }
  }
  writeToken(null);
  clearAllCaches();
}
