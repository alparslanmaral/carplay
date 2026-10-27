import { create } from 'zustand';
import { log } from '../../core/logger';
import { currentScreen, useRouter } from '../../core/router';
import { getSettings, useSettings, type Place } from '../../core/settings';
import { useGeo } from './geolocation';
import { addRecent } from './places';
import { cumulativeDistances, nextManeuverIndex, remainingSeconds, snapToRoute } from './routeMath';
import { fetchRoute, type Route, type RouteOptions } from './routing';

/**
 * In-app turn-by-turn on top of the open routing service. It only works while DriveDeck is on screen (iOS
 * stops GPS for web apps in the background), so it is a "second pair of eyes" next to a dedicated nav app.
 */
export type NavPhase = 'idle' | 'routing' | 'preview' | 'guiding';

export interface NavState {
  phase: NavPhase;
  destination: Place | null;
  route: Route | null;
  error: string | null;
  /** A new route is being fetched while the old one is still shown (off-route). */
  rerouting: boolean;
  arrived: boolean;
  /** Metres travelled along the route. */
  along: number;
  /** Distance from the position to the route line, metres. */
  offM: number;
  nextIdx: number;
  toNextM: number;
  remainingM: number;
  remainingS: number;
}

const IDLE: NavState = {
  phase: 'idle',
  destination: null,
  route: null,
  error: null,
  rerouting: false,
  arrived: false,
  along: 0,
  offM: 0,
  nextIdx: 0,
  toNextM: 0,
  remainingM: 0,
  remainingS: 0,
};

export const useNav = create<NavState>(() => ({ ...IDLE }));

const STORAGE_KEY = 'dd.nav';
/** A trip older than this is not resumed after the app was killed. */
export const RESUME_WINDOW_MS = 6 * 60 * 60_000;
/** Spoken/announced this far ahead of a manoeuvre. */
const ANNOUNCE_M = 350;
const ARRIVE_M = 40;
const REROUTE_MIN_GAP_MS = 8000;

let cum: number[] = [];
let inflight: AbortController | null = null;
let unsubscribeGeo: (() => void) | null = null;
let offRouteFixes = 0;
let lastRerouteAt = 0;
let announced = new Set<number>();
let hint = 0;

function routeOptions(): RouteOptions {
  const s = getSettings();
  return { avoidTolls: s.avoidTolls, avoidHighways: s.avoidHighways };
}

function save(destination: Place | null): void {
  try {
    if (destination) localStorage.setItem(STORAGE_KEY, JSON.stringify({ destination, ts: Date.now() }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the trip simply is not resumed after a restart */
  }
}

function readSaved(): Place | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      destination?: Place;
      ts?: number;
    } | null;
    const d = raw?.destination;
    if (!d || typeof raw?.ts !== 'number' || Date.now() - raw.ts > RESUME_WINDOW_MS) return null;
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng) || typeof d.name !== 'string') return null;
    return d;
  } catch {
    return null;
  }
}

export function speak(text: string): void {
  if (!getSettings().navVoice || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  } catch (e) {
    log.warn('nav', 'speech failed', e);
  }
}

function applyRoute(route: Route): void {
  cum = cumulativeDistances(route.coords);
  hint = 0;
  offRouteFixes = 0;
  announced = new Set();
  useNav.setState({
    route,
    error: null,
    along: 0,
    offM: 0,
    nextIdx: route.maneuvers.length > 1 ? 1 : 0,
    toNextM: route.maneuvers[1]?.startM ?? route.distanceM,
    remainingM: route.distanceM,
    remainingS: route.durationS,
  });
}

function origin(): { lat: number; lng: number } | null {
  const { lat, lng } = useGeo.getState();
  return lat === null || lng === null ? null : { lat, lng };
}

