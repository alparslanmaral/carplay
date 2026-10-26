import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../core/settings';
import { clearAllCaches } from '../../core/cache';
import { deps, spotifyFetch, useSpotifyApiState, type SpotifyError } from './api';
import {
  base64Url,
  buildAuthorizeUrl,
  challengeFor,
  exportConnectionCode,
  generateVerifier,
  getAccessToken,
  handleRedirectCallback,
  importConnectionCode,
  logout,
  readToken,
  redirectUri,
  refreshToken,
  startLogin,
  useSpotifyAuth,
} from './auth';
import { SpotifyRemoteController, mapPlayback, pollIntervalMs } from './controller';
import { libraryContains, pickImage, trackFromApi, type ApiPlayback } from './endpoints';

type FetchArgs = [string, RequestInit?];
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers });

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (...args: FetchArgs) => handler(args[0], args[1]));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function seedToken(over: Partial<{ accessToken: string; refreshToken: string; expiresAt: number }> = {}) {
  localStorage.setItem(
    'dd.spotify.token',
    JSON.stringify({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresAt: Date.now() + 3_600_000,
      scope: 's',
      ...over,
    }),
  );
  useSpotifyAuth.getState().setFromToken(readToken());
}

beforeEach(() => {
  useSettings.getState().reset();
  useSettings.getState().set('spotifyClientId', 'CLIENT');
  clearAllCaches();
  useSpotifyApiState.setState({ blockedUntil: 0, lastStatus: null, lastAt: null });
  deps.sleep = vi.fn(async () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  logout();
});

describe('PKCE', () => {
  it('matches the RFC 7636 appendix B test vector', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
  it('generates verifiers of the right length from the allowed alphabet', () => {
    const v = generateVerifier();
    expect(v).toHaveLength(96);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(generateVerifier()).not.toBe(v);
  });
  it('base64url has no padding or unsafe characters', () => {
    expect(base64Url(new Uint8Array([251, 255, 254]))).toBe('-__-');
  });
  it('builds an authorize URL with S256, state, scopes and no secret', () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: 'C', redirect: 'http://127.0.0.1:5173/', challenge: 'CH', state: 'ST' }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('ST');
    expect(url.searchParams.get('scope')).toContain('user-modify-playback-state');
    expect(url.searchParams.has('client_secret')).toBe(false);
  });
  it('uses origin + path as the redirect URI', () => {
    expect(redirectUri()).toBe(location.origin + location.pathname);
  });
  it('startLogin stores the verifier/state and navigates to Spotify', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', {
      ...location,
      origin: 'http://127.0.0.1:5173',
      pathname: '/',
      set href(v: string) {
        assign(v);
      },
    });
    await startLogin();
    expect(assign.mock.calls[0]![0]).toContain('https://accounts.spotify.com/authorize');
    const stored = JSON.parse(localStorage.getItem('dd.spotify.pkce')!);
    expect(stored.verifier).toHaveLength(96);
    expect(assign.mock.calls[0]![0]).toContain(`state=${stored.state}`);
  });
});

describe('redirect callback', () => {
  it('exchanges the code with the stored verifier and stores tokens', async () => {
    localStorage.setItem(
      'dd.spotify.pkce',
      JSON.stringify({ verifier: 'V', state: 'S1', redirect: 'http://x/' }),
    );
    window.history.replaceState(null, '', '/?code=abc&state=S1');
    const f = mockFetch(() => json({ access_token: 'A', refresh_token: 'R', expires_in: 3600, scope: 'x' }));
    expect(await handleRedirectCallback()).toBe('connected');
    const body = new URLSearchParams(f.mock.calls[0]![1]!.body as URLSearchParams);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('V');
    expect(body.get('client_id')).toBe('CLIENT');
    expect(body.has('client_secret')).toBe(false);
    expect(readToken()?.refreshToken).toBe('R');
    expect(location.search).toBe('');
    expect(localStorage.getItem('dd.spotify.pkce')).toBeNull();
  });
  it('ignores a redirect whose state does not match', async () => {
    localStorage.setItem(
      'dd.spotify.pkce',
      JSON.stringify({ verifier: 'V', state: 'S1', redirect: 'http://x/' }),
    );
    window.history.replaceState(null, '', '/?code=abc&state=OTHER');
    const f = mockFetch(() => json({}));
    expect(await handleRedirectCallback()).toBe('none');
    expect(f).not.toHaveBeenCalled();
    window.history.replaceState(null, '', '/');
  });
  it('reports access_denied', async () => {
    localStorage.setItem(
      'dd.spotify.pkce',
      JSON.stringify({ verifier: 'V', state: 'S1', redirect: 'http://x/' }),
    );
    window.history.replaceState(null, '', '/?error=access_denied&state=S1');
    expect(await handleRedirectCallback()).toBe('error');
    expect(useSpotifyAuth.getState().error).toMatch(/denied/);
  });
});

