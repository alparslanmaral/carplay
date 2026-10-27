import type { LatLngLike } from './adapter';
import type { Maneuver } from './routing';

const EARTH = 6371008.8;
const RAD = Math.PI / 180;

/** Metres from the start to each vertex of the polyline. */
export function cumulativeDistances(coords: LatLngLike[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const dLat = (b.lat - a.lat) * RAD;
    const dLng = (b.lng - a.lng) * RAD;
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
    out.push(out[i - 1]! + 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h))));
  }
  return out;
}

export interface Snap {
  /** Metres travelled along the route. */
  along: number;
  /** Straight-line distance from the position to the route, metres. */
  offM: number;
  /** Index of the segment the position projects onto. */
  segment: number;
}

/** Closest point of one segment, in a local flat metric around the segment (fine for segments of a few km). */
function project(a: LatLngLike, b: LatLngLike, p: LatLngLike): { t: number; off: number } {
  const k = Math.cos(a.lat * RAD) * EARTH * RAD;
  const ky = EARTH * RAD;
  const bx = (b.lng - a.lng) * k;
  const by = (b.lat - a.lat) * ky;
  const px = (p.lng - a.lng) * k;
  const py = (p.lat - a.lat) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return { t, off: Math.hypot(px - t * bx, py - t * by) };
}

/** Offsets this close count as "the same road", so the segment nearest the previous answer wins. */
const TIE_M = 3;

function scan(
  coords: LatLngLike[],
  cum: number[],
  pos: LatLngLike,
  from: number,
  to: number,
  hint: number,
): Snap | null {
  let best: Snap | null = null;
  for (let i = Math.max(0, from); i <= Math.min(coords.length - 2, to); i++) {
    const { t, off } = project(coords[i]!, coords[i + 1]!, pos);
    const better =
      best === null ||
      off + TIE_M < best.offM ||
      (off <= best.offM + TIE_M && Math.abs(i - hint) < Math.abs(best.segment - hint));
    if (better) best = { along: cum[i]! + t * (cum[i + 1]! - cum[i]!), offM: off, segment: i };
  }
  return best;
}

/**
 * Where on the route is this position? Looks near the previous answer first so a road that doubles back on
 * itself (a loop, an interchange) does not make the progress jump; only if that window is far off does it
 * search the whole route.
 */
export function snapToRoute(coords: LatLngLike[], cum: number[], pos: LatLngLike, hint = 0): Snap {
  if (coords.length < 2) return { along: 0, offM: Infinity, segment: 0 };
  const near = scan(coords, cum, pos, hint - 10, hint + 400, hint);
  if (near && near.offM <= 80) return near;
  const all = scan(coords, cum, pos, 0, coords.length - 2, hint)!;
  return near && near.offM <= all.offM ? near : all;
}

/** Index of the manoeuvre the driver is currently heading towards (the first one not yet reached). */
export function nextManeuverIndex(maneuvers: Maneuver[], along: number): number {
  for (let i = 0; i < maneuvers.length; i++) {
    if (maneuvers[i]!.startM > along + 5) return i;
  }
  return Math.max(0, maneuvers.length - 1);
}

/** Seconds still to go, interpolated inside the current stretch. */
export function remainingSeconds(maneuvers: Maneuver[], total: number, along: number): number {
  let i = maneuvers.length - 1;
  while (i > 0 && maneuvers[i]!.startM > along) i--;
  const m = maneuvers[i];
  if (!m) return 0;
  const frac = m.lengthM > 0 ? Math.min(1, Math.max(0, (along - m.startM) / m.lengthM)) : 1;
  return Math.max(0, total - (m.startS + frac * m.timeS));
}

export function bounds(coords: LatLngLike[]): LatLngLike[] {
  if (coords.length === 0) return [];
  let s = 90;
  let n = -90;
  let w = 180;
  let e = -180;
  for (const c of coords) {
    s = Math.min(s, c.lat);
    n = Math.max(n, c.lat);
    w = Math.min(w, c.lng);
    e = Math.max(e, c.lng);
  }
  return [
    { lat: s, lng: w },
    { lat: n, lng: e },
  ];
}
