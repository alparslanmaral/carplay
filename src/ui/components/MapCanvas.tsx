import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLastKnownPosition } from '../../core/lastPos';
import { useSettings } from '../../core/settings';
import { currentThemeContext, resolveTheme } from '../../core/theme';
import { toast } from '../../core/toast';
import {
  createMapAdapter,
  loadLastView,
  resolveMapStyle,
  saveLastView,
  zoomForSpeed,
  type LatLngLike,
  type MapAdapter,
} from '../../services/maps/adapter';
import { useGeo } from '../../services/maps/geolocation';
import { bounds } from '../../services/maps/routeMath';
import { useNow } from '../hooks/useClock';

export interface MapCanvasProps {
  interactive?: boolean;
  destination?: (LatLngLike & { name?: string }) | null;
  /** Called when the user taps empty map. */
  onTap?: (p: LatLngLike) => void;
  className?: string;
  /** Shown over the map when it is not interactive (dashboard widget): the whole card is a button. */
  onActivate?: () => void;
  /** Increment to jump back to the user and resume following. */
  recenterNonce?: number;
  onFollowChange?: (following: boolean) => void;
  /** Planned route drawn as a line; the camera fits it while previewing. */
  route?: LatLngLike[] | null;
  /** Turn-by-turn is running: keep following the user instead of framing the whole trip. */
  guiding?: boolean;
}

/** Room taken up by the Maps screen's search bar and bottom sheet, so a fitted route stays clear of them. */
function overlayInsets(host: HTMLElement | null): { top: number; bottom: number } | undefined {
  const screen = host?.closest('.maps');
  if (!host || !screen) return undefined;
  const area = host.getBoundingClientRect();
  const top = screen.querySelector('.maps__top')?.getBoundingClientRect();
  const bottom = screen.querySelector('.maps__bottom')?.getBoundingClientRect();
  return {
    top: top ? Math.max(0, top.bottom - area.top) : 0,
    bottom: bottom ? Math.max(0, area.bottom - bottom.top) : 0,
  };
}

/**
 * Map + live position. Follows the user until they drag the map; a recenter button brings follow mode back.
 * Camera behaviour (north-up / heading-up, auto-zoom by speed) comes from settings.
 */
