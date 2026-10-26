import { useEffect } from 'react';
import { useSettings } from '../../core/settings';
import { applyTheme, currentThemeContext, resolveTheme } from '../../core/theme';

/** Applies theme + design tokens to <html> on every settings change, and re-evaluates sunset/system themes. */
export function useThemeEngine(): void {
  useEffect(() => {
    const apply = () => {
      const s = useSettings.getState();
      applyTheme(s, resolveTheme(s.theme, currentThemeContext()));
    };
    apply();
    const unsub = useSettings.subscribe(apply);
    const timer = setInterval(apply, 60_000);
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    mq?.addEventListener('change', apply);
    document.addEventListener('visibilitychange', apply);
    return () => {
      unsub();
      clearInterval(timer);
      mq?.removeEventListener('change', apply);
      document.removeEventListener('visibilitychange', apply);
    };
  }, []);
}
