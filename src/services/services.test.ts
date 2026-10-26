import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheGet, cacheSet, cached, clearAllCaches } from '../core/cache';
import { useSettings, type Place } from '../core/settings';
import { describeWeather } from './weather';
import { navUrl } from './maps/deeplinks';
import { pushRecent, samePlace } from './maps/places';
import { deriveSpeedKmh, resetGeoForTests, useGeo } from './maps/geolocation';

beforeEach(() => {
  useSettings.getState().reset();
  clearAllCaches();
  resetGeoForTests();
});

describe('cache', () => {
  it('expires entries', () => {
    vi.useFakeTimers();
    cacheSet('k', { a: 1 }, 1000);
    expect(cacheGet('k')).toEqual({ a: 1 });
    vi.advanceTimersByTime(1500);
    expect(cacheGet('k')).toBeUndefined();
    vi.useRealTimers();
  });
  it('shares one in-flight request and then serves from cache', async () => {
    const fetcher = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cached('x', 1000, fetcher), cached('x', 1000, fetcher)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    await cached('x', 1000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('survives a cold memory by reading localStorage', () => {
    cacheSet('persist', 'v', 60_000);
    expect(localStorage.getItem('dd.cache.persist')).toContain('"v"');
  });
});

describe('weather codes', () => {
  it('maps WMO codes', () => {
    expect(describeWeather(0, true)).toEqual({ label: 'clear', icon: 'sun' });
    expect(describeWeather(0, false).icon).toBe('moon');
    expect(describeWeather(63, true).label).toBe('rain');
    expect(describeWeather(75, true).label).toBe('snow');
    expect(describeWeather(95, true).label).toBe('storm');
    expect(describeWeather(45, true).icon).toBe('fog');
  });
});

describe('navigation deep links', () => {
  it('matches the three documented URL formats', () => {
    expect(navUrl('apple', 41.0082, 28.9784)).toBe('https://maps.apple.com/?daddr=41.0082,28.9784&dirflg=d');
    expect(navUrl('google', 41.0082, 28.9784)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=41.0082,28.9784&travelmode=driving',
    );
    expect(navUrl('waze', 41.0082, 28.9784)).toBe('https://waze.com/ul?ll=41.0082,28.9784&navigate=yes');
  });
  it('keeps negative coordinates and trims noise digits', () => {
    expect(navUrl('waze', -33.8688, 151.2093)).toContain('ll=-33.8688,151.2093');
    expect(navUrl('waze', 10.1234567891, 20)).toContain('ll=10.123457,20');
  });
});

describe('recents', () => {
  const p = (id: string, lat: number, lng: number): Place => ({ id, name: id, lat, lng });
  it('puts the newest first, de-duplicates nearby places and caps the list', () => {
    let list: Place[] = [];
    list = pushRecent(list, p('a', 41, 29), 3);
    list = pushRecent(list, p('b', 42, 30), 3);
    list = pushRecent(list, p('a2', 41.00001, 29.00001), 3); // ~1 m from "a"
    expect(list.map((x) => x.id)).toEqual(['a2', 'b']);
    list = pushRecent(list, p('c', 43, 31), 3);
    list = pushRecent(list, p('d', 44, 32), 3);
    expect(list).toHaveLength(3);
    expect(list[0]!.id).toBe('d');
  });
  it('treats equal ids as the same place', () => {
    expect(samePlace(p('x', 1, 1), p('x', 50, 50))).toBe(true);
  });
});

describe('geolocation', () => {
  const coords = (lat: number, lng: number, speed: number | null, accuracy = 10) =>
    ({ latitude: lat, longitude: lng, accuracy, speed, heading: 90 }) as GeolocationCoordinates;

  it('uses the device speed when present (m/s -> km/h)', () => {
    useGeo.getState().ingest({ coords: coords(41, 29, 10), timestamp: 1000 });
    expect(useGeo.getState().speedKmh).toBeCloseTo(36);
    expect(useGeo.getState().speedSource).toBe('device');
    expect(useGeo.getState().status).toBe('watching');
  });

  it('derives speed from consecutive fixes when the device reports none', () => {
    useGeo.getState().ingest({ coords: coords(41, 29, null), timestamp: 0 });
    // ~111 m north in 5 s = ~22 m/s = ~80 km/h
    useGeo.getState().ingest({ coords: coords(41.001, 29, null), timestamp: 5000 });
    expect(useGeo.getState().speedSource).toBe('derived');
    expect(useGeo.getState().speedKmh).toBeGreaterThan(70);
    expect(useGeo.getState().speedKmh).toBeLessThan(90);
  });

  it('ignores GPS jitter and inaccurate fixes', () => {
    const a = { lat: 41, lng: 29, ts: 0 };
    expect(deriveSpeedKmh(a, { lat: 41.00002, lng: 29, ts: 2000 }, 20)).toBe(0);
    expect(deriveSpeedKmh(a, { lat: 41.01, lng: 29, ts: 2000 }, 200)).toBeNull();
    expect(deriveSpeedKmh(a, { lat: 41.01, lng: 29, ts: 100 }, 10)).toBeNull();
  });

  it('only reports a heading while actually moving', () => {
    useGeo.getState().ingest({ coords: coords(41, 29, 0), timestamp: 1 });
    expect(useGeo.getState().heading).toBeNull();
    useGeo.getState().ingest({ coords: coords(41, 29, 15), timestamp: 2 });
    expect(useGeo.getState().heading).toBe(90);
  });
});
