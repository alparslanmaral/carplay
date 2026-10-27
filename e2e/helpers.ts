import type { Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/**
 * Preload persisted settings before the app boots (skips onboarding, enables the demo player).
 * `storage` adds raw localStorage entries, e.g. a fake Spotify token.
 */
export async function seed(
  page: Page,
  settings: Record<string, unknown> = {},
  storage: Record<string, unknown> = {},
): Promise<void> {
  await page.addInitScript(
    ([overrides, extra]) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      localStorage.setItem(
        'dd.settings',
        JSON.stringify({ state: { onboardingDone: true, demoPlayer: true, ...overrides }, version: 1 }),
      );
      for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    },
    [settings, storage] as const,
  );
}

/** Deterministic network: external services are stubbed so screenshots never depend on live data. */
export async function mockExternal(page: Page): Promise<void> {
  await mockMaps(page);
  await mockYouTube(page);
  await page.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: { current: { temperature_2m: 17.4, weather_code: 2, is_day: 1, wind_speed_10m: 14 } },
    }),
  );
  // Cover art / thumbnails: a coloured square with the first letter in the URL.
  await page.route('**/mock-img/**', (route) => {
    const name = route.request().url().split('/').pop() ?? 'x';
    const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${hue} 60% 45%)"/><circle cx="50" cy="50" r="22" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="6"/></svg>`,
    });
  });
}

/* ---------- fake map tiles (deterministic, offline) ---------- */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 256x256 street-like PNG derived from the tile coordinates, so neighbouring tiles look related. */
export function fakeTile(z: number, x: number, y: number, dark: boolean): Buffer {
  const size = 256;
  const bg = dark ? [28, 34, 48] : [233, 238, 240];
  const minor = dark ? [44, 52, 70] : [255, 255, 255];
  const major = dark ? [74, 84, 108] : [247, 214, 142];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const seed = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  const hash = (n: number) => Math.abs(Math.sin(n + seed) * 10000) % 1;
  const rows = [hash(1), hash(2), hash(3)].map((r) => Math.floor(r * size));
  const cols = [hash(4), hash(5), hash(6)].map((r) => Math.floor(r * size));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let c = bg;
      if (rows.some((r) => Math.abs(py - r) < 3) || cols.some((q) => Math.abs(px - q) < 3)) c = minor;
      if (Math.abs(py - rows[0]!) < 6 || Math.abs(px - cols[0]!) < 6) c = major;
      if ((px + py + seed) % 97 === 0) c = minor;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = c[0]!;
      raw[o + 1] = c[1]!;
      raw[o + 2] = c[2]!;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function mockMaps(page: Page): Promise<void> {
  // The vector road styles are replaced by a small raster style that points at fake tiles on the same host.
  await page.route(/tiles\.versatiles\.org\/assets\/styles\/(\w+)\/style\.json/, (route) => {
    const dark = route.request().url().includes('/eclipse/');
    return route.fulfill({
      json: {
        version: 8,
        sources: {
          base: {
            type: 'raster',
            tiles: [`https://tiles.versatiles.org/mock/${dark ? 'dark' : 'light'}/{z}/{x}/{y}.png`],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'base', type: 'raster', source: 'base' }],
      },
    });
  });
  await page.route(/(tiles\.versatiles\.org\/mock|arcgisonline\.com)/, (route) => {
    const url = route.request().url();
    const m = /\/(\d+)\/(\d+)\/(\d+)(?:@2x)?\.png|\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
    const nums = (m ?? []).slice(1).filter(Boolean).map(Number);
    const [z = 0, x = 0, y = 0] = nums;
    return route.fulfill({ contentType: 'image/png', body: fakeTile(z, x, y, url.includes('/dark/')) });
  });
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({
      json: {
        features: [
          { name: 'Galata Tower', city: 'Istanbul', country: 'Türkiye', c: [28.9741, 41.0256] },
          { name: 'Galata Bridge', city: 'Istanbul', country: 'Türkiye', c: [28.9733, 41.0206] },
          { name: 'Galatasaray Island', city: 'Istanbul', country: 'Türkiye', c: [29.0356, 41.0455] },
        ].map((f, i) => ({
          geometry: { coordinates: f.c },
          properties: {
            osm_id: 100 + i,
            osm_type: 'N',
            name: f.name,
            city: f.city,
            country: f.country,
            countrycode: 'TR',
          },
        })),
      },
    }),
  );
  await page.route('https://photon.komoot.io/reverse**', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [29.0, 41.04] },
            properties: { name: 'Barbaros Boulevard', city: 'Istanbul', country: 'Türkiye' },
          },
        ],
      },
    }),
  );
}

