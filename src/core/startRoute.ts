import type { ScreenId } from './router';

/** Returning from a hand-off (Maps, Spotify, a shortcut) within this window restores the exact screen. */
export const HANDOFF_WINDOW_MS = 30 * 60 * 1000;
const KEY = 'dd.handoff';

export function markHandoff(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function readHandoff(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export type StartRoute = { type: 'onboarding' } | { type: 'restore' } | { type: 'screen'; screen: ScreenId };

export interface StartInput {
  onboardingDone: boolean;
  startScreen: 'home' | 'dashboard' | 'last';
  hasSavedStack: boolean;
  handoffAt: number | null;
  now: number;
}

/** Decide what the app shows on launch. Hand-off returns always win so the user lands where they left. */
export function decideStartRoute(i: StartInput): StartRoute {
  if (!i.onboardingDone) return { type: 'onboarding' };
  const returningFromHandoff = i.handoffAt !== null && i.now - i.handoffAt < HANDOFF_WINDOW_MS;
  if (i.hasSavedStack && (returningFromHandoff || i.startScreen === 'last')) return { type: 'restore' };
  return { type: 'screen', screen: i.startScreen === 'dashboard' ? 'dashboard' : 'home' };
}
