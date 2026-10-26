import { Suspense, lazy, type ReactNode } from 'react';
import type { Entry } from './core/router';
import { Chassis } from './ui/Chassis';
import { ScreenHost } from './ui/ScreenHost';
import { Wallpaper } from './ui/Wallpaper';
import { DialogHost, PassengerPrompt, Toasts } from './ui/components/Overlays';
import { Home } from './ui/screens/Home';
import { Placeholder } from './ui/screens/Placeholder';
import { useThemeEngine } from './ui/hooks/useThemeEngine';
import { useMediaState } from './services/media/manager';
import { NightDim } from './ui/NightDim';
import { NavChooser } from './ui/components/NavChooser';
import { useAppEffects } from './ui/hooks/useAppEffects';

const Dashboard = lazy(() => import('./ui/screens/Dashboard'));
const NowPlaying = lazy(() => import('./ui/screens/NowPlaying'));
const SpotifyScreen = lazy(() => import('./ui/screens/SpotifyScreen'));

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
    default:
      return <Placeholder screen={entry.screen} />;
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
      <NightDim />
      <DialogHost />
      <PassengerPrompt />
      <NavChooser />
      <Toasts />
    </>
  );
}
