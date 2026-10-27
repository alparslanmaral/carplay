/**
 * Turns raw phone accelerometer samples into the car's forward acceleration.
 *
 * The phone sits in a mount at an unknown angle, so the "forward" axis is learned: gravity says which way is
 * down, and every time GPS reports a clear speed change the horizontal acceleration felt during that second is
 * correlated with it. The accumulated direction is the car's forward axis (and its sign: braking and
 * accelerating pull opposite ways). Until that has been seen a few times there is no answer and the caller
 * keeps using GPS only. Pure code with no browser API, so it can be tested with synthetic samples.
 */

type Vec = [number, number, number];

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: Vec): Vec => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
};

export interface MotionSample {
  /** Acceleration without gravity (m/s^2) if the device reports it. */
  linear: Vec | null;
  /** Acceleration including gravity. */
  gravity: Vec;
}

/** A GPS speed change below this is too small to tell forward from sideways. */
const MIN_GPS_ACCEL = 0.6;
/** Direction is trusted once it has been seen this often and the evidence agrees. */
const MIN_EVIDENCE = 3;
const MIN_CONSISTENCY = 0.6;
/** Phone moved in its mount: forget the learned direction. */
const REMOUNT_COS = Math.cos((20 * Math.PI) / 180);
/** Seconds of smoothing on the output. */
const SMOOTH = 0.1;

export class MotionTracker {
  private g: Vec | null = null;
  private gCal: Vec | null = null;
  private fwd: Vec = [0, 0, 0];
  private fwdAbs = 0;
  private evidence = 0;
  private bias: Vec = [0, 0, 0];
  private sum: Vec = [0, 0, 0];
  private sumT = 0;
  private lastFix: { v: number; t: number } | null = null;
  private lastT: number | null = null;
  private out = 0;
  private prevDown: Vec | null = null;
  private unstableUntil = -Infinity;
  private biasN = 0;

  /** Has a forward direction been learned? */
  get calibrated(): boolean {
    return this.evidence >= MIN_EVIDENCE && this.consistency > MIN_CONSISTENCY;
  }

  private get consistency(): number {
    return this.fwdAbs > 0 ? len(this.fwd) / this.fwdAbs : 0;
  }

  reset(): void {
    this.fwd = [0, 0, 0];
    this.fwdAbs = 0;
    this.evidence = 0;
    this.bias = [0, 0, 0];
    this.biasN = 0;
    this.sum = [0, 0, 0];
    this.sumT = 0;
    this.gCal = null;
  }

  /** Feed one sensor sample; returns forward acceleration in m/s^2, or null while not calibrated. */
  feed(sample: MotionSample, t: number): number | null {
    const dt = this.lastT === null ? 0 : Math.min(0.25, Math.max(0, t - this.lastT));
    this.lastT = t;
    // iOS reports acceleration with and without gravity; the difference is gravity itself, free of braking and
    // acceleration. Without that, fall back to a slow low-pass of the gravity-including reading.
    if (sample.linear) this.g = sub(sample.gravity, sample.linear);
    else {
      const k = dt === 0 ? 1 : 1 - Math.exp(-dt / 1.5);
      this.g = this.g ? add(this.g, scale(sub(sample.gravity, this.g), k)) : sample.gravity;
    }
    const down = unit(this.g);
    if (len(down) === 0) return null;

    // The phone is being handled (not just driven): learn nothing until it has been still for a moment.
    if (
      this.prevDown &&
      dt > 0 &&
      Math.acos(Math.min(1, Math.max(-1, dot(down, this.prevDown)))) / dt > 0.35
    ) {
      this.unstableUntil = t + 1.5;
    }
    this.prevDown = down;

    if (this.gCal === null) this.gCal = down;
    else if (dot(down, this.gCal) < REMOUNT_COS) {
      this.reset();
      this.gCal = down;
    }

    const lin = sample.linear ?? sub(sample.gravity, this.g);
    const horizontal = sub(lin, scale(down, dot(lin, down)));
    if (dt > 0) {
      this.sum = add(this.sum, scale(horizontal, dt));
      this.sumT += dt;
    }
    if (!this.calibrated) return null;

    const along = dot(sub(horizontal, this.bias), unit(this.fwd));
    this.out += (along - this.out) * (dt === 0 ? 1 : 1 - Math.exp(-dt / SMOOTH));
    return this.out;
  }

  /** A GPS speed (m/s) arrived: learn from it. */
  onFix(speed: number, t: number): void {
    const prev = this.lastFix;
    this.lastFix = { v: speed, t };
    if (!prev || this.sumT < 0.3 || t < this.unstableUntil) return this.clearWindow();
    const dt = t - prev.t;
    if (dt < 0.3 || dt > 3) return this.clearWindow();
    const mean = scale(this.sum, 1 / this.sumT);
    const gpsA = (speed - prev.v) / dt;
    if (speed < 0.3 && prev.v < 0.3) {
      // standing still: whatever the sensor shows is bias
      this.biasN++;
      this.bias = add(this.bias, scale(sub(mean, this.bias), Math.max(0.25, 1 / this.biasN)));
    } else if (Math.abs(gpsA) > MIN_GPS_ACCEL) {
      const m = sub(mean, this.bias);
      // forget old evidence slowly so a re-mounted phone is re-learned
      this.fwd = add(scale(this.fwd, 0.97), scale(m, gpsA));
      this.fwdAbs = this.fwdAbs * 0.97 + len(m) * Math.abs(gpsA);
      this.evidence++;
    }
    this.clearWindow();
  }

  private clearWindow(): void {
    this.sum = [0, 0, 0];
    this.sumT = 0;
  }
}
