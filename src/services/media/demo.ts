import { createStore } from 'zustand/vanilla';
import { getSettings } from '../../core/settings';
import {
  idleState,
  interpolatePosition,
  type Capabilities,
  type MediaController,
  type MediaState,
  type RepeatMode,
  type Track,
} from './types';

/**
 * Demo player: a clearly labelled, silent stand-in so the whole Now Playing UI can be tried (and screenshotted)
 * without any account. It plays no audio, so it never needs - and never takes - the Media Session.
 */

function art(a: string, b: string, glyph: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><g fill="none" stroke="rgba(255,255,255,.55)" stroke-width="10" stroke-linecap="round">${glyph}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEMO_TRACKS: Track[] = [
  {
    id: 'demo-1',
    title: 'Open Road',
    artist: 'Demo Artist',
    album: 'Sample Sessions',
    durationMs: 214_000,
    artworkUrl: art(
      '#ff7a59',
      '#7b2ff7',
      '<path d="M60 320 190 90M340 320 210 90M200 300v-40M200 220v-40M200 140v-30"/>',
    ),
  },
  {
    id: 'demo-2',
    title: 'City Lights',
    artist: 'Demo Artist',
    album: 'Sample Sessions',
    durationMs: 187_000,
    artworkUrl: art(
      '#12c2e9',
      '#c471ed',
      '<path d="M80 320V200h50v120M150 320V120h60v200M230 320V170h50v150M300 320V230h30v90"/>',
    ),
  },
  {
    id: 'demo-3',
    title: 'Tunnel Echo',
    artist: 'The Placeholders',
    album: 'Loopback',
    durationMs: 251_000,
    artworkUrl: art(
      '#0f9b8e',
      '#134e5e',
      '<circle cx="200" cy="200" r="40"/><circle cx="200" cy="200" r="90"/><circle cx="200" cy="200" r="140"/>',
    ),
  },
  {
    id: 'demo-4',
    title: 'Sunrise Lane',
    artist: 'The Placeholders',
    album: 'Loopback',
    durationMs: 198_000,
    artworkUrl: art(
      '#f9d423',
      '#ff4e50',
      '<circle cx="200" cy="230" r="70"/><path d="M60 300h280M200 90v40M110 140l28 28M290 140l-28 28"/>',
    ),
  },
];

const CAPS: Capabilities = { seek: true, volume: true, shuffle: true, repeat: true, like: true, queue: true };

export class DemoController implements MediaController {
  readonly id = 'demo' as const;
  readonly label = 'Demo player';
  readonly ownsMediaSession = false;
  readonly state$ = createStore<MediaState>(() => ({
    ...idleState('demo'),
    status: 'ready',
    caps: CAPS,
    volume: 60,
    deviceName: 'Demo (silent)',
  }));

  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private liked = new Set<string>();

  private set(patch: Partial<MediaState>): void {
    this.state$.setState({ ...patch, updatedAt: Date.now() });
  }

  private load(index: number, playing: boolean): void {
    const len = DEMO_TRACKS.length;
    this.index = ((index % len) + len) % len;
    const track = DEMO_TRACKS[this.index]!;
    this.set({
      track,
      durationMs: track.durationMs,
      positionMs: 0,
      positionAt: Date.now(),
      playing,
      liked: this.liked.has(track.id),
      queue: [1, 2, 3].map((n) => DEMO_TRACKS[(this.index + n) % len]!),
    });
  }

  async activate(): Promise<void> {
    const s = getSettings();
    if (!this.state$.getState().track) {
      this.load(0, false);
      // Start part-way through so screenshots show a filled scrubber.
      this.set({ positionMs: 74_000, positionAt: Date.now() });
    }
    const patch: Partial<MediaState> = {};
    if (s.defaultShuffle !== 'keep') patch.shuffle = s.defaultShuffle === 'on';
    if (s.defaultRepeat !== 'keep') patch.repeat = s.defaultRepeat;
    this.set(patch);
    this.timer ??= setInterval(() => this.tick(), 500);
  }

  deactivate(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const st = this.state$.getState();
    if (!st.playing) return;
    if (interpolatePosition(st) >= st.durationMs) void this.advance(true);
  }

  private async advance(auto: boolean): Promise<void> {
    const st = this.state$.getState();
    if (auto && st.repeat === 'track') return this.load(this.index, true);
    if (st.shuffle) return this.load(Math.floor(Math.random() * DEMO_TRACKS.length), st.playing || auto);
    const atEnd = this.index === DEMO_TRACKS.length - 1;
    if (auto && atEnd && st.repeat === 'off') return this.load(0, false);
    this.load(this.index + 1, st.playing || auto);
  }

  async play(): Promise<void> {
    const st = this.state$.getState();
    this.set({ playing: true, positionMs: interpolatePosition(st), positionAt: Date.now() });
  }
  async pause(): Promise<void> {
    const st = this.state$.getState();
    this.set({ playing: false, positionMs: interpolatePosition(st), positionAt: Date.now() });
  }
  async next(): Promise<void> {
    await this.advance(false);
  }
  async previous(): Promise<void> {
    this.load(this.index - 1, this.state$.getState().playing);
  }
  async seek(positionMs: number): Promise<void> {
    this.set({ positionMs: Math.max(0, positionMs), positionAt: Date.now() });
  }
  async setVolume(percent: number): Promise<void> {
    this.set({ volume: Math.round(percent) });
  }
  async setShuffle(on: boolean): Promise<void> {
    this.set({ shuffle: on });
  }
  async setRepeat(mode: RepeatMode): Promise<void> {
    this.set({ repeat: mode });
  }
  async toggleLike(): Promise<void> {
    const t = this.state$.getState().track;
    if (!t) return;
    if (this.liked.has(t.id)) this.liked.delete(t.id);
    else this.liked.add(t.id);
    this.set({ liked: this.liked.has(t.id) });
  }
  async refreshQueue(): Promise<void> {
    /* queue is derived in load() */
  }
}
