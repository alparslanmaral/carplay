import type { AppDef } from '../core/apps';
import { useRouter } from '../core/router';
import { toast } from '../core/toast';
import { persistRouter } from '../core/router';
import { markHandoff } from '../core/startRoute';

/** Open an app tile: built-in apps navigate, shortcuts hand off to their URL or URL scheme. */
export function launchApp(app: AppDef): void {
  if (app.screen) {
    if (app.screen === 'home' || app.screen === 'dashboard') useRouter.getState().reset(app.screen);
    else useRouter.getState().open(app.screen);
    return;
  }
  if (app.url) openExternal(app.url);
}

export function openExternal(url: string): void {
  try {
    persistRouter();
    markHandoff();
    // A direct navigation keeps iOS in standalone mode and lets URL schemes (tel:, sms:, waze://) reach their app.
    window.location.href = url;
  } catch {
    toast('Could not open link', 'bad');
  }
}
