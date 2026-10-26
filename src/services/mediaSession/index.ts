import { log } from '../../core/logger';
import { getSettings } from '../../core/settings';
import { smartPrevious } from '../media/smart';
import { interpolatePosition, type MediaController, type MediaState, type Track } from '../media/types';

/**
 * The ONLY module allowed to touch navigator.mediaSession.
 *
 * iOS routes Bluetooth/steering-wheel media keys to whichever app owns "Now Playing". While Spotify is the
 * source it must be that app, so DriveDeck stays hands-off: nothing is registered, no metadata is set, and no
 * audio element exists. The session is only taken for sources that play audio inside DriveDeck (YouTube).
 */

type SessionActions =
  'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekbackward' | 'seekforward' | 'seekto' | 'stop';

const ACTIONS: SessionActions[] = [
  'play',
  'pause',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto',
  'stop',
];

export interface MediaSessionLike {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
  setPositionState?(state?: MediaPositionState): void;
}

let attached: MediaController | null = null;
let unsubscribe: (() => void) | null = null;
let lastTrackId: string | null = null;
let lastPlaying: boolean | null = null;
let lastPositionPush = 0;
let sessionOverride: MediaSessionLike | null = null;

/** Tests inject a fake session; production always uses navigator.mediaSession. */
export function _setSessionForTests(session: MediaSessionLike | null): void {
  sessionOverride = session;
}

function session(): MediaSessionLike | null {
  if (sessionOverride) return sessionOverride;
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession as MediaSessionLike;
}

export function buildMetadata(track: Track): MediaMetadataInit {
  const artwork = track.artworkUrl
    ? [96, 128, 192, 256, 384, 512].map((px) => ({ src: track.artworkUrl!, sizes: `${px}x${px}` }))
    : [];
  return { title: track.title, artist: track.artist, album: track.album ?? '', artwork };
}

function pushMetadata(state: MediaState): void {
  const s = session();
  if (!s) return;
  s.metadata = state.track ? new MediaMetadata(buildMetadata(state.track)) : null;
}

function pushPosition(state: MediaState, force = false): void {
  const s = session();
  if (!s?.setPositionState) return;
  const now = Date.now();
  if (!force && now - lastPositionPush < 1000) return;
  lastPositionPush = now;
  if (!state.track || state.durationMs <= 0) {
    try {
      s.setPositionState();
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    s.setPositionState({
      duration: state.durationMs / 1000,
      position: interpolatePosition(state, now) / 1000,
      playbackRate: state.playing ? 1 : 0.0001,
    });
  } catch (e) {
    log.debug('mediaSession', 'setPositionState rejected', e);
  }
}

function onState(state: MediaState): void {
  const s = session();
  if (!s) return;
  const trackId = state.track?.id ?? null;
  if (trackId !== lastTrackId) {
    lastTrackId = trackId;
    pushMetadata(state);
    pushPosition(state, true);
  }
  if (state.playing !== lastPlaying) {
    lastPlaying = state.playing;
    s.playbackState = state.track ? (state.playing ? 'playing' : 'paused') : 'none';
    pushPosition(state, true);
  }
}

function installHandlers(controller: MediaController): void {
  const s = session();
  if (!s) return;
  const step = () => getSettings().seekStep * 1000;
  const handlers: Record<SessionActions, MediaSessionActionHandler> = {
    play: () => void controller.play(),
    pause: () => void controller.pause(),
    stop: () => void controller.pause(),
    nexttrack: () => void controller.next(),
    previoustrack: () => void smartPrevious(controller),
    seekbackward: (d) => {
      const st = controller.state$.getState();
      const by = d.seekOffset ? d.seekOffset * 1000 : step();
      void controller.seek(Math.max(0, interpolatePosition(st) - by));
    },
    seekforward: (d) => {
      const st = controller.state$.getState();
      const by = d.seekOffset ? d.seekOffset * 1000 : step();
      void controller.seek(interpolatePosition(st) + by);
    },
    seekto: (d) => {
      if (typeof d.seekTime === 'number') void controller.seek(d.seekTime * 1000);
    },
  };
  for (const action of ACTIONS) {
    try {
      s.setActionHandler(action, handlers[action]);
    } catch (e) {
      log.debug('mediaSession', `action ${action} unsupported`, e);
    }
  }
}

/** Give up the session completely: handlers off, metadata cleared. No-op if it was never taken. */
export function releaseMediaSession(): void {
  unsubscribe?.();
  unsubscribe = null;
  const s = session();
  if (attached && s) {
    for (const action of ACTIONS) {
      try {
        s.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
    s.metadata = null;
    s.playbackState = 'none';
    try {
      s.setPositionState?.();
    } catch {
      /* ignore */
    }
  }
  attached = null;
  lastTrackId = null;
  lastPlaying = null;
}

export function attachMediaSession(controller: MediaController): void {
  if (attached === controller) return;
  releaseMediaSession();
  if (!session()) return;
  attached = controller;
  installHandlers(controller);
  const state = controller.state$.getState();
  lastTrackId = null;
  lastPlaying = null;
  onState(state);
  unsubscribe = controller.state$.subscribe((st) => {
    onState(st);
    if (st.playing) pushPosition(st);
  });
}

let watcher: (() => void) | null = null;

/**
 * Single entry point used by the media manager whenever the active source changes.
 * A source that owns the session only takes the keys while it actually has something loaded: merely being the
 * "last used" source at launch must not steal them from whatever else is playing on the phone.
 */
export function syncMediaSession(controller: MediaController | null): void {
  watcher?.();
  watcher = null;
  if (!controller?.ownsMediaSession) return releaseMediaSession();
  const reconcile = () => {
    const hasTrack = !!controller.state$.getState().track;
    if (hasTrack && attached !== controller) attachMediaSession(controller);
    else if (!hasTrack && attached === controller) releaseMediaSession();
  };
  reconcile();
  watcher = controller.state$.subscribe(reconcile);
}

export interface MediaSessionDiagnostics {
  supported: boolean;
  attached: string | null;
  playbackState: string;
  metadataTitle: string | null;
}

export function mediaSessionDiagnostics(): MediaSessionDiagnostics {
  const s = session();
  return {
    supported: !!s,
    attached: attached?.id ?? null,
    playbackState: s?.playbackState ?? 'n/a',
    metadataTitle: s?.metadata?.title ?? null,
  };
}
