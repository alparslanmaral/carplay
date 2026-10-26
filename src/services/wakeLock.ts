import { create } from 'zustand';
import { getFeatures } from '../core/features';
import { log } from '../core/logger';

export type WakeLockStatus = 'unsupported' | 'off' | 'held' | 'denied';

interface WakeLockState {
  status: WakeLockStatus;
  lastError: string | null;
}

export const useWakeLockState = create<WakeLockState>(() => ({
  status: getFeatures().wakeLock ? 'off' : 'unsupported',
  lastError: null,
}));

let sentinel: WakeLockSentinel | null = null;
let wanted = false;
let listening = false;

async function acquire(): Promise<void> {
  if (!getFeatures().wakeLock || !wanted || sentinel || document.hidden) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    useWakeLockState.setState({ status: 'held', lastError: null });
    sentinel.addEventListener('release', () => {
      sentinel = null;
      useWakeLockState.setState({ status: 'off' });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn('wakeLock', message);
    useWakeLockState.setState({ status: 'denied', lastError: message });
  }
}

/** The browser drops the lock whenever the page is hidden, so it has to be re-acquired on return. */
function onVisibility(): void {
  if (!document.hidden) void acquire();
}

export function setWakeLockWanted(value: boolean): void {
  wanted = value;
  if (!getFeatures().wakeLock) return;
  if (value) {
    if (!listening) {
      document.addEventListener('visibilitychange', onVisibility);
      listening = true;
    }
    void acquire();
  } else {
    void sentinel?.release();
    sentinel = null;
    useWakeLockState.setState({ status: 'off' });
  }
}
