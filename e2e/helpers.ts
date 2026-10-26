import type { Page } from '@playwright/test';

/** Preload persisted settings before the app boots (skips onboarding, enables the demo player). */
export async function seed(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((overrides) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem(
      'dd.settings',
      JSON.stringify({ state: { onboardingDone: true, demoPlayer: true, ...overrides }, version: 1 }),
    );
  }, settings);
}

export const PORTRAIT = { width: 390, height: 844 };
export const LANDSCAPE = { width: 844, height: 390 };

export async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector('.chassis');
  // let entry animations settle
  await page.waitForTimeout(450);
}
