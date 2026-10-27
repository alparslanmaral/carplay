import { create } from 'zustand';

export type ScreenId =
  | 'home'
  | 'dashboard'
  | 'nowplaying'
  | 'spotify'
  | 'youtube'
  | 'maps'
  | 'destinations'
  | 'sport'
  | 'settings'
  | 'diagnostics'
  | 'limitations'
  | 'install'
  | 'onboarding';

export type NavAction = 'init' | 'push' | 'pop' | 'reset';
export type Params = Record<string, string>;

export interface Entry {
  key: number;
  screen: ScreenId;
  params: Params;
}

interface RouterState {
  stack: Entry[];
  /** What produced the current top entry - drives the transition direction. */
  action: NavAction;
  push: (screen: ScreenId, params?: Params) => void;
  /** Push, or pop back to the screen if it is already in the stack (keeps the stack shallow). */
  open: (screen: ScreenId, params?: Params) => void;
  pop: () => void;
  reset: (screen: ScreenId, params?: Params) => void;
  /** Replace the top entry without animating. */
  replaceParams: (params: Params) => void;
}

export const MAX_DEPTH = 10;
const STORAGE_KEY = 'dd.router';
let keyCounter = 1;

const entry = (screen: ScreenId, params: Params = {}): Entry => ({ key: keyCounter++, screen, params });

const SCREENS: readonly ScreenId[] = [
  'home',
  'dashboard',
  'nowplaying',
  'spotify',
  'youtube',
  'maps',
  'destinations',
  'sport',
  'settings',
  'diagnostics',
  'limitations',
  'install',
  'onboarding',
];

export function isScreenId(value: unknown): value is ScreenId {
  return typeof value === 'string' && (SCREENS as readonly string[]).includes(value);
}

const sameParams = (a: Params, b: Params) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

export const useRouter = create<RouterState>((set, get) => ({
  stack: [entry('home')],
  action: 'init',
  push: (screen, params = {}) => {
    const { stack } = get();
    const top = stack[stack.length - 1]!;
    if (top.screen === screen && sameParams(top.params, params)) return;
    const next = [...stack, entry(screen, params)];
    // Keep the root, drop the oldest middle entries.
    const trimmed = next.length > MAX_DEPTH ? [next[0]!, ...next.slice(next.length - MAX_DEPTH + 1)] : next;
    set({ stack: trimmed, action: 'push' });
  },
  open: (screen, params = {}) => {
    const { stack, push } = get();
    const idx = stack.findIndex((e) => e.screen === screen);
    if (idx === -1) return push(screen, params);
    if (idx === stack.length - 1) {
      if (!sameParams(stack[idx]!.params, params))
        set({ stack: [...stack.slice(0, idx), entry(screen, params)], action: 'pop' });
      return;
    }
    set({ stack: [...stack.slice(0, idx), entry(screen, params)], action: 'pop' });
  },
  pop: () => {
    const { stack } = get();
    if (stack.length <= 1) return;
    set({ stack: stack.slice(0, -1), action: 'pop' });
  },
  reset: (screen, params = {}) => {
    const { stack } = get();
    const top = stack[stack.length - 1]!;
    if (stack.length === 1 && top.screen === screen && sameParams(top.params, params)) return;
    set({ stack: [entry(screen, params)], action: 'reset' });
  },
  replaceParams: (params) => {
    const { stack } = get();
    const top = stack[stack.length - 1]!;
    set({ stack: [...stack.slice(0, -1), { ...top, params }] });
  },
}));

export const currentScreen = (): Entry => {
  const { stack } = useRouter.getState();
  return stack[stack.length - 1]!;
};

interface Persisted {
  stack: { screen: ScreenId; params: Params }[];
  savedAt: number;
}

/** Persist the stack so a hand-off to another app (or iOS killing the PWA) restores the exact screen. */
export function persistRouter(): void {
  try {
    const { stack } = useRouter.getState();
    const data: Persisted = {
      stack: stack.map(({ screen, params }) => ({ screen, params })),
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode) - restoring is a nicety only */
  }
}

export function readPersistedStack(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!Array.isArray(parsed.stack) || parsed.stack.length === 0) return null;
    const clean = parsed.stack.filter((e) => isScreenId(e?.screen) && e.screen !== 'onboarding');
    if (clean.length === 0) return null;
    return {
      stack: clean.map((e) => ({ screen: e.screen, params: e.params ?? {} })),
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function restoreStack(saved: Persisted): void {
  keyCounter += 1;
  useRouter.setState({ stack: saved.stack.map((e) => entry(e.screen, e.params)), action: 'init' });
}

/** Subscribes persistence; returns an unsubscribe function. */
export function startRouterPersistence(): () => void {
  return useRouter.subscribe(persistRouter);
}
