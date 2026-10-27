import { create } from 'zustand';
import { log } from '../../core/logger';
import { getSettings, useSettings, type Settings } from '../../core/settings';
import { restartGeo, useGeo } from '../maps/geolocation';
import { SportAudio, type SportAudioConfig } from './audio';
import { MotionTracker } from './motion';
import {
  DEMO_SECONDS,
  createDrive,
  demoSpeedKmh,
  observeFix,
  observeMotion,
  stepDrive,
  toFrame,
  type DriveEvents,
  type DriveParams,
  type DriveState,
} from './model';
import { ENGINES } from './profiles';

/**
 * Runs sport mode: owns the AudioContext, feeds the drive model with GPS speed and turns its events into sound.
 *
 * Audio rules (the app also controls Spotify): everything is Web Audio, never an <audio> element, and the Media
 * Session is never touched, so iOS does not make DriveDeck the "Now Playing" app and the steering-wheel keys
 * stay with Spotify. The audio session is asked to be "ambient" so the sounds mix with Spotify instead of
 * interrupting it, and the context is suspended whenever there is nothing to play (no silent keep-alive audio).
 */

export interface SportState {
  /** An audio engine exists (sport mode on, or a test sound is playing). */
  active: boolean;
  /** The browser has not allowed sound yet: one tap anywhere unlocks it. */
  locked: boolean;
  /** Test sound is playing. */
  demo: boolean;
  supported: boolean;
  /** Accelerometer input: off (GPS only), waiting for permission / a tap, learning the mount, ready, or unusable. */
  motion: MotionStatus;
  rpm: number;
  gear: number;
  throttle: number;
  boost: number;
  speedKmh: number;
}

export type MotionStatus = 'off' | 'asking' | 'denied' | 'unsupported' | 'calibrating' | 'ready';

const IDLE_STATE: SportState = {
  active: false,
  locked: false,
  demo: false,
  supported: true,
  motion: 'off',
  rpm: 0,
  gear: 1,
  throttle: 0,
  boost: 0,
  speedKmh: 0,
};

export const useSport = create<SportState>(() => ({ ...IDLE_STATE }));

const TICK_MS = 40;

type AudioSessionLike = { type: string };
const audioSession = (): AudioSessionLike | null =>
  (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession ?? null;

let ctx: AudioContext | null = null;
let audio: SportAudio | null = null;
let drive: DriveState | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubGeo: (() => void) | null = null;
let lastTick = 0;
let lastGeoTs: number | null = null;
let lastPublish = 0;
let silentFor = 0;
let demoStartedAt: number | null = null;
let demoLastFix = 0;
let lastRestart = 0;
/** We paused the context ourselves (nothing to play); that is not the same as iOS blocking sound. */
let suspendedByUs = false;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => clamp(v, 0, 100) / 100;
const nowS = () => performance.now() / 1000;

export function configFromSettings(s: Settings): SportAudioConfig {
  return {
    engineOn: s.sportEngineOn,
    engine: ENGINES[s.sportEngine],
    turboOn: s.sportTurboOn,
    turbo: s.sportTurbo,
    exhaustOn: s.sportExhaustOn,
    exhaust: s.sportExhaust,
    volume: pct(s.sportVolume),
    engineVolume: pct(s.sportEngineVolume),
    turboVolume: pct(s.sportTurboVolume),
    exhaustVolume: pct(s.sportExhaustVolume),
  };
}

export function paramsFromSettings(s: Settings): DriveParams {
  return {
    profile: ENGINES[s.sportEngine],
    sensitivity: clamp(s.sportSensitivity, 1, 10),
    gearbox: s.sportGearbox,
  };
}

/** Which of the model's pop events the user wants to hear. */
export function popWanted(trigger: Settings['sportPopTrigger'], kind: 'accel' | 'lift' | 'shift'): boolean {
  if (kind === 'shift') return true;
  return trigger === 'both' || (trigger === 'acceleration' ? kind === 'accel' : kind === 'lift');
}

function createContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const session = audioSession();
    if (session) session.type = 'ambient';
    return new Ctor({ latencyHint: 'interactive' });
  } catch (e) {
    log.warn('sport', 'AudioContext failed', e);
    return null;
  }
}

function resume(): void {
  if (!ctx || ctx.state === 'running') return;
  void ctx
    .resume()
    .then(() => useSport.setState({ locked: ctx?.state !== 'running' }))
    .catch(() => undefined);
}

/* ------------------------------------------------------------ accelerometer */

type MotionEventCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

