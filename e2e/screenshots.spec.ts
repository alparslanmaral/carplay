import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  FAKE_SPOTIFY_TOKEN,
  FAKE_YOUTUBE_TOKEN,
  LANDSCAPE,
  PORTRAIT,
  mockExternal,
  mockSpotify,
  seed,
  waitForApp,
} from './helpers';

/**
 * Screenshots at 390x844 (portrait) and 844x390 (landscape) for every scene.
 * Output folder: SHOT_DIR (default docs/screenshots/latest). SHOT_ONLY=name1,name2 limits the run.
 * Run: npm run shots
 */
const dir = process.env.SHOT_DIR ?? join('docs', 'screenshots', 'latest');
const only = process.env.SHOT_ONLY?.split(',').filter(Boolean);
mkdirSync(dir, { recursive: true });

interface Scene {
  name: string;
  url: string;
  settings?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  spotify?: { device?: boolean; premium?: boolean };
  act?: (page: Page) => Promise<void>;
}

const places = [
  { id: 'r1', name: 'Kadıköy Pier', address: 'Kadıköy, Istanbul', lat: 40.9925, lng: 29.0245, ts: 1 },
  { id: 'r2', name: 'Istanbul Airport', address: 'Arnavutköy, Istanbul', lat: 41.2753, lng: 28.7519, ts: 2 },
  { id: 'r3', name: 'Bebek Park', address: 'Beşiktaş, Istanbul', lat: 41.0773, lng: 29.0436, ts: 3 },
];
const favorites = [
  { id: 'f1', name: 'Home', lat: 41.0422, lng: 29.0083, kind: 'home' },
  { id: 'f2', name: 'Work', lat: 41.0766, lng: 29.0174, kind: 'work' },
];

const spotifySettings = {
  demoPlayer: false,
  defaultSource: 'spotify',
  lastSource: 'spotify',
  spotifyClientId: 'CLIENT',
};

const ytSettings = {
  demoPlayer: false,
  defaultSource: 'youtube',
  lastSource: 'youtube',
  googleClientId: 'CLIENT',
};

async function openRouteSheet(page: Page): Promise<void> {
  await page.evaluate(() =>
    (
      window as unknown as { __dd: { router: { getState(): { reset(s: string, p: object): void } } } }
    ).__dd.router
      .getState()
      .reset('maps', { dest: 'r1' }),
  );
  await page.getByRole('button', { name: /Navigate in DriveDeck/ }).click();
  await page.getByRole('button', { name: 'Start' }).waitFor();
}

