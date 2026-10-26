/** Last GPS fix, kept in localStorage so sunset theming, weather and map centering work before the first fix. */
const KEY = 'dd.lastpos';

export interface LatLng {
  lat: number;
  lng: number;
}

export function getLastKnownPosition(): LatLng | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LatLng;
    return Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
  } catch {
    return null;
  }
}

export function saveLastKnownPosition(pos: LatLng): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lat: pos.lat, lng: pos.lng }));
  } catch {
    /* ignore */
  }
}
