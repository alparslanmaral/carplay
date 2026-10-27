import { expect, test } from '@playwright/test';
import { mockExternal, seed, waitForApp } from './helpers';

/** Runs against the production build: `npm run e2e:pwa` (builds and serves it on :4173). */

interface Manifest {
  name: string;
  short_name: string;
  display: string;
  orientation: string;
  start_url: string;
  scope: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

test.describe('installable PWA', () => {
  test('manifest declares a standalone, orientation-free app with maskable icons', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const res = await request.get(new URL(href!, page.url()).toString());
    expect(res.ok()).toBe(true);
    const m = (await res.json()) as Manifest;
    expect(m.name).toBe('DriveDeck');
    expect(m.display).toBe('standalone');
    expect(m.orientation).toBe('any');
    expect(m.theme_color).toMatch(/^#/);
    expect(m.background_color).toMatch(/^#/);
    const has = (size: string, purpose: string) =>
      m.icons.some((i) => i.sizes === size && (i.purpose ?? 'any') === purpose);
    expect(has('192x192', 'maskable')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    // every declared icon must actually be served as a PNG of the declared size
    for (const icon of m.icons) {
      const r = await request.get(new URL(icon.src, new URL(href!, page.url())).toString());
      expect(r.ok(), icon.src).toBe(true);
      const buf = await r.body();
      expect(buf.subarray(1, 4).toString(), icon.src).toBe('PNG');
      const w = buf.readUInt32BE(16);
      expect(`${w}x${w}`, icon.src).toBe(icon.sizes);
    }
  });

  test('iOS meta tags and the 180px apple-touch-icon are present', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute(
      'content',
      /.+/,
    );
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    const r = await request.get(new URL(href!, page.url()).toString());
    expect(r.ok()).toBe(true);
    expect((await r.body()).readUInt32BE(16)).toBe(180);
  });

  test('the app shell loads offline after the first visit', async ({ page, context }) => {
    await seed(page);
    await mockExternal(page);
    await page.goto('/');
    await waitForApp(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // the worker has to control the page before it can serve it offline
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await waitForApp(page);
    await expect(page.getByRole('button', { name: 'Maps' }).first()).toBeVisible();
    await expect(page.locator('.home')).toBeVisible();
    await context.setOffline(false);
  });

  test('production build has no dev-only debug hook', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await waitForApp(page);
    expect(await page.evaluate(() => '__dd' in window)).toBe(false);
  });
});