const scenes: Scene[] = [
  { name: 'home', url: '/?demo=1' },
  {
    name: 'home-light-right-rail',
    url: '/?demo=1',
    settings: { theme: 'light', railPosition: 'right', accent: '#ff8a3d' },
  },
  {
    name: 'dashboard',
    url: '/?demo=1&screen=dashboard',
    settings: { recents: places, favorites },
    act: async (page) => {
      await page.waitForSelector('.dash');
    },
  },
  {
    name: 'nowplaying',
    url: '/?demo=1&screen=nowplaying',
    settings: { defaultSource: 'last', lastSource: 'demo' },
  },
  {
    name: 'nowplaying-vinyl-gradient',
    url: '/?demo=1&screen=nowplaying',
    settings: { artworkShape: 'vinyl', nowPlayingBg: 'gradient', accent: '#b05cff', lastSource: 'demo' },
  },
  {
    name: 'spotify-nowplaying',
    url: '/?screen=nowplaying',
    settings: spotifySettings,
    storage: FAKE_SPOTIFY_TOKEN,
    act: async (page) => {
      await page.waitForSelector('.np__title');
    },
  },
  {
    name: 'spotify-library',
    url: '/?screen=spotify',
    settings: spotifySettings,
    storage: FAKE_SPOTIFY_TOKEN,
    act: async (page) => {
      await page.waitForSelector('.row');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'spotify-open-app',
    url: '/?screen=nowplaying',
    settings: spotifySettings,
    storage: FAKE_SPOTIFY_TOKEN,
    spotify: { device: false },
    act: async (page) => {
      await page.waitForSelector('.notice');
    },
  },
  {
    name: 'spotify-premium',
    url: '/?screen=nowplaying',
    settings: spotifySettings,
    storage: FAKE_SPOTIFY_TOKEN,
    spotify: { premium: false },
    act: async (page) => {
      await page.waitForSelector('.np__title');
      await page.locator('.np__play').click();
      await page.waitForSelector('.notice');
    },
  },
  {
    name: 'maps-destination',
    url: '/?demo=1&screen=home',
    settings: { recents: places, favorites, navApp: 'apple' },
    act: async (page) => {
      await page.evaluate(() =>
        (
          window as unknown as { __dd: { router: { getState(): { reset(s: string, p: object): void } } } }
        ).__dd.router
          .getState()
          .reset('maps', { dest: 'r1' }),
      );
      await page.waitForSelector('.maps__sheet');
      await page.waitForTimeout(900);
    },
  },
  {
    name: 'maps-route',
    url: '/?demo=1&screen=home',
    settings: { recents: places, favorites, navApp: 'drivedeck', avoidTolls: true },
    act: async (page) => {
      await openRouteSheet(page);
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'maps-guidance',
    url: '/?demo=1&screen=home',
    settings: { recents: places, favorites, navApp: 'drivedeck', avoidTolls: true },
    act: async (page) => {
      await openRouteSheet(page);
      await page.getByRole('button', { name: 'Start' }).click();
      await page.waitForSelector('.nav__banner');
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'maps-search',
    url: '/?demo=1&screen=maps',
    settings: { recents: places, favorites },
    act: async (page) => {
      await page.locator('.maps__search input').fill('galata');
      await page.waitForSelector('.maps__panel [role="option"]');
    },
  },
  {
    name: 'maps-suggestions',
    url: '/?demo=1&screen=maps',
    settings: { recents: places, favorites },
    act: async (page) => {
      await page.locator('.maps__search input').click();
      await page.waitForSelector('.maps__chips');
    },
  },
  {
    name: 'destinations',
    url: '/?demo=1&screen=destinations',
    settings: { recents: places, favorites },
  },
  {
    name: 'dashboard-map',
    url: '/?demo=1&screen=dashboard',
    settings: { recents: places, favorites, mapStyle: 'dark' },
    act: async (page) => {
      await page.waitForSelector('.mapcanvas[data-ready="true"]');
      await page.waitForTimeout(1500);
    },
  },
  {
    name: 'youtube-library',
    url: '/?screen=youtube',
    settings: ytSettings,
    storage: FAKE_YOUTUBE_TOKEN,
    act: async (page) => {
      await page.waitForSelector('.row');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'youtube-playing',
    url: '/?screen=youtube',
    settings: ytSettings,
    storage: FAKE_YOUTUBE_TOKEN,
    act: async (page) => {
      await page.getByRole('radio', { name: 'Liked videos' }).click();
      await page.locator('.row').first().click();
      await page.waitForSelector('[data-testid="yt-iframe"]');
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'youtube-parked',
    url: '/?screen=youtube',
    settings: ytSettings,
    storage: FAKE_YOUTUBE_TOKEN,
    act: async (page) => {
      await page.getByRole('radio', { name: 'Liked videos' }).click();
      await page.locator('.row').first().click();
      await page.waitForSelector('[data-testid="yt-iframe"]');
      await page.evaluate(() =>
        (window as unknown as { __dd: { geo: { getState(): { ingest(p: unknown): void } } } }).__dd.geo
          .getState()
          .ingest({
            coords: { latitude: 41, longitude: 29, accuracy: 5, speed: 14, heading: 90 },
            timestamp: Date.now(),
          }),
      );
      await page.waitForSelector('.ythost__parked');
    },
  },
  {
    name: 'youtube-nowplaying',
    url: '/?screen=youtube',
    settings: ytSettings,
    storage: FAKE_YOUTUBE_TOKEN,
    act: async (page) => {
      await page.getByRole('radio', { name: 'Liked videos' }).click();
      await page.locator('.row').first().click();
      await page.waitForSelector('[data-testid="yt-iframe"]');
      await page.evaluate(() =>
        (window as unknown as { __dd: { router: { getState(): { reset(s: string): void } } } }).__dd.router
          .getState()
          .reset('nowplaying'),
      );
      await page.waitForSelector('.np__title');
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'youtube-mini',
    url: '/?screen=youtube',
    settings: ytSettings,
    storage: FAKE_YOUTUBE_TOKEN,
    act: async (page) => {
      await page.getByRole('radio', { name: 'Liked videos' }).click();
      await page.locator('.row').first().click();
      await page.waitForSelector('[data-testid="yt-iframe"]');
      await page.evaluate(() =>
        (window as unknown as { __dd: { router: { getState(): { reset(s: string): void } } } }).__dd.router
          .getState()
          .reset('home'),
      );
      await page.waitForSelector('.ythost[data-mode="mini"]');
      await page.waitForTimeout(1000);
    },
  },
  { name: 'settings', url: '/?demo=1&screen=settings' },
  {
    name: 'settings-appearance',
    url: '/?demo=1&screen=settings',
    act: async (page) => {
      await page.getByRole('button', { name: /Appearance/ }).click();
      await page.waitForSelector('.set-preview');
    },
  },
  {
    name: 'settings-search',
    url: '/?demo=1&screen=settings',
    act: async (page) => {
      await page.getByRole('textbox', { name: 'Search settings' }).fill('speed');
      await page.waitForSelector('[data-item="speedAlert"]');
    },
  },
  {
    name: 'settings-driving',
    url: '/?demo=1&screen=settings',
    settings: { dimEnabled: true },
    act: async (page) => {
      await page.getByRole('button', { name: /Driving and safety/ }).click();
      await page.waitForSelector('[data-item="lockSpeed"]');
    },
  },
  { name: 'limitations', url: '/?demo=1&screen=limitations' },
  { name: 'diagnostics', url: '/?demo=1&screen=diagnostics' },
  { name: 'install', url: '/?demo=1&screen=install' },
  {
    name: 'onboarding',
    url: '/?demo=1',
    settings: { onboardingDone: false },
    act: async (page) => {
      await page.getByRole('heading', { name: 'Welcome to DriveDeck' }).waitFor();
    },
  },
  {
    name: 'onboarding-layout',
    url: '/?demo=1',
    settings: { onboardingDone: false },
    act: async (page) => {
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^(Next|Skip)$/ }).click();
      await page.getByRole('heading', { name: 'Where should the side rail go?' }).waitFor();
    },
  },
  {
    name: 'home-simplified',
    url: '/?demo=1',
    settings: { simplified: true, theme: 'dark' },
  },
  {
    name: 'spotify-connect',
    url: '/?screen=spotify',
    settings: spotifySettings,
  },
];

const SIZES = [
  { tag: 'portrait', viewport: PORTRAIT },
  { tag: 'landscape', viewport: LANDSCAPE },
];

for (const scene of scenes) {
  if (only && !only.includes(scene.name)) continue;
  for (const size of SIZES) {
    test(`${scene.name} ${size.tag}`, async ({ page }) => {
      await seed(page, scene.settings, scene.storage);
      await mockExternal(page);
      await mockSpotify(page, scene.spotify);
      await page.setViewportSize(size.viewport);
      await page.goto(scene.url);
      await waitForApp(page);
      await scene.act?.(page);
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(dir, `${scene.name}-${size.tag}.png`) });
    });
  }
}
