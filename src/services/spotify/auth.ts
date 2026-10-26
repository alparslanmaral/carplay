import { create } from 'zustand';
import { getSettings } from '../../core/settings';
import { log } from '../../core/logger';
import { clearAllCaches } from '../../core/cache';
import { markHandoff } from '../../core/startRoute';

/**
 * Spotify Authorization Code + PKCE (no client secret anywhere). Tokens live in localStorage.
 * iOS keeps Safari and the home-screen app in separate storage, so a sign-in done in Safari can be moved to the
 * installed app with a "connection code" (export/import below).
 */

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
];

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const TOKEN_KEY = 'dd.spotify.token';
const VERIFIER_KEY = 'dd.spotify.pkce';
/** Refresh this long before the access token actually expires. */
export const REFRESH_MARGIN_MS = 60_000;

export interface SpotifyToken {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  scope: string;
}

interface AuthState {
  connected: boolean;
  expiresAt: number | null;
  error: string | null;
  setFromToken: (t: SpotifyToken | null) => void;
  setError: (e: string | null) => void;
}

export const useSpotifyAuth = create<AuthState>((set) => ({
  connected: false,
  expiresAt: null,
  error: null,
  setFromToken: (t) => set({ connected: !!t, expiresAt: t?.expiresAt ?? null }),
  setError: (error) => set({ error }),
}));

/* ---------- PKCE helpers (pure, tested) ---------- */

const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function generateVerifier(length = 96, rand: (n: number) => Uint8Array = randomBytes): string {
  const bytes = rand(length);
  let out = '';
  for (let i = 0; i < length; i++) out += VERIFIER_CHARS[bytes[i]! % VERIFIER_CHARS.length];
  return out;
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(digest);
}

/** Spotify requires the redirect URI to match a registered one exactly. */
export function redirectUri(): string {
  return location.origin + location.pathname;
}

export function clientId(): string {
  return (
    getSettings().spotifyClientId ||
    (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ||
    ''
  ).trim();
}

export function isConfigured(): boolean {
  return clientId() !== '';
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirect: string;
  challenge: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: opts.clientId,
    response_type: 'code',
    redirect_uri: opts.redirect,
    code_challenge_method: 'S256',
    code_challenge: opts.challenge,
    state: opts.state,
    scope: SPOTIFY_SCOPES.join(' '),
  });
  return `${AUTH_URL}?${q.toString()}`;
}

/* ---------- token storage ---------- */

export function readToken(): SpotifyToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as SpotifyToken;
    // An imported connection code has no access token yet; the refresh token is what proves a sign-in.
    return t.refreshToken ? t : null;
  } catch {
    return null;
  }
}

function writeToken(t: SpotifyToken | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    log.warn('spotify', 'could not persist token');
  }
  useSpotifyAuth.getState().setFromToken(t);
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

function tokenFromResponse(r: TokenResponse, previous?: SpotifyToken | null): SpotifyToken {
  return {
    accessToken: r.access_token,
    // Refresh responses may omit a new refresh token: keep the old one.
    refreshToken: r.refresh_token ?? previous?.refreshToken ?? '',
    expiresAt: Date.now() + r.expires_in * 1000,
    scope: r.scope ?? previous?.scope ?? '',
  };
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: string; error_description?: string };
      detail = j.error_description ?? j.error ?? '';
    } catch {
      /* not json */
    }
    throw new Error(`Spotify token request failed (${res.status}) ${detail}`.trim());
  }
  return (await res.json()) as TokenResponse;
}

/* ---------- flows ---------- */

export async function startLogin(): Promise<void> {
  const id = clientId();
  if (!id) throw new Error('Spotify Client ID is not configured');
  const verifier = generateVerifier();
  const state = base64Url(randomBytes(16));
  try {
    localStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, state, redirect: redirectUri() }));
  } catch {
    throw new Error('Storage is unavailable, cannot sign in');
  }
  markHandoff();
  location.href = buildAuthorizeUrl({
    clientId: id,
    redirect: redirectUri(),
    challenge: await challengeFor(verifier),
    state,
  });
}

/** Call once at boot: completes the redirect (?code=&state=) and cleans the URL. */
export async function handleRedirectCallback(): Promise<'none' | 'connected' | 'error'> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  const state = params.get('state');
  if (!code && !error) return 'none';
  let stored: { verifier: string; state: string; redirect: string } | null;
  try {
    stored = JSON.parse(localStorage.getItem(VERIFIER_KEY) ?? 'null');
  } catch {
    stored = null;
  }
  // Only react to redirects this app started (state matches); ignore anything else in the URL.
  if (!stored || (state && stored.state !== state)) return 'none';
  const clean = () => history.replaceState(null, '', location.pathname);
  try {
    if (error)
      throw new Error(error === 'access_denied' ? 'Spotify access was denied' : `Spotify error: ${error}`);
    const res = await postToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: stored.redirect,
        client_id: clientId(),
        code_verifier: stored.verifier,
      }),
    );
    writeToken(tokenFromResponse(res));
    useSpotifyAuth.getState().setError(null);
    return 'connected';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn('spotify', message);
    useSpotifyAuth.getState().setError(message);
    return 'error';
  } finally {
    localStorage.removeItem(VERIFIER_KEY);
    clean();
  }
}

let refreshing: Promise<SpotifyToken> | null = null;

/** Refresh the access token. Concurrent callers share one request (single-flight). */
export function refreshToken(): Promise<SpotifyToken> {
  refreshing ??= (async () => {
    const current = readToken();
    if (!current?.refreshToken) throw new Error('Not signed in to Spotify');
    try {
      const res = await postToken(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: current.refreshToken,
          client_id: clientId(),
        }),
      );
      const next = tokenFromResponse(res, current);
      writeToken(next);
      return next;
    } catch (e) {
      // A rejected refresh token (revoked / expired) means the user has to sign in again.
      if (e instanceof Error && /\(400\)|\(401\)/.test(e.message)) logout();
      throw e;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** A valid access token, refreshing first when it is about to expire. */
export async function getAccessToken(): Promise<string> {
  const t = readToken();
  if (!t) throw new Error('Not signed in to Spotify');
  if (t.expiresAt - Date.now() > REFRESH_MARGIN_MS) return t.accessToken;
  return (await refreshToken()).accessToken;
}

export function logout(): void {
  writeToken(null);
  clearAllCaches();
}

export function initSpotifyAuthState(): void {
  useSpotifyAuth.getState().setFromToken(readToken());
}

/* ---------- connection code (Safari -> installed app) ---------- */

export function exportConnectionCode(): string | null {
  const t = readToken();
  if (!t) return null;
  return `dd1.${btoa(JSON.stringify({ r: t.refreshToken, s: t.scope, c: clientId() }))}`;
}

/** Only the refresh token travels; the app mints its own access token from it. */
export async function importConnectionCode(code: string): Promise<void> {
  const m = /^dd1\.([A-Za-z0-9+/=]+)$/.exec(code.trim());
  if (!m) throw new Error('That is not a DriveDeck connection code');
  const data = JSON.parse(atob(m[1]!)) as { r?: string; s?: string; c?: string };
  if (!data.r) throw new Error('The connection code is incomplete');
  if (data.c && clientId() && data.c !== clientId())
    throw new Error('The code was made with a different Spotify app');
  writeToken({ accessToken: '', refreshToken: data.r, expiresAt: 0, scope: data.s ?? '' });
  await refreshToken();
}
