import type { EngineProfile } from './profiles';

/**
 * A pretend drivetrain driven by the real speed. The phone only knows speed (about once a second), so everything
 * else is inferred: acceleration from successive fixes, throttle from acceleration, gear and rpm from speed and
 * throttle, turbo boost from throttle and rpm. Pure functions: easy to test, no audio in here.
 */

export interface DriveParams {
  profile: EngineProfile;
  /** 1..10 */
  sensitivity: number;
  gearbox: boolean;
}

export interface DriveState {
  hasFix: boolean;
  /** Speed of the last GPS fix (m/s) and when it arrived (seconds, any monotonic clock). */
  fixSpeed: number;
  fixAt: number;
  /** Smoothed longitudinal acceleration, m/s^2. */
  accel: number;
  /** Speed estimate between fixes, m/s. */
  speed: number;
  throttle: number;
  /** Recent throttle peak; a lift-off is the throttle closing after a high peak. */
  peak: number;
  rpm: number;
  gear: number;
  boost: number;
  /** Seconds left of the power cut during a gear change. */
  shiftCut: number;
  shiftCooldown: number;
  popCooldown: number;
  hardActive: boolean;
}

export type PopKind = 'accel' | 'lift' | 'shift';

export interface DriveEvents {
  /** Blow-off intensity 0..1 (0 = none). */
  blowOff: number;
  pop: PopKind | null;
  popIntensity: number;
  shift: 'up' | 'down' | null;
}

