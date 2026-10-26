import { create } from 'zustand';
import { haversine, mpsToKmh } from '../../core/units';
import { saveLastKnownPosition } from '../../core/lastPos';
import { getSettings } from '../../core/settings';
import { log } from '../../core/logger';

export type GeoStatus = 'idle' | 'starting' | 'watching' | 'denied' | 'unavailable' | 'error';

export interface GeoState {
  status: GeoStatus;
  lat: number | null;
  lng: number | null;
  /** metres */
  accuracy: number | null;
  /** Always km/h; derived from consecutive fixes when the device does not report speed. */
  speedKmh: number;
  speedSource: 'device' | 'derived' | 'none';
  /** degrees clockwise from north, null when unknown/stationary */
  heading: number | null;
  /** timestamp of the last fix (ms) */
  ts: number | null;
  error: string | null;
}

interface GeoActions {
  start: () => void;
  stop: () => void;
  /** Test/demo hook: feed a fix as if it came from the browser. */
  ingest: (pos: Pick<GeolocationPosition, 'coords' | 'timestamp'>) => void;
}

const INITIAL: GeoState = {
  status: 'idle',
  lat: null,
  lng: null,
  accuracy: null,
  speedKmh: 0,
  speedSource: 'none',
  heading: null,
  ts: null,
  error: null,
};

let watchId: number | null = null;
let prevFix: { lat: number; lng: number; ts: number } | null = null;

/** Speed from two fixes; null when the fixes are too close in time or too inaccurate to trust. */
export function deriveSpeedKmh(
  prev: { lat: number; lng: number; ts: number },
  next: { lat: number; lng: number; ts: number },
  accuracy: number | null,
): number | null {
  const dt = (next.ts - prev.ts) / 1000;
  if (dt < 0.5 || dt > 30) return null;
  if (accuracy !== null && accuracy > 75) return null;
  const metres = haversine(prev.lat, prev.lng, next.lat, next.lng);
  // Below the accuracy noise floor this is jitter, not movement.
  if (accuracy !== null && metres < Math.min(accuracy * 0.5, 8)) return 0;
  return mpsToKmh(metres / dt);
}

export const useGeo = create<GeoState & GeoActions>((set, get) => ({
  ...INITIAL,
  ingest: (pos) => {
    const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords;
    const ts = pos.timestamp;
    let speedKmh = get().speedKmh;
    let speedSource: GeoState['speedSource'] = 'none';
    if (typeof speed === 'number' && Number.isFinite(speed) && speed >= 0) {
      speedKmh = mpsToKmh(speed);
      speedSource = 'device';
    } else if (prevFix) {
      const d = deriveSpeedKmh(prevFix, { lat, lng, ts }, accuracy);
      if (d !== null) {
        speedKmh = d;
        speedSource = 'derived';
      }
    }
    prevFix = { lat, lng, ts };
    saveLastKnownPosition({ lat, lng });
    set({
      status: 'watching',
      lat,
      lng,
      accuracy,
      speedKmh,
      speedSource,
      heading: typeof heading === 'number' && Number.isFinite(heading) && speedKmh > 3 ? heading : null,
      ts,
      error: null,
    });
  },
  start: () => {
    if (watchId !== null) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      set({ status: 'unavailable', error: 'Geolocation is not available' });
      return;
    }
    set({ status: 'starting' });
    watchId = navigator.geolocation.watchPosition(
      (p) => get().ingest(p),
      (err) => {
        log.warn('geo', `watchPosition error ${err.code}: ${err.message}`);
        if (err.code === err.PERMISSION_DENIED) set({ status: 'denied', error: err.message });
        else set({ status: get().lat === null ? 'error' : 'watching', error: err.message });
      },
      { enableHighAccuracy: getSettings().gpsMode === 'high', maximumAge: 1000, timeout: 20000 },
    );
  },
  stop: () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    prevFix = null;
    set({ status: 'idle' });
  },
}));

/** Restart the watcher (used when the accuracy mode setting changes). */
export function restartGeo(): void {
  const wasWatching = watchId !== null;
  useGeo.getState().stop();
  if (wasWatching) useGeo.getState().start();
}

/** Start immediately when permission was already granted, otherwise wait for a user gesture. */
export async function startGeoIfPermitted(): Promise<void> {
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (perm?.state === 'granted') useGeo.getState().start();
    else if (perm?.state === 'denied') useGeo.setState({ status: 'denied' });
  } catch {
    /* Permissions API unavailable: the user starts GPS from onboarding or the map */
  }
}

export function resetGeoForTests(): void {
  watchId = null;
  prevFix = null;
  useGeo.setState({ ...INITIAL });
}
