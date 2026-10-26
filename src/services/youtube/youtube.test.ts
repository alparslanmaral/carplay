import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDrivingForTests, useDriving } from '../../core/driving';
import { clearAllCaches } from '../../core/cache';
import { useSettings } from '../../core/settings';
import {
  YouTubeApiError,
  describeError,
  itemsToTracks,
  likedVideos,
  parseIsoDuration,
  parseYouTubeLink,
  searchVideos,
  ytFetch,
} from './api';
import { getAccessToken, hasValidToken, readToken, signOut, useYouTubeAuth } from './auth';
import { cursorLoader } from './paging';
import { PlayerState, type PlayerHandlers, type YTPlayer } from './player';
import type * as PlayerModule from './player';
import type { Track } from '../media/types';

// The real player loads Google's script; tests drive a fake instead.
let handlers: PlayerHandlers | null = null;
const fakePlayer = {
  loadVideoById: vi.fn(),
  cueVideoById: vi.fn(),
  playVideo: vi.fn(),
  pauseVideo: vi.fn(),
  stopVideo: vi.fn(),
  seekTo: vi.fn(),
  getCurrentTime: vi.fn(() => 12.5),
  getDuration: vi.fn(() => 200),
  getPlayerState: vi.fn(() => 1),
  setVolume: vi.fn(),
  getVolume: vi.fn(() => 100),
  destroy: vi.fn(),
} satisfies YTPlayer;

vi.mock('./player', async (orig) => {
  const actual = await orig<typeof PlayerModule>();
  return {
    ...actual,
    createPlayer: vi.fn(async (_el: HTMLElement, _o: unknown, h: PlayerHandlers) => {
      handlers = h;
      return fakePlayer;
    }),
  };
});

import {
  YouTubePlayerController,
  isYouTubeBlocked,
  shuffled,
  useYouTubeGate,
  useYouTubeSurface,
} from './controller';

const track = (n: number): Track => ({
  id: `vid${n}`,
  title: `Video ${n}`,
  artist: 'Chan',
  durationMs: 100_000,
});
const tracks = [1, 2, 3].map(track);

function setToken(over: Partial<{ accessToken: string; expiresAt: number }> = {}) {
  localStorage.setItem(
    'dd.youtube.token',
    JSON.stringify({ accessToken: 'TOK', expiresAt: Date.now() + 3_600_000, ...over }),
  );
  useYouTubeAuth.getState().set(readToken());
}

beforeEach(() => {
  useSettings.getState().reset();
  resetDrivingForTests();
  clearAllCaches();
  useYouTubeGate.setState({ blocked: false });
  useYouTubeSurface.setState({ visible: false });
  Object.values(fakePlayer).forEach((f) => 'mockClear' in f && f.mockClear());
  handlers = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  signOut();
});

describe('helpers', () => {
  it('parses ISO-8601 durations', () => {
    expect(parseIsoDuration('PT3M20S')).toBe(200_000);
    expect(parseIsoDuration('PT1H2M3S')).toBe(3_723_000);
    expect(parseIsoDuration('PT45S')).toBe(45_000);
    expect(parseIsoDuration('P0D')).toBe(0);
    expect(parseIsoDuration('garbage')).toBe(0);
    expect(parseIsoDuration(undefined)).toBe(0);
  });

  it('extracts ids from pasted links', () => {
    expect(parseYouTubeLink('https://www.youtube.com/playlist?list=PLabcdefghijklmn')).toEqual({
      playlistId: 'PLabcdefghijklmn',
    });
    expect(parseYouTubeLink('https://youtu.be/dQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ' });
    expect(parseYouTubeLink('youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ' });
    expect(parseYouTubeLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijklmn')).toEqual({
      playlistId: 'PLabcdefghijklmn',
      videoId: 'dQw4w9WgXcQ',
    });
    expect(parseYouTubeLink('PLabcdefghijklmn')).toEqual({ playlistId: 'PLabcdefghijklmn' });
    expect(parseYouTubeLink('dQw4w9WgXcQ')).toEqual({ videoId: 'dQw4w9WgXcQ' });
    expect(parseYouTubeLink('hello world')).toBeNull();
    expect(parseYouTubeLink('')).toBeNull();
  });

  it('drops private and deleted videos from playlists', () => {
    const out = itemsToTracks([
      {
        snippet: { title: 'Good', channelTitle: 'C', resourceId: { videoId: 'a' } },
        contentDetails: { videoId: 'a' },
      },
      { snippet: { title: 'Private video', resourceId: { videoId: 'b' } } },
      { snippet: { title: 'Deleted video', resourceId: { videoId: 'c' } } },
      { snippet: { title: 'No id' } },
    ]);
    expect(out.map((t) => t.id)).toEqual(['a']);
    expect(out[0]!.artworkUrl).toBe('https://i.ytimg.com/vi/a/hqdefault.jpg');
    expect(out[0]!.webUrl).toBe('https://www.youtube.com/watch?v=a');
  });

  it('shuffles without losing items', () => {
    const out = shuffled([1, 2, 3, 4, 5], () => 0.3);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled([], Math.random)).toEqual([]);
  });

  it('cursorLoader maps offsets to page tokens and skips empty pages', async () => {
    const pages: Record<string, { items: number[]; next: string | null }> = {
      '': { items: [1, 2], next: 'p2' },
      p2: { items: [], next: 'p3' },
      p3: { items: [3], next: null },
    };
    const fetchPage = vi.fn(async (token: string) => ({ ...pages[token]!, total: 0 }));
    const load = cursorLoader(fetchPage);
    const first = await load(0);
    expect(first).toEqual({ items: [1, 2], total: 3 });
    const second = await load(2);
    expect(second).toEqual({ items: [3], total: 3 });
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual(['', 'p2', 'p3']);
  });
});

