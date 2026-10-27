import { decideStartRoute, readHandoff } from './startRoute';
import { isScreenId, readPersistedStack, restoreStack, startRouterPersistence, useRouter } from './router';
import { getSettings, useSettings } from './settings';
import { startDrivingMonitor, useDriving } from './driving';
import { setupI18n } from './i18n';
import { settingsEnglish } from './settingsSchema';
import { startGeoIfPermitted, useGeo } from '../services/maps/geolocation';
import { resumeNavigation } from '../services/maps/navigation';
import { DemoController } from '../services/media/demo';
import {
  pickInitialSource,
  registerController,
  availableSources,
  setActiveSource,
  useMedia,
} from '../services/media/manager';
import { handleRedirectCallback, initSpotifyAuthState, useSpotifyAuth } from '../services/spotify/auth';
import { spotifyController } from '../services/spotify/controller';
import { initYouTubeAuthState } from '../services/youtube/auth';
import { youtubeController } from '../services/youtube/controller';
import { toast } from './toast';
import { log } from './logger';

/**
 * One-time startup, run before the first render so the first paint is already on the right screen.
 * Service controllers are registered here; Spotify/YouTube register themselves in later milestones' modules.
 */
export function bootstrapApp(): void {
  setupI18n({ set: settingsEnglish() });

  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') useSettings.getState().set('demoPlayer', true);

  registerController(new DemoController());
  registerController(spotifyController);
  registerController(youtubeController);
  initSpotifyAuthState();
  initYouTubeAuthState();

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
  // ?screen=<id> opens a screen directly (used by the screenshot/e2e tooling and handy for bookmarks).
  if (isScreenId(screenParam) && screenParam !== 'onboarding') useRouter.getState().reset(screenParam);

  if (import.meta.env.DEV) {
    // Debug/e2e hook (dev server only, never in production builds): lets tests simulate driving.
    (window as unknown as { __dd: unknown }).__dd = {
      geo: useGeo,
      driving: useDriving,
      settings: useSettings,
      router: useRouter,
    };
  }

  startRouterPersistence();
  startDrivingMonitor();
  void startGeoIfPermitted();

  // iOS may have killed the app while another one was in front: carry on with the trip in progress.
  if (route.type !== 'onboarding' && resumeNavigation()) useRouter.getState().open('maps');

  const initial = pickInitialSource(s.defaultSource, s.lastSource, availableSources());
  if (initial) void setActiveSource(initial).catch((e) => log.warn('boot', 'activating source failed', e));

  // Finish a Spotify sign-in redirect (?code=&state=). The controller was activated before the token existed,
  // so it is activated again once the exchange succeeds.
  void handleRedirectCallback().then(async (result) => {
    if (result === 'connected') {
      toast('Spotify connected', 'ok');
      if (useMedia.getState().active === 'spotify') await spotifyController.activate();
      else await setActiveSource('spotify');
    } else if (result === 'error') {
      toast(useSpotifyAuth.getState().error ?? 'Spotify sign-in failed', 'bad', 6000);
    }
  });
}
