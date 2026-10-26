import { expect, test } from '@playwright/test';
import { LANDSCAPE, PORTRAIT, seed, waitForApp } from './helpers';

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
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('.home__cell[data-editing="true"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Hide' }).first().click();
    await page.getByRole('button', { name: 'Done' }).click();
    const names = await page
      .locator('.home__cell .app-icon')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(names.length).toBeLessThan(7);
  });

  test('changing the accent setting updates the live design token', async ({ page }) => {
    await seed(page, { accent: '#ff5c5c' });
    await page.goto('/');
    await waitForApp(page);
    const accent = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
    expect(accent).toBe('#ff5c5c');
  });
});
