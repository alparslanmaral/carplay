export const KMH_PER_MPS = 3.6;
export const MPH_PER_KMH = 0.621371;
export const MI_PER_KM = 0.621371;

export type SpeedUnit = 'kmh' | 'mph';
export type DistanceUnit = 'km' | 'mi';

export function mpsToKmh(mps: number): number {
  return mps * KMH_PER_MPS;
}

export function kmhToUnit(kmh: number, unit: SpeedUnit): number {
  return unit === 'mph' ? kmh * MPH_PER_KMH : kmh;
}

export function unitToKmh(value: number, unit: SpeedUnit): number {
  return unit === 'mph' ? value / MPH_PER_KMH : value;
}

export function speedLabel(unit: SpeedUnit): string {
  return unit === 'mph' ? 'mph' : 'km/h';
}

export function formatSpeed(kmh: number, unit: SpeedUnit): string {
  return String(Math.round(kmhToUnit(Math.max(0, kmh), unit)));
}

/** Distance in metres to a short human string: 450 m / 3.2 km / 12 km / 0.3 mi. */
export function formatDistance(meters: number, unit: DistanceUnit): string {
  if (!Number.isFinite(meters)) return '-';
  if (unit === 'mi') {
    const miles = (meters / 1000) * MI_PER_KM;
    if (miles < 0.1) return `${Math.round((meters * 3.28084) / 10) * 10} ft`;
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Great-circle distance in metres. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** m:ss or h:mm:ss */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
