import { Suspense, type ReactNode } from 'react';
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
import { useAppEffects } from './ui/hooks/useAppEffects';

function renderEntry(entry: Entry): ReactNode {
  switch (entry.screen) {
    case 'home':
      return <Home />;
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
      <Toasts />
    </>
  );
}
