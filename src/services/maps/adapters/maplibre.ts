import type { GeoJSONSource, Map as MlMap, Marker, StyleSpecification } from 'maplibre-gl';
import type {
  FollowTarget,
  LatLngLike,
  MapAdapter,
  MapCreateOptions,
  MapStyleKind,
  MapView,
  UserMarker,
} from '../adapter';

interface TileSet {
  tiles: string[];
  attribution: string;
  tileSize: number;
  maxzoom: number;
}

/**
 * Road maps are VersaTiles vector styles (OpenStreetMap data, free, no API key). CARTO's free raster tiles
 * started returning "API KEY REQUIRED" watermarks, so they are no longer used. Each style brings its own
 * tiles, glyphs, sprite and attribution.
 */
export const VECTOR_STYLES: Record<'light' | 'dark', string> = {
  light: 'https://tiles.versatiles.org/assets/styles/colorful/style.json',
  dark: 'https://tiles.versatiles.org/assets/styles/eclipse/style.json',
};

/** Raster imagery for the satellite view. */
export const TILE_SETS: Record<'satellite', TileSet> = {
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    tileSize: 256,
    maxzoom: 18,
  },
};

export function buildStyle(kind: 'satellite'): StyleSpecification {
  const set = TILE_SETS[kind];
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: set.tiles,
        tileSize: set.tileSize,
        maxzoom: set.maxzoom,
        attribution: set.attribution,
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

/** A style URL for the vector road maps, an inline raster style for satellite. */
export function styleFor(kind: MapStyleKind): string | StyleSpecification {
  return kind === 'satellite' ? buildStyle(kind) : VECTOR_STYLES[kind];
}

function userElement(accent: string): { el: HTMLElement; arrow: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'map-user';
  el.style.setProperty('--accent', accent);
  const arrow = document.createElement('div');
  arrow.className = 'map-user__arrow';
  const dot = document.createElement('div');
  dot.className = 'map-user__dot';
  el.append(arrow, dot);
  return { el, arrow };
}

export async function createMapLibreAdapter(
  container: HTMLElement,
  opts: MapCreateOptions,
): Promise<MapAdapter> {
  const [maplibregl, { default: workerUrl }] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]);
  // v6 loads its worker from a separate file that the bundler does not emit on its own; without this
  // the production build asks for /assets/maplibre-gl-worker.mjs, gets a 404 and the map stays blank.
  maplibregl.setWorkerUrl(workerUrl);
  const center = opts.center ?? { lat: 30, lng: 20 };
  const map: MlMap = new maplibregl.Map({
    container,
    style: styleFor(opts.style),
    center: [center.lng, center.lat],
    zoom: opts.center ? opts.zoom : 2,
    attributionControl: { compact: true },
    interactive: opts.interactive,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    fadeDuration: 150,
  });
  map.touchZoomRotate.disableRotation();

  let userMarker: Marker | null = null;
  let userArrow: HTMLElement | null = null;
  let destMarker: Marker | null = null;
  let moveCb: (() => void) | null = null;
  let tapCb: ((p: LatLngLike) => void) | null = null;
  let programmatic = 0;

  // Only gestures count as "the user moved the map"; our own easeTo calls are tagged and ignored.
  map.on('dragstart', () => moveCb?.());
  map.on('zoomstart', (e) => {
    if (!programmatic && (e as { originalEvent?: unknown }).originalEvent) moveCb?.();
  });
  map.on('click', (e) => tapCb?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));

  // The route lives in its own source/layers. Changing the basemap style wipes them, so they are re-added on
  // every style load; if the style is not ready yet, adding throws and the `style.load` redraw takes over.
  let routeCoords: LatLngLike[] | null = null;
  const drawRoute = () => {
    try {
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: (routeCoords ?? []).map((p) => [p.lng, p.lat] as [number, number]),
        },
      };
      const src = map.getSource('route') as GeoJSONSource | undefined;
      if (src) return src.setData(data);
      if (!routeCoords) return;
      map.addSource('route', { type: 'geojson', data });
      const line = { 'line-cap': 'round', 'line-join': 'round' } as const;
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: line,
        paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: line,
        paint: { 'line-color': opts.accent, 'line-width': 7 },
      });
    } catch {
      /* style not loaded yet */
    }
  };
  map.on('style.load', drawRoute);

  const run = (fn: () => void) => {
    programmatic++;
    fn();
    map.once('moveend', () => {
      programmatic = Math.max(0, programmatic - 1);
    });
  };

  return {
    kind: 'maplibre',
    setStyle: (style) => map.setStyle(styleFor(style)),
    // MapLibre raster basemaps carry no traffic data; the setting is documented as "where supported".
    setTraffic: () => undefined,
    setUser(user: UserMarker | null) {
      if (!user) {
        userMarker?.remove();
        userMarker = null;
        return;
      }
      if (!userMarker) {
        const { el, arrow } = userElement(opts.accent);
        userArrow = arrow;
        userMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
          .setLngLat([user.lng, user.lat])
          .addTo(map);
      } else {
        userMarker.setLngLat([user.lng, user.lat]);
      }
      if (userArrow) {
        userArrow.style.opacity = user.heading === null ? '0' : '1';
        userArrow.style.transform = `rotate(${user.heading ?? 0}deg)`;
      }
    },
    setDestination(dest) {
      destMarker?.remove();
      destMarker = null;
      if (!dest) return;
      const el = document.createElement('div');
      el.className = 'map-pin';
      el.style.setProperty('--accent', opts.accent);
      // MapLibre positions the marker element with its own transform, so the rotated shape lives in a child.
      const shape = document.createElement('div');
      shape.className = 'map-pin__shape';
      el.append(shape);
      destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([dest.lng, dest.lat])
        .addTo(map);
    },
    setRoute(coords) {
      routeCoords = coords && coords.length > 1 ? coords : null;
      drawRoute();
    },
    follow(t: FollowTarget) {
      run(() =>
        map.easeTo({
          center: [t.lng, t.lat],
          ...(t.zoom !== undefined ? { zoom: t.zoom } : {}),
          ...(t.bearing !== undefined ? { bearing: t.bearing } : {}),
          duration: 900,
          easing: (x) => x,
        }),
      );
    },
    jumpTo(t) {
      run(() =>
        map.jumpTo({
          center: [t.lng, t.lat],
          ...(t.zoom !== undefined ? { zoom: t.zoom } : {}),
          ...(t.bearing !== undefined ? { bearing: t.bearing } : {}),
        }),
      );
    },
    fitTo(points, insets) {
      if (points.length === 0) return;
      const b = points.reduce(
        (acc, p) => ({
          w: Math.min(acc.w, p.lng),
          e: Math.max(acc.e, p.lng),
          s: Math.min(acc.s, p.lat),
          n: Math.max(acc.n, p.lat),
        }),
        { w: 180, e: -180, s: 90, n: -90 },
      );
      run(() =>
        map.fitBounds(
          [
            [b.w, b.s],
            [b.e, b.n],
          ],
          {
            padding: insets ? { top: insets.top + 24, bottom: insets.bottom + 24, left: 48, right: 48 } : 80,
            maxZoom: 16,
            duration: 700,
          },
        ),
      );
    },
    getView(): MapView {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng, zoom: map.getZoom(), bearing: map.getBearing() };
    },
    onUserMove: (cb) => (moveCb = cb),
    onTap: (cb) => (tapCb = cb),
    resize: () => map.resize(),
    destroy: () => map.remove(),
  };
}
