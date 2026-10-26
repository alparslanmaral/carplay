import { useEffect } from 'react';
import { isInputLocked, useDriving } from '../../core/driving';
import { useRouter } from '../../core/router';
import { useSettings } from '../../core/settings';
import { installTapFeedback } from '../../services/feedback';
import { restartGeo } from '../../services/maps/geolocation';
import { setWakeLockWanted } from '../../services/wakeLock';

/** App-wide side effects driven by settings: wake lock, idle return, keyboard lock, tap feedback, GPS mode. */
export function useAppEffects(): void {
  const keepAwake = useSettings((s) => s.keepAwake);
  const idleMinutes = useSettings((s) => s.idleReturnMinutes);
  const gpsMode = useSettings((s) => s.gpsMode);

  useEffect(() => setWakeLockWanted(keepAwake), [keepAwake]);

  useEffect(() => installTapFeedback(), []);

  useEffect(() => restartGeo(), [gpsMode]);

  useEffect(() => {
    if (!idleMinutes) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { stack, reset } = useRouter.getState();
        if (stack.length > 1 || stack[0]!.screen !== 'home') reset('home');
      }, idleMinutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [idleMinutes]);

  // Driving lock: any text field that receives focus while moving is blurred and the passenger prompt opens.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && isInputLocked()) {
        el.blur();
        useDriving.getState().openPrompt();
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
}
