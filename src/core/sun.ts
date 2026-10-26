/**
 * Sunrise / sunset using the NOAA approximation (good to a couple of minutes, plenty for a theme switch).
 * Returns minutes since local-midnight in UTC terms converted by the caller's timezone offset.
 */
export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  /** polar day / polar night */
  alwaysUp: boolean;
  alwaysDown: boolean;
}

const rad = Math.PI / 180;

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  const n = dayOfYear(date);
  const gamma = ((2 * Math.PI) / 365) * (n - 1);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const cosHa =
    Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa > 1) return { sunrise: null, sunset: null, alwaysUp: false, alwaysDown: true };
  if (cosHa < -1) return { sunrise: null, sunset: null, alwaysUp: true, alwaysDown: false };
  const ha = Math.acos(cosHa) / rad;
  const midnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const riseMin = 720 - 4 * (lng + ha) - eqTime;
  const setMin = 720 - 4 * (lng - ha) - eqTime;
  return {
    sunrise: new Date(midnightUtc + riseMin * 60000),
    sunset: new Date(midnightUtc + setMin * 60000),
    alwaysUp: false,
    alwaysDown: false,
  };
}

/** True when the sun is below the horizon. Falls back to 07:00-19:00 local when no position is known. */
export function isNight(now: Date, pos: { lat: number; lng: number } | null): boolean {
  if (!pos) {
    const h = now.getHours() + now.getMinutes() / 60;
    return h < 7 || h >= 19;
  }
  const t = sunTimes(now, pos.lat, pos.lng);
  if (t.alwaysUp) return false;
  if (t.alwaysDown) return true;
  const { sunrise, sunset } = t;
  if (!sunrise || !sunset) return false;
  // The computed daylight interval can belong to the previous/next UTC day relative to `now`, so test +-1 day.
  const ms = now.getTime();
  for (const shift of [-86400000, 0, 86400000]) {
    if (ms >= sunrise.getTime() + shift && ms < sunset.getTime() + shift) return false;
  }
  return true;
}
