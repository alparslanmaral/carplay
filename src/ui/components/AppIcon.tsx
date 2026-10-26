import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { appLabel, type AppDef } from '../../core/apps';
import { useSettings } from '../../core/settings';
import { Icon } from './Icon';

export function AppTile({ app, size }: { app: AppDef; size?: number | string }) {
  const style = {
    '--c1': app.colors[0],
    '--c2': app.colors[1],
    ...(size ? { '--tile': typeof size === 'number' ? `${size}px` : size } : {}),
  } as CSSProperties;
  return (
    <span className="app-tile" style={style}>
      <Icon name={app.icon} />
    </span>
  );
}

export function AppIcon({
  app,
  onClick,
  showLabel,
  className,
}: {
  app: AppDef;
  onClick?: () => void;
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const shortcuts = useSettings((s) => s.shortcuts);
  const labels = useSettings((s) => s.showLabels);
  const label = appLabel(app, shortcuts, t);
  const visible = showLabel ?? labels;
  return (
    <button className={`app-icon${className ? ` ${className}` : ''}`} onClick={onClick} aria-label={label}>
      <AppTile app={app} />
      {visible && <span className="app-icon__label ellipsis">{label}</span>}
    </button>
  );
}
