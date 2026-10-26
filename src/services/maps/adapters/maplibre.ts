import type { Map as MlMap, Marker, StyleSpecification } from 'maplibre-gl';
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

const CARTO_ATTR =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

/** Raster basemaps built on OpenStreetMap data. */
export const TILE_SETS: Record<MapStyleKind, TileSet> = {
  light: {
    tiles: ['a', 'b', 'c', 'd'].map(
      (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`,
    ),
    attribution: CARTO_ATTR,
    tileSize: 256,
    maxzoom: 19,
  },
  dark: {
    tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`),
    attribution: CARTO_ATTR,
    tileSize: 256,
    maxzoom: 19,
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    tileSize: 256,
    maxzoom: 18,
  },
};

export function buildStyle(kind: MapStyleKind): StyleSpecification {
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
  const [maplibregl] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
  const center = opts.center ?? { lat: 30, lng: 20 };
  const map: MlMap = new maplibregl.Map({
    container,
    style: buildStyle(opts.style),
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

  const run = (fn: () => void) => {
    programmatic++;
    fn();
    map.once('moveend', () => {
      programmatic = Math.max(0, programmatic - 1);
    });
  };

  return {
    kind: 'maplibre',
    setStyle: (style) => map.setStyle(buildStyle(style)),
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
    fitTo(points) {
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
          { padding: 80, maxZoom: 16, duration: 700 },
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
