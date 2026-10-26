import { useEffect, useState } from 'react';
import { getLastKnownPosition } from '../../core/lastPos';
import { useSettings } from '../../core/settings';
import { searchPlaces, supportsAutocomplete, type SearchResult } from '../../services/maps/geocode';
import { useGeo } from '../../services/maps/geolocation';

export const SEARCH_DEBOUNCE_MS = 350;
export const MIN_QUERY_LENGTH = 2;

/**
 * Debounced place search. Providers that allow autocomplete (Photon, Google) search while typing;
 * Nominatim only searches when `submitNonce` changes (its usage policy forbids autocomplete).
 */
export function usePlaceSearch(query: string, submitNonce: number) {
  const provider = useSettings((s) => s.searchProvider);
  const region = useSettings((s) => s.regionBias);
  const googleKey = useSettings((s) => s.googleMapsKey);
  const [state, setState] = useState<{ results: SearchResult[]; loading: boolean; error: string | null }>({
    results: [],
    loading: false,
    error: null,
  });

  const live = supportsAutocomplete(provider);
  const q = query.trim();

  useEffect(() => {
    if (q.length < MIN_QUERY_LENGTH) {
      setState({ results: [], loading: false, error: null });
      return;
    }
    if (!live && submitNonce === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setState((s) => ({ ...s, loading: true, error: null }));
        const g = useGeo.getState();
        const near = g.lat !== null && g.lng !== null ? { lat: g.lat, lng: g.lng } : getLastKnownPosition();
        searchPlaces(provider, q, { near, region, language: 'en', googleKey, signal: controller.signal })
          .then((results) => setState({ results, loading: false, error: null }))
          .catch((e: unknown) => {
            if (controller.signal.aborted) return;
            setState({ results: [], loading: false, error: e instanceof Error ? e.message : String(e) });
          });
      },
      live ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `submitNonce` is intentionally part of the key for submit-only providers
  }, [q, provider, region, googleKey, live, submitNonce]);

  return { ...state, live, tooShort: q.length < MIN_QUERY_LENGTH };
}