/** Compute a route to `place` and show it for confirmation. */
export async function previewRoute(place: Place): Promise<void> {
  stopGuidanceLoop();
  inflight?.abort();
  const ctl = (inflight = new AbortController());
  useNav.setState({ ...IDLE, phase: 'routing', destination: place });
  save(null);
  addRecent(place);
  const from = origin();
  if (!from) {
    useNav.setState({
      phase: 'preview',
      error: 'Waiting for a GPS fix. Allow location access and try again.',
    });
    useGeo.getState().start();
    return;
  }
  try {
    const route = await fetchRoute(from, place, routeOptions(), ctl.signal);
    if (ctl.signal.aborted) return;
    applyRoute(route);
    useNav.setState({ phase: 'preview' });
  } catch (e) {
    if (ctl.signal.aborted) return;
    log.warn('nav', 'route failed', e);
    useNav.setState({ phase: 'preview', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Re-run the current request, e.g. after the user toggles "avoid tolls". */
export function refreshRoute(): void {
  const { destination, phase } = useNav.getState();
  if (!destination) return;
  if (phase === 'guiding') void reroute(true);
  else void previewRoute(destination);
}

export function setAvoid(patch: Partial<Pick<RouteOptions, 'avoidTolls' | 'avoidHighways'>>): void {
  useSettings.getState().patch(patch);
  refreshRoute();
}

export function startGuidance(): void {
  const { route, destination } = useNav.getState();
  if (!route || !destination) return;
  useNav.setState({ phase: 'guiding', arrived: false });
  save(destination);
  stopGuidanceLoop();
  let lastTs: number | null = null;
  unsubscribeGeo = useGeo.subscribe((s) => {
    if (s.ts === lastTs) return;
    lastTs = s.ts;
    onFix();
  });
  const first = route.maneuvers[0];
  if (first) speak(first.text);
  onFix();
}

function stopGuidanceLoop(): void {
  unsubscribeGeo?.();
  unsubscribeGeo = null;
}

export function stopNavigation(): void {
  inflight?.abort();
  inflight = null;
  stopGuidanceLoop();
  save(null);
  try {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  cum = [];
  useNav.setState({ ...IDLE });
}

async function reroute(force = false): Promise<void> {
  const { destination, rerouting } = useNav.getState();
  const from = origin();
  if (!destination || !from || rerouting) return;
  const now = Date.now();
  if (!force && now - lastRerouteAt < REROUTE_MIN_GAP_MS) return;
  lastRerouteAt = now;
  inflight?.abort();
  const ctl = (inflight = new AbortController());
  useNav.setState({ rerouting: true });
  try {
    const route = await fetchRoute(from, destination, routeOptions(), ctl.signal);
    if (ctl.signal.aborted || useNav.getState().phase !== 'guiding') return;
    applyRoute(route);
    useNav.setState({ rerouting: false });
    speak('Route updated.');
  } catch (e) {
    if (ctl.signal.aborted) return;
    // Offline in a tunnel: keep the old line and try again on a later fix.
    log.warn('nav', 'reroute failed', e);
    useNav.setState({ rerouting: false });
  }
}

function onFix(): void {
  const state = useNav.getState();
  const route = state.route;
  const geo = useGeo.getState();
  if (state.phase !== 'guiding' || !route || geo.lat === null || geo.lng === null || state.arrived) return;

  const snap = snapToRoute(route.coords, cum, { lat: geo.lat, lng: geo.lng }, hint);
  hint = snap.segment;
  const nextIdx = nextManeuverIndex(route.maneuvers, snap.along);
  const next = route.maneuvers[nextIdx];
  // The drawn line is the ground truth for "how far to the end"; the service's total can differ by a few metres.
  const remainingM = Math.max(0, (cum.at(-1) ?? route.distanceM) - snap.along);
  const toNextM = Math.max(0, (next?.startM ?? route.distanceM) - snap.along);
  const remainingS = remainingSeconds(route.maneuvers, route.durationS, snap.along);

  const arrived = remainingM < ARRIVE_M;
  useNav.setState({ along: snap.along, offM: snap.offM, nextIdx, toNextM, remainingM, remainingS, arrived });
  if (arrived) {
    speak('You have arrived.');
    save(null);
    return;
  }

  if (next && toNextM <= ANNOUNCE_M && !announced.has(nextIdx)) {
    announced.add(nextIdx);
    speak(next.spoken);
  }

  // A poor fix (tunnel, urban canyon) says nothing about being on or off the road: neither count nor reset.
  const accuracy = geo.accuracy ?? 0;
  if (accuracy >= 100) return;
  if (snap.offM > Math.max(60, accuracy * 2)) {
    offRouteFixes++;
    if (offRouteFixes >= 3) void reroute();
  } else {
    offRouteFixes = 0;
  }
}

/**
 * Open the Maps screen and show the route for `place`. This is what the "DriveDeck" navigation choice does.
 */
export function navigateInApp(place: Place): void {
  void previewRoute(place);
  if (currentScreen().screen !== 'maps') useRouter.getState().open('maps');
}

/**
 * After iOS killed the web app (for example while the user was in another app) pick the trip back up:
 * wait for a position, fetch a fresh route and continue guiding. Returns true when a trip is being resumed.
 */
export function resumeNavigation(): boolean {
  const saved = readSaved();
  if (!saved) return false;
  useNav.setState({ ...IDLE, phase: 'routing', destination: saved });
  const go = async () => {
    const from = origin();
    if (!from) return;
    unsub();
    const ctl = (inflight = new AbortController());
    try {
      const route = await fetchRoute(from, saved, routeOptions(), ctl.signal);
      if (ctl.signal.aborted) return;
      applyRoute(route);
      startGuidance();
    } catch (e) {
      if (ctl.signal.aborted) return;
      log.warn('nav', 'resume failed', e);
      useNav.setState({ phase: 'preview', error: e instanceof Error ? e.message : String(e) });
    }
  };
  const unsub = useGeo.subscribe(() => void go());
  void go();
  return true;
}