export const FAKE_YOUTUBE_TOKEN = {
  'dd.youtube.token': { accessToken: 'YT', expiresAt: 4_102_444_800_000 },
};

/** Test double for the IFrame API: a labelled box with a ticking clock instead of a real iframe. */
const FAKE_IFRAME_API = `
window.YT = { Player: function (el, cfg) {
  var self = this, state = -1, started = 0, base = 0, id = '';
  var box = document.createElement('div');
  box.setAttribute('data-testid', 'yt-iframe');
  box.style.cssText = 'position:absolute;inset:0;background:linear-gradient(135deg,#1b1f2a,#3a4160);display:grid;place-items:center;color:#fff;font:600 14px -apple-system,sans-serif;text-align:center;padding:8px';
  el.appendChild(box);
  function set(s) { state = s; cfg.events.onStateChange({ data: s, target: self }); }
  function paint() { box.textContent = 'YouTube player (test double)\\n' + id; box.style.whiteSpace = 'pre-line'; }
  this.loadVideoById = function (v) { id = v; base = 0; started = Date.now(); paint(); set(1); };
  this.cueVideoById = function (v) { id = v; base = 0; paint(); set(5); };
  this.playVideo = function () { started = Date.now(); set(1); };
  this.pauseVideo = function () { base = this.getCurrentTime(); set(2); };
  this.stopVideo = function () { set(0); };
  this.seekTo = function (s) { base = s; started = Date.now(); };
  this.getCurrentTime = function () { return state === 1 ? base + (Date.now() - started) / 1000 : base; };
  this.getDuration = function () { return 213; };
  this.getPlayerState = function () { return state; };
  this.setVolume = function () {}; this.getVolume = function () { return 100; };
  this.destroy = function () { box.remove(); };
  setTimeout(function () { cfg.events.onReady({ target: self }); }, 0);
} };
setTimeout(function () { window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(); }, 0);
`;

const ytThumb = (n: string) => ({
  high: { url: `https://mock.test/mock-img/yt-${n}` },
  medium: { url: `https://mock.test/mock-img/yt-${n}` },
});

/** Stubs the YouTube Data API and the IFrame API. */
export async function mockYouTube(page: Page): Promise<void> {
  await page.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: FAKE_IFRAME_API }),
  );
  const videos = [
    'Rainy Night Drive - Lo-fi Mix',
    'Coastal Highway Timelapse 4K',
    'City Lights Ambient',
    'Sunrise Road Trip Playlist',
  ];
  const item = (i: number) => ({
    snippet: {
      title: videos[i % videos.length],
      videoOwnerChannelTitle: 'Open Roads',
      thumbnails: ytThumb(String(i)),
      resourceId: { videoId: `vid${i}aaaaaaa` },
    },
    contentDetails: { videoId: `vid${i}aaaaaaa` },
  });
  await page.route('https://www.googleapis.com/youtube/v3/**', (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ json: body });
    switch (url.pathname.split('/').pop()) {
      case 'playlists':
        return json({
          pageInfo: { totalResults: 3 },
          items: ['Road Trip Mix', 'Podcasts', 'Watch later'].map((title, i) => ({
            id: `PLmock${i}`,
            snippet: { title, thumbnails: ytThumb(`pl${i}`) },
            contentDetails: { itemCount: 12 + i * 7 },
          })),
        });
      case 'playlistItems':
        return json({ pageInfo: { totalResults: 4 }, items: [0, 1, 2, 3].map(item) });
      case 'videos':
        return json({
          items: (url.searchParams.get('id') ?? '')
            .split(',')
            .filter(Boolean)
            .map((id) => ({ id, contentDetails: { duration: 'PT3M33S' } })),
        });
      case 'search':
        return json({
          items: [0, 1, 2, 3].map((i) => ({
            id: { videoId: `vid${i}aaaaaaa` },
            snippet: { title: videos[i], channelTitle: 'Open Roads', thumbnails: ytThumb(String(i)) },
          })),
        });
      default:
        return json({ items: [] });
    }
  });
}

