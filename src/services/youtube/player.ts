import { log } from '../../core/logger';

/**
 * Thin wrapper over the official YouTube IFrame Player API. The player is created in a visible container and
 * is never restyled or hidden by this code (API terms); audio is never extracted.
 */

/** IFrame API `onStateChange` values. */
export const PlayerState = {
  Unstarted: -1,
  Ended: 0,
  Playing: 1,
  Paused: 2,
  Buffering: 3,
  Cued: 5,
} as const;

export interface YTPlayer {
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  getVolume(): number;
  loadModule?(name: string): void;
  setOption?(module: string, option: string, value: unknown): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    cfg: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

let apiLoading: Promise<YTNamespace> | null = null;

export function loadIframeApi(): Promise<YTNamespace> {
  const w = window as unknown as {
    YT?: YTNamespace & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  apiLoading ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => reject(new Error('Could not load the YouTube player (offline or blocked)'));
    document.head.appendChild(s);
  }).catch((e) => {
    apiLoading = null;
    throw e;
  });
  return apiLoading;
}

/** YouTube error codes from the IFrame API documentation. */
export function describePlayerError(code: number): string {
  switch (code) {
    case 2:
      return 'This video link is invalid.';
    case 5:
      return 'The video could not be played in this player.';
    case 100:
      return 'This video was removed or is private.';
    case 101:
    case 150:
      return 'The owner does not allow this video to be played outside YouTube.';
    default:
      return `YouTube player error ${code}.`;
  }
}

export interface PlayerHandlers {
  onState(state: number): void;
  onError(code: number): void;
}

export async function createPlayer(
  container: HTMLElement,
  opts: { captions: boolean },
  handlers: PlayerHandlers,
): Promise<YTPlayer> {
  const YT = await loadIframeApi();
  return new Promise<YTPlayer>((resolve) => {
    const mount = document.createElement('div');
    container.replaceChildren(mount);
    const player = new YT.Player(mount, {
      width: '100%',
      height: '100%',
      playerVars: {
        playsinline: 1,
        rel: 0,
        controls: 1,
        fs: 0,
        enablejsapi: 1,
        origin: location.origin,
        cc_load_policy: opts.captions ? 1 : 0,
        iv_load_policy: 3,
      },
      events: {
        onReady: (e) => {
          log.debug('youtube', 'player ready');
          resolve(e.target);
        },
        onStateChange: (e) => handlers.onState(e.data),
        onError: (e) => handlers.onError(e.data),
      },
    });
    void player;
  });
}
