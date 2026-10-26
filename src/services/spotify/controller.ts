import { createStore } from 'zustand/vanilla';
import { getSettings } from '../../core/settings';
import { log } from '../../core/logger';
import { markHandoff } from '../../core/startRoute';
import { clamp } from '../../core/units';
import {
  idleState,
  interpolatePosition,
  type Capabilities,
  type MediaController,
  type MediaState,
  type RepeatMode,
} from '../media/types';
import { SpotifyError, isRateLimited, useSpotifyApiState } from './api';
import { initSpotifyAuthState, isConfigured, readToken, useSpotifyAuth } from './auth';
import * as api from './endpoints';

/**
 * Remote control for the official Spotify app via the Web API.
 *
 * DriveDeck never plays audio in this mode: no <audio>, no silent audio, and (see services/mediaSession) no
 * navigator.mediaSession handlers - so the steering-wheel keys keep controlling Spotify natively.
 */

export const SPOTIFY_APP_URL = 'spotify://';
export const MIN_POLL_S = 1;
export const MAX_POLL_S = 5;
const TRANSFER_RETRY_MS = 3000;

export function pollIntervalMs(seconds: number): number {
  return clamp(Math.round(seconds), MIN_POLL_S, MAX_POLL_S) * 1000;
}

export function mapPlayback(p: api.ApiPlayback, now = Date.now()): Partial<MediaState> {
  const device = p.device;
  const track = p.item ? api.trackFromApi(p.item) : null;
  const caps: Capabilities = {
    seek: !!track,
    // iPhone's Spotify app reports supports_volume=false: hide the slider instead of showing a dead control.
    volume: !!device && device.supports_volume !== false && device.volume_percent !== null,
    shuffle: true,
    repeat: true,
    like: !!track && p.item?.type !== 'episode',
    queue: true,
  };
  return {
    status: 'ready',
    statusMessage: null,
    playing: p.is_playing,
    track,
    positionMs: p.progress_ms ?? 0,
    positionAt: now,
    durationMs: track?.durationMs ?? 0,
    volume: caps.volume ? (device?.volume_percent ?? null) : null,
    shuffle: p.shuffle_state,
    repeat: p.repeat_state === 'off' ? 'off' : p.repeat_state,
    deviceName: device?.name ?? null,
    caps,
    updatedAt: now,
  };
}

export function openSpotifyApp(): void {
  markHandoff();
  window.location.href = SPOTIFY_APP_URL;
}

export class SpotifyRemoteController implements MediaController {
  readonly id = 'spotify' as const;
  readonly label = 'Spotify';
  /** Spotify's own app is the audio engine, so DriveDeck must not take the media keys. */
  readonly ownsMediaSession = false;
  readonly state$ = createStore<MediaState>(() => idleState('spotify'));

  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private product: string | null = null;
  private defaultsApplied = false;
  private likedFor: string | null = null;
  private lastTransferAt = 0;
  private onVisibility = () => {
    if (!document.hidden && this.active) this.schedule(0);
  };

  private set(patch: Partial<MediaState>): void {
    this.state$.setState(patch);
  }

  async activate(): Promise<void> {
    this.active = true;
    initSpotifyAuthState();
    document.addEventListener('visibilitychange', this.onVisibility);
    if (!this.authorised()) return;
    this.set({ status: 'connecting', statusMessage: null });
    void this.loadProfile();
    this.schedule(0);
  }