let tracker: MotionTracker | null = null;
let motionStatus: MotionStatus = 'off';
let motionAttached = false;
let motionWatchdog: ReturnType<typeof setTimeout> | null = null;

function setMotion(status: MotionStatus): void {
  motionStatus = status;
  useSport.setState({ motion: status });
}

function onMotion(e: DeviceMotionEvent): void {
  const g = e.accelerationIncludingGravity;
  if (!tracker || !g || g.x == null || g.y == null || g.z == null) return;
  if (motionWatchdog) {
    clearTimeout(motionWatchdog);
    motionWatchdog = null;
  }
  const a = e.acceleration;
  const linear =
    a && a.x != null && a.y != null && a.z != null ? ([a.x, a.y, a.z] as [number, number, number]) : null;
  const t = nowS();
  const forward = tracker.feed({ linear, gravity: [g.x, g.y, g.z] }, t);
  if (forward !== null && drive && demoStartedAt === null) observeMotion(drive, forward, t);
}

function attachMotion(): void {
  if (motionAttached) return;
  tracker = new MotionTracker();
  window.addEventListener('devicemotion', onMotion);
  motionAttached = true;
  setMotion('calibrating');
  // Desktop browsers and some in-app views expose the API but never send data.
  motionWatchdog = setTimeout(() => {
    if (motionAttached) {
      detachMotion();
      setMotion('unsupported');
    }
  }, 3000);
}

function detachMotion(): void {
  window.removeEventListener('devicemotion', onMotion);
  if (motionWatchdog) clearTimeout(motionWatchdog);
  motionWatchdog = null;
  motionAttached = false;
  tracker = null;
}

/**
 * Start listening to the accelerometer when "Accelerometer + GPS" is chosen. On iOS the permission prompt only
 * appears from a user gesture, so this must be called synchronously from a tap handler (the settings change or the
 * sport toggle); after a restart the first tap retries it.
 */
function startMotion(): void {
  if (motionAttached || getSettings().sportInput !== 'motion') return;
  const Ev = (window as unknown as { DeviceMotionEvent?: MotionEventCtor }).DeviceMotionEvent;
  if (!Ev) return setMotion('unsupported');
  if (typeof Ev.requestPermission !== 'function') return attachMotion();
  setMotion('asking');
  Ev.requestPermission()
    .then((r) => (r === 'granted' ? attachMotion() : setMotion('denied')))
    // not from a gesture (app just launched): wait for the first tap
    .catch(() => setMotion('asking'));
}

function stopMotion(): void {
  detachMotion();
  setMotion('off');
}

/** iOS only lets audio start from a tap; the first touch anywhere after launch unlocks it. */
function installUnlock(): void {
  const unlock = () => {
    resume();
    if (ctx && motionStatus === 'asking') startMotion();
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const)
    document.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && resume());
}

function handleEvents(e: DriveEvents, s: Settings): void {
  if (!audio || !ctx) return;
  const at = ctx.currentTime;
  if (e.blowOff > 0) audio.blowOff(e.blowOff, at);
  if (e.pop && popWanted(s.sportPopTrigger, e.pop)) audio.pops(e.pop, e.popIntensity, at);
}

function tick(): void {
  if (!ctx || !audio || !drive) return;
  const now = nowS();
  const dt = clamp(now - lastTick, 0.001, 0.1);
  lastTick = now;
  const s = getSettings();

  if (demoStartedAt !== null) {
    const t = now - demoStartedAt;
    if (now - demoLastFix >= 0.5) {
      demoLastFix = now;
      observeFix(drive, demoSpeedKmh(t), now);
    }
    if (t > DEMO_SECONDS) return void endDemo();
  }

  const events = stepDrive(drive, now, dt, paramsFromSettings(s));
  const frame = toFrame(drive);
  const stopped = frame.speedKmh < 1;
  const audible = !stopped || s.sportIdle || demoStartedAt !== null;
  if (ctx.state === 'running') {
    audio.update({ ...frame, audible }, ctx.currentTime);
    handleEvents(events, s);
  }

  // Nothing to play (stopped, idle sound off): suspend instead of running silent audio.
  if (!audible && ctx.state === 'running') {
    silentFor += dt;
    if (silentFor > 2) {
      suspendedByUs = true;
      void ctx.suspend();
    }
  } else {
    silentFor = 0;
    if (audible && suspendedByUs) {
      suspendedByUs = false;
      resume();
    }
  }

  // The GPS watcher can go quiet on iOS; kick it if no fix has arrived for a while.
  const geo = useGeo.getState();
  if (
    !demoStartedAt &&
    geo.status === 'watching' &&
    geo.ts &&
    Date.now() - geo.ts > 6000 &&
    now - lastRestart > 15
  ) {
    lastRestart = now;
    restartGeo();
  }

  if (motionStatus === 'calibrating' && tracker?.calibrated) setMotion('ready');
  else if (motionStatus === 'ready' && !tracker?.calibrated) setMotion('calibrating');

  if (now - lastPublish > 0.1) {
    lastPublish = now;
    useSport.setState({
      rpm: drive.rpm,
      gear: drive.gear,
      throttle: drive.throttle,
      boost: drive.boost,
      speedKmh: frame.speedKmh,
      locked: ctx.state !== 'running' && !suspendedByUs,
    });
  }
}

