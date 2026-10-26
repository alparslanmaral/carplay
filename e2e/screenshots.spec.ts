import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LANDSCAPE, PORTRAIT, seed, waitForApp } from './helpers';

/**
 * Screenshots at 390x844 (portrait) and 844x390 (landscape) for every scene.
 * Output folder: SHOT_DIR (default docs/screenshots/latest). Run: npm run shots
 */
const dir = process.env.SHOT_DIR ?? join('docs', 'screenshots', 'latest');
mkdirSync(dir, { recursive: true });

interface Scene {
  name: string;
  url: string;
  settings?: Record<string, unknown>;
  act?: (page: Page) => Promise<void>;
}

const scenes: Scene[] = [
  { name: 'home', url: '/?demo=1' },
  {
    name: 'home-light-right-rail',
    url: '/?demo=1',
    settings: { theme: 'light', railPosition: 'right', accent: '#ff8a3d' },
  },
];

const SIZES = [
  { tag: 'portrait', viewport: PORTRAIT },
  { tag: 'landscape', viewport: LANDSCAPE },
];

for (const scene of scenes) {
  for (const size of SIZES) {
    test(`${scene.name} ${size.tag}`, async ({ page }) => {
      await seed(page, scene.settings);
      await page.setViewportSize(size.viewport);
      await page.goto(scene.url);
      await waitForApp(page);
      await scene.act?.(page);
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(dir, `${scene.name}-${size.tag}.png`) });
    });
  }
}