describe('auth state', () => {
  it('treats tokens inside the refresh margin as expired', () => {
    expect(hasValidToken()).toBe(false);
    setToken();
    expect(hasValidToken()).toBe(true);
    setToken({ expiresAt: Date.now() + 10_000 });
    expect(hasValidToken()).toBe(false);
  });
  it('returns a valid stored token without any network call and null when signed out', async () => {
    expect(await getAccessToken()).toBeNull();
    setToken();
    expect(await getAccessToken()).toBe('TOK');
  });
});

describe('Data API client', () => {
  it('uses the bearer token when signed in and the API key otherwise', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', f);
    setToken();
    await ytFetch('search', { part: 'snippet' });
    expect((f.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer TOK');
    expect(f.mock.calls[0]![0]).not.toContain('key=');
    signOut();
    useSettings.getState().set('youtubeApiKey', 'APIKEY');
    await ytFetch('search', { part: 'snippet' });
    expect(f.mock.calls[1]![0]).toContain('key=APIKEY');
    expect(f.mock.calls[1]![1]).toBeUndefined();
  });

  it('refuses to call without credentials', async () => {
    await expect(ytFetch('search', {})).rejects.toMatchObject({ reason: 'noCredentials' });
  });

  it('explains quota errors', async () => {
    useSettings.getState().set('youtubeApiKey', 'K');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'x', errors: [{ reason: 'quotaExceeded' }] } }), {
            status: 403,
          }),
      ),
    );
    const err = (await ytFetch('search', {}).catch((e) => e)) as YouTubeApiError;
    expect(err).toBeInstanceOf(YouTubeApiError);
    expect(err.quotaExceeded).toBe(true);
    expect(describeError(err)).toMatch(/quota/i);
  });

  it('caches searches so repeated queries cost no quota', async () => {
    useSettings.getState().set('youtubeApiKey', 'K');
    const f = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/search')
              ? { items: [{ id: { videoId: 'v1' }, snippet: { title: 'T', channelTitle: 'C' } }] }
              : { items: [{ id: 'v1', contentDetails: { duration: 'PT1M' } }] },
          ),
        ),
    );
    vi.stubGlobal('fetch', f);
    const a = await searchVideos('Lo-Fi  ');
    expect(a.items[0]).toMatchObject({ id: 'v1', durationMs: 60_000 });
    const calls = f.mock.calls.length;
    await searchVideos('lo-fi'); // same normalised query
    expect(f.mock.calls.length).toBe(calls);
  });

  it('liked videos fall back to videos?myRating=like when the LL playlist is refused', async () => {
    setToken();
    const f = vi.fn(async (url: string) => {
      if (url.includes('/playlistItems'))
        return new Response(
          JSON.stringify({ error: { message: 'no', errors: [{ reason: 'playlistNotFound' }] } }),
          { status: 404 },
        );
      return new Response(
        JSON.stringify({
          items: [
            { id: 'z', snippet: { title: 'Liked', channelTitle: 'C' }, contentDetails: { duration: 'PT2M' } },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', f);
    const r = await likedVideos();
    expect(r.items[0]).toMatchObject({ id: 'z', durationMs: 120_000 });
    expect(f.mock.calls.some(([u]) => String(u).includes('myRating=like'))).toBe(true);
  });
});

describe('parked-only gate', () => {
  it('blocks only while moving, unless allowed or a confirmed passenger', () => {
    const base = { policy: 'blocked' as const, moving: true, passenger: false, passengerAllowed: true };
    expect(isYouTubeBlocked(base)).toBe(true);
    expect(isYouTubeBlocked({ ...base, moving: false })).toBe(false);
    expect(isYouTubeBlocked({ ...base, passenger: true })).toBe(false);
    expect(isYouTubeBlocked({ ...base, passenger: true, passengerAllowed: false })).toBe(true);
    expect(isYouTubeBlocked({ ...base, policy: 'allowed' })).toBe(false);
  });
});

describe('YouTubePlayerController', () => {
  async function ready() {
    const c = new YouTubePlayerController();
    c.setContainer(document.createElement('div'));
    await c.activate();
    return c;
  }

  it('owns the media session (it plays the audio itself)', () => {
    expect(new YouTubePlayerController().ownsMediaSession).toBe(true);
  });

  it('plays a queue and exposes the next videos', async () => {
    const c = await ready();
    await c.playQueue(tracks, 0);
    expect(fakePlayer.loadVideoById).toHaveBeenCalledWith('vid1');
    expect(c.state$.getState().track?.id).toBe('vid1');
    expect(c.state$.getState().queue.map((t) => t.id)).toEqual(['vid2', 'vid3']);
    expect(useYouTubeSurface.getState().visible).toBe(true);
    handlers!.onState(PlayerState.Playing);
    expect(c.state$.getState().playing).toBe(true);
    c.deactivate();
  });

  it('advances on end when autoplay-next is on, and stops at the end of the list', async () => {
    const c = await ready();
    await c.playQueue(tracks, 1);
    handlers!.onState(PlayerState.Ended);
    await vi.waitFor(() => expect(c.state$.getState().track?.id).toBe('vid3'));
    handlers!.onState(PlayerState.Ended);
    await Promise.resolve();
    expect(c.state$.getState().track?.id).toBe('vid3');
    expect(c.state$.getState().playing).toBe(false);
    c.deactivate();
  });

  it('loops the list with repeat=context and restarts a track with repeat=track', async () => {
    const c = await ready();
    await c.playQueue(tracks, 2);
    await c.setRepeat('context');
    handlers!.onState(PlayerState.Ended);
    await vi.waitFor(() => expect(c.state$.getState().track?.id).toBe('vid1'));
    await c.setRepeat('track');
    handlers!.onState(PlayerState.Ended);
    expect(fakePlayer.seekTo).toHaveBeenCalledWith(0, true);
    c.deactivate();
  });

  it('does not auto-advance when the setting is off', async () => {
    useSettings.getState().set('ytAutoplayNext', false);
    const c = await ready();
    await c.playQueue(tracks, 0);
    handlers!.onState(PlayerState.Ended);
    await Promise.resolve();
    expect(c.state$.getState().track?.id).toBe('vid1');
    c.deactivate();
  });

  it('skips videos that fail to play', async () => {
    const c = await ready();
    await c.playQueue(tracks, 0);
    handlers!.onError(101);
    await vi.waitFor(() => expect(c.state$.getState().track?.id).toBe('vid2'));
    c.deactivate();
  });

  it('shuffle keeps the current video first and can be undone', async () => {
    const c = await ready();
    await c.playQueue(tracks, 1);
    await c.setShuffle(true);
    expect(c.state$.getState().track?.id).toBe('vid2');
    expect(c.state$.getState().queue).toHaveLength(2);
    await c.setShuffle(false);
    expect(c.state$.getState().queue.map((t) => t.id)).toEqual(['vid3']);
    c.deactivate();
  });

  it('pauses and refuses to play while moving, and resumes allowed once a passenger confirms', async () => {
    const c = await ready();
    await c.playQueue(tracks, 0);
    handlers!.onState(PlayerState.Playing);
    useDriving.getState()._setMoving(true);
    expect(useYouTubeGate.getState().blocked).toBe(true);
    expect(fakePlayer.pauseVideo).toHaveBeenCalled();
    expect(c.state$.getState().playing).toBe(false);

    fakePlayer.playVideo.mockClear();
    await c.play();
    expect(fakePlayer.playVideo).not.toHaveBeenCalled();
    expect(c.state$.getState().statusMessage).toBe('parked-only');

    useDriving.getState().setPassenger(true);
    expect(useYouTubeGate.getState().blocked).toBe(false);
    await c.play();
    expect(fakePlayer.playVideo).toHaveBeenCalled();
    c.deactivate();
  });

  it('cues instead of auto-playing a new video while blocked', async () => {
    const c = await ready();
    useDriving.getState()._setMoving(true);
    await c.playQueue(tracks, 0);
    expect(fakePlayer.cueVideoById).toHaveBeenCalledWith('vid1');
    expect(fakePlayer.loadVideoById).not.toHaveBeenCalled();
    c.deactivate();
  });

  it('plays freely while moving when the policy is "allowed"', async () => {
    useSettings.getState().set('ytWhileMoving', 'allowed');
    const c = await ready();
    useDriving.getState()._setMoving(true);
    await c.playQueue(tracks, 0);
    expect(fakePlayer.loadVideoById).toHaveBeenCalledWith('vid1');
    c.deactivate();
  });

  it('close() clears the queue and hides the surface', async () => {
    const c = await ready();
    await c.playQueue(tracks, 0);
    await c.close();
    expect(c.state$.getState().track).toBeNull();
    expect(useYouTubeSurface.getState().visible).toBe(false);
    expect(fakePlayer.destroy).toHaveBeenCalled();
    c.deactivate();
  });
});