describe('token refresh', () => {
  it('returns a still-valid token without a network call', async () => {
    seedToken();
    const f = mockFetch(() => json({}));
    expect(await getAccessToken()).toBe('AT');
    expect(f).not.toHaveBeenCalled();
  });
  it('refreshes inside the safety margin and keeps the old refresh token when none is returned', async () => {
    seedToken({ expiresAt: Date.now() + 10_000 });
    const f = mockFetch(() => json({ access_token: 'NEW', expires_in: 3600 }));
    expect(await getAccessToken()).toBe('NEW');
    expect(readToken()?.refreshToken).toBe('RT');
    expect(new URLSearchParams(f.mock.calls[0]![1]!.body as URLSearchParams).get('grant_type')).toBe(
      'refresh_token',
    );
  });
  it('is single-flight: concurrent refreshes share one request', async () => {
    seedToken({ expiresAt: 0 });
    const f = mockFetch(() => json({ access_token: 'NEW', expires_in: 3600 }));
    await Promise.all([refreshToken(), refreshToken(), getAccessToken()]);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('signs out when the refresh token is rejected', async () => {
    seedToken({ expiresAt: 0 });
    mockFetch(() => json({ error: 'invalid_grant' }, 400));
    await expect(refreshToken()).rejects.toThrow();
    expect(readToken()).toBeNull();
    expect(useSpotifyAuth.getState().connected).toBe(false);
  });
});

describe('connection code', () => {
  it('round-trips between Safari and the installed app', async () => {
    seedToken();
    const code = exportConnectionCode()!;
    expect(code.startsWith('dd1.')).toBe(true);
    expect(code).not.toContain('AT'); // access token never travels
    logout();
    mockFetch(() => json({ access_token: 'FRESH', refresh_token: 'RT', expires_in: 3600 }));
    await importConnectionCode(code);
    expect(readToken()?.accessToken).toBe('FRESH');
  });
  it('rejects garbage and codes from another Spotify app', async () => {
    await expect(importConnectionCode('nonsense')).rejects.toThrow(/connection code/);
    const other = `dd1.${btoa(JSON.stringify({ r: 'x', c: 'SOMEONE_ELSE' }))}`;
    await expect(importConnectionCode(other)).rejects.toThrow(/different Spotify app/);
  });
});

describe('API client', () => {
  it('sends the bearer token and resolves 204 to null', async () => {
    seedToken();
    const f = mockFetch(() => new Response(null, { status: 204 }));
    expect(await spotifyFetch('/me/player')).toBeNull();
    expect((f.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer AT');
  });
  it('encodes query params and skips undefined ones', async () => {
    seedToken();
    const f = mockFetch(() => json({}));
    await spotifyFetch('/me/player/seek', {
      method: 'PUT',
      query: { position_ms: 1000, device_id: undefined },
    });
    expect(f.mock.calls[0]![0]).toBe('https://api.spotify.com/v1/me/player/seek?position_ms=1000');
  });
  it('honours Retry-After on 429 and then succeeds', async () => {
    seedToken();
    let n = 0;
    mockFetch(() =>
      n++ === 0
        ? json({ error: { status: 429, message: 'slow down' } }, 429, { 'Retry-After': '2' })
        : json({ ok: true }),
    );
    const r = await spotifyFetch<{ ok: boolean }>('/me/player');
    expect(r).toEqual({ ok: true });
    expect(deps.sleep).toHaveBeenCalled();
    expect(vi.mocked(deps.sleep).mock.calls[0]![0]).toBeGreaterThan(0);
  });
  it('gives up with a RATE_LIMITED error when the wait is too long', async () => {
    seedToken();
    mockFetch(() => json({ error: { message: 'x' } }, 429, { 'Retry-After': '120' }));
    await expect(spotifyFetch('/me/player')).rejects.toMatchObject({
      status: 429,
      reason: 'RATE_LIMITED',
      retryAfter: 120,
    });
    // subsequent calls fail fast instead of hammering the API
    const f = mockFetch(() => json({}));
    await expect(spotifyFetch('/me/player')).rejects.toMatchObject({ reason: 'RATE_LIMITED' });
    expect(f).not.toHaveBeenCalled();
  });
  it('refreshes once on 401 and retries', async () => {
    seedToken();
    const f = mockFetch((url) => {
      if (url.includes('accounts.spotify.com')) return json({ access_token: 'NEW', expires_in: 3600 });
      const auth = (f.mock.calls.at(-1)![1]!.headers as Record<string, string>).Authorization;
      return auth === 'Bearer NEW'
        ? json({ ok: 1 })
        : json({ error: { status: 401, message: 'expired' } }, 401);
    });
    expect(await spotifyFetch('/me')).toEqual({ ok: 1 });
  });
  it('maps Premium and device errors', async () => {
    seedToken();
    mockFetch(() =>
      json({ error: { status: 403, message: 'Premium required', reason: 'PREMIUM_REQUIRED' } }, 403),
    );
    const e = (await spotifyFetch('/me/player/play', { method: 'PUT' }).catch((x) => x)) as SpotifyError;
    expect(e.premiumRequired).toBe(true);
    mockFetch(() =>
      json(
        {
          error: {
            status: 404,
            message: 'Player command failed: No active device found',
            reason: 'NO_ACTIVE_DEVICE',
          },
        },
        404,
      ),
    );
    const e2 = (await spotifyFetch('/me/player/play', { method: 'PUT' }).catch((x) => x)) as SpotifyError;
    expect(e2.noActiveDevice).toBe(true);
  });
});

describe('endpoint mapping', () => {
  it('maps tracks and episodes, picking an image near 300px', () => {
    const t = trackFromApi({
      id: 'abc',
      name: 'Song',
      uri: 'spotify:track:abc',
      duration_ms: 1000,
      artists: [{ name: 'A' }, { name: 'B' }],
      album: {
        name: 'Alb',
        images: [
          { url: 'big', width: 640 },
          { url: 'mid', width: 300 },
          { url: 'small', width: 64 },
        ],
      },
    });
    expect(t.artist).toBe('A, B');
    expect(t.artworkUrl).toBe('mid');
    expect(t.webUrl).toBe('https://open.spotify.com/track/abc');
    const ep = trackFromApi({
      id: 'e1',
      type: 'episode',
      name: 'Ep',
      uri: 'spotify:episode:e1',
      duration_ms: 5,
      show: { name: 'Show', publisher: 'Pub' },
    });
    expect(ep.artist).toBe('Pub');
    expect(ep.album).toBe('Show');
    expect(pickImage(undefined)).toBeUndefined();
    expect(pickImage([{ url: 'only' }])).toBe('only');
  });
  it('library contains falls back to the legacy route if the new one is unknown', async () => {
    seedToken();
    const f = mockFetch((url) =>
      url.includes('/me/library/') ? json({ error: { status: 404, message: 'nope' } }, 404) : json([true]),
    );
    expect(await libraryContains(['spotify:track:xyz'])).toEqual([true]);
    expect(f.mock.calls.at(-1)![0]).toContain('/me/tracks/contains?ids=xyz');
  });
});

describe('mapPlayback', () => {
  const base: ApiPlayback = {
    is_playing: true,
    progress_ms: 5000,
    shuffle_state: true,
    repeat_state: 'context',
    item: { id: 't', name: 'N', uri: 'spotify:track:t', duration_ms: 100_000, artists: [{ name: 'X' }] },
    device: {
      id: 'd',
      name: 'iPhone',
      type: 'Smartphone',
      is_active: true,
      volume_percent: 50,
      supports_volume: false,
    },
  };
  it('hides volume for devices that cannot set it (iPhone)', () => {
    const m = mapPlayback(base, 1);
    expect(m.caps?.volume).toBe(false);
    expect(m.volume).toBeNull();
    expect(m.playing).toBe(true);
    expect(m.durationMs).toBe(100_000);
    expect(m.deviceName).toBe('iPhone');
  });
  it('exposes volume when the device supports it', () => {
    const m = mapPlayback({ ...base, device: { ...base.device!, supports_volume: true } });
    expect(m.volume).toBe(50);
    expect(m.caps?.volume).toBe(true);
  });
});

describe('poll interval', () => {
  it('clamps to 1-5 seconds', () => {
    expect(pollIntervalMs(0)).toBe(1000);
    expect(pollIntervalMs(2)).toBe(2000);
    expect(pollIntervalMs(60)).toBe(5000);
  });
});

describe('SpotifyRemoteController', () => {
  it('never owns the media session', () => {
    expect(new SpotifyRemoteController().ownsMediaSession).toBe(false);
  });

  it('flags a missing client id vs a missing sign-in', async () => {
    useSettings.getState().set('spotifyClientId', '');
    const c = new SpotifyRemoteController();
    await c.activate();
    expect(c.state$.getState()).toMatchObject({ status: 'unauthorized', statusMessage: 'not-configured' });
    useSettings.getState().set('spotifyClientId', 'CLIENT');
    await c.activate();
    expect(c.state$.getState()).toMatchObject({ status: 'unauthorized', statusMessage: 'signed-out' });
    c.deactivate();
  });

  it('shows "Open Spotify" when there is no device, and transfers automatically when one appears', async () => {
    seedToken();
    const c = new SpotifyRemoteController();
    let devices: unknown[] = [];
    const f = mockFetch((url, init) => {
      if (url.endsWith('/me/player') && (init?.method ?? 'GET') === 'GET')
        return new Response(null, { status: 204 });
      if (url.endsWith('/me/player/devices')) return json({ devices });
      if (url.endsWith('/me/player') && init?.method === 'PUT') return new Response(null, { status: 204 });
      return json({});
    });
    await c.poll();
    expect(c.state$.getState()).toMatchObject({ status: 'needs-device', statusMessage: 'no-device' });

    devices = [{ id: 'dev1', name: 'My iPhone', type: 'Smartphone', is_active: false, volume_percent: 30 }];
    await c.poll();
    const transfer = f.mock.calls.find(([u, i]) => u.endsWith('/me/player') && i?.method === 'PUT');
    expect(transfer).toBeTruthy();
    expect(JSON.parse(transfer![1]!.body as string)).toEqual({ device_ids: ['dev1'], play: false });
    c.deactivate();
  });

  it('does not transfer when auto-transfer is off', async () => {
    seedToken();
    useSettings.getState().set('spotifyAutoTransfer', false);
    const c = new SpotifyRemoteController();
    const f = mockFetch((url) =>
      url.endsWith('/me/player/devices')
        ? json({
            devices: [{ id: 'd', name: 'Phone', type: 'Smartphone', is_active: false, volume_percent: 1 }],
          })
        : new Response(null, { status: 204 }),
    );
    await c.poll();
    expect(f.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false);
    expect(c.state$.getState()).toMatchObject({ status: 'needs-device', statusMessage: 'device-idle' });
  });

  it('turns a Premium-required 403 into a clear status and stops sending commands', async () => {
    seedToken();
    const c = new SpotifyRemoteController();
    const f = mockFetch(() =>
      json({ error: { status: 403, message: 'Premium required', reason: 'PREMIUM_REQUIRED' } }, 403),
    );
    await c.play();
    expect(c.state$.getState().status).toBe('premium-required');
    const calls = f.mock.calls.length;
    await c.next();
    expect(f.mock.calls.length).toBe(calls);
  });

  it('applies playback state, optimistic play/pause and reverts on failure', async () => {
    seedToken();
    const c = new SpotifyRemoteController();
    const playback: ApiPlayback = {
      is_playing: false,
      progress_ms: 1000,
      shuffle_state: false,
      repeat_state: 'off',
      item: { id: 't', name: 'N', uri: 'spotify:track:t', duration_ms: 100_000, artists: [{ name: 'X' }] },
      device: {
        id: 'd',
        name: 'iPhone',
        type: 'Smartphone',
        is_active: true,
        volume_percent: 10,
        supports_volume: false,
      },
    };
    mockFetch((url) =>
      url.endsWith('/me/player') || url.includes('additional_types') ? json(playback) : json([false]),
    );
    await c.poll();
    expect(c.state$.getState()).toMatchObject({ status: 'ready', playing: false });
    mockFetch(() => json({ error: { status: 500, message: 'boom' } }, 500));
    await c.play();
    expect(c.state$.getState().playing).toBe(false); // reverted
    expect(c.state$.getState().status).toBe('error');
    c.deactivate();
  });
});

describe('Spotify mode stays out of the audio path', () => {
  const dir = join(process.cwd(), 'src', 'services', 'spotify');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  it.each(files)('%s plays no audio and never touches navigator.mediaSession', (file) => {
    const text = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(text).not.toMatch(/new Audio\(|<audio|AudioContext|createElement\(['"]audio|HTMLMediaElement/);
    expect(text).not.toMatch(/mediaSession|setActionHandler/);
  });
});
