import { create } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useDriving } from '../../core/driving';
import { log } from '../../core/logger';
import { getSettings, useSettings } from '../../core/settings';
import { toast } from '../../core/toast';
import {
  idleState,
  interpolatePosition,
  type Capabilities,
  type MediaController,
  type MediaState,
  type RepeatMode,
  type Track,
} from '../media/types';
import { PlayerState, createPlayer, describePlayerError, type YTPlayer } from './player';

const CAPS: Capabilities = {
  seek: true,
  volume: false,
  shuffle: true,
  repeat: true,
  like: false,
  queue: true,
};

/* ---------- parked-only gate ---------- */

export function isYouTubeBlocked(input: {
  policy: 'blocked' | 'allowed';
  moving: boolean;
  passenger: boolean;
  passengerAllowed: boolean;
}): boolean {
  if (input.policy === 'allowed') return false;
  return input.moving && !(input.passengerAllowed && input.passenger);
}

interface GateState {
  blocked: boolean;
}
/** True while video must not play because the vehicle is moving. Drives the "Parked-only" overlay. */
export const useYouTubeGate = create<GateState>(() => ({ blocked: false }));

/** Whether the persistent player surface should exist (a video is loaded). */
export const useYouTubeSurface = create<{ visible: boolean }>(() => ({ visible: false }));