export function createDrive(profile: EngineProfile): DriveState {
  return {
    hasFix: false,
    fixSpeed: 0,
    fixAt: 0,
    accel: 0,
    speed: 0,
    throttle: 0,
    peak: 0,
    rpm: profile.idleRpm,
    gear: 1,
    boost: 0,
    shiftCut: 0,
    shiftCooldown: 0,
    popCooldown: 0,
    hardActive: false,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sens01 = (sensitivity: number) => clamp((sensitivity - 1) / 9, 0, 1);

/** Acceleration (m/s^2) that counts as "hard", the trigger for pops. */
export const hardAccel = (sensitivity: number) => lerp(4.8, 1.8, sens01(sensitivity));
/** Acceleration that opens the throttle fully. */
const fullThrottleAccel = (sensitivity: number) => lerp(6, 2.2, sens01(sensitivity));

/** A new GPS speed reading arrived. */
export function observeFix(s: DriveState, speedKmh: number, now: number): void {
  const v = Math.max(0, speedKmh) / 3.6;
  if (s.hasFix) {
    const dt = now - s.fixAt;
    if (dt > 0.25 && dt < 3) {
      const raw = clamp((v - s.fixSpeed) / dt, -9, 9);
      s.accel = 0.45 * s.accel + 0.55 * raw;
    } else if (dt >= 3) {
      s.accel = 0;
    }
  } else {
    s.speed = v;
  }
  s.fixSpeed = v;
  s.fixAt = now;
  s.hasFix = true;
}

function rpmFromSpeed(speedKmh: number, gear: number, p: EngineProfile): number {
  return (speedKmh / p.gears[gear - 1]!) * 1000;
}

/** Advance the model by `dt` seconds. `now` is the same clock as observeFix. */
export function stepDrive(s: DriveState, now: number, dt: number, params: DriveParams): DriveEvents {
  const { profile: p, sensitivity } = params;
  const events: DriveEvents = { blowOff: 0, pop: null, popIntensity: 0, shift: null };

  // ---- speed between fixes: extrapolate along the acceleration, but only for a moment
  const age = now - s.fixAt;
  if (!s.hasFix) {
    s.speed = 0;
  } else {
    if (age > 1.2) s.accel *= Math.exp(-dt / 1.5);
    let target = Math.max(0, s.fixSpeed + s.accel * clamp(age, 0, 1.5));
    // A GPS that has gone quiet (tunnel, lost fix) lets the car coast to a stop instead of revving forever.
    if (age > 8) target *= Math.exp(-(age - 8) / 4);
    s.speed += (target - s.speed) * (1 - Math.exp(-dt / 0.12));
  }
  const kmh = s.speed * 3.6;

  // ---- throttle: lift when slowing, open in proportion to the acceleration
  const cruise = kmh > 2 ? 0.1 + Math.min(0.12, kmh * 0.0009) : 0;
  const wanted =
    s.accel < -0.7 ? 0 : clamp(cruise + (Math.max(0, s.accel) / fullThrottleAccel(sensitivity)) * 0.9, 0, 1);
  const rate = (wanted > s.throttle ? 7 : 5) * dt;
  s.throttle += clamp(wanted - s.throttle, -rate, rate);
  // The throttle moves in small steps, so a lift-off is detected against the recent peak, not the last frame.
  const peakBefore = Math.max(s.throttle, s.peak - 0.5 * dt);
  const lift = peakBefore > 0.55 && s.throttle < 0.25;
  s.peak = lift ? s.throttle : peakBefore;

  // ---- gearbox
  s.shiftCut = Math.max(0, s.shiftCut - dt);
  s.shiftCooldown = Math.max(0, s.shiftCooldown - dt);
  s.popCooldown = Math.max(0, s.popCooldown - dt);
  let speedRpm: number;
  if (params.gearbox) {
    if (kmh < 3) s.gear = 1;
    const up = p.redline * (0.55 + 0.35 * s.throttle);
    const downLow = Math.max(p.idleRpm * 1.5, p.redline * 0.2);
    speedRpm = rpmFromSpeed(kmh, s.gear, p);
    if (s.shiftCooldown <= 0) {
      if (s.gear < p.gears.length && speedRpm > up) {
        s.gear++;
        events.shift = 'up';
      } else if (s.gear > 1 && (speedRpm < downLow || (s.throttle > 0.85 && speedRpm < p.redline * 0.38))) {
        s.gear--;
        events.shift = 'down';
      }
      if (events.shift) {
        s.shiftCut = 0.2;
        s.shiftCooldown = 0.9;
        speedRpm = rpmFromSpeed(kmh, s.gear, p);
      }
    }
  } else {
    speedRpm = p.idleRpm + (p.redline - p.idleRpm) * clamp(kmh / 220, 0, 1) ** 0.55;
  }
  let rpmTarget = Math.max(p.idleRpm, speedRpm);
  // Pulling away: the clutch slips, so the engine revs ahead of the wheels.
  if (kmh < 22 && s.throttle > 0.05) {
    const slip = p.idleRpm + s.throttle * (p.redline * 0.45 - p.idleRpm) * (1 - kmh / 22);
    rpmTarget = Math.max(rpmTarget, slip);
  }
  rpmTarget = Math.min(rpmTarget, p.redline);
  const slewUp = (3500 + 6000 * s.throttle) * dt;
  const slewDown = 4500 * dt;
  s.rpm += clamp(rpmTarget - s.rpm, -slewDown, slewUp);

  // ---- turbo boost: builds with throttle and revs (lag), drops quickly when the throttle closes
  const rpmFactor = clamp((s.rpm - 1500) / (p.redline * 0.5), 0, 1);
  const boostTarget = s.throttle > 0.35 ? clamp((s.throttle - 0.3) / 0.7, 0, 1) * rpmFactor : 0;
  const tau = boostTarget > s.boost ? 0.7 : 0.25;
  s.boost += (boostTarget - s.boost) * (1 - Math.exp(-dt / tau));

  if (lift && s.boost > 0.3) events.blowOff = s.boost;
  if (events.shift === 'up' && s.boost > 0.45 && events.blowOff === 0) events.blowOff = s.boost * 0.6;

  // ---- exhaust pops
  const hard = hardAccel(sensitivity);
  if (s.accel > hard && !s.hardActive && kmh > 2 && s.popCooldown <= 0) {
    s.hardActive = true;
    s.popCooldown = 1.6;
    events.pop = 'accel';
    events.popIntensity = clamp(s.accel / (hard * 2), 0.3, 1);
  }
  if (s.accel < hard * 0.5) s.hardActive = false;
  if (lift && peakBefore > 0.6 && s.rpm > 2200 && kmh > 20 && s.popCooldown <= 0) {
    s.popCooldown = 1.6;
    events.pop = 'lift';
    events.popIntensity = clamp(peakBefore, 0.4, 1);
  }
  if (events.shift === 'up' && s.throttle > 0.7 && events.pop === null) {
    events.pop = 'shift';
    events.popIntensity = s.throttle;
  }
  return events;
}

/** What the audio layer reads each tick. */
export function toFrame(s: DriveState) {
  return {
    rpm: s.rpm,
    // The power cut during a gear change drops the load, which is what makes shifts audible.
    load: s.throttle * (s.shiftCut > 0 ? 0.2 : 1),
    boost: s.shiftCut > 0 ? s.boost * 0.5 : s.boost,
    speedKmh: s.speed * 3.6,
  };
}

/** A scripted drive used by "Test sound": launch, cruise, lift, brake, second pull, stop. Seconds -> km/h. */
export function demoSpeedKmh(t: number): number {
  if (t < 0.8) return 0;
  if (t < 6.3) {
    const x = (t - 0.8) / 5.5;
    return 125 * (1 - (1 - x) ** 1.6);
  }
  if (t < 7.5) return 125;
  if (t < 10) return 125 - 65 * ((t - 7.5) / 2.5);
  if (t < 12.5) return 60 + 50 * (1 - (1 - (t - 10) / 2.5) ** 1.5);
  if (t < 15.5) return Math.max(0, 110 * (1 - (t - 12.5) / 3));
  return 0;
}

export const DEMO_SECONDS = 16.5;