function start(): boolean {
  if (ctx) return true;
  const c = createContext();
  if (!c) {
    useSport.setState({ supported: false });
    return false;
  }
  ctx = c;
  const s = getSettings();
  startMotion();
  audio = new SportAudio(c);
  audio.configure(configFromSettings(s), c.currentTime);
  drive = createDrive(ENGINES[s.sportEngine]);
  const geo = useGeo.getState();
  if (geo.status === 'watching') observeFix(drive, geo.speedKmh, nowS());
  lastGeoTs = geo.ts;
  unsubGeo = useGeo.subscribe((g) => {
    if (!drive || g.ts === lastGeoTs || demoStartedAt !== null) return;
    lastGeoTs = g.ts;
    const t = nowS();
    const kmh = g.status === 'watching' ? g.speedKmh : 0;
    // the tracker learns the mount from GPS speed changes; the model corrects its integrated speed with them
    tracker?.onFix(kmh / 3.6, t);
    observeFix(drive, kmh, t);
  });
  lastTick = nowS();
  timer = setInterval(tick, TICK_MS);
  useSport.setState({ active: true, locked: c.state !== 'running', supported: true });
  resume();
  // The freshest, most accurate fixes while the sound follows the car.
  restartGeo();
  return true;
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  unsubGeo?.();
  unsubGeo = null;
  stopMotion();
  audio?.dispose();
  audio = null;
  drive = null;
  demoStartedAt = null;
  const c = ctx;
  ctx = null;
  suspendedByUs = false;
  if (c) void c.close().catch(() => undefined);
  const session = audioSession();
  if (session) session.type = 'auto';
  useSport.setState({ ...IDLE_STATE });
  restartGeo();
}

function endDemo(): void {
  demoStartedAt = null;
  useSport.setState({ demo: false });
  if (!getSettings().sportMode) stop();
  else if (drive) {
    // go back to following the car
    const g = useGeo.getState();
    observeFix(drive, g.status === 'watching' ? g.speedKmh : 0, nowS());
  }
}

/** "Test sound": a scripted drive (pull away, lift, brake, second pull) so the settings can be auditioned parked. */
export function playDemo(): void {
  if (demoStartedAt !== null) return endDemo();
  if (!start() || !drive) return;
  resume();
  drive = createDrive(ENGINES[getSettings().sportEngine]);
  demoStartedAt = nowS();
  demoLastFix = 0;
  useSport.setState({ demo: true });
}

let initialised = false;

/** Called once at startup: follows the settings and unlocks audio on the first tap. */
export function initSport(): void {
  if (initialised) return;
  initialised = true;
  installUnlock();
  const apply = () => {
    const s = getSettings();
    if (s.sportMode) start();
    else if (ctx && demoStartedAt === null) stop();
  };
  useSettings.subscribe((s, prev) => {
    if (s.sportMode !== prev.sportMode) return apply();
    if (!audio || !ctx) return;
    const changed = (Object.keys(s) as (keyof Settings)[]).some(
      (k) => k.startsWith('sport') && s[k] !== prev[k],
    );
    if (!changed) return;
    audio.configure(configFromSettings(s), ctx.currentTime);
    if (s.sportEngine !== prev.sportEngine && drive) {
      // different gearing and redline: restart the model from the current speed
      const keep = drive.speed * 3.6;
      drive = createDrive(ENGINES[s.sportEngine]);
      observeFix(drive, keep, nowS());
    }
    if (s.sportPreciseGps !== prev.sportPreciseGps) restartGeo();
    if (s.sportInput !== prev.sportInput) {
      // runs inside the tap that changed the setting, which is what lets iOS show its permission prompt
      stopMotion();
      startMotion();
    }
  });
  apply();
}

/** Test hook. */
export function stopSportForTests(): void {
  stop();
  initialised = false;
}
