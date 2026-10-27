import { Suspense, lazy, type ReactNode } from 'react';
import type { Entry } from './core/router';
import { Chassis } from './ui/Chassis';
import { ScreenHost } from './ui/ScreenHost';
import { Wallpaper } from './ui/Wallpaper';
import { DialogHost, PassengerPrompt, Toasts, UpdateBanner } from './ui/components/Overlays';
import { Home } from './ui/screens/Home';
import { useThemeEngine } from './ui/hooks/useThemeEngine';
import { useMediaState } from './services/media/manager';
import { NightDim } from './ui/NightDim';
import { NavChooser } from './ui/components/NavChooser';
import { YouTubeHost } from './ui/components/YouTubeHost';
import { useAppEffects } from './ui/hooks/useAppEffects';

const Dashboard = lazy(() => import('./ui/screens/Dashboard'));
const NowPlaying = lazy(() => import('./ui/screens/NowPlaying'));
const SpotifyScreen = lazy(() => import('./ui/screens/SpotifyScreen'));
const MapsScreen = lazy(() => import('./ui/screens/MapsScreen'));
const Destinations = lazy(() => import('./ui/screens/Destinations'));
const YouTubeScreen = lazy(() => import('./ui/screens/YouTubeScreen'));
const SettingsScreen = lazy(() => import('./ui/screens/SettingsScreen'));
const Diagnostics = lazy(() => import('./ui/screens/Diagnostics'));
const Limitations = lazy(() => import('./ui/screens/Limitations'));
const InstallGuide = lazy(() => import('./ui/screens/InstallGuide'));
const Onboarding = lazy(() => import('./ui/screens/Onboarding'));

function renderEntry(entry: Entry): ReactNode {
  switch (entry.screen) {
    case 'home':
      return <Home />;
    case 'dashboard':
      return <Dashboard />;
    case 'nowplaying':
      return <NowPlaying />;
    case 'spotify':
      return <SpotifyScreen />;
    case 'maps':
      return <MapsScreen params={entry.params} />;
    case 'destinations':
      return <Destinations />;
    case 'youtube':
      return <YouTubeScreen />;
    case 'settings':
      return <SettingsScreen params={entry.params} />;
    case 'diagnostics':
      return <Diagnostics />;
    case 'limitations':
      return <Limitations />;
    case 'install':
      return <InstallGuide />;
    case 'onboarding':
      return <Onboarding />;
  }
}

export default function App() {
  useThemeEngine();
  useAppEffects();
  const artUrl = useMediaState((s) => s.track?.artworkUrl ?? null);
  return (
    <>
      <Wallpaper artUrl={artUrl} />
      <Chassis>
        <Suspense
          fallback={
            <div className="empty">
              <div className="spinner" />
            </div>
          }
        >
          <ScreenHost render={renderEntry} />
        </Suspense>
      </Chassis>
      <YouTubeHost />
      <NightDim />
      <DialogHost />
      <PassengerPrompt />
      <UpdateBanner />
      <NavChooser />
      <Toasts />
    </>
  );
}
