import { expect, test, type Page } from '@playwright/test';
import { ROUTE_POINTS, mockExternal, seed, waitForApp } from './helpers';

type Dev = {
  __dd: {
    sport: {
      getState(): {
        active: boolean;
        locked: boolean;
        demo: boolean;
        rpm: number;
        gear: number;
        boost: number;
      };
    };
    geo: { getState(): { ingest(p: unknown): void } };
  };
};

const sportState = (page: Page) => page.evaluate(() => (window as unknown as Dev).__dd.sport.getState());

test.describe('sport mode', () => {
  test('turns on from the Sport screen, plays a test drive and never touches Media Session or <audio>', async ({
    page,
  }) => {
    await seed(page, { demoPlayer: false, lastSource: 'spotify', defaultSource: 'spotify' });
    await mockExternal(page);
    await page.goto('/?screen=sport');
    await waitForApp(page);

    const toggle = page.getByRole('button', { name: /Sport mode off/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.getByRole('button', { name: /Sport mode on/ })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await sportState(page)).active).toBe(true);
    await expect.poll(async () => (await sportState(page)).locked).toBe(false);

    await page.getByRole('button', { name: 'Test sound' }).click();
    await expect.poll(async () => (await sportState(page)).demo).toBe(true);
    // the scripted drive revs past idle, changes gear and builds boost
    await expect.poll(async () => (await sportState(page)).rpm, { timeout: 8000 }).toBeGreaterThan(3000);
    await expect.poll(async () => (await sportState(page)).gear, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(async () => (await sportState(page)).boost, { timeout: 8000 }).toBeGreaterThan(0.3);

    // Spotify keeps the steering-wheel keys: no <audio>, no Media Session metadata or handlers from DriveDeck
    const audio = await page.evaluate(() => ({
      audioElements: document.querySelectorAll('audio, video').length,
      metadata: navigator.mediaSession?.metadata ?? null,
    }));
    expect(audio).toEqual({ audioElements: 0, metadata: null });

    await page.getByRole('button', { name: 'Stop test' }).click();
    await expect.poll(async () => (await sportState(page)).demo).toBe(false);
    await page.getByRole('button', { name: /Sport mode on/ }).click();
    await expect.poll(async () => (await sportState(page)).active).toBe(false);
  });

  test('engine, turbo and exhaust switch independently and hide their own options', async ({ page }) => {
    await seed(page);
    await mockExternal(page);
    await page.goto('/?screen=sport');
    await waitForApp(page);
    const row = (id: string) => page.locator(`[data-item="${id}"]`);

    for (const id of ['sportEngine', 'sportTurbo', 'sportExhaust', 'sportEngineVolume']) {
      await expect(row(id)).toBeVisible();
    }
    // turbo off: only the engine and the exhaust remain
    await row('sportTurboOn').getByRole('switch').click();
    await expect(row('sportTurbo')).toBeHidden();
    await expect(row('sportTurboVolume')).toBeHidden();
    await expect(row('sportEngine')).toBeVisible();
    await expect(row('sportExhaust')).toBeVisible();

    await row('sportExhaustOn').getByRole('switch').click();
    await expect(row('sportExhaust')).toBeHidden();
    await row('sportEngineOn').getByRole('switch').click();
    await expect(row('sportEngine')).toBeHidden();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dd.settings')!).state);
    expect([stored.sportEngineOn, stored.sportTurboOn, stored.sportExhaustOn]).toEqual([false, false, false]);
  });

  test('the engine type can be chosen from a list of at least ten', async ({ page }) => {
    await seed(page);
    await mockExternal(page);
    await page.goto('/?screen=sport');
    await waitForApp(page);
    await page.locator('[data-item="sportEngine"]').getByRole('button').click();
    const list = page.getByRole('dialog');
    await expect(list.getByRole('radio')).toHaveCount(13);
    await list.getByRole('radio', { name: 'V12 (silky)' }).click();
    const engine = await page.evaluate(
      () => JSON.parse(localStorage.getItem('dd.settings')!).state.sportEngine,
    );
    expect(engine).toBe('v12');
  });
});

test.describe('dashboard navigation view', () => {
  test('shows the route, the next turn and the arrival time while a trip is running', async ({ page }) => {
    await seed(page, {
      navApp: 'drivedeck',
      recents: [{ id: 'r1', name: 'Pier', lat: 41.0256, lng: 28.9741, ts: 1 }],
    });
    await mockExternal(page);
    await page.goto('/?screen=dashboard');
    await waitForApp(page);
    const card = page.locator('[data-widget="map"]');
    await expect(card.locator('.widget-map__nav')).toHaveCount(0);

    await page.locator('[data-widget="recents"] .row').first().click();
    await page.locator('.maps__sheet').getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.nav__banner')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).first().click();

    await expect(card.locator('.widget-map__nav .nav__banner')).toContainText(
      'Turn right onto Alemdar Caddesi.',
    );
    await expect(card.locator('.widget-map__bar')).toContainText('2.0 km');

    await page.evaluate(
      ([la, ln]) =>
        (window as unknown as Dev).__dd.geo.getState().ingest({
          coords: { latitude: la, longitude: ln, accuracy: 8, speed: 12, heading: 0 },
          timestamp: Date.now(),
        }),
      ROUTE_POINTS[3]!,
    );
    await expect(card.locator('.widget-map__nav .nav__banner')).toContainText(
      'Turn left onto Galata Bridge.',
    );

    // ending the trip on the Maps screen clears the dashboard again
    await card.locator('.mapcanvas__activate').click();
    await page.locator('.nav__bar').getByRole('button', { name: 'End' }).click();
    await page.getByRole('button', { name: 'Back' }).first().click();
    await expect(card.locator('.widget-map__nav')).toHaveCount(0);
    await expect(card.locator('.widget-map__bar')).toHaveCount(0);
  });

  test('a route being previewed shows as a chip on the dashboard', async ({ page }) => {
    await seed(page, {
      navApp: 'drivedeck',
      recents: [{ id: 'r1', name: 'Pier', lat: 41.0256, lng: 28.9741, ts: 1 }],
    });
    await mockExternal(page);
    await page.goto('/?screen=dashboard');
    await waitForApp(page);
    await page.locator('[data-widget="recents"] .row').first().click();
    await expect(page.locator('.maps__sheet').getByRole('button', { name: 'Start' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).first().click();
    await expect(page.locator('[data-widget="map"] .widget-map__bar')).toContainText('Pier');
  });
});