export const FAKE_SPOTIFY_TOKEN = {
  'dd.spotify.token': { accessToken: 'AT', refreshToken: 'RT', expiresAt: 4_102_444_800_000, scope: 'x' },
};

const img = (n: string) => [{ url: `https://mock.test/mock-img/${n}`, width: 300, height: 300 }];
const apiTrack = (n: number) => ({
  id: `t${n}`,
  name: ['Midnight Drive', 'Coastal Highway', 'Neon Rain', 'Sunday Roads', 'Last Exit'][n % 5],
  uri: `spotify:track:t${n}`,
  duration_ms: 200_000 + n * 7000,
  artists: [{ name: ['The Placeholders', 'Demo Artist'][n % 2] }],
  album: { name: 'Sample Album', images: img(`album${n}`) },
  external_urls: { spotify: `https://open.spotify.com/track/t${n}` },
});

/** Stubs the Spotify Web API. `device: false` simulates "Spotify not running"; `premium: false` a free account. */
export async function mockSpotify(
  page: Page,
  opts: { device?: boolean; premium?: boolean } = {},
): Promise<void> {
  const { device = true, premium = true } = opts;
  await page.route('https://api.spotify.com/v1/**', (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/v1', '');
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (req.method() !== 'GET') {
      if (!premium)
        return json({ error: { status: 403, message: 'Premium required', reason: 'PREMIUM_REQUIRED' } }, 403);
      return route.fulfill({ status: 204 });
    }
    switch (path) {
      case '/me':
        return json({ id: 'me', display_name: 'Driver' });
      case '/me/player':
        if (!device) return route.fulfill({ status: 204 });
        return json({
          is_playing: true,
          progress_ms: 74_000,
          shuffle_state: false,
          repeat_state: 'off',
          item: apiTrack(0),
          device: {
            id: 'd1',
            name: 'iPhone',
            type: 'Smartphone',
            is_active: true,
            volume_percent: 55,
            supports_volume: false,
          },
        });
      case '/me/player/devices':
        return json({ devices: [] });
      case '/me/library/contains':
      case '/me/tracks/contains':
        return json([true]);
      case '/me/player/queue':
        return json({ currently_playing: apiTrack(0), queue: [1, 2, 3].map(apiTrack) });
      case '/me/playlists':
        return json({
          total: 4,
          next: null,
          items: ['Road Trip', 'Morning Commute', 'Focus', 'Late Night Drive'].map((name, i) => ({
            id: `p${i}`,
            name,
            uri: `spotify:playlist:p${i}`,
            images: img(`pl${i}`),
            owner: { display_name: 'Driver' },
            items: { total: 24 + i * 11 },
          })),
        });
      default:
        return json({ items: [], total: 0, next: null });
    }
  });
}

export const PORTRAIT = { width: 390, height: 844 };
export const LANDSCAPE = { width: 844, height: 390 };

export async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector('.chassis');
  // let entry animations settle
  await page.waitForTimeout(450);
}
