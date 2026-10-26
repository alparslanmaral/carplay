import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { useSettings } from '../../core/settings';
import { idleState, type MediaController, type MediaState } from '../media/types';
import {
  _setSessionForTests,
  attachMediaSession,
  buildMetadata,
  mediaSessionDiagnostics,
  releaseMediaSession,
  syncMediaSession,
  type MediaSessionLike,
} from './index';

class FakeMetadata {
  constructor(public init: MediaMetadataInit) {}
  get title() {
    return this.init.title;
  }
}

function fakeSession() {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const session = {
    metadata: null as MediaMetadata | null,
    playbackState: 'none' as MediaSessionPlaybackState,
    setActionHandler: vi.fn(
      (action: string, h: MediaSessionActionHandler | null) => void handlers.set(action, h),
    ),
    setPositionState: vi.fn(),
  };
  return { session: session as unknown as MediaSessionLike & typeof session, handlers };
}

function fakeController(id: 'youtube' | 'spotify', owns: boolean) {
  const state$ = createStore<MediaState>(() => ({
    ...idleState(id),
    status: 'ready',
    caps: { seek: true, volume: false, shuffle: false, repeat: false, like: false, queue: false },
    track: { id: 't1', title: 'Song', artist: 'Artist', durationMs: 200_000, artworkUrl: 'http://x/a.jpg' },
    durationMs: 200_000,
  }));
  const ctrl = {
    id,
    label: id,
    ownsMediaSession: owns,
    state$,
    activate: vi.fn(),
    deactivate: vi.fn(),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    previous: vi.fn(async () => undefined),
    seek: vi.fn(async () => undefined),
    setVolume: vi.fn(),
    setShuffle: vi.fn(),
    setRepeat: vi.fn(),
    toggleLike: vi.fn(),
    refreshQueue: vi.fn(),
  };
  return ctrl as unknown as MediaController & typeof ctrl;
}

beforeEach(() => {
  vi.stubGlobal('MediaMetadata', FakeMetadata);
  useSettings.getState().reset();
});
afterEach(() => {
  releaseMediaSession();
  _setSessionForTests(null);
  vi.unstubAllGlobals();
});

describe('media session ownership', () => {
  it('YouTube (owns the session) registers all handlers, metadata and playback state', () => {
    const { session, handlers } = fakeSession();
    _setSessionForTests(session);
    const yt = fakeController('youtube', true);
    syncMediaSession(yt);
    for (const a of [
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
      'seekbackward',
      'seekforward',
      'seekto',
      'stop',
    ]) {
      expect(handlers.get(a), a).toBeTypeOf('function');
    }
    expect(session.metadata?.title).toBe('Song');
    expect(session.playbackState).toBe('paused');
    yt.state$.setState({ playing: true });
    expect(session.playbackState).toBe('playing');
    expect(mediaSessionDiagnostics().attached).toBe('youtube');
  });

  it('Spotify (remote only) never touches navigator.mediaSession', () => {
    const { session } = fakeSession();
    _setSessionForTests(session);
    syncMediaSession(fakeController('spotify', false));
    expect(session.setActionHandler).not.toHaveBeenCalled();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(session.setPositionState).not.toHaveBeenCalled();
  });

  it('switching from YouTube to Spotify releases every handler and the metadata', () => {
    const { session, handlers } = fakeSession();
    _setSessionForTests(session);
    syncMediaSession(fakeController('youtube', true));
    expect(session.metadata).not.toBeNull();
    syncMediaSession(fakeController('spotify', false));
    for (const h of handlers.values()) expect(h).toBeNull();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(mediaSessionDiagnostics().attached).toBeNull();
  });

  it('handlers drive the controller', () => {
    const { session, handlers } = fakeSession();
    _setSessionForTests(session);
    const yt = fakeController('youtube', true);
    attachMediaSession(yt);
    handlers.get('play')!({ action: 'play' });
    handlers.get('pause')!({ action: 'pause' });
    handlers.get('nexttrack')!({ action: 'nexttrack' });
    handlers.get('seekto')!({ action: 'seekto', seekTime: 42 });
    expect(yt.play).toHaveBeenCalled();
    expect(yt.pause).toHaveBeenCalled();
    expect(yt.next).toHaveBeenCalled();
    expect(yt.seek).toHaveBeenCalledWith(42_000);
  });

  it('seek handlers use the configured step when the OS gives no offset', () => {
    const { session, handlers } = fakeSession();
    _setSessionForTests(session);
    useSettings.getState().set('seekStep', 30);
    const yt = fakeController('youtube', true);
    yt.state$.setState({ positionMs: 100_000, positionAt: Date.now(), playing: false });
    attachMediaSession(yt);
    handlers.get('seekforward')!({ action: 'seekforward' });
    expect(yt.seek).toHaveBeenLastCalledWith(130_000);
    handlers.get('seekbackward')!({ action: 'seekbackward', seekOffset: 10 });
    expect(yt.seek).toHaveBeenLastCalledWith(90_000);
  });

  it('previoustrack restarts after 3 s, otherwise goes back', async () => {
    const { session, handlers } = fakeSession();
    _setSessionForTests(session);
    const yt = fakeController('youtube', true);
    attachMediaSession(yt);
    yt.state$.setState({ positionMs: 20_000, positionAt: Date.now(), playing: false });
    await handlers.get('previoustrack')!({ action: 'previoustrack' });
    expect(yt.seek).toHaveBeenCalledWith(0);
    yt.state$.setState({ positionMs: 500, positionAt: Date.now() });
    await handlers.get('previoustrack')!({ action: 'previoustrack' });
    expect(yt.previous).toHaveBeenCalled();
  });

  it('updates metadata when the track changes', () => {
    const { session } = fakeSession();
    _setSessionForTests(session);
    const yt = fakeController('youtube', true);
    attachMediaSession(yt);
    yt.state$.setState({ track: { id: 't2', title: 'Next One', artist: 'B', durationMs: 1000 } });
    expect(session.metadata?.title).toBe('Next One');
  });

  it('is a no-op when the browser has no Media Session', () => {
    _setSessionForTests(null);
    const original = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');
    expect(() => syncMediaSession(fakeController('youtube', true))).not.toThrow();
    expect(mediaSessionDiagnostics().supported).toBe('mediaSession' in navigator);
    if (original) Object.defineProperty(navigator, 'mediaSession', original);
  });
});

describe('buildMetadata', () => {
  it('produces artwork at several sizes only when art exists', () => {
    expect(
      buildMetadata({ id: '1', title: 'T', artist: 'A', durationMs: 1, artworkUrl: 'u' }).artwork,
    ).toHaveLength(6);
    expect(buildMetadata({ id: '1', title: 'T', artist: 'A', durationMs: 1 }).artwork).toEqual([]);
  });
});
