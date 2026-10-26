export type NavAppId = 'apple' | 'google' | 'waze';

export const NAV_APPS: { id: NavAppId; label: string }[] = [
  { id: 'apple', label: 'Apple Maps' },
  { id: 'google', label: 'Google Maps' },
  { id: 'waze', label: 'Waze' },
];

const fmt = (n: number) => n.toFixed(6).replace(/\.?0+$/, '');

/**
 * Universal-link hand-off URLs. Turn-by-turn navigation cannot be embedded in a web app, so the
 * destination is passed to the real navigation app which takes over the screen.
 */
export function navUrl(app: NavAppId, lat: number, lng: number): string {
  const pos = `${fmt(lat)},${fmt(lng)}`;
  switch (app) {
    case 'apple':
      return `https://maps.apple.com/?daddr=${pos}&dirflg=d`;
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${pos}&travelmode=driving`;
    case 'waze':
      return `https://waze.com/ul?ll=${pos}&navigate=yes`;
  }
}

export function navAppLabel(app: NavAppId): string {
  return NAV_APPS.find((a) => a.id === app)?.label ?? app;
}
