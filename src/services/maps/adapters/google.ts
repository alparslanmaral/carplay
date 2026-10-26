/* eslint-disable @typescript-eslint/no-explicit-any --
   The Google Maps JS SDK is loaded at runtime from Google's servers and ships no bundled types;
   its surface is kept behind the MapAdapter interface. */
import type {
  FollowTarget,
  LatLngLike,
  MapAdapter,
  MapCreateOptions,
  MapStyleKind,
  MapView,
  UserMarker,
} from '../adapter';

let loading: Promise<any> | null = null;

/** Load the Maps JavaScript API once. Rejects on a blocked script or an invalid key. */
function loadGoogle(key: string): Promise<any> {
  const w = window as any;
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google);
  loading ??= new Promise((resolve, reject) => {
    w.__ddGoogleAuthFailed = () => reject(new Error('Google Maps rejected the API key'));
    w.gm_authFailure = w.__ddGoogleAuthFailed;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__ddGoogleReady`;
    s.async = true;
    w.__ddGoogleReady = () => resolve(w.google);
    s.onerror = () => reject(new Error('Could not load Google Maps'));
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export async function createGoogleAdapter(
  container: HTMLElement,
  opts: MapCreateOptions,
): Promise<MapAdapter> {
  const google = await loadGoogle(opts.googleKey);
  const { Map: GMap } = await google.maps.importLibrary('maps');
  const center = opts.center ?? { lat: 30, lng: 20 };
  const colorScheme = (s: MapStyleKind) =>
    s === 'dark' ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT;
  const typeId = (s: MapStyleKind) => (s === 'satellite' ? 'hybrid' : 'roadmap');

  const map = new GMap(container, {
    center,
    zoom: opts.center ? opts.zoom : 2,
    // A mapId is required for vector maps (heading rotation, dark colour scheme).
    mapId: 'DEMO_MAP_ID',
    colorScheme: colorScheme(opts.style),
    mapTypeId: typeId(opts.style),
    disableDefaultUI: true,
    gestureHandling: opts.interactive ? 'greedy' : 'none',
    clickableIcons: false,
  });
  const traffic = new google.maps.TrafficLayer();
  if (opts.traffic) traffic.setMap(map);

  let userMarker: any = null;
  let destMarker: any = null;
  let moveCb: (() => void) | null = null;
  let tapCb: ((p: LatLngLike) => void) | null = null;
  let programmatic = false;

  map.addListener('dragstart', () => moveCb?.());
  map.addListener('click', (e: any) => tapCb?.({ lat: e.latLng.lat(), lng: e.latLng.lng() }));

  const move = (t: FollowTarget) => {
    programmatic = true;
    map.panTo({ lat: t.lat, lng: t.lng });
    if (t.zoom !== undefined) map.setZoom(t.zoom);
    if (t.bearing !== undefined) map.setHeading(t.bearing);
    setTimeout(() => (programmatic = false), 400);
  };

  return {
    kind: 'google',
    setStyle(style) {
      map.setOptions({ colorScheme: colorScheme(style), mapTypeId: typeId(style) });
    },
    setTraffic: (on) => traffic.setMap(on ? map : null),
    setUser(user: UserMarker | null) {
      if (!user) {
        userMarker?.setMap(null);
        userMarker = null;
        return;
      }
      const icon = {
        path:
          user.heading === null ? google.maps.SymbolPath.CIRCLE : google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: user.heading === null ? 8 : 6,
        rotation: user.heading ?? 0,
        fillColor: opts.accent,
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      };
      userMarker ??= new google.maps.Marker({ map, clickable: false, zIndex: 10 });
      userMarker.setPosition({ lat: user.lat, lng: user.lng });
      userMarker.setIcon(icon);
    },
    setDestination(dest) {
      destMarker?.setMap(null);
      destMarker = dest
        ? new google.maps.Marker({ map, position: { lat: dest.lat, lng: dest.lng }, title: dest.name })
        : null;
    },
    follow: move,
    jumpTo: move,
    fitTo(points) {
      if (!points.length) return;
      const b = new google.maps.LatLngBounds();
      points.forEach((p) => b.extend(p));
      map.fitBounds(b, 80);
    },
    getView(): MapView {
      const c = map.getCenter();
      return { lat: c.lat(), lng: c.lng(), zoom: map.getZoom(), bearing: map.getHeading() ?? 0 };
    },
    onUserMove: (cb) => (moveCb = () => !programmatic && cb()),
    onTap: (cb) => (tapCb = cb),
    resize: () => google.maps.event.trigger(map, 'resize'),
    destroy() {
      userMarker?.setMap(null);
      destMarker?.setMap(null);
      container.replaceChildren();
    },
  };
}
