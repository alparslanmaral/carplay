import { cached } from '../../core/cache';
import { getSettings } from '../../core/settings';
import type { Track } from '../media/types';
import { getAccessToken } from './auth';

/**
 * YouTube Data API v3 client. Quota matters (default 10,000 units/day; search.list alone costs 100),
 * so every list is cached: playlists/likes 5 min, search 1 h, durations 24 h.
 * Without sign-in the app falls back to the optional API key (public search + public playlists only).
 */

const BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'YouTubeApiError';
  }
  get quotaExceeded(): boolean {
    return this.status === 403 && (this.reason === 'quotaExceeded' || this.reason === 'dailyLimitExceeded');
  }
}

export const TTL = { lists: 5 * 60_000, search: 60 * 60_000, durations: 24 * 60 * 60_000 } as const;

type Query = Record<string, string | number | boolean | undefined>;

export async function ytFetch<T>(path: string, query: Query): Promise<T> {
  const token = await getAccessToken();
  const key = getSettings().youtubeApiKey;
  if (!token && !key)
    throw new YouTubeApiError(
      'Sign in to YouTube or add an API key in Settings > Accounts',
      401,
      'noCredentials',
    );
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) q.set(k, String(v));
  if (!token) q.set('key', key);
  const res = await fetch(
    `${BASE}/${path}?${q}`,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  );
  if (!res.ok) {
    let message = res.statusText;
    let reason: string | undefined;
    try {
      const j = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
      message = j.error?.message ?? message;
      reason = j.error?.errors?.[0]?.reason;
    } catch {
      /* non-JSON error */
    }
    throw new YouTubeApiError(message, res.status, reason);
  }
  return (await res.json()) as T;
}

/** Human message for the toast/notice; quota errors get an explanation instead of raw API text. */
export function describeError(e: unknown): string {
  if (e instanceof YouTubeApiError) {
    if (e.quotaExceeded) return 'YouTube daily quota is used up. It resets at midnight Pacific time.';
    if (e.status === 401) return 'Sign in to YouTube again.';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/* ---------- pure helpers ---------- */

/** ISO-8601 duration (PT1H2M3S) to milliseconds. Live streams ("P0D") give 0. */
export function parseIsoDuration(iso: string | undefined): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso ?? '');
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return Math.round(
    ((Number(d ?? 0) * 24 + Number(h ?? 0)) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0)) * 1000,
  );
}

/** Pull a playlist or video id out of whatever the user pasted: URL, short link or bare id. */
export function parseYouTubeLink(input: string): { playlistId?: string; videoId?: string } | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    const list = url.searchParams.get('list');
    if (list) return { playlistId: list, videoId: url.searchParams.get('v') ?? undefined };
    const v = url.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return { videoId: v };
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1);
      if (/^[\w-]{11}$/.test(id)) return { videoId: id };
    }
  } catch {
    /* not a URL: maybe a bare id */
  }
  if (/^(PL|UU|LL|OL|RD|FL)[\w-]{10,}$/.test(text)) return { playlistId: text };
  if (/^[\w-]{11}$/.test(text)) return { videoId: text };
  return null;
}

