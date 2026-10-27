import { expect, test } from '@playwright/test';
import { LANDSCAPE, PORTRAIT, mockExternal, seed, waitForApp } from './helpers';

test.describe('shell', () => {
  test('home shows the app grid and a dock with the Home button', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await waitForApp(page);
    await expect(page.getByRole('button', { name: 'Maps' }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Dock' })).toBeVisible();
    expect(await page.locator('.home__cell').count()).toBeGreaterThanOrEqual(7);
  });

  test('portrait uses the top status bar + bottom dock, landscape uses the side rail', async ({ page }) => {
    await seed(page);
    await page.setViewportSize(PORTRAIT);
    await page.goto('/');
    await waitForApp(page);
    await expect(page.locator('.chassis')).toHaveAttribute('data-layout', 'portrait');
    await expect(page.locator('.status-bar')).toBeVisible();
    await page.setViewportSize(LANDSCAPE);
    await expect(page.locator('.chassis')).toHaveAttribute('data-layout', 'landscape');
    await expect(page.locator('.rail[data-variant="rail"]')).toBeVisible();
  });

  test('every interactive control in the dock meets the 64px touch target', async ({ page }) => {
    await seed(page);
    await page.setViewportSize(LANDSCAPE);
    await page.goto('/');
    await waitForApp(page);
    const boxes = await page.locator('.rail .dock-btn').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }),
    );
    const visible = boxes.filter((b) => b.h > 0 && b.w > 0);
    expect(visible.length).toBeGreaterThan(3);
    for (const b of visible) {
      expect(b.h).toBeGreaterThanOrEqual(64);
      expect(b.w).toBeGreaterThanOrEqual(64);
    }
  });

  test('edit mode toggles and hides an app', async ({ page }) => {
    // Edit mode wiggles forever; reduced motion keeps Playwright's stability checks meaningful.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seed(page);
    await page.goto('/');
    await waitForApp(page);
    const countApps = () => page.locator('.home__cell .app-icon').count();
    const before = await countApps();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('.home__cell[data-editing="true"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Hide' }).first().click();
    await page.getByRole('button', { name: 'Done' }).click();
    expect(await countApps()).toBe(before - 1);
  });

  test('driving lock: typing is blocked above the speed threshold until a passenger confirms', async ({
    page,
  }) => {
    await seed(page, { recents: [], navApp: 'apple' });
    await mockExternal(page);
    await page.goto('/?screen=maps');
    await waitForApp(page);
    const input = page.locator('.maps__search input');
    await expect(input).toHaveAttribute('data-locked', 'false');

    // Simulate the car moving at 50 km/h.
    await page.evaluate(() => {
      const dd = (window as unknown as { __dd: { geo: { getState(): { ingest(p: unknown): void } } } }).__dd;
      dd.geo.getState().ingest({
        coords: { latitude: 41, longitude: 29, accuracy: 5, speed: 50 / 3.6, heading: 90 },
        timestamp: Date.now(),
      });
    });
    await expect(input).toHaveAttribute('data-locked', 'true');
    await input.click();
    const prompt = page.getByRole('alertdialog', { name: 'Parked? Passenger mode' });
    await expect(prompt).toBeVisible();

    await prompt.getByRole('button', { name: "I'm a passenger" }).click();
    await expect(prompt).toBeHidden();
    await expect(input).toHaveAttribute('data-locked', 'false');
    await input.fill('galata');
    await expect(page.locator('.maps__panel [role="option"]').first()).toBeVisible();
  });

  test('hand-off uses the documented deep link for the preferred navigation app', async ({ page }) => {
    await seed(page, {
      navApp: 'waze',
      recents: [{ id: 'r1', name: 'Pier', lat: 40.9925, lng: 29.0245, ts: 1 }],
    });
    await mockExternal(page);
    // Intercept the navigation instead of leaving the app.
    let target = '';
    await page.route('https://waze.com/**', (route) => {
      target = route.request().url();
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>waze</html>' });
    });
    await page.goto('/?screen=dashboard');
    await waitForApp(page);
    await page.locator('[data-widget="recents"] .row').first().click();
    await expect.poll(() => target).toBe('https://waze.com/ul?ll=40.9925,29.0245&navigate=yes');
  });

  test('settings: theme and accent apply live and persist', async ({ page }) => {
    await seed(page);
    await mockExternal(page);
    await page.goto('/?screen=settings');
    await waitForApp(page);
    await page.getByRole('button', { name: /Appearance/ }).click();
    await page.getByRole('radio', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('radio', { name: '#ff5c5c' }).click();
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe(
      '#ff5c5c',
    );
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dd.settings')!).state);
    expect(stored.theme).toBe('light');
    expect(stored.accent).toBe('#ff5c5c');
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('settings search finds items across sections and edits them', async ({ page }) => {
    await seed(page);
    await page.goto('/?screen=settings');
    await waitForApp(page);
    await page.getByRole('textbox', { name: 'Search settings' }).fill('speed alert');
    const row = page.locator('[data-item="speedAlert"]');
    await expect(row).toBeVisible();
    await page.getByRole('textbox', { name: 'Search settings' }).fill('passenger');
    await expect(page.locator('[data-item="passengerOverride"]')).toBeVisible();
    await page.getByRole('switch', { name: 'Passenger override' }).click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dd.settings')!).state);
    expect(stored.passengerOverride).toBe(false);
    await page.getByRole('textbox', { name: 'Search settings' }).fill('zzzzqq');
    await expect(page.getByText('No settings match')).toBeVisible();
  });

  test('custom shortcut: validates the URL, then shows up on Home', async ({ page }) => {
    await seed(page);
    await page.goto('/?screen=settings');
    await waitForApp(page);
    await page.getByRole('button', { name: /Layout/ }).click();
    await page.getByRole('button', { name: 'Add shortcut' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Mom');
    await page.getByRole('textbox', { name: 'Link or URL scheme' }).fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('not allowed for safety')).toBeVisible();
    await page.getByRole('textbox', { name: 'Link or URL scheme' }).fill('tel:+905551234567');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.evaluate(() =>
      (window as unknown as { __dd: { router: { getState(): { reset(s: string): void } } } }).__dd.router
        .getState()
        .reset('home'),
    );
    await waitForApp(page);
    await expect(page.getByRole('button', { name: 'Mom' })).toBeVisible();
  });

  test('onboarding walks through every step and then opens Home', async ({ page }) => {
    await seed(page, { onboardingDone: false });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to DriveDeck' })).toBeVisible();
    await expect(page.locator('.rail, .dock-btn')).toHaveCount(0); // no dock during onboarding
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Allow location' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Connect your music' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('radio', { name: /Right/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Start driving' }).click();
    await expect(page.locator('.home')).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dd.settings')!).state);
    expect(stored.onboardingDone).toBe(true);
    expect(stored.railPosition).toBe('right');
  });

  test('known limitations and diagnostics screens render real content', async ({ page }) => {
    await seed(page);
    await page.goto('/?screen=limitations');
    await waitForApp(page);
    await expect(page.getByRole('heading', { name: 'Steering-wheel buttons' })).toBeVisible();
    expect(await page.locator('.limit').count()).toBeGreaterThanOrEqual(8);
    await page.goto('/?screen=diagnostics');
    await waitForApp(page);
    await expect(page.getByText('Media Session', { exact: true })).toBeVisible();
    await expect(page.getByText('Wake lock', { exact: true })).toBeVisible();
    await expect(page.getByText('GPS accuracy')).toBeVisible();
  });

  test('changing the accent setting updates the live design token', async ({ page }) => {
    await seed(page, { accent: '#ff5c5c' });
    await page.goto('/');
    await waitForApp(page);
    const accent = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
    expect(accent).toBe('#ff5c5c');
  });
});
