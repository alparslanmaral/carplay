import { cached } from '../core/cache';

/** Open-Meteo: free, no key, CORS enabled. */
export interface Weather {
  temperature: number;
  code: number;
  isDay: boolean;
  windKmh: number;
  fahrenheit: boolean;
  fetchedAt: number;
}

export const WEATHER_TTL_MS = 15 * 60 * 1000;

export async function fetchWeather(lat: number, lng: number, fahrenheit: boolean): Promise<Weather> {
  // 0.1 degree buckets (~11 km) so small movements reuse the cache.
  const key = `weather:${lat.toFixed(1)},${lng.toFixed(1)}:${fahrenheit ? 'f' : 'c'}`;
  return cached(key, WEATHER_TTL_MS, async () => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
      `&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto` +
      (fahrenheit ? '&temperature_unit=fahrenheit' : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const json = (await res.json()) as {
      current?: { temperature_2m: number; weather_code: number; is_day: number; wind_speed_10m: number };
    };
    const c = json.current;
    if (!c) throw new Error('Open-Meteo: no current data');
    return {
      temperature: c.temperature_2m,
      code: c.weather_code,
      isDay: c.is_day === 1,
      windKmh: c.wind_speed_10m,
      fahrenheit,
      fetchedAt: Date.now(),
    } satisfies Weather;
  });
}

export interface WeatherLook {
  /** i18n key suffix under `weather.` */
  label: string;
  icon: string;
}

/** WMO weather interpretation codes -> label + glyph. */
export function describeWeather(code: number, isDay: boolean): WeatherLook {
  if (code === 0) return { label: 'clear', icon: isDay ? 'sun' : 'moon' };
  if (code === 1 || code === 2) return { label: 'partly', icon: isDay ? 'cloud-sun' : 'cloud' };
  if (code === 3) return { label: 'overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'fog', icon: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'drizzle', icon: 'rain' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'rain', icon: 'rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'snow', icon: 'snow' };
  if (code >= 95) return { label: 'storm', icon: 'storm' };
  return { label: 'unknown', icon: 'cloud' };
}
