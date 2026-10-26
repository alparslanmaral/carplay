import { getSettings, useSettings, type Place } from '../../core/settings';
import { haversine } from '../../core/units';

/** Two places are "the same" when they share an id or lie within 30 m of each other. */
export function samePlace(a: Place, b: Place): boolean {
  return a.id === b.id || haversine(a.lat, a.lng, b.lat, b.lng) < 30;
}

export function newPlaceId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Most recent first, de-duplicated, capped by the `recentsLimit` setting. */
export function pushRecent(recents: Place[], place: Place, limit: number, now = Date.now()): Place[] {
  const next = [{ ...place, kind: undefined, ts: now }, ...recents.filter((r) => !samePlace(r, place))];
  return next.slice(0, Math.max(0, limit));
}

export function addRecent(place: Place): void {
  const { recents, recentsLimit } = getSettings();
  useSettings.getState().set('recents', pushRecent(recents, place, recentsLimit));
}

export function clearRecents(): void {
  useSettings.getState().set('recents', []);
}

export function getFavorite(kind: 'home' | 'work'): Place | undefined {
  return getSettings().favorites.find((f) => f.kind === kind);
}

/** Home and Work are single slots; custom favorites can be any number. */
export function saveFavorite(place: Place, kind: 'home' | 'work' | 'custom', name?: string): void {
  const { favorites } = getSettings();
  const entry: Place = { ...place, kind, name: name ?? place.name, ts: Date.now() };
  const rest = favorites.filter((f) => (kind === 'custom' ? f.id !== place.id : f.kind !== kind));
  useSettings.getState().set('favorites', [...rest, entry]);
}

export function removeFavorite(id: string): void {
  useSettings.getState().set(
    'favorites',
    getSettings().favorites.filter((f) => f.id !== id),
  );
}

export function renameFavorite(id: string, name: string): void {
  useSettings.getState().set(
    'favorites',
    getSettings().favorites.map((f) => (f.id === id ? { ...f, name } : f)),
  );
}