interface Thumbs {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
  standard?: { url: string };
}
export const bestThumb = (t: Thumbs | undefined, id: string): string =>
  t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export function videoTrack(
  id: string,
  title: string,
  channel: string,
  thumbs: Thumbs | undefined,
  durationMs = 0,
): Track {
  return {
    id,
    title,
    artist: channel,
    artworkUrl: bestThumb(thumbs, id),
    durationMs,
    uri: `youtube:${id}`,
    webUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

/* ---------- endpoints ---------- */

export interface PlaylistSummary {
  id: string;
  title: string;
  count: number;
  thumb?: string;
}
export interface Paged<T> {
  items: T[];
  next: string | null;
  total: number;
}

interface ListResponse<I> {
  items?: I[];
  nextPageToken?: string;
  pageInfo?: { totalResults?: number };
}

export function myPlaylists(pageToken = ''): Promise<Paged<PlaylistSummary>> {
  return cached(`yt:playlists:${pageToken}`, TTL.lists, async () => {
    const r = await ytFetch<
      ListResponse<{
        id: string;
        snippet: { title: string; thumbnails?: Thumbs };
        contentDetails?: { itemCount?: number };
      }>
    >('playlists', {
      part: 'snippet,contentDetails',
      mine: true,
      maxResults: 30,
      pageToken: pageToken || undefined,
    });
    return {
      items: (r.items ?? []).map((p) => ({
        id: p.id,
        title: p.snippet.title,
        count: p.contentDetails?.itemCount ?? 0,
        thumb: p.snippet.thumbnails?.medium?.url ?? p.snippet.thumbnails?.default?.url,
      })),
      next: r.nextPageToken ?? null,
      total: r.pageInfo?.totalResults ?? 0,
    };
  });
}

interface PlaylistItem {
  snippet: {
    title: string;
    videoOwnerChannelTitle?: string;
    channelTitle?: string;
    thumbnails?: Thumbs;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
}

const UNAVAILABLE = new Set(['Private video', 'Deleted video']);

export function itemsToTracks(items: PlaylistItem[]): Track[] {
  const out: Track[] = [];
  for (const it of items) {
    const id = it.contentDetails?.videoId ?? it.snippet.resourceId?.videoId;
    if (!id || UNAVAILABLE.has(it.snippet.title)) continue;
    out.push(
      videoTrack(
        id,
        it.snippet.title,
        it.snippet.videoOwnerChannelTitle ?? it.snippet.channelTitle ?? '',
        it.snippet.thumbnails,
      ),
    );
  }
  return out;
}

/** Fill in durations (1 quota unit per 50 videos) so rows and the scrubber know the length up front. */
async function withDurations(tracks: Track[]): Promise<Track[]> {
  if (tracks.length === 0) return tracks;
  const ids = tracks.map((t) => t.id).join(',');
  const durations = await cached(`yt:dur:${ids}`, TTL.durations, async () => {
    const r = await ytFetch<ListResponse<{ id: string; contentDetails: { duration: string } }>>('videos', {
      part: 'contentDetails',
      id: ids,
      maxResults: 50,
    });
    return Object.fromEntries(
      (r.items ?? []).map((v) => [v.id, parseIsoDuration(v.contentDetails.duration)]),
    );
  }).catch(() => ({}) as Record<string, number>);
  return tracks.map((t) => ({ ...t, durationMs: durations[t.id] ?? 0 }));
}

export function playlistVideos(playlistId: string, pageToken = ''): Promise<Paged<Track>> {
  return cached(`yt:items:${playlistId}:${pageToken}`, TTL.lists, async () => {
    const r = await ytFetch<ListResponse<PlaylistItem>>('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: 30,
      pageToken: pageToken || undefined,
    });
    return {
      items: await withDurations(itemsToTracks(r.items ?? [])),
      next: r.nextPageToken ?? null,
      total: r.pageInfo?.totalResults ?? 0,
    };
  });
}

/** Liked videos: the "LL" playlist, falling back to videos?myRating=like when LL is not served. */
export async function likedVideos(pageToken = ''): Promise<Paged<Track>> {
  try {
    return await playlistVideos('LL', pageToken);
  } catch (e) {
    if (!(e instanceof YouTubeApiError) || ![400, 403, 404].includes(e.status) || e.quotaExceeded) throw e;
    return cached(`yt:liked:${pageToken}`, TTL.lists, async () => {
      const r = await ytFetch<
        ListResponse<{
          id: string;
          snippet: { title: string; channelTitle: string; thumbnails?: Thumbs };
          contentDetails: { duration: string };
        }>
      >('videos', {
        part: 'snippet,contentDetails',
        myRating: 'like',
        maxResults: 30,
        pageToken: pageToken || undefined,
      });
      return {
        items: (r.items ?? []).map((v) =>
          videoTrack(
            v.id,
            v.snippet.title,
            v.snippet.channelTitle,
            v.snippet.thumbnails,
            parseIsoDuration(v.contentDetails.duration),
          ),
        ),
        next: r.nextPageToken ?? null,
        total: r.pageInfo?.totalResults ?? 0,
      };
    });
  }
}

export function searchVideos(query: string, pageToken = ''): Promise<Paged<Track>> {
  const q = query.trim().toLowerCase();
  return cached(`yt:search:${q}:${pageToken}`, TTL.search, async () => {
    const r = await ytFetch<
      ListResponse<{
        id: { videoId: string };
        snippet: { title: string; channelTitle: string; thumbnails?: Thumbs };
      }>
    >('search', {
      part: 'snippet',
      type: 'video',
      q: query.trim(),
      maxResults: 20,
      videoEmbeddable: true,
      safeSearch: 'moderate',
      pageToken: pageToken || undefined,
    });
    const tracks = (r.items ?? []).map((v) =>
      videoTrack(v.id.videoId, v.snippet.title, v.snippet.channelTitle, v.snippet.thumbnails),
    );
    return {
      items: await withDurations(tracks),
      next: r.nextPageToken ?? null,
      total: r.pageInfo?.totalResults ?? 0,
    };
  });
}
