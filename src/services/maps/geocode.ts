import type { Place } from '../../core/settings';

/**
 * Place search. Providers:
 *  - Photon (komoot, OSM data): built for search-as-you-type, no key.
 *  - Nominatim (OSM): the public instance forbids autocomplete, so it is submit-only and rate limited to 1 req/s.
 *  - Google Places (New): used when the user supplies an API key.
 * Attribution for OSM data ("© OpenStreetMap contributors") is shown next to the results in the UI.
 */

export type SearchProviderId = 'photon' | 'nominatim' | 'google';

export interface SearchResult {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  countryCode?: string;
  /** Google predictions only carry an id until the user picks one. */
  placeId?: string;
}

export interface SearchContext {
  /** current / last known position, used to bias results */
  near: { lat: number; lng: number } | null;
  /** ISO country code to prefer, empty for none */
  region: string;
  language: string;
  googleKey: string;
  signal?: AbortSignal;
}

/** Providers that may be queried on every keystroke. */
export function supportsAutocomplete(p: SearchProviderId): boolean {
  return p !== 'nominatim';
}

export const ATTRIBUTION: Record<SearchProviderId, string> = {
  photon: 'Search by Photon / komoot · © OpenStreetMap contributors',
  nominatim: 'Search by Nominatim · © OpenStreetMap contributors',
  google: 'Search by Google Places',
};

/* ---------- parsing (pure, unit tested) ---------- */

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
}

export function joinAddress(parts: (string | undefined)[]): string {
  const seen = new Set<string>();
  return parts.filter((p): p is string => !!p && !seen.has(p) && !!seen.add(p)).join(', ');
}

export function parsePhoton(json: { features?: PhotonFeature[] }): SearchResult[] {
  const out: SearchResult[] = [];
  for (const f of json.features ?? []) {
    const c = f.geometry?.coordinates;
    const p = f.properties;
    if (!c || !p) continue;
    const street = joinAddress([
      p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : undefined,
    ]);
    const name = p.name ?? street;
    if (!name) continue;
    out.push({
      id: `photon:${p.osm_type ?? ''}${p.osm_id ?? `${c[1]},${c[0]}`}`,
      name,
      address: joinAddress([p.name ? street : undefined, p.district, p.city, p.state, p.country]),
      lat: c[1],
      lng: c[0],
      countryCode: p.countrycode?.toUpperCase(),
    });
  }
  return out;
}

interface NominatimItem {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: { country_code?: string };
}

export function parseNominatim(items: NominatimItem[]): SearchResult[] {
  return items.map((i) => {
    const [first, ...rest] = i.display_name.split(', ');
    return {
      id: `nominatim:${i.place_id}`,
      name: i.name || first || i.display_name,
      address: rest.join(', '),
      lat: Number(i.lat),
      lng: Number(i.lon),
      countryCode: i.address?.country_code?.toUpperCase(),
    };
  });
}

interface GooglePrediction {
  placePrediction?: {
    placeId: string;
    text?: { text: string };
    structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
  };
}

export function parseGoogleAutocomplete(json: { suggestions?: GooglePrediction[] }): SearchResult[] {
  const out: SearchResult[] = [];
  for (const s of json.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p) continue;
    out.push({
      id: `google:${p.placeId}`,
      placeId: p.placeId,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      address: p.structuredFormat?.secondaryText?.text ?? '',
      lat: null,
      lng: null,
    });
  }
  return out;
}

/** Results from the preferred country first; order is otherwise kept. */
export function preferRegion(results: SearchResult[], region: string): SearchResult[] {
  if (!region) return results;
  const code = region.toUpperCase();
  return [...results.filter((r) => r.countryCode === code), ...results.filter((r) => r.countryCode !== code)];
}

/* ---------- network ---------- */

async function getJson<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { signal, ...init });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return (await res.json()) as T;
}

let lastNominatim = 0;

export async function searchPlaces(
  provider: SearchProviderId,
  query: string,
  ctx: SearchContext,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  switch (provider) {
    case 'photon': {
      const p = new URLSearchParams({
        q,
        limit: '7',
        lang: ['de', 'fr'].includes(ctx.language) ? ctx.language : 'en',
      });
      if (ctx.near) {
        p.set('lat', ctx.near.lat.toFixed(4));
        p.set('lon', ctx.near.lng.toFixed(4));
      }
      const json = await getJson<{ features?: PhotonFeature[] }>(
        `https://photon.komoot.io/api/?${p}`,
        ctx.signal,
      );
      return preferRegion(parsePhoton(json), ctx.region);
    }
    case 'nominatim': {
      // Public instance policy: at most one request per second.
      const wait = lastNominatim + 1000 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastNominatim = Date.now();
      const p = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '7',
        addressdetails: '1',
        'accept-language': ctx.language,
      });
      if (ctx.region) p.set('countrycodes', ctx.region.toLowerCase());
      const items = await getJson<NominatimItem[]>(
        `https://nominatim.openstreetmap.org/search?${p}`,
        ctx.signal,
      );
      return parseNominatim(items);
    }
    case 'google': {
      if (!ctx.googleKey)
        throw new Error('Add a Google Maps API key in Settings > Accounts to use Google search');
      const body: Record<string, unknown> = { input: q, languageCode: ctx.language };
      if (ctx.region) body.includedRegionCodes = [ctx.region.toLowerCase()];
      if (ctx.near) {
        body.locationBias = {
          circle: { center: { latitude: ctx.near.lat, longitude: ctx.near.lng }, radius: 50_000 },
        };
      }
      const json = await getJson<{ suggestions?: GooglePrediction[] }>(
        'https://places.googleapis.com/v1/places:autocomplete',
        ctx.signal,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': ctx.googleKey },
          body: JSON.stringify(body),
        },
      );
      return parseGoogleAutocomplete(json);
    }
  }
}

/** Google predictions need one more call to get coordinates. */
export async function resolveResult(
  result: SearchResult,
  ctx: Pick<SearchContext, 'googleKey' | 'language'>,
): Promise<Place> {
  let { lat, lng } = result;
  let address = result.address;
  if ((lat === null || lng === null) && result.placeId) {
    const json = await getJson<{
      location?: { latitude: number; longitude: number };
      formattedAddress?: string;
    }>(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(result.placeId)}?languageCode=${ctx.language}`,
      undefined,
      { headers: { 'X-Goog-Api-Key': ctx.googleKey, 'X-Goog-FieldMask': 'location,formattedAddress' } },
    );
    if (!json.location) throw new Error('Place has no location');
    lat = json.location.latitude;
    lng = json.location.longitude;
    address = json.formattedAddress ?? address;
  }
  if (lat === null || lng === null) throw new Error('Place has no location');
  return { id: result.id, name: result.name, address, lat, lng };
}

/** Name a dropped pin using Photon's reverse geocoder; falls back to the coordinates. */
export async function reverseGeocode(
  lat: number,
  lng: number,
  language = 'en',
  signal?: AbortSignal,
): Promise<{ name: string; address: string }> {
  const fallback = { name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, address: '' };
  try {
    const json = await getJson<{ features?: PhotonFeature[] }>(
      `https://photon.komoot.io/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&lang=${['de', 'fr'].includes(language) ? language : 'en'}`,
      signal,
    );
    const [first] = parsePhoton(json);
    return first ? { name: first.name, address: first.address } : fallback;
  } catch {
    return fallback;
  }
}
