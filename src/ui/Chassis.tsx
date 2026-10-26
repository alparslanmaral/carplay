import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BUILTIN_APPS, allApps, appLabel } from '../core/apps';
import { useRouter } from '../core/router';
import { useSettings } from '../core/settings';
import { AppTile } from './components/AppIcon';
import { Icon } from './components/Icon';
import { StatusChips } from './components/StatusChips';
import { MiniPlayer } from './components/MiniPlayer';
import { useClock } from './hooks/useClock';
import { useLayout, useViewport } from './hooks/useViewport';
import { touchTargetPx } from '../core/theme';
import { launchApp } from './launch';

function RailClock() {
  const { now, time, suffix } = useClock();
  const showDate = useSettings((s) => s.showDate);
  return (
    <div className="rail__clock">
      <div className="rail__time">
        {time}
        {suffix && <small>{suffix}</small>}
      </div>
      {showDate && (
        <div className="rail__date">
          {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      )}
    </div>
  );
}

function StatusBar() {
  const { time, suffix } = useClock();
  return (
    <div className="chassis__status status-bar">
      <span className="status-bar__time">
        {time}
        {suffix && <small>{suffix}</small>}
      </span>
      <div className="status-bar__right">
        <StatusChips />
      </div>
    </div>
  );
}

/** How many pinned apps fit in a horizontal bar next to Home, the artwork button and play/pause. */
export function dockCapacity(viewportWidth: number, touchPx: number): number {
  const slots = Math.floor((viewportWidth - 34) / touchPx);
  return Math.max(1, slots - 3);
}

function DockButtons({ vertical }: { vertical: boolean }) {
  const { t } = useTranslation();
  const allDockItems = useSettings((s) => s.dockItems);
  const touch = useSettings((s) => s.touchTarget);
  const large = useSettings((s) => s.largeTargets);
  const scale = useSettings((s) => s.uiScale);
  const { width } = useViewport();
  const tt = Math.max(
    touchTargetPx({ touchTarget: touch, largeTargets: large }) * Math.max(1, scale / 100),
    64,
  );
  const dockItems = vertical ? allDockItems : allDockItems.slice(0, dockCapacity(width, tt));
  const shortcuts = useSettings((s) => s.shortcuts);
  const labels = useSettings((s) => s.showLabels);
  const current = useRouter((s) => s.stack[s.stack.length - 1]!.screen);
  const apps = allApps(shortcuts);
  return (
    <>
      <button
        className="dock-btn dock-btn--home"
        onClick={() => useRouter.getState().reset('home')}
        aria-label={t('apps.home')}
        aria-current={current === 'home'}
      >
        <Icon name="home" size="1.75rem" />
        {vertical && labels && <span className="dock-btn__label">{t('apps.home')}</span>}
      </button>
      {dockItems.map((id) => {
        const app = apps.get(id) ?? BUILTIN_APPS.find((a) => a.id === id);
        if (!app) return null;
        const label = appLabel(app, shortcuts, t);
        return (
          <button
            key={id}
            className="dock-btn"
            onClick={() => launchApp(app)}
            aria-label={label}
            aria-current={app.screen === current}
          >
            <AppTile app={app} />
            {vertical && labels && <span className="dock-btn__label ellipsis">{label}</span>}
          </button>
        );
      })}
    </>
  );
}

function Rail({ variant }: { variant: 'rail' | 'bar' | 'dock' }) {
  const vertical = variant === 'rail';
  return (
    <nav className="rail glass" data-variant={variant} aria-label="Dock">
      {vertical && (
        <div className="rail__head">
          <RailClock />
          <StatusChips />
        </div>
      )}
      <DockButtons vertical={vertical} />
      {vertical && <div className="rail__spacer" />}
      <MiniPlayer compact={!vertical} />
    </nav>
  );
}

export function Chassis({ children }: { children: ReactNode }) {
  const layout = useLayout();
  const rail = useSettings((s) => s.railPosition);
  const position = layout === 'portrait' ? 'bottom' : rail;
  const variant = layout === 'portrait' ? 'dock' : rail === 'bottom' ? 'bar' : 'rail';
  return (
    <div className="chassis" data-layout={layout} data-rail={position}>
      {layout === 'portrait' && <StatusBar />}
      <main className="chassis__main">{children}</main>
      <Rail variant={variant} />
    </div>
  );
}
