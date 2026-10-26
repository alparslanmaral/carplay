import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  FAKE_SPOTIFY_TOKEN,
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
