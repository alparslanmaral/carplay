import { cached } from '../../core/cache';
import type { Track } from '../media/types';
import { SpotifyError, spotifyFetch } from './api';

/* ---------- API shapes (only the fields DriveDeck reads) ---------- */

export interface ApiImage {
  url: string;
  width?: number | null;
  height?: number | null;
}
interface ApiArtist {
  name: string;
}
export interface ApiTrack {
  id: string | null;
  type?: 'track' | 'episode';
  name: string;
  uri: string;
  duration_ms: number;
  explicit?: boolean;
  artists?: ApiArtist[];
  album?: { name: string; images?: ApiImage[] };
  /** episodes */
  show?: { name: string; publisher?: string; images?: ApiImage[] };
  images?: ApiImage[];
  external_urls?: { spotify?: string };
  is_playable?: boolean;
}
export interface ApiDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted?: boolean;
  volume_percent: number | null;
  supports_volume?: boolean;
}
export interface ApiPlayback {
  device?: ApiDevice;
  is_playing: boolean;
  progress_ms: number | null;
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
  item: ApiTrack | null;
  currently_playing_type?: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  next: string | null;
  offset?: number;
}
export interface ApiPlaylist {
  id: string;
  name: string;
  uri: string;
  images?: ApiImage[] | null;
  owner?: { display_name?: string | null };
  items?: { total: number };
  tracks?: { total: number };
  external_urls?: { spotify?: string };
}
export interface ApiAlbum {
  id: string;
  name: string;
  uri: string;
  images?: ApiImage[];
  artists?: ApiArtist[];
  total_tracks?: number;
  external_urls?: { spotify?: string };
}

/* ---------- mapping ---------- */

/** Pick an image near 300 px: sharp enough for the Now Playing art, small enough to load quickly. */
export function pickImage(images: ApiImage[] | null | undefined, target = 300): string | undefined {
  if (!images?.length) return undefined;
  const sized = images.filter((i) => typeof i.width === 'number');
  if (!sized.length) return images[0]!.url;
  return sized.reduce((best, i) => (Math.abs(i.width! - target) < Math.abs(best.width! - target) ? i : best))
    .url;
}

export function trackFromApi(t: ApiTrack): Track {
  const isEpisode = t.type === 'episode';
  const id = t.id ?? t.uri;
  return {
    id,
    title: t.name,
    artist: isEpisode
      ? (t.show?.publisher ?? t.show?.name ?? '')
      : (t.artists ?? []).map((a) => a.name).join(', '),
    album: isEpisode ? t.show?.name : t.album?.name,
    artworkUrl: pickImage(isEpisode ? (t.images ?? t.show?.images) : t.album?.images),
    durationMs: t.duration_ms,
    uri: t.uri,
    webUrl:
      t.external_urls?.spotify ??
      (t.id ? `https://open.spotify.com/${isEpisode ? 'episode' : 'track'}/${t.id}` : undefined),
    explicit: t.explicit,
  };
}

/* ---------- player ---------- */

export const getPlayback = () =>
  spotifyFetch<ApiPlayback>('/me/player', { query: { additional_types: 'track,episode' } });

export const getDevices = async () =>
  (await spotifyFetch<{ devices: ApiDevice[] }>('/me/player/devices'))?.devices ?? [];

export const getQueue = () =>
  spotifyFetch<{ currently_playing: ApiTrack | null; queue: ApiTrack[] }>('/me/player/queue');

