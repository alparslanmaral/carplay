import { create } from 'zustand';
import { useGeo } from '../services/maps/geolocation';
import { getSettings } from './settings';

/** How long speed must stay under the threshold before the lock releases (avoids flicker at junctions). */
export const RELEASE_DELAY_MS = 4000;
/** GPS older than this does not release the lock (tunnel safety: unknown means still driving). */
export const STALE_MS = 15000;

export interface MovingInput {
  wasMoving: boolean;
  belowSince: number | null;
  speedKmh: number;
  threshold: number;
  now: number;
}

/** Pure hysteresis: lock instantly above the threshold, release after RELEASE_DELAY_MS below it. */
export function evaluateMoving(i: MovingInput): { moving: boolean; belowSince: number | null } {
  if (i.speedKmh > i.threshold) return { moving: true, belowSince: null };
  if (!i.wasMoving) return { moving: false, belowSince: null };
  const since = i.belowSince ?? i.now;
  return i.now - since >= RELEASE_DELAY_MS
    ? { moving: false, belowSince: null }
    : { moving: true, belowSince: since };
}

interface DrivingState {
  moving: boolean;
  /** Passenger confirmed they are not driving. Session only, never persisted. */
  passenger: boolean;
  promptOpen: boolean;
  setPassenger: (value: boolean) => void;
  openPrompt: () => void;
  closePrompt: () => void;
  _setMoving: (value: boolean) => void;
}

export const useDriving = create<DrivingState>((set) => ({
  moving: false,
  passenger: false,
  promptOpen: false,
  setPassenger: (passenger) => set({ passenger, promptOpen: false }),
  openPrompt: () => set({ promptOpen: true }),
  closePrompt: () => set({ promptOpen: false }),
  _setMoving: (moving) => set({ moving }),
}));

/** Text input is blocked while moving unless the passenger override is active. */
export function isInputLocked(): boolean {
  const s = getSettings();
  const d = useDriving.getState();
  return s.lockInput && d.moving && !(s.passengerOverride && d.passenger);
}

/** True while the vehicle is moving and nobody has confirmed they are a passenger. */
export function isDriverLocked(): boolean {
  const s = getSettings();
  const d = useDriving.getState();
  return d.moving && !(s.passengerOverride && d.passenger);
}

let belowSince: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const geo = useGeo.getState();
  const { lockSpeed } = getSettings();
  const now = Date.now();
  const stale = geo.ts !== null && now - geo.ts > STALE_MS;
  const current = useDriving.getState().moving;
  // Stale or missing fixes never release a lock that is already on.
  const speed = stale && current ? Number.POSITIVE_INFINITY : geo.speedKmh;
  const r = evaluateMoving({ wasMoving: current, belowSince, speedKmh: speed, threshold: lockSpeed, now });
  belowSince = r.belowSince;
  if (r.moving !== current) useDriving.getState()._setMoving(r.moving);
}

export function startDrivingMonitor(): () => void {
  if (timer) return () => undefined;
  const unsub = useGeo.subscribe(tick);
  timer = setInterval(tick, 1000);
  return () => {
    unsub();
    if (timer) clearInterval(timer);
    timer = null;
  };
}

export function resetDrivingForTests(): void {
  belowSince = null;
  useDriving.setState({ moving: false, passenger: false, promptOpen: false });
}