export function shuffled<T>(list: T[], rand: () => number = Math.random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export class YouTubePlayerController implements MediaController {
  readonly id = 'youtube' as const;
  readonly label = 'YouTube';
  /** DriveDeck itself plays the audio, so it owns the Media Session (steering-wheel keys). */
  readonly ownsMediaSession = true;
  readonly state$ = createStore<MediaState>(() => ({ ...idleState('youtube'), status: 'ready', caps: CAPS }));

  private player: YTPlayer | null = null;
  private creating: Promise<YTPlayer> | null = null;
  private container: HTMLElement | null = null;
  private containerWaiters: ((el: HTMLElement) => void)[] = [];
  private original: Track[] = [];
  private queue: Track[] = [];
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubs: (() => void)[] = [];
  private active = false;

  private set(patch: Partial<MediaState>): void {
    this.state$.setState({ ...patch, updatedAt: Date.now() });
  }

  async activate(): Promise<void> {
    this.active = true;
    const s = getSettings();
    this.set({ status: 'ready', repeat: s.ytLoopPlaylist ? 'context' : this.state$.getState().repeat });
    const evaluate = () => this.evaluateGate();
    this.unsubs.push(useDriving.subscribe(evaluate), useSettings.subscribe(evaluate));
    evaluate();
    this.timer ??= setInterval(() => this.tick(), 500);
  }

  deactivate(): void {
    this.active = false;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // The gate only matters while YouTube is the active source.
    useYouTubeGate.setState({ blocked: false });
  }

  /* ---------- container (the visible player surface) ---------- */

  setContainer(el: HTMLElement | null): void {
    if (el === this.container) return;
    this.container = el;
    if (!el) {
      this.destroyPlayer();
      return;
    }
    this.containerWaiters.splice(0).forEach((w) => w(el));
  }

  private waitForContainer(): Promise<HTMLElement> {
    return this.container
      ? Promise.resolve(this.container)
      : new Promise((r) => this.containerWaiters.push(r));
  }

  private destroyPlayer(): void {
    try {
      this.player?.destroy();
    } catch {
      /* already gone */
    }
    this.player = null;
    this.creating = null;
  }

  private async ensurePlayer(): Promise<YTPlayer> {
    if (this.player) return this.player;
    this.creating ??= (async () => {
      const el = await this.waitForContainer();
      const p = await createPlayer(
        el,
        { captions: getSettings().ytCaptions },
        { onState: (s) => this.onPlayerState(s), onError: (c) => this.onPlayerError(c) },
      );
      this.player = p;
      return p;
    })().catch((e) => {
      this.creating = null;
      throw e;
    });
    return this.creating;
  }

  /* ---------- gate ---------- */

  private evaluateGate(): void {
    const s = getSettings();
    const d = useDriving.getState();
    const blocked = isYouTubeBlocked({
      policy: s.ytWhileMoving,
      moving: d.moving,
      passenger: d.passenger,
      passengerAllowed: s.passengerOverride,
    });
    if (useYouTubeGate.getState().blocked === blocked) return;
    useYouTubeGate.setState({ blocked });
    if (blocked && this.state$.getState().playing) {
      this.player?.pauseVideo();
      this.set({
        playing: false,
        positionMs: interpolatePosition(this.state$.getState()),
        positionAt: Date.now(),
      });
    }
  }

  private isBlocked(): boolean {
    this.evaluateGate();
    return useYouTubeGate.getState().blocked;
  }

  /* ---------- player events ---------- */

  private onPlayerState(state: number): void {
    const st = this.state$.getState();
    if (state === PlayerState.Playing) {
      // Autoplay can start before the gate reacts (e.g. cue + user tap): enforce it here as well.
      if (this.isBlocked()) {
        this.player?.pauseVideo();
        return;
      }
      this.set({ playing: true, positionMs: this.readTime(), positionAt: Date.now() });
    } else if (state === PlayerState.Paused) {
      this.set({ playing: false, positionMs: this.readTime(), positionAt: Date.now() });
    } else if (state === PlayerState.Ended) {
      void this.handleEnded();
    } else if (state === PlayerState.Buffering && !st.playing) {
      this.set({ positionAt: Date.now() });
    }
  }

  private onPlayerError(code: number): void {
    const message = describePlayerError(code);
    log.warn('youtube', message);
    toast(message, 'bad', 5000);
    // Skip videos that cannot be played instead of stalling the whole queue.
    if (this.index < this.queue.length - 1) void this.next();
    else this.set({ playing: false, statusMessage: message });
  }

  private async handleEnded(): Promise<void> {
    const { repeat } = this.state$.getState();
    if (repeat === 'track') {
      this.player?.seekTo(0, true);
      this.player?.playVideo();
      return;
    }
    if (this.index < this.queue.length - 1) {
      if (getSettings().ytAutoplayNext) await this.next();
      else this.set({ playing: false });
      return;
    }
    if (repeat === 'context' && this.queue.length > 0) await this.load(0, true);
    else this.set({ playing: false });
  }

  private readTime(): number {
    try {
      return Math.round((this.player?.getCurrentTime() ?? 0) * 1000);
    } catch {
      return this.state$.getState().positionMs;
    }
  }

  private tick(): void {
    const p = this.player;
    if (!p || !this.active) return;
    const st = this.state$.getState();
    if (!st.track) return;
    try {
      const dur = Math.round(p.getDuration() * 1000);
      const patch: Partial<MediaState> = {};
      if (dur > 0 && Math.abs(dur - st.durationMs) > 1500) patch.durationMs = dur;
      if (st.playing) {
        patch.positionMs = this.readTime();
        patch.positionAt = Date.now();
      }
      if (Object.keys(patch).length) this.state$.setState(patch);
    } catch {
      /* player is mid-reload */
    }
  }

  /* ---------- queue ---------- */

  private upcoming(): Track[] {
    return this.queue.slice(this.index + 1, this.index + 21);
  }

  private async load(index: number, autoplay: boolean): Promise<void> {
    const track = this.queue[index];
    if (!track) return;
    this.index = index;
    const blocked = this.isBlocked();
    useYouTubeSurface.setState({ visible: true });
    this.set({
      track,
      durationMs: track.durationMs,
      positionMs: 0,
      positionAt: Date.now(),
      playing: false,
      queue: this.upcoming(),
      statusMessage: blocked ? 'parked-only' : null,
    });
    const p = await this.ensurePlayer();
    if (autoplay && !blocked) p.loadVideoById(track.id);
    else p.cueVideoById(track.id);
  }

  /** Start a list of videos in the visible player. */
  async playQueue(tracks: Track[], startIndex = 0, opts: { shuffle?: boolean } = {}): Promise<void> {
    if (tracks.length === 0) return;
    this.original = tracks.slice();
    if (opts.shuffle) {
      const first = tracks[Math.min(startIndex, tracks.length - 1)]!;
      this.queue = [first, ...shuffled(tracks.filter((t) => t !== first))];
      this.index = 0;
      this.set({ shuffle: true });
    } else {
      this.queue = tracks.slice();
      this.index = Math.min(startIndex, tracks.length - 1);
      this.set({ shuffle: false });
    }
    await this.load(this.index, true);
  }

  /** Remove the player entirely (the mini player's close button). */
  async close(): Promise<void> {
    this.queue = [];
    this.original = [];
    this.index = 0;
    useYouTubeSurface.setState({ visible: false });
    this.set({ ...idleState('youtube'), status: 'ready', caps: CAPS, repeat: this.state$.getState().repeat });
    this.destroyPlayer();
  }

  /* ---------- MediaController ---------- */

  async play(): Promise<void> {
    if (!this.state$.getState().track) return;
    if (this.isBlocked()) {
      this.set({ statusMessage: 'parked-only' });
      return;
    }
    this.set({ statusMessage: null });
    (await this.ensurePlayer()).playVideo();
  }

  async pause(): Promise<void> {
    const p = this.player;
    if (!p) return;
    p.pauseVideo();
    this.set({
      playing: false,
      positionMs: interpolatePosition(this.state$.getState()),
      positionAt: Date.now(),
    });
  }

  async next(): Promise<void> {
    if (this.queue.length === 0) return;
    const atEnd = this.index >= this.queue.length - 1;
    if (atEnd && this.state$.getState().repeat !== 'context') return;
    await this.load(
      atEnd ? 0 : this.index + 1,
      this.state$.getState().playing || getSettings().ytAutoplayNext,
    );
  }

  async previous(): Promise<void> {
    if (this.queue.length === 0) return;
    await this.load(Math.max(0, this.index - 1), this.state$.getState().playing);
  }

  async seek(positionMs: number): Promise<void> {
    const p = this.player;
    if (!p) return;
    p.seekTo(Math.max(0, positionMs) / 1000, true);
    this.set({ positionMs: Math.max(0, positionMs), positionAt: Date.now() });
  }

  async setVolume(): Promise<void> {
    /* iOS ignores page-level volume for media; the volume capability is off so the slider is hidden. */
  }

  async setShuffle(on: boolean): Promise<void> {
    const current = this.queue[this.index];
    if (!current) return this.set({ shuffle: on });
    if (on) {
      this.queue = [current, ...shuffled(this.original.filter((t) => t.id !== current.id))];
      this.index = 0;
    } else {
      this.queue = this.original.slice();
      this.index = Math.max(
        0,
        this.queue.findIndex((t) => t.id === current.id),
      );
    }
    this.set({ shuffle: on, queue: this.upcoming() });
  }

  async setRepeat(mode: RepeatMode): Promise<void> {
    this.set({ repeat: mode });
  }

  async toggleLike(): Promise<void> {
    /* Rating needs the full youtube scope; DriveDeck only asks for read-only access. */
  }

  async refreshQueue(): Promise<void> {
    this.set({ queue: this.upcoming() });
  }
}

export const youtubeController = new YouTubePlayerController();
