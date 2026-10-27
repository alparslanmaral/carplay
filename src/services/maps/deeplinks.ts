/** External navigation apps reached through universal links. */
export type NavAppId = 'apple' | 'google' | 'waze';
/** Everything the user can pick as "Navigate in ...": the external apps or DriveDeck's own guidance. */
export type NavTarget = NavAppId | 'drivedeck';

export const NAV_APPS: { id: NavTarget; label: string }[] = [
  { id: 'drivedeck', label: 'DriveDeck (open source)' },
  { id: 'apple', label: 'Apple Maps' },
  { id: 'google', label: 'Google Maps' },
  { id: 'waze', label: 'Waze' },
];

export interface AvoidOptions {
  tolls?: boolean;
  highways?: boolean;
}

const fmt = (n: number) => n.toFixed(6).replace(/\.?0+$/, '');

/**
 * Universal-link hand-off URLs. Turn-by-turn navigation by these apps cannot be embedded in a web app, so the
 * destination is passed to the real navigation app which takes over the screen. Only Google Maps accepts
 * route preferences in the link; Apple Maps and Waze use the toggles in their own settings.
 */
export function navUrl(app: NavAppId, lat: number, lng: number, avoid: AvoidOptions = {}): string {
  const pos = `${fmt(lat)},${fmt(lng)}`;
  switch (app) {
    case 'apple':
      return `https://maps.apple.com/?daddr=${pos}&dirflg=d`;
    case 'google': {
      const list = [avoid.tolls && 'tolls', avoid.highways && 'highways'].filter(Boolean).join('|');
      const avoidParam = list ? `&avoid=${encodeURIComponent(list)}` : '';
      return `https://www.google.com/maps/dir/?api=1&destination=${pos}&travelmode=driving${avoidParam}`;
    }
    case 'waze':
      return `https://waze.com/ul?ll=${pos}&navigate=yes`;
  }
}

export function navAppLabel(app: NavTarget): string {
  return NAV_APPS.find((a) => a.id === app)?.label ?? app;
}
