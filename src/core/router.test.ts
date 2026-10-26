import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_DEPTH, persistRouter, readPersistedStack, restoreStack, useRouter } from './router';
import { HANDOFF_WINDOW_MS, decideStartRoute } from './startRoute';

const top = () => useRouter.getState().stack.at(-1)!;

beforeEach(() => {
  useRouter.getState().reset('home');
});

describe('router', () => {
  it('push / pop with the right action', () => {
    useRouter.getState().push('maps');
    expect(top().screen).toBe('maps');
    expect(useRouter.getState().action).toBe('push');
    useRouter.getState().pop();
    expect(top().screen).toBe('home');
    expect(useRouter.getState().action).toBe('pop');
  });

  it('never pops the root', () => {
    useRouter.getState().pop();
    expect(useRouter.getState().stack).toHaveLength(1);
  });

  it('ignores a push of the identical screen', () => {
    useRouter.getState().push('maps');
    useRouter.getState().push('maps');
    expect(useRouter.getState().stack).toHaveLength(2);
  });

  it('open() pops back to a screen that is already in the stack', () => {
    const r = useRouter.getState();
    r.push('maps');
    r.push('settings');
    r.open('maps');
    expect(useRouter.getState().stack.map((e) => e.screen)).toEqual(['home', 'maps']);
    expect(useRouter.getState().action).toBe('pop');
  });

  it('reset collapses the stack', () => {
    const r = useRouter.getState();
    r.push('maps');
    r.push('settings');
    r.reset('dashboard');
    expect(useRouter.getState().stack.map((e) => e.screen)).toEqual(['dashboard']);
  });

  it('caps the depth but keeps the root and the newest entries', () => {
    const screens = [
      'maps',
      'spotify',
      'youtube',
      'settings',
      'diagnostics',
      'limitations',
      'install',
      'destinations',
      'nowplaying',
      'dashboard',
      'maps',
    ] as const;
    screens.forEach((s, i) => useRouter.getState().push(s, { n: String(i) }));
    const stack = useRouter.getState().stack;
    expect(stack.length).toBeLessThanOrEqual(MAX_DEPTH);
    expect(stack[0]!.screen).toBe('home');
    expect(stack.at(-1)!.params.n).toBe(String(screens.length - 1));
  });

  it('persists and restores the stack (hand-off return)', () => {
    const r = useRouter.getState();
    r.push('maps', { q: 'x' });
    persistRouter();
    r.reset('home');
    const saved = readPersistedStack();
    expect(saved).not.toBeNull();
    restoreStack(saved!);
    expect(useRouter.getState().stack.map((e) => e.screen)).toEqual(['home', 'maps']);
    expect(top().params.q).toBe('x');
  });

  it('does not restore onboarding or unknown screens', () => {
    localStorage.setItem(
      'dd.router',
      JSON.stringify({ stack: [{ screen: 'onboarding' }, { screen: 'bogus' }], savedAt: 1 }),
    );
    expect(readPersistedStack()).toBeNull();
  });
});

describe('decideStartRoute', () => {
  const base = {
    onboardingDone: true,
    startScreen: 'home' as const,
    hasSavedStack: true,
    handoffAt: null,
    now: 1_000_000_000,
  };

  it('shows onboarding on first run', () => {
    expect(decideStartRoute({ ...base, onboardingDone: false })).toEqual({ type: 'onboarding' });
  });
  it('restores instantly when returning from a hand-off', () => {
    expect(decideStartRoute({ ...base, handoffAt: base.now - 60_000 })).toEqual({ type: 'restore' });
  });
  it('ignores stale hand-offs', () => {
    expect(decideStartRoute({ ...base, handoffAt: base.now - HANDOFF_WINDOW_MS - 1 })).toEqual({
      type: 'screen',
      screen: 'home',
    });
  });
  it('honours start screen = last and dashboard', () => {
    expect(decideStartRoute({ ...base, startScreen: 'last' })).toEqual({ type: 'restore' });
    expect(decideStartRoute({ ...base, startScreen: 'dashboard' })).toEqual({
      type: 'screen',
      screen: 'dashboard',
    });
  });
});
