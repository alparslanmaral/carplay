import type { Settings } from '../../core/settings';
import { log } from '../../core/logger';

export type MapStyleKind = 'light' | 'dark' | 'satellite';
export type MapProviderId = Settings['mapProvider'];

export interface LatLngLike {
  lat: number;
  lng: number;
}

export interface UserMarker extends LatLngLike {
  heading: number | null;
  accuracy: number | null;
}

export interface FollowTarget extends LatLngLike {
  zoom?: number;
  bearing?: number;
}

export interface MapView extends LatLngLike {
  zoom: number;
  bearing: number;
}

/** What the UI needs from any map engine; MapLibre, Google Maps JS and MapKit JS each implement it. */
export interface MapAdapter {
  readonly kind: MapProviderId;
  setStyle(style: MapStyleKind): void;
  setTraffic(on: boolean): void;
  setUser(user: UserMarker | null): void;
  setDestination(dest: (LatLngLike & { name?: string }) | null): void;
  /** Draw (or clear with null) the planned route as a line. */
  setRoute(coords: LatLngLike[] | null): void;
  /** Smoothly move the camera (used while following the user). */
  follow(target: FollowTarget): void;
  jumpTo(target: FollowTarget): void;
  /** Frame all points; `insets` keeps them clear of UI laid over the map (search bar on top, sheet at the bottom). */
  fitTo(points: LatLngLike[], insets?: { top: number; bottom: number }): void;
  getView(): MapView;
  /** The user dragged / zoomed the map by hand. */
  onUserMove(cb: () => void): void;
  /** Tap on empty map (not on a marker). */
  onTap(cb: (p: LatLngLike) => void): void;
  resize(): void;
  destroy(): void;
}

export interface MapCreateOptions {
  style: MapStyleKind;
  center: LatLngLike | null;
  zoom: number;
  traffic: boolean;
  interactive: boolean;
  googleKey: string;
  mapkitToken: string;
  accent: string;
}

/**
 * Zoom level for a given speed: closer in when slow, wider when fast so the road ahead stays in view.
 */
export function zoomForSpeed(kmh: number): number {
  if (kmh < 10) return 17;
  if (kmh < 30) return 16;
  if (kmh < 60) return 15;
  if (kmh < 90) return 14;
  return 13;
}

/** Resolves `auto` using the app theme. */
export function resolveMapStyle(setting: Settings['mapStyle'], theme: 'dark' | 'light'): MapStyleKind {
  return setting === 'auto' ? theme : setting;
}

const VIEW_KEY = 'dd.mapview';

export function loadLastView(): (LatLngLike & { zoom: number }) | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as (LatLngLike & { zoom: number }) | null;
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
  } catch {
    return null;
  }
}

export function saveLastView(v: LatLngLike & { zoom: number }): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/**
 * Create the adapter for the chosen provider. Google/MapKit need user-supplied credentials and a network
 * script; any failure (no key, blocked script, bad token) falls back to MapLibre so the map never goes blank.
 */
export async function createMapAdapter(
  provider: MapProviderId,
  container: HTMLElement,
  opts: MapCreateOptions,
  onFallback?: (reason: string) => void,
): Promise<MapAdapter> {
  try {
    if (provider === 'google') {
      if (!opts.googleKey) throw new Error('No Google Maps API key set');
      return await (await import('./adapters/google')).createGoogleAdapter(container, opts);
    }
    if (provider === 'mapkit') {
      if (!opts.mapkitToken) throw new Error('No MapKit JS token set');
      return await (await import('./adapters/mapkit')).createMapKitAdapter(container, opts);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    log.warn('maps', `${provider} unavailable, using MapLibre: ${reason}`);
    onFallback?.(reason);
  }
  return (await import('./adapters/maplibre')).createMapLibreAdapter(container, opts);
}
