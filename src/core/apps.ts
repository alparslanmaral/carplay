import type { ScreenId } from './router';
import type { Settings } from './settings';

export interface AppDef {
  id: string;
  /** i18n key under `apps.` */
  labelKey: string;
  icon: string;
  /** Tile gradient: [from, to] */
  colors: [string, string];
  screen?: ScreenId;
  /** External URL (shortcuts) */
  url?: string;
  custom?: boolean;
}

export const BUILTIN_APPS: AppDef[] = [
  {
    id: 'dashboard',
    labelKey: 'dashboard',
    icon: 'gauge',
    colors: ['#5b7cfa', '#2a3fb8'],
    screen: 'dashboard',
  },
  { id: 'maps', labelKey: 'maps', icon: 'map', colors: ['#34c98a', '#0f7d5a'], screen: 'maps' },
  { id: 'spotify', labelKey: 'spotify', icon: 'music', colors: ['#2bd567', '#128a3e'], screen: 'spotify' },
  { id: 'youtube', labelKey: 'youtube', icon: 'video', colors: ['#ff5a52', '#b3231d'], screen: 'youtube' },
  {
    id: 'nowplaying',
    labelKey: 'nowplaying',
    icon: 'disc',
    colors: ['#c46bff', '#6a2bd1'],
    screen: 'nowplaying',
  },
  {
    id: 'destinations',
    labelKey: 'destinations',
    icon: 'pin',
    colors: ['#ffb347', '#d2691e'],
    screen: 'destinations',
  },
  {
    id: 'sport',
    labelKey: 'sport',
    icon: 'engine',
    colors: ['#ff6a3d', '#b3200f'],
    screen: 'sport',
  },
  {
    id: 'settings',
    labelKey: 'settings',
    icon: 'sliders',
    colors: ['#8e9aaf', '#4b5568'],
    screen: 'settings',
  },
];

export const SHORTCUT_PREFIX = 'sc:';

export function shortcutApp(sc: Settings['shortcuts'][number]): AppDef {
  return {
    id: SHORTCUT_PREFIX + sc.id,
    labelKey: '',
    icon: sc.icon,
    colors: ['#6f7bf7', '#3d47b3'],
    url: sc.url,
    custom: true,
  };
}

/** Name shown under the icon for an app (shortcut names are user text, not translated). */
export function appLabel(app: AppDef, shortcuts: Settings['shortcuts'], t: (key: string) => string): string {
  if (app.custom) {
    const sc = shortcuts.find((s) => SHORTCUT_PREFIX + s.id === app.id);
    return sc?.name ?? '';
  }
  return t(`apps.${app.labelKey}`);
}

/** All apps (built-in + shortcuts) keyed by id. */
export function allApps(shortcuts: Settings['shortcuts']): Map<string, AppDef> {
  const map = new Map<string, AppDef>();
  for (const a of BUILTIN_APPS) map.set(a.id, a);
  for (const s of shortcuts) map.set(SHORTCUT_PREFIX + s.id, shortcutApp(s));
  return map;
}

/**
 * Ordered, visible app list for Home. Unknown ids are dropped; apps missing from the saved
 * order (e.g. a newly added shortcut) are appended so nothing can get lost.
 */
export function resolveHomeApps(
  order: string[],
  hidden: string[],
  shortcuts: Settings['shortcuts'],
  opts: { includeHidden?: boolean } = {},
): AppDef[] {
  const apps = allApps(shortcuts);
  const seen = new Set<string>();
  const out: AppDef[] = [];
  for (const id of order) {
    const app = apps.get(id);
    if (!app || seen.has(id)) continue;
    seen.add(id);
    if (!opts.includeHidden && hidden.includes(id)) continue;
    out.push(app);
  }
  for (const [id, app] of apps) {
    if (seen.has(id)) continue;
    if (!opts.includeHidden && hidden.includes(id)) continue;
    out.push(app);
  }
  return out;
}

/** Split into pages of `perPage` items. Always returns at least one (possibly empty) page. */
export function paginate<T>(items: T[], perPage: number): T[][] {
  const size = Math.max(1, perPage);
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length ? pages : [[]];
}

/** Move an item inside an array (immutable). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
