import type { StoreApi } from 'zustand/vanilla';

export type SourceId = 'spotify' | 'youtube' | 'demo';
export type RepeatMode = 'off' | 'context' | 'track';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  durationMs: number;
  /** Source-specific URI, e.g. spotify:track:... */
  uri?: string;
  /** Link back to the content on its home service (required by Spotify's design guidelines). */
  webUrl?: string;
  explicit?: boolean;
}

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'needs-device'
  | 'premium-required'
  | 'unauthorized'
  | 'rate-limited'
  | 'error';

export interface Capabilities {
  seek: boolean;
  volume: boolean;
  shuffle: boolean;
  repeat: boolean;
  like: boolean;
  queue: boolean;
}

export interface MediaState {
  source: SourceId;
  status: ConnectionStatus;
  statusMessage: string | null;
  playing: boolean;
  track: Track | null;
  /** Position at `positionAt` (epoch ms). Use interpolatePosition() for the live value. */
  positionMs: number;
  positionAt: number;
  durationMs: number;
  /** 0-100, null if the device does not expose volume */
  volume: number | null;
  shuffle: boolean;
  repeat: RepeatMode;
  liked: boolean | null;
  deviceName: string | null;
  queue: Track[];
  caps: Capabilities;
  /** epoch ms of the last successful update from the source (diagnostics) */
  updatedAt: number | null;
}

export const NO_CAPS: Capabilities = {
  seek: false,
  volume: false,
  shuffle: false,
  repeat: false,
  like: false,
  queue: false,
};

export function idleState(source: SourceId): MediaState {
  return {
    source,
    status: 'idle',
    statusMessage: null,
    playing: false,
    track: null,
    positionMs: 0,
    positionAt: Date.now(),
    durationMs: 0,
    volume: null,
    shuffle: false,
    repeat: 'off',
    liked: null,
    deviceName: null,
    queue: [],
    caps: NO_CAPS,
    updatedAt: null,
  };
}

/** Live playback position: last known position plus elapsed time while playing, clamped to the duration. */
export function interpolatePosition(
  state: Pick<MediaState, 'playing' | 'positionMs' | 'positionAt' | 'durationMs'>,
  now = Date.now(),
): number {
  const elapsed = state.playing ? Math.max(0, now - state.positionAt) : 0;
  const pos = state.positionMs + elapsed;
  return state.durationMs > 0 ? Math.min(pos, state.durationMs) : pos;
}

export interface MediaController {
  readonly id: SourceId;
  readonly label: string;
  /** True when DriveDeck itself plays audio, so it must own navigator.mediaSession. Spotify (remote) is false. */
  readonly ownsMediaSession: boolean;
  readonly state$: StoreApi<MediaState>;

  activate(): Promise<void>;
  deactivate(): void;

  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(percent: number): Promise<void>;
  setShuffle(on: boolean): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;
  toggleLike(): Promise<void>;
  refreshQueue(): Promise<void>;
}
