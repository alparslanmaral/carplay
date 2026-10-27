import type { LatLngLike } from './adapter';
import { decodePolyline } from './polyline';

/**
 * Open-source routing through Valhalla (OpenStreetMap data). The public FOSSGIS instance needs no key and
 * allows browser requests; it is shared infrastructure, so only one request is made per route / reroute.
 */
export const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';

export interface RouteOptions {
  avoidTolls: boolean;
  avoidHighways: boolean;
}

export interface Maneuver {
  /** Valhalla maneuver type (see ManeuverKind). */
  type: number;
  text: string;
  /** Sentence meant to be spoken shortly before the manoeuvre. */
  spoken: string;
  street: string;
  /** Metres from the start of the route to this manoeuvre. */
  startM: number;
  /** Seconds from the start of the route to this manoeuvre. */
  startS: number;
  /** Length of the stretch that follows this manoeuvre, metres / seconds. */
  lengthM: number;
  timeS: number;
}

export interface Route {
  coords: LatLngLike[];
  maneuvers: Maneuver[];
  distanceM: number;
  durationS: number;
  hasToll: boolean;
  hasFerry: boolean;
}

export type ManeuverKind =
  'straight' | 'left' | 'right' | 'sharp-left' | 'sharp-right' | 'uturn' | 'roundabout' | 'arrive';

/**
 * Collapse Valhalla's maneuver types into the few glyphs the banner shows.
 * 4-6 destination, 9/10/18/20/23/37 right-ish, 11 sharp right, 12/13 U-turn, 14 sharp left,
 * 15/16/19/21/24/38 left-ish, 26/27 roundabout; everything else (start, continue, merge, ferry) is straight.
 */
export function maneuverKind(type: number): ManeuverKind {
  switch (type) {
    case 4:
    case 5:
    case 6:
      return 'arrive';
    case 9:
    case 10:
    case 18:
    case 20:
    case 23:
    case 37:
      return 'right';
    case 11:
      return 'sharp-right';
    case 12:
    case 13:
      return 'uturn';
    case 14:
      return 'sharp-left';
    case 15:
    case 16:
    case 19:
    case 21:
    case 24:
    case 38:
      return 'left';
    case 26:
    case 27:
      return 'roundabout';
    default:
      return 'straight';
  }
}

interface ValhallaManeuver {
  type: number;
  instruction: string;
  verbal_pre_transition_instruction?: string;
  verbal_transition_alert_instruction?: string;
  street_names?: string[];
  length: number;
  time: number;
}

interface ValhallaResponse {
  trip?: {
    summary: { length: number; time: number; has_toll?: boolean; has_ferry?: boolean };
    legs: { shape: string; maneuvers: ValhallaManeuver[] }[];
  };
  error?: string;
  error_code?: number;
}

export function buildRequest(from: LatLngLike, to: LatLngLike, opts: RouteOptions) {
  return {
    locations: [
      { lat: from.lat, lon: from.lng, type: 'break' },
      { lat: to.lat, lon: to.lng, type: 'break' },
    ],
    costing: 'auto',
    // 0 = avoid as far as possible, 0.5 = neutral. Valhalla treats this as a strong preference, not a ban;
    // `has_toll` in the answer says whether the result still contains a toll.
    costing_options: {
      auto: { use_tolls: opts.avoidTolls ? 0 : 0.5, use_highways: opts.avoidHighways ? 0 : 0.5 },
    },
    directions_options: { units: 'kilometers', language: 'en-US' },
  };
}

export function parseRoute(data: ValhallaResponse): Route {
  const trip = data.trip;
  if (!trip || trip.legs.length === 0) throw new Error(data.error ?? 'No route found');
  const coords: LatLngLike[] = [];
  const maneuvers: Maneuver[] = [];
  let m = 0;
  let s = 0;
  for (const leg of trip.legs) {
    const shape = decodePolyline(leg.shape);
    coords.push(...(coords.length ? shape.slice(1) : shape));
    for (const v of leg.maneuvers) {
      const lengthM = v.length * 1000;
      maneuvers.push({
        type: v.type,
        text: v.instruction,
        spoken: v.verbal_pre_transition_instruction ?? v.verbal_transition_alert_instruction ?? v.instruction,
        street: v.street_names?.[0] ?? '',
        startM: m,
        startS: s,
        lengthM,
        timeS: v.time,
      });
      m += lengthM;
      s += v.time;
    }
  }
  return {
    coords,
    maneuvers,
    distanceM: trip.summary.length * 1000,
    durationS: trip.summary.time,
    hasToll: !!trip.summary.has_toll,
    hasFerry: !!trip.summary.has_ferry,
  };
}

export async function fetchRoute(
  from: LatLngLike,
  to: LatLngLike,
  opts: RouteOptions,
  signal?: AbortSignal,
): Promise<Route> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  const forward = () => ctl.abort();
  signal?.addEventListener('abort', forward);
  try {
    const res = await fetch(VALHALLA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(from, to, opts)),
      signal: ctl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as ValhallaResponse;
    if (!res.ok) {
      // 442 = no path between the points (for example across water without a ferry).
      if (data.error_code === 442) throw new Error('No road route between these points.');
      throw new Error(data.error ?? `Routing failed (${res.status})`);
    }
    return parseRoute(data);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError' && !signal?.aborted)
      throw new Error('Routing timed out. Check your connection.', { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}
