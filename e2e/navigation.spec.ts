import { expect, test, type Page } from '@playwright/test';
import { ROUTE_POINTS, mockExternal, seed, waitForApp } from './helpers';

const pier = { id: 'r1', name: 'Pier', lat: 41.0256, lng: 28.9741, ts: 1 };

type Dev = { __dd: { geo: { getState(): { ingest(p: unknown): void } } } };

/** Feed a GPS fix, as if the car had moved. */
async function moveTo(page: Page, [lat, lng]: [number, number]): Promise<void> {
  await page.evaluate(
    ([la, ln]) => {
      (window as unknown as Dev).__dd.geo.getState().ingest({
        coords: { latitude: la, longitude: ln, accuracy: 8, speed: 12, heading: 0 },
        timestamp: Date.now(),
      });
    },
    [lat, lng] as const,
  );
}

async function openRoute(page: Page): Promise<void> {
  await page.goto('/?screen=dashboard');
  await waitForApp(page);
  await page.locator('[data-widget="recents"] .row').first().click();
  await expect(page.locator('.maps__sheet').getByRole('button', { name: 'Start' })).toBeVisible();
}

test.describe('in-app navigation', () => {
  test('previews a route, avoids tolls, guides turn by turn and ends on arrival', async ({ page }) => {
    await seed(page, { navApp: 'drivedeck', recents: [pier] });
    await mockExternal(page);
    await openRoute(page);

    const sheet = page.locator('.maps__sheet');
    await expect(sheet.getByText('2.0 km')).toBeVisible();
    await expect(sheet.getByText('This route still includes toll roads')).toBeVisible();

    await sheet.getByRole('button', { name: 'Avoid tolls' }).click();
    await expect(sheet.getByText('No toll roads')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dd.settings')!).state.avoidTolls)).toBe(
      true,
    );

    await sheet.getByRole('button', { name: 'Start' }).click();
    const banner = page.locator('.nav__banner');
    await expect(banner).toContainText('Turn right onto Alemdar Caddesi.');
    await expect(banner).toContainText('400 m');
    await expect(page.locator('.maps__search')).toBeHidden();

    await moveTo(page, ROUTE_POINTS[3]!);
    await expect(banner).toContainText('Turn left onto Galata Bridge.');

    await moveTo(page, ROUTE_POINTS[5]!);
    await expect(banner).toContainText('You have arrived');
    await page.locator('.nav__bar').getByRole('button', { name: 'Done' }).click();
    await expect(banner).toBeHidden();
    await expect(page.locator('.maps__search')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('dd.nav'))).toBeNull();
  });

  test('"ask every time" offers DriveDeck next to the other apps', async ({ page }) => {
    await seed(page, { navApp: 'ask', recents: [pier] });
    await mockExternal(page);
    await page.goto('/?screen=dashboard');
    await waitForApp(page);
    await page.locator('[data-widget="recents"] .row').first().click();
    await page.getByRole('button', { name: 'DriveDeck (open source)' }).click();
    await expect(page.locator('.maps__sheet').getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('closing the preview returns to a normal map', async ({ page }) => {
    await seed(page, { navApp: 'drivedeck', recents: [pier] });
    await mockExternal(page);
    await openRoute(page);
    await page.locator('.maps__sheet').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.maps__sheet')).toBeHidden();
  });

  test('a restarted app picks the trip back up', async ({ page }) => {
    await seed(page, { navApp: 'drivedeck', recents: [pier] });
    await mockExternal(page);
    await openRoute(page);
    await page.locator('.maps__sheet').getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.nav__banner')).toBeVisible();

    await page.reload();
    await waitForApp(page);
    await expect(page.locator('.nav__banner')).toBeVisible();
    await expect(page.locator('.nav__bar')).toBeVisible();
  });

  test('Google Maps hand-off carries the toll preference', async ({ page }) => {
    await seed(page, { navApp: 'google', avoidTolls: true, recents: [pier] });
    await mockExternal(page);
    let target = '';
    await page.route('https://www.google.com/maps/**', (route) => {
      target = route.request().url();
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>maps</html>' });
    });
    await page.goto('/?screen=dashboard');
    await waitForApp(page);
    await page.locator('[data-widget="recents"] .row').first().click();
    await expect.poll(() => target).toContain('&avoid=tolls');
  });
});
