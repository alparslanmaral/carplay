import { decideStartRoute, readHandoff } from './startRoute';
import { readPersistedStack, restoreStack, startRouterPersistence, useRouter } from './router';
import { getSettings, useSettings } from './settings';
import { startDrivingMonitor } from './driving';
import { setupI18n } from './i18n';
import { startGeoIfPermitted } from '../services/maps/geolocation';
import { DemoController } from '../services/media/demo';
import {
  pickInitialSource,
  registerController,
  availableSources,
  setActiveSource,
} from '../services/media/manager';
import { log } from './logger';

/**
 * One-time startup, run before the first render so the first paint is already on the right screen.
 * Service controllers are registered here; Spotify/YouTube register themselves in later milestones' modules.
 */
export function bootstrapApp(): void {
  setupI18n();

  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') useSettings.getState().set('demoPlayer', true);

  registerController(new DemoController());

  const s = getSettings();
  const saved = readPersistedStack();
  const route = decideStartRoute({
    onboardingDone: s.onboardingDone || params.get('skipOnboarding') === '1',
    startScreen: s.startScreen,
    hasSavedStack: !!saved,
    handoffAt: readHandoff(),
    now: Date.now(),
  });
  if (route.type === 'restore' && saved) restoreStack(saved);
  else if (route.type === 'onboarding') useRouter.getState().reset('onboarding');
  else if (route.type === 'screen') useRouter.getState().reset(route.screen);
  const screenParam = params.get('screen');
  if (screenParam === 'dashboard' || screenParam === 'nowplaying') useRouter.getState().reset(screenParam);

  startRouterPersistence();
  startDrivingMonitor();
  void startGeoIfPermitted();

  const initial = pickInitialSource(s.defaultSource, s.lastSource, availableSources());
  if (initial) void setActiveSource(initial).catch((e) => log.warn('boot', 'activating source failed', e));
}
