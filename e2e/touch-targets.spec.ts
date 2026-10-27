import { expect, test, type Page } from '@playwright/test';
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
 * The brief: "Minimum touch target 64 px". Walks the app and checks the rendered size of every interactive
 * element (sizes are CSS px, so 64 means 64 points on the phone). Third-party widgets are exempt.
 */
const MIN = 63.5;

const INTERACTIVE =
  'button, a[href], [role="button"], [role="radio"], [role="switch"], [role="checkbox"], [role="tab"], [role="slider"], [role="option"], input:not([type="hidden"]), textarea, select';

async function audit(page: Page): Promise<string[]> {
  return page.evaluate(
    ([selector, min]) => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(selector as string)) {
        if (el.closest('.maplibregl-ctrl, .maplibregl-canvas-container, .sr-only, [inert], [hidden]'))
          continue;
        if (el.classList.contains('sr-only')) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none')
          continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // clipped by a scroll container: only the on-screen part counts as the target
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        if (Math.min(r.width, r.height) < (min as number)) {
          const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? '';
          bad.push(
            `${el.tagName.toLowerCase()}.${el.className.toString().split(' ').join('.')} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }
      return bad;
    },
    [INTERACTIVE, MIN] as const,
  );
}

const sizes = [
  { tag: 'portrait', viewport: PORTRAIT },
  { tag: 'landscape', viewport: LANDSCAPE },
];

const ytSettings = {
  demoPlayer: false,
  defaultSource: 'youtube',
  lastSource: 'youtube',
  googleClientId: 'C',
};
const spSettings = {
  demoPlayer: false,
  defaultSource: 'spotify',
  lastSource: 'spotify',
  spotifyClientId: 'C',
};

interface Page_ {
  name: string;
  url: string;
  settings?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  act?: (page: Page) => Promise<void>;
}

const pages: Page_[] = [
  { name: 'home', url: '/?demo=1' },
  {
    name: 'home (edit mode)',
    url: '/?demo=1',
    act: async (p) => {
      await p.getByRole('button', { name: 'Edit' }).click();
    },
  },
  { name: 'home (simplified)', url: '/?demo=1', settings: { simplified: true } },
  {
    name: 'dashboard',
    url: '/?demo=1&screen=dashboard',
    settings: { favorites: [{ id: 'h', name: 'Home', lat: 41, lng: 29, kind: 'home' }] },
  },
  { name: 'now playing (demo)', url: '/?demo=1&screen=nowplaying' },
  {
    name: 'now playing (spotify)',
    url: '/?screen=nowplaying',
    settings: spSettings,
    storage: FAKE_SPOTIFY_TOKEN,
    act: async (p) => void (await p.waitForSelector('.np__title')),
  },
  {
    name: 'spotify library',
    url: '/?screen=spotify',
    settings: spSettings,
    storage: FAKE_SPOTIFY_TOKEN,
    act: async (p) => void (await p.waitForSelector('.row')),
  },
  {
    name: 'youtube',
    url: '/?screen=youtube',
    settings: ytSettings,
    storage: FAKE_YOUTUBE_TOKEN,
    act: async (p) => {
      await p.getByRole('radio', { name: 'Liked videos' }).click();
      await p.locator('.row').first().click();
      await p.waitForSelector('[data-testid="yt-iframe"]');
    },
  },
  {
    name: 'maps with destination',
    url: '/?demo=1',
    settings: { recents: [{ id: 'r1', name: 'Pier', lat: 40.99, lng: 29.02, ts: 1 }] },
    act: async (p) => {
      await p.evaluate(() =>
        (
          window as unknown as { __dd: { router: { getState(): { reset(s: string, q: object): void } } } }
        ).__dd.router
          .getState()
          .reset('maps', { dest: 'r1' }),
      );
      await p.waitForSelector('.maps__sheet');
      await p.getByRole('button', { name: 'Save' }).click();
    },
  },
  {
    name: 'maps route preview',
    url: '/?demo=1&screen=maps',
    settings: {
      navApp: 'drivedeck',
      recents: [{ id: 'r1', name: 'Pier', lat: 41.0256, lng: 28.9741, ts: 1 }],
    },
    act: async (p) => {
      await p.evaluate(() =>
        (
          window as unknown as { __dd: { router: { getState(): { reset(s: string, q: object): void } } } }
        ).__dd.router
          .getState()
          .reset('maps', { dest: 'r1' }),
      );
      await p.getByRole('button', { name: /Navigate in DriveDeck/ }).click();
      await p.getByRole('button', { name: 'Start' }).waitFor();
    },
  },
  {
    name: 'maps guidance',
    url: '/?demo=1&screen=maps',
    settings: {
      navApp: 'drivedeck',
      recents: [{ id: 'r1', name: 'Pier', lat: 41.0256, lng: 28.9741, ts: 1 }],
    },
    act: async (p) => {
      await p.evaluate(() =>
        (
          window as unknown as { __dd: { router: { getState(): { reset(s: string, q: object): void } } } }
        ).__dd.router
          .getState()
          .reset('maps', { dest: 'r1' }),
      );
      await p.getByRole('button', { name: /Navigate in DriveDeck/ }).click();
      await p.getByRole('button', { name: 'Start' }).click();
      await p.waitForSelector('.nav__banner');
    },
  },
  {
    name: 'maps search panel',
    url: '/?demo=1&screen=maps',
    settings: { recents: [{ id: 'r1', name: 'Pier', lat: 40.99, lng: 29.02, ts: 1 }] },
    act: async (p) => {
      await p.locator('.maps__search input').click();
      await p.waitForSelector('.maps__chips');
    },
  },
  {
    name: 'destinations',
    url: '/?demo=1&screen=destinations',
    settings: {
      recents: [{ id: 'r1', name: 'Pier', lat: 40.99, lng: 29.02, ts: 1 }],
      favorites: [{ id: 'h', name: 'Home', lat: 41, lng: 29, kind: 'home' }],
    },
  },
  { name: 'settings index', url: '/?demo=1&screen=settings' },
  ...['Appearance', 'Layout', 'Media', 'Maps', 'Driving and safety', 'Accounts and data', 'About'].map(
    (section): Page_ => ({
      name: `settings > ${section}`,
      url: '/?demo=1&screen=settings',
      settings: {
        dimEnabled: true,
        dimScheduleEnabled: true,
        shortcuts: [{ id: 's1', name: 'Mom', icon: 'phone', url: 'tel:1' }],
      },
      act: async (p) => {
        await p
          .locator('.screen__body')
          .getByRole('button', { name: new RegExp(section) })
          .click();
        await p.waitForTimeout(300);
        if (section === 'Layout') await p.getByRole('button', { name: 'Add shortcut' }).click();
      },
    }),
  ),
  { name: 'diagnostics', url: '/?demo=1&screen=diagnostics' },
  { name: 'limitations', url: '/?demo=1&screen=limitations' },
  { name: 'install guide', url: '/?demo=1&screen=install' },
  { name: 'onboarding', url: '/?demo=1', settings: { onboardingDone: false } },
];

for (const size of sizes) {
  test.describe(`touch targets ${size.tag}`, () => {
    for (const pg of pages) {
      test(pg.name, async ({ page }) => {
        // the edit-mode wiggle animation never settles; the layout size is what matters here
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await seed(page, pg.settings, pg.storage);
        await mockExternal(page);
        await mockSpotify(page);
        await page.setViewportSize(size.viewport);
        await page.goto(pg.url);
        await waitForApp(page);
        await pg.act?.(page);
        await page.waitForTimeout(300);
        expect(await audit(page)).toEqual([]);
      });
    }
  });
}