  deactivate(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Is there a usable sign-in? Sets the status the UI turns into a "Connect" prompt when not. */
  private authorised(): boolean {
    if (!isConfigured() && !readToken()) {
      this.set({ ...idleState('spotify'), status: 'unauthorized', statusMessage: 'not-configured' });
      return false;
    }
    if (!readToken()) {
      this.set({ ...idleState('spotify'), status: 'unauthorized', statusMessage: 'signed-out' });
      return false;
    }
    return true;
  }

  private async loadProfile(): Promise<void> {
    try {
      const me = await api.getMe();
      // `product` was removed from /me for development-mode apps (Feb 2026); only trust it when present.
      this.product = me?.product ?? null;
      if (this.product && this.product !== 'premium') this.markPremiumRequired();
    } catch (e) {
      log.debug('spotify', 'profile unavailable', e);
    }
  }

  private markPremiumRequired(): void {
    this.set({ status: 'premium-required', statusMessage: null });
  }

  /* ---------- polling ---------- */

  private schedule(delayMs: number): void {
    if (!this.active) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private nextDelay(): number {
    const s = this.state$.getState();
    if (s.status === 'needs-device') return TRANSFER_RETRY_MS;
    if (s.status === 'rate-limited') {
      return Math.max(2000, useSpotifyApiState.getState().blockedUntil - Date.now());
    }
    return pollIntervalMs(getSettings().spotifyPollSeconds);
  }

  private async tick(): Promise<void> {
    if (!this.active || this.polling) return;
    // Hidden pages are throttled by iOS anyway; polling resumes instantly on visibilitychange.
    if (document.hidden) return;
    if (!this.authorised()) return;
    if (isRateLimited()) {
      this.set({ status: 'rate-limited' });
      return this.schedule(this.nextDelay());
    }
    this.polling = true;
    try {
      await this.poll();
    } catch (e) {
      this.handleError(e);
    } finally {
      this.polling = false;
      this.schedule(this.nextDelay());
    }
  }

  async poll(): Promise<void> {
    const p = await api.getPlayback();
    if (!p || !p.device) {
      await this.handleNoPlayback();
      return;
    }
    const prev = this.state$.getState();
    const mapped = mapPlayback(p);
    if (prev.status === 'premium-required') delete mapped.status;
    this.set(mapped);
    const id = mapped.track?.id ?? null;
    if (id !== this.likedFor) {
      this.likedFor = id;
      this.set({ liked: null, queue: [] });
      void this.refreshLiked();
    }
    void this.applyDefaultsOnce();
  }

  /** 204 / no device: look for a device to take over, otherwise ask the user to open Spotify. */
  private async handleNoPlayback(): Promise<void> {
    const devices = await api.getDevices();
    const settings = getSettings();
    const wanted = settings.spotifyDeviceName.trim().toLowerCase();
    const pick =
      (wanted && devices.find((d) => d.name.toLowerCase().includes(wanted))) ||
      devices.find((d) => d.is_active) ||
      devices.find((d) => d.type === 'Smartphone') ||
      devices[0];
    if (
      pick?.id &&
      settings.spotifyAutoTransfer &&
      Date.now() - this.lastTransferAt > TRANSFER_RETRY_MS - 500
    ) {
      this.lastTransferAt = Date.now();
      try {
        await api.transferPlayback(pick.id, false);
        this.set({ status: 'connecting', statusMessage: null, deviceName: pick.name });
        this.schedule(600);
        return;
      } catch (e) {
        log.debug('spotify', 'transfer failed', e);
      }
    }
    this.set({
      status: this.state$.getState().status === 'premium-required' ? 'premium-required' : 'needs-device',
      statusMessage: pick ? 'device-idle' : 'no-device',
      playing: false,
      updatedAt: Date.now(),
    });
  }

  private async applyDefaultsOnce(): Promise<void> {
    if (this.defaultsApplied) return;
    this.defaultsApplied = true;
    const s = getSettings();
    try {
      if (s.defaultShuffle !== 'keep') await api.setShuffleState(s.defaultShuffle === 'on');
      if (s.defaultRepeat !== 'keep') await api.setRepeatState(s.defaultRepeat);
      if (s.autoResume && !this.state$.getState().playing && this.state$.getState().track) await api.resume();
    } catch (e) {
      log.debug('spotify', 'applying defaults failed', e);
    }
  }

  private async refreshLiked(): Promise<void> {
    const t = this.state$.getState().track;
    if (!t?.uri || !this.state$.getState().caps.like) return;
    try {
      const [liked] = await api.libraryContains([t.uri]);
      if (this.state$.getState().track?.id === t.id) this.set({ liked: liked ?? false });
    } catch (e) {
      log.debug('spotify', 'liked lookup failed', e);
    }
  }

  async refreshQueue(): Promise<void> {
    try {
      const q = await api.getQueue();
      this.set({ queue: (q?.queue ?? []).slice(0, 20).map(api.trackFromApi) });
    } catch (e) {
      this.handleError(e);
    }
  }

  /* ---------- commands ---------- */

  private handleError(e: unknown): void {
    if (e instanceof SpotifyError) {
      if (e.premiumRequired) return this.markPremiumRequired();
      if (e.noActiveDevice) return void this.set({ status: 'needs-device', statusMessage: 'no-device' });
      if (e.status === 429)
        return void this.set({ status: 'rate-limited', statusMessage: String(e.retryAfter ?? '') });
      if (e.status === 401 || e.status === 403) {
        if (!readToken()) return void this.set({ status: 'unauthorized', statusMessage: 'signed-out' });
        return void this.set({ status: 'error', statusMessage: e.message });
      }
      log.warn('spotify', `${e.status} ${e.message}`);
      return void this.set({ status: 'error', statusMessage: e.message });
    }
    const message = e instanceof Error ? e.message : String(e);
    if (!readToken()) return void this.set({ status: 'unauthorized', statusMessage: 'signed-out' });
    log.warn('spotify', message);
    // Offline blips must not wipe a working display: keep the last good state, just flag it.
    this.set({ status: 'error', statusMessage: message });
  }

  /** Optimistic update, send, then re-poll shortly so the UI converges on the truth. */
  private async command(optimistic: Partial<MediaState>, send: () => Promise<unknown>): Promise<void> {
    const before = this.state$.getState();
    if (before.status === 'premium-required') return;
    this.set(optimistic);
    try {
      await send();
      this.schedule(450);
    } catch (e) {
      if (e instanceof SpotifyError && e.noActiveDevice) {
        const recovered = await this.recoverDevice();
        if (recovered) {
          try {
            await send();
            return this.schedule(450);
          } catch (e2) {
            this.set(before);
            return this.handleError(e2);
          }
        }
      }
      this.set({
        playing: before.playing,
        shuffle: before.shuffle,
        repeat: before.repeat,
        volume: before.volume,
      });
      this.handleError(e);
    }
  }

  private async recoverDevice(): Promise<boolean> {
    try {
      const devices = await api.getDevices();
      const target =
        devices.find((d) => d.is_active) ?? devices.find((d) => d.type === 'Smartphone') ?? devices[0];
      if (!target?.id) return false;
      await api.transferPlayback(target.id, false);
      await new Promise((r) => setTimeout(r, 500));
      return true;
    } catch {
      return false;
    }
  }

  async play(): Promise<void> {
    const s = this.state$.getState();
    await this.command(
      { playing: true, positionMs: interpolatePosition(s), positionAt: Date.now() },
      api.resume,
    );
  }
  async pause(): Promise<void> {
    const s = this.state$.getState();
    await this.command(
      { playing: false, positionMs: interpolatePosition(s), positionAt: Date.now() },
      api.pausePlayback,
    );
  }
  async next(): Promise<void> {
    await this.command({}, api.skipNext);
  }
  async previous(): Promise<void> {
    await this.command({}, api.skipPrevious);
  }
  async seek(positionMs: number): Promise<void> {
    await this.command({ positionMs: Math.max(0, positionMs), positionAt: Date.now() }, () =>
      api.seekTo(positionMs),
    );
  }
  async setVolume(percent: number): Promise<void> {
    await this.command({ volume: Math.round(percent) }, () => api.setVolumePercent(percent));
  }
  async setShuffle(on: boolean): Promise<void> {
    await this.command({ shuffle: on }, () => api.setShuffleState(on));
  }
  async setRepeat(mode: RepeatMode): Promise<void> {
    await this.command({ repeat: mode }, () => api.setRepeatState(mode));
  }

  async toggleLike(): Promise<void> {
    const s = this.state$.getState();
    if (!s.track?.uri) return;
    const next = !s.liked;
    this.set({ liked: next });
    try {
      if (next) await api.librarySave(s.track.uri);
      else await api.libraryRemove(s.track.uri);
    } catch (e) {
      this.set({ liked: !next });
      this.handleError(e);
    }
  }

  /** Start a playlist / album / list of tracks (used by the Spotify browser screen). */
  async playRequest(req: api.PlayRequest, opts: { shuffle?: boolean } = {}): Promise<void> {
    await this.command({}, async () => {
      if (opts.shuffle !== undefined) await api.setShuffleState(opts.shuffle);
      await api.startPlayback(req);
    });
    this.set({ playing: true });
  }
}

/** Singleton shared by the media manager and the Spotify screen. */
export const spotifyController = new SpotifyRemoteController();

export function useSpotifyConnected(): boolean {
  return useSpotifyAuth((s) => s.connected);
}
