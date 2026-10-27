import { describe, expect, it } from 'vitest';
import { MotionTracker } from './motion';
import { createDrive, observeFix, observeMotion, stepDrive, type DriveParams } from './model';
import { ENGINES } from './profiles';

type Vec = [number, number, number];

/** Rotation matrix for `deg` degrees about `axis` (Rodrigues). */
function rotation(axis: Vec, deg: number): number[][] {
  const l = Math.hypot(...axis);
  const [x, y, z] = axis.map((v) => v / l) as Vec;
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  const k = 1 - c;
  return [
    [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
    [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
    [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
  ];
}
/** World -> phone: multiply by the transpose. */
const toPhone = (r: number[][], v: Vec): Vec => [
  r[0]![0]! * v[0] + r[1]![0]! * v[1] + r[2]![0]! * v[2],
  r[0]![1]! * v[0] + r[1]![1]! * v[1] + r[2]![1]! * v[2],
  r[0]![2]! * v[0] + r[1]![2]! * v[1] + r[2]![2]! * v[2],
];

/** Deterministic noise in -1..1. */
function noise(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return (a / 4294967296) * 2 - 1;
  };
}

/** Standing 3 s, then firm pull / coast / brake cycles. Forward acceleration in m/s^2 at time t. */
const script = (t: number): number => {
  if (t < 3) return 0;
  const phase = (t - 3) % 7;
  if (phase < 3) return 3;
  if (phase < 4) return 0;
  if (phase < 6) return -3;
  return 0;
};

interface Rig {
  tracker: MotionTracker;
  /** Advance to time `t` (seconds) in steps of 1/60 s; returns the last output. */
  run(
    from: number,
    to: number,
    orientation: number[][],
    onSample?: (t: number, out: number | null) => void,
  ): void;
  speed: number;
}

function rig(seed = 1, bias: Vec = [0, 0, 0], vibration = 0.35): Rig {
  const tracker = new MotionTracker();
  const rnd = noise(seed);
  const state = { speed: 0, nextFix: 0 };
  const rigObj: Rig = {
    tracker,
    get speed() {
      return state.speed;
    },
    run(from, to, orientation, onSample) {
      const dt = 1 / 60;
      for (let t = from; t < to; t += dt) {
        const a = script(t);
        state.speed = Math.max(0, state.speed + a * dt);
        if (state.speed === 0 && a < 0) state.speed = 0;
        const worldLinear: Vec = [
          a + bias[0] + vibration * rnd(),
          bias[1] + vibration * rnd(),
          vibration * rnd(),
        ];
        const lin = toPhone(orientation, worldLinear);
        const grav = toPhone(orientation, [worldLinear[0], worldLinear[1], worldLinear[2] + 9.81]);
        if (t >= state.nextFix) {
          tracker.onFix(state.speed, t);
          state.nextFix += 1;
        }
        const out = tracker.feed({ linear: lin, gravity: grav }, t);
        onSample?.(t, out);
      }
    },
  };
  return rigObj;
}

const ORIENTATION = rotation([1, 2, 3], 70);

describe('motion tracker', () => {
  it('stays silent until it has seen the car accelerate and brake', () => {
    const r = rig();
    const outs: (number | null)[] = [];
    r.run(0, 3, ORIENTATION, (_t, o) => outs.push(o));
    expect(r.tracker.calibrated).toBe(false);
    expect(outs.every((o) => o === null)).toBe(true);
  });

  it('learns the forward axis of a phone mounted at an arbitrary angle, with the right sign', () => {
    const r = rig();
    const rows: { t: number; out: number; truth: number }[] = [];
    r.run(0, 40, ORIENTATION, (t, out) => {
      if (out !== null && t > 20) rows.push({ t, out, truth: script(t) });
    });
    expect(r.tracker.calibrated).toBe(true);
    expect(rows.length).toBeGreaterThan(600);
    // follows the real acceleration closely (the 0.1 s smoothing lags a little at the edges)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const accelerating = rows
      .filter((x) => x.truth === 3 && x.t % 7 > 3.6 && x.t % 7 < 5.4)
      .map((x) => x.out);
    const braking = rows.filter((x) => x.truth === -3).map((x) => x.out);
    expect(mean(accelerating)).toBeGreaterThan(2.4);
    expect(mean(braking)).toBeLessThan(-2.4);
    const err = rows.map((x) => Math.abs(x.out - x.truth));
    expect(mean(err)).toBeLessThan(0.7);
  });

  it('gets the sign right however the phone is turned', () => {
    for (const [axis, deg] of [
      [[0, 0, 1], 180],
      [[1, 0, 0], 90],
      [[0, 1, 0], -110],
    ] as [Vec, number][]) {
      const r = rig(7);
      let late = 0;
      let n = 0;
      r.run(0, 40, rotation(axis, deg), (t, out) => {
        if (out !== null && t > 25 && script(t) === 3 && t % 7 > 3.6 && t % 7 < 5.4) {
          late += out;
          n++;
        }
      });
      expect(r.tracker.calibrated).toBe(true);
      expect(late / n).toBeGreaterThan(2);
    }
  });

  it('ignores a constant sensor offset once it has been seen standing still', () => {
    const r = rig(3, [0.25, -0.15, 0]);
    const coasting: number[] = [];
    r.run(0, 40, ORIENTATION, (t, out) => {
      // between the pull and the braking the car just rolls: true acceleration is zero
      if (out !== null && t > 25 && script(t) === 0 && (t - 3) % 7 > 3.6 && (t - 3) % 7 < 3.9)
        coasting.push(out);
    });
    expect(r.tracker.calibrated).toBe(true);
    expect(coasting.length).toBeGreaterThan(5);
    expect(Math.abs(coasting.reduce((a, b) => a + b, 0) / coasting.length)).toBeLessThan(0.45);
  });
  it('forgets the learned direction when the phone is turned in its mount, then learns again', () => {
    const r = rig(5);
    r.run(0, 40, ORIENTATION);
    expect(r.tracker.calibrated).toBe(true);
    const moved = rotation([0, 1, 1], 110);
    let firstAfter: number | null | undefined;
    r.run(40, 40.05, moved, (_t, o) => (firstAfter ??= o));
    expect(firstAfter).toBeNull();
    expect(r.tracker.calibrated).toBe(false);
    r.run(40.05, 90, moved);
    expect(r.tracker.calibrated).toBe(true);
  });
});

describe('drive model with the accelerometer', () => {
  const params: DriveParams = { profile: ENGINES.v8, sensitivity: 5, gearbox: true };
  const ONSET = 2.3;
  const A = 4;
  const trueSpeed = (t: number) => (t < ONSET ? 0 : A * (t - ONSET));

  /** Run the model; with `motion` the accelerometer reports the true acceleration with a tiny delay. */
  function run(motion: boolean) {
    const s = createDrive(params.profile);
    let nextFix = 0;
    let popAt: number | null = null;
    let speedBeforeFix = 0;
    for (let t = 0; t <= 6; t += 0.016) {
      if (t >= nextFix) {
        observeFix(s, trueSpeed(t) * 3.6, t);
        nextFix += 1;
      }
      if (motion) observeMotion(s, t < ONSET + 0.05 ? 0 : A, t);
      const e = stepDrive(s, t, 0.016, params);
      if (e.pop === 'accel' && popAt === null) popAt = t;
      if (t >= 2.9 && t < 2.92) speedBeforeFix = s.speed * 3.6;
    }
    return { popAt, speedBeforeFix };
  }

  it('reacts to a sudden pull within a fraction of a second instead of waiting for GPS', () => {
    const gps = run(false);
    const fast = run(true);
    expect(fast.popAt).not.toBeNull();
    expect(fast.popAt! - ONSET).toBeLessThan(0.4);
    expect(gps.popAt === null || gps.popAt - ONSET > 0.9).toBe(true);
  });

  it('knows the speed between fixes, which GPS alone does not', () => {
    const truth = trueSpeed(2.9) * 3.6;
    expect(Math.abs(run(true).speedBeforeFix - truth)).toBeLessThan(3);
    expect(Math.abs(run(false).speedBeforeFix - truth)).toBeGreaterThan(5);
  });

  it('falls back to GPS the moment the accelerometer goes quiet', () => {
    const s = createDrive(params.profile);
    observeFix(s, 50, 0);
    observeMotion(s, 6, 0);
    for (let t = 0; t < 2; t += 0.04) stepDrive(s, t, 0.04, params);
    // no more motion samples after t=0: the stale value must not keep accelerating the car forever
    expect(s.speed * 3.6).toBeLessThan(80);
  });

  it('does not invent speed from sensor noise while standing still', () => {
    const s = createDrive(params.profile);
    observeFix(s, 0, 0);
    let t = 0;
    for (; t < 10; t += 0.016) {
      if (Math.abs(t - Math.round(t)) < 0.016) observeFix(s, 0, t);
      observeMotion(s, 0.3 * Math.sin(t * 40), t);
      stepDrive(s, t, 0.016, params);
    }
    expect(s.speed * 3.6).toBeLessThan(1);
  });
});
