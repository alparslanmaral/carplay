/* eslint-disable @typescript-eslint/no-explicit-any --
   MapKit JS is loaded at runtime from Apple's CDN and ships no bundled types;
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

function loadMapKit(token: string): Promise<any> {
  const w = window as any;
  loading ??= new Promise((resolve, reject) => {
    const done = () => {
      try {
        w.mapkit.init({ authorizationCallback: (cb: (t: string) => void) => cb(token), language: 'en' });
        resolve(w.mapkit);
      } catch (e) {
        reject(e instanceof Error ? e : new Error('MapKit failed to initialise'));
      }
    };
    if (w.mapkit) return done();
    const s = document.createElement('script');
    s.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
    s.crossOrigin = 'anonymous';
    s.onload = done;
    s.onerror = () => reject(new Error('Could not load MapKit JS'));
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export async function createMapKitAdapter(
  container: HTMLElement,
  opts: MapCreateOptions,
): Promise<MapAdapter> {
  const mapkit = await loadMapKit(opts.mapkitToken);
  const coord = (p: LatLngLike) => new mapkit.Coordinate(p.lat, p.lng);
  const center = opts.center ?? { lat: 30, lng: 20 };
  const span = (zoom: number) => 360 / 2 ** zoom;
  const region = (p: LatLngLike, zoom: number) =>
    new mapkit.CoordinateRegion(coord(p), new mapkit.CoordinateSpan(span(zoom) * 0.6, span(zoom)));
  const mapType = (s: MapStyleKind) =>
    s === 'satellite' ? mapkit.Map.MapTypes.Hybrid : mapkit.Map.MapTypes.Standard;
  const scheme = (s: MapStyleKind) =>
    s === 'light' ? mapkit.Map.ColorSchemes.Light : mapkit.Map.ColorSchemes.Dark;

  const map = new mapkit.Map(container, {
    region: region(center, opts.center ? opts.zoom : 2),
    mapType: mapType(opts.style),
    colorScheme: scheme(opts.style),
    showsUserLocationControl: false,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    showsZoomControl: false,
    showsMapTypeControl: false,
    isRotationEnabled: opts.interactive,
    isScrollEnabled: opts.interactive,
    isZoomEnabled: opts.interactive,
    showsTraffic: opts.traffic,
  });

  let user: any = null;
  let dest: any = null;
  let routeOverlay: any = null;
  let moveCb: (() => void) | null = null;
  let tapCb: ((p: LatLngLike) => void) | null = null;
  let programmatic = false;

  map.addEventListener('scroll-start', () => !programmatic && moveCb?.());
  map.addEventListener('zoom-start', () => !programmatic && moveCb?.());
  map.element.addEventListener('click', (e: MouseEvent) => {
    const p = map.convertPointOnPageToCoordinate(new DOMPoint(e.pageX, e.pageY));
    tapCb?.({ lat: p.latitude, lng: p.longitude });
  });

  const move = (t: FollowTarget, animated: boolean) => {
    programmatic = true;
    if (t.zoom !== undefined) map.setRegionAnimated(region(t, t.zoom), animated);
    else map.setCenterAnimated(coord(t), animated);
    if (t.bearing !== undefined) map.rotation = t.bearing;
    setTimeout(() => (programmatic = false), 600);
  };

  return {
    kind: 'mapkit',
    setStyle(style) {
      map.mapType = mapType(style);
      map.colorScheme = scheme(style);
    },
    setTraffic: (on) => (map.showsTraffic = on),
    setUser(u: UserMarker | null) {
      if (user) map.removeAnnotation(user);
      user = null;
      if (!u) return;
      user = new mapkit.MarkerAnnotation(coord(u), {
        color: opts.accent,
        glyphText: '●',
        clusteringIdentifier: null,
      });
      map.addAnnotation(user);
    },
    setDestination(d) {
      if (dest) map.removeAnnotation(dest);
      dest = null;
      if (!d) return;
      dest = new mapkit.MarkerAnnotation(coord(d), { color: '#ff3b30', title: d.name });
      map.addAnnotation(dest);
    },
    setRoute(coords) {
      if (routeOverlay) map.removeOverlay(routeOverlay);
      routeOverlay = null;
      if (!coords || coords.length < 2) return;
      routeOverlay = new mapkit.PolylineOverlay(coords.map(coord), {
        style: new mapkit.Style({
          lineWidth: 7,
          strokeColor: opts.accent,
          lineJoin: 'round',
          lineCap: 'round',
        }),
      });
      map.addOverlay(routeOverlay);
    },
    follow: (t) => move(t, true),
    jumpTo: (t) => move(t, false),
    fitTo(points, insets) {
      if (!points.length) return;
      map.showItems(
        points.map((p) => new mapkit.MarkerAnnotation(coord(p))),
        {
          animate: true,
          padding: insets
            ? new mapkit.Padding(insets.top + 24, 48, insets.bottom + 24, 48)
            : new mapkit.Padding(80, 80, 80, 80),
        },
      );
    },
    getView(): MapView {
      const c = map.center;
      const zoom = Math.log2(360 / (map.region.span.longitudeDelta || 1));
      return { lat: c.latitude, lng: c.longitude, zoom, bearing: map.rotation ?? 0 };
    },
    onUserMove: (cb) => (moveCb = cb),
    onTap: (cb) => (tapCb = cb),
    resize: () => undefined,
    destroy: () => map.destroy(),
  };
}
