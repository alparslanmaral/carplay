import type { Page } from '@playwright/test';

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