export function MapCanvas({
  interactive = true,
  destination = null,
  onTap,
  className,
  onActivate,
  recenterNonce = 0,
  onFollowChange,
  route = null,
  guiding = false,
}: MapCanvasProps) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<MapAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  followingRef.current = following;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const provider = useSettings((s) => s.mapProvider);
  const styleSetting = useSettings((s) => s.mapStyle);
  const traffic = useSettings((s) => s.showTraffic);
  const accent = useSettings((s) => s.accent);
  const theme = useSettings((s) => s.theme);
  const googleKey = useSettings((s) => s.googleMapsKey);
  const mapkitToken = useSettings((s) => s.mapkitToken);
  const now = useNow(60_000);
  const resolvedTheme = resolveTheme(theme, { ...currentThemeContext(), now });
  const style = resolveMapStyle(styleSetting, resolvedTheme);

  const lat = useGeo((s) => s.lat);
  const lng = useGeo((s) => s.lng);
  const heading = useGeo((s) => s.heading);
  const accuracy = useGeo((s) => s.accuracy);
  const speed = useGeo((s) => s.speedKmh);

  // Latest values for effects that must not re-create the map.
  const latest = useRef({ style, traffic });
  latest.current = { style, traffic };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    const last = loadLastView();
    const pos = useGeo.getState();
    const start =
      pos.lat !== null && pos.lng !== null
        ? { lat: pos.lat, lng: pos.lng }
        : (getLastKnownPosition() ?? last);
    void createMapAdapter(
      provider,
      el,
      {
        style: latest.current.style,
        center: start,
        zoom: last?.zoom ?? 15,
        traffic: latest.current.traffic,
        interactive,
        googleKey,
        mapkitToken,
        accent,
      },
      (reason) => toast(t('maps.providerFallback', { reason }), 'bad', 6000),
    ).then((a) => {
      if (cancelled) return a.destroy();
      adapter.current = a;
      a.onUserMove(() => setFollowing(false));
      a.onTap((p) => onTapRef.current?.(p));
      setReady(true);
      // The container may have been laid out (screen transition, rail change) while the engine was loading,
      // and ResizeObserver already fired before an adapter existed to receive it.
      requestAnimationFrame(() => adapter.current?.resize());
      setTimeout(() => adapter.current?.resize(), 400);
    });
    const ro = new ResizeObserver(() => adapter.current?.resize());
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
      const a = adapter.current;
      if (a) {
        saveLastView({ ...a.getView() });
        a.destroy();
      }
      adapter.current = null;
      setReady(false);
    };
    // Rebuild only when the engine or interactivity changes; style/traffic/position are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, interactive, googleKey, mapkitToken]);

  useEffect(() => {
    if (ready) adapter.current?.setStyle(style);
  }, [ready, style]);

  useEffect(() => {
    if (ready) adapter.current?.setTraffic(traffic);
  }, [ready, traffic]);

  useEffect(() => {
    if (ready) adapter.current?.setDestination(destination);
  }, [ready, destination]);

  // Position marker + camera.
  useEffect(() => {
    const a = adapter.current;
    if (!ready || !a) return;
    if (lat === null || lng === null) return a.setUser(null);
    a.setUser({ lat, lng, heading, accuracy });
    if (!followingRef.current) return;
    const s = useSettings.getState();
    a.follow({
      lat,
      lng,
      zoom: s.autoZoom ? zoomForSpeed(speed) : undefined,
      bearing: s.mapOrientation === 'heading' ? (heading ?? undefined) : 0,
    });
    // Speed only matters for zoom; re-running on every speed tick would restart the animation needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lat, lng, heading, accuracy]);

  useEffect(() => {
    if (ready) adapter.current?.setRoute(route);
  }, [ready, route]);

  // Starting guidance hands the camera back to the user's position (a hand-drag afterwards still wins).
  useEffect(() => {
    if (!guiding) return;
    setFollowing(true);
    const g = useGeo.getState();
    if (!ready || g.lat === null || g.lng === null) return;
    const s = useSettings.getState();
    adapter.current?.follow({
      lat: g.lat,
      lng: g.lng,
      zoom: s.autoZoom ? zoomForSpeed(g.speedKmh) : undefined,
      bearing: s.mapOrientation === 'heading' ? (g.heading ?? undefined) : 0,
    });
    // only when guidance starts (or the map becomes ready), not on every position update
  }, [guiding, ready]);

  // A destination picked from search: show both ends of the trip (or the whole route) and stop following.
  // While guiding the camera stays on the user instead.
  useEffect(() => {
    const a = adapter.current;
    if (!ready || !a || !destination) return;
    if (guiding) return;
    setFollowing(false);
    const points: LatLngLike[] = route?.length ? bounds(route) : [destination];
    const g = useGeo.getState();
    if (!route?.length && g.lat !== null && g.lng !== null) points.push({ lat: g.lat, lng: g.lng });
    // The sheet and search bar are laid over the map; wait a frame so their final size is known.
    const frame = requestAnimationFrame(() => a.fitTo(points, overlayInsets(host.current)));
    return () => cancelAnimationFrame(frame);
  }, [ready, destination, route, guiding]);

  useEffect(() => onFollowChange?.(following), [following, onFollowChange]);

  useEffect(() => {
    if (!recenterNonce) return;
    setFollowing(true);
    const g = useGeo.getState();
    if (g.lat !== null && g.lng !== null && adapter.current) {
      adapter.current.follow({ lat: g.lat, lng: g.lng, zoom: zoomForSpeed(g.speedKmh), bearing: 0 });
    } else {
      g.start();
    }
  }, [recenterNonce]);

  return (
    <div
      className={`mapcanvas${className ? ` ${className}` : ''}`}
      data-ready={ready}
      data-provider={provider}
    >
      <div ref={host} className="mapcanvas__host" />
      {!ready && (
        <div className="mapcanvas__loading">
          <div className="spinner" />
        </div>
      )}
      {!interactive && onActivate && (
        <button className="mapcanvas__activate" onClick={onActivate} aria-label={t('maps.openMap')} />
      )}
    </div>
  );
}
