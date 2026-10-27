import { defineConfig } from '@playwright/test';

const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${DEV_PORT}`,
    hasTouch: true,
    isMobile: true,
    // SHOT_SCALE=1 keeps committed screenshots small
    deviceScaleFactor: Number(process.env.SHOT_SCALE ?? 2),
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'Europe/Istanbul',
    // Spoof a GPS fix so location-dependent UI (map, speed, weather) is deterministic.
    geolocation: { latitude: 41.0082, longitude: 28.9784, accuracy: 12 },
    permissions: ['geolocation'],
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /(smoke|touch-targets|navigation|sport)\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 } },
    },
    { name: 'shots', testMatch: /screenshots\.spec\.ts/ },
    {
      // Runs against the production build (minified bundle + service worker): `npm run e2e:pwa`
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${PREVIEW_PORT}`, viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: `http://127.0.0.1:${DEV_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run build && npm run preview',
      url: `http://127.0.0.1:${PREVIEW_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
