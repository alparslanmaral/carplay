import { defineConfig } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'Europe/Istanbul',
    // Spoof a GPS fix so location-dependent UI (map, speed, weather) is deterministic.
    geolocation: { latitude: 41.0082, longitude: 28.9784, accuracy: 12 },
    permissions: ['geolocation'],
  },
  projects: [
    { name: 'smoke', testMatch: /smoke\.spec\.ts/, use: { viewport: { width: 390, height: 844 } } },
    { name: 'shots', testMatch: /screenshots\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
