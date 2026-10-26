import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../core/settings';
import { resolveMapStyle, zoomForSpeed } from './adapter';
import {
  parseGoogleAutocomplete,
  parseNominatim,
  parsePhoton,
  preferRegion,
  resolveResult,
  searchPlaces,
  supportsAutocomplete,
  type SearchContext,
} from './geocode';
import { getFavorite, removeFavorite, renameFavorite, saveFavorite } from './places';
import { useNavChooser, navigateTo } from './handoff';
import { TILE_SETS, buildStyle } from './adapters/maplibre';

vi.mock('../../ui/launch', () => ({ openExternal: vi.fn() }));
import { openExternal } from '../../ui/launch';

const ctx: SearchContext = { near: { lat: 41, lng: 29 }, region: '', language: 'en', googleKey: '' };

beforeEach(() => {
  useSettings.getState().reset();
  useNavChooser.getState().close();
  vi.mocked(openExternal).mockClear();
});

describe('zoomForSpeed', () => {
  it('zooms out as speed rises', () => {
    const zooms = [0, 15, 45, 75, 120].map(zoomForSpeed);
    expect(zooms).toEqual([17, 16, 15, 14, 13]);
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]!).toBeLessThan(zooms[i - 1]!);
  });
});

describe('map style', () => {
  it('resolves auto from the theme and keeps explicit choices', () => {
    expect(resolveMapStyle('auto', 'dark')).toBe('dark');
    expect(resolveMapStyle('auto', 'light')).toBe('light');
    expect(resolveMapStyle('satellite', 'dark')).toBe('satellite');
  });
  it('every style has attribution (required by the tile providers)', () => {
    for (const set of Object.values(TILE_SETS)) expect(set.attribution.length).toBeGreaterThan(10);
    expect(TILE_SETS.light.attribution).toContain('OpenStreetMap');
    const style = buildStyle('dark');
    expect(style.layers[0]).toMatchObject({ type: 'raster' });
  });
});

describe('search parsing', () => {
  it('parses Photon GeoJSON', () => {
    const r = parsePhoton({
      features: [
        {
          geometry: { coordinates: [29.0083, 41.0422] },
          properties: {
            osm_id: 12,
            osm_type: 'N',
            name: 'Galata Tower',
            city: 'Istanbul',
            country: 'Türkiye',
            countrycode: 'TR',
          },
        },
        { geometry: { coordinates: [1, 2] }, properties: { street: 'Main St', housenumber: '5', city: 'X' } },
        { geometry: undefined, properties: { name: 'broken' } },
      ],
    });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      name: 'Galata Tower',
      lat: 41.0422,
      lng: 29.0083,
      countryCode: 'TR',
      id: 'photon:N12',
    });
    expect(r[0]!.address).toBe('Istanbul, Türkiye');
    expect(r[1]!.name).toBe('Main St 5');
  });

  it('parses Nominatim', () => {
    const r = parseNominatim([
      {
        place_id: 7,
        lat: '41.01',
        lon: '28.97',
        display_name: 'Sultanahmet, Fatih, Istanbul, Türkiye',
        address: { country_code: 'tr' },
      },
    ]);
    expect(r[0]).toMatchObject({
      id: 'nominatim:7',
      name: 'Sultanahmet',
      lat: 41.01,
      lng: 28.97,
      countryCode: 'TR',
    });
    expect(r[0]!.address).toBe('Fatih, Istanbul, Türkiye');
  });

  it('parses Google autocomplete predictions without coordinates', () => {
    const r = parseGoogleAutocomplete({
      suggestions: [
        {
          placePrediction: {
            placeId: 'abc',
            structuredFormat: { mainText: { text: 'Cafe' }, secondaryText: { text: 'Istanbul' } },
          },
        },
        {},
      ],
    });
    expect(r).toEqual([
      { id: 'google:abc', placeId: 'abc', name: 'Cafe', address: 'Istanbul', lat: null, lng: null },
    ]);
  });

  it('prefers the configured region without dropping other results', () => {
    const mk = (id: string, cc: string) => ({ id, name: id, address: '', lat: 0, lng: 0, countryCode: cc });
    const out = preferRegion([mk('a', 'DE'), mk('b', 'TR'), mk('c', 'FR'), mk('d', 'TR')], 'tr');
    expect(out.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(preferRegion([mk('a', 'DE')], '')).toHaveLength(1);
  });

  it('only Nominatim is submit-only', () => {
    expect(supportsAutocomplete('photon')).toBe(true);
    expect(supportsAutocomplete('google')).toBe(true);
    expect(supportsAutocomplete('nominatim')).toBe(false);
  });
});