export const transferPlayback = (deviceId: string, play: boolean) =>
  spotifyFetch('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } });

export const resume = () => spotifyFetch('/me/player/play', { method: 'PUT' });
export const pausePlayback = () => spotifyFetch('/me/player/pause', { method: 'PUT' });
export const skipNext = () => spotifyFetch('/me/player/next', { method: 'POST' });
export const skipPrevious = () => spotifyFetch('/me/player/previous', { method: 'POST' });
export const seekTo = (ms: number) =>
  spotifyFetch('/me/player/seek', { method: 'PUT', query: { position_ms: Math.max(0, Math.round(ms)) } });
export const setVolumePercent = (p: number) =>
  spotifyFetch('/me/player/volume', {
    method: 'PUT',
    query: { volume_percent: Math.round(Math.min(100, Math.max(0, p))) },
  });
export const setShuffleState = (on: boolean) =>
  spotifyFetch('/me/player/shuffle', { method: 'PUT', query: { state: on } });
export const setRepeatState = (mode: 'off' | 'track' | 'context') =>
  spotifyFetch('/me/player/repeat', { method: 'PUT', query: { state: mode } });

export interface PlayRequest {
  contextUri?: string;
  uris?: string[];
  offset?: number;
}
export const startPlayback = (r: PlayRequest, deviceId?: string) =>
  spotifyFetch('/me/player/play', {
    method: 'PUT',
    query: { device_id: deviceId },
    body: {
      ...(r.contextUri ? { context_uri: r.contextUri } : {}),
      ...(r.uris ? { uris: r.uris } : {}),
      ...(r.offset !== undefined ? { offset: { position: r.offset } } : {}),
    },
  });

/* ---------- library ("saved") ----------
 * Since Feb 2026 the per-type save/remove/contains endpoints are replaced by /me/library (Spotify URIs).
 * Older apps may still be served by the legacy routes, so each call falls back when the new one is rejected
 * as unknown (404/405) or malformed (400).
 */
const isRouteMissing = (e: unknown) => e instanceof SpotifyError && [400, 404, 405].includes(e.status);

function trackIdFromUri(uri: string): string {
  return uri.split(':').pop() ?? uri;
}

export async function libraryContains(uris: string[]): Promise<boolean[]> {
  if (uris.length === 0) return [];
  try {
    return (await spotifyFetch<boolean[]>('/me/library/contains', { query: { uris: uris.join(',') } })) ?? [];
  } catch (e) {
    if (!isRouteMissing(e)) throw e;
    return (
      (await spotifyFetch<boolean[]>('/me/tracks/contains', {
        query: { ids: uris.map(trackIdFromUri).join(',') },
      })) ?? []
    );
  }
}

export async function librarySave(uri: string): Promise<void> {
  try {
    await spotifyFetch('/me/library', { method: 'PUT', query: { uris: uri } });
  } catch (e) {
    if (!isRouteMissing(e)) throw e;
    await spotifyFetch('/me/tracks', { method: 'PUT', query: { ids: trackIdFromUri(uri) } });
  }
}

export async function libraryRemove(uri: string): Promise<void> {
  try {
    await spotifyFetch('/me/library', { method: 'DELETE', query: { uris: uri } });
  } catch (e) {
    if (!isRouteMissing(e)) throw e;
    await spotifyFetch('/me/tracks', { method: 'DELETE', query: { ids: trackIdFromUri(uri) } });
  }
}

/* ---------- browse (cached) ---------- */

const LIST_TTL = 5 * 60 * 1000;
export const PAGE_SIZE = 30;

export const getMe = () => spotifyFetch<{ id: string; display_name?: string; product?: string }>('/me');

export function getPlaylists(offset: number): Promise<Page<ApiPlaylist>> {
  return cached(
    `sp:playlists:${offset}`,
    LIST_TTL,
    async () =>
      (await spotifyFetch<Page<ApiPlaylist>>('/me/playlists', { query: { limit: PAGE_SIZE, offset } })) ??
      emptyPage(),
  );
}

export function getSavedTracks(offset: number): Promise<Page<{ track: ApiTrack }>> {
  return cached(
    `sp:saved:${offset}`,
    LIST_TTL,
    async () =>
      (await spotifyFetch<Page<{ track: ApiTrack }>>('/me/tracks', {
        query: { limit: PAGE_SIZE, offset },
      })) ?? emptyPage(),
  );
}

export function getSavedAlbums(offset: number): Promise<Page<{ album: ApiAlbum }>> {
  return cached(
    `sp:albums:${offset}`,
    LIST_TTL,
    async () =>
      (await spotifyFetch<Page<{ album: ApiAlbum }>>('/me/albums', {
        query: { limit: PAGE_SIZE, offset },
      })) ?? emptyPage(),
  );
}

/** Recently played has no offset paging: one page of the latest 50, de-duplicated by track. */
export function getRecentlyPlayed(): Promise<ApiTrack[]> {
  return cached('sp:recent', 60 * 1000, async () => {
    const r = await spotifyFetch<{ items: { track: ApiTrack }[] }>('/me/player/recently-played', {
      query: { limit: 50 },
    });
    const seen = new Set<string>();
    const out: ApiTrack[] = [];
    for (const { track } of r?.items ?? []) {
      if (!track.id || seen.has(track.id)) continue;
      seen.add(track.id);
      out.push(track);
    }
    return out;
  });
}

function emptyPage<T>(): Page<T> {
  return { items: [], total: 0, next: null };
}

/** Number of tracks in a playlist, whichever field name the API version uses (`items` since Feb 2026). */
export function playlistTrackCount(p: ApiPlaylist): number | undefined {
  return p.items?.total ?? p.tracks?.total;
}