describe('search requests', () => {
  it('Photon: biases to the position and ignores empty queries', async () => {
    const f = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ features: [] })),
    );
    vi.stubGlobal('fetch', f);
    expect(await searchPlaces('photon', '  ', ctx)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    await searchPlaces('photon', 'galata', ctx);
    const url = new URL(f.mock.calls[0]![0] as string);
    expect(url.origin).toBe('https://photon.komoot.io');
    expect(url.searchParams.get('lat')).toBe('41.0000');
    expect(url.searchParams.get('q')).toBe('galata');
    vi.unstubAllGlobals();
  });

  it('Google: refuses without a key and sends it as a header when present', async () => {
    await expect(searchPlaces('google', 'x', ctx)).rejects.toThrow(/API key/);
    const f = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ suggestions: [] })),
    );
    vi.stubGlobal('fetch', f);
    await searchPlaces('google', 'x', { ...ctx, googleKey: 'KEY', region: 'TR' });
    const init = f.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('KEY');
    expect(JSON.parse(init.body as string).includedRegionCodes).toEqual(['tr']);
    vi.unstubAllGlobals();
  });

  it('resolves a Google prediction to coordinates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ location: { latitude: 1.5, longitude: 2.5 }, formattedAddress: 'Addr' }),
          ),
      ),
    );
    const p = await resolveResult(
      { id: 'google:abc', placeId: 'abc', name: 'Cafe', address: '', lat: null, lng: null },
      { googleKey: 'K', language: 'en' },
    );
    expect(p).toMatchObject({ lat: 1.5, lng: 2.5, address: 'Addr', name: 'Cafe' });
    vi.unstubAllGlobals();
  });
});

describe('favorites', () => {
  const place = { id: 'p1', name: 'Cafe', lat: 1, lng: 2 };
  it('Home and Work are single slots, custom favorites accumulate', () => {
    saveFavorite(place, 'home');
    saveFavorite({ ...place, id: 'p2' }, 'home');
    expect(useSettings.getState().favorites.filter((f) => f.kind === 'home')).toHaveLength(1);
    expect(getFavorite('home')?.id).toBe('p2');
    saveFavorite({ ...place, id: 'p3' }, 'custom');
    saveFavorite({ ...place, id: 'p4' }, 'custom');
    expect(useSettings.getState().favorites).toHaveLength(3);
  });
  it('renames and removes', () => {
    saveFavorite(place, 'custom');
    renameFavorite('p1', 'Best cafe');
    expect(useSettings.getState().favorites[0]!.name).toBe('Best cafe');
    removeFavorite('p1');
    expect(useSettings.getState().favorites).toHaveLength(0);
  });
});

describe('hand-off', () => {
  const place = { id: 'x', name: 'Dest', lat: 41.5, lng: 29.5 };
  it.each([
    ['apple', 'https://maps.apple.com/?daddr=41.5,29.5&dirflg=d'],
    ['google', 'https://www.google.com/maps/dir/?api=1&destination=41.5,29.5&travelmode=driving'],
    ['waze', 'https://waze.com/ul?ll=41.5,29.5&navigate=yes'],
  ] as const)('opens %s directly and records the recent', (app, url) => {
    useSettings.getState().set('navApp', app);
    navigateTo(place);
    expect(openExternal).toHaveBeenCalledWith(url);
    expect(useSettings.getState().recents[0]!.id).toBe('x');
  });
  it('asks when the preference is "ask"', () => {
    useSettings.getState().set('navApp', 'ask');
    navigateTo(place);
    expect(openExternal).not.toHaveBeenCalled();
    expect(useNavChooser.getState().place?.id).toBe('x');
  });
  it('respects the recents limit', () => {
    useSettings.getState().patch({ navApp: 'apple', recentsLimit: 2 });
    for (let i = 0; i < 4; i++) navigateTo({ id: `p${i}`, name: `P${i}`, lat: i * 2, lng: i * 2 });
    expect(useSettings.getState().recents.map((r) => r.id)).toEqual(['p3', 'p2']);
  });
});
