import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OPTIONS, useSettings, DEFAULT_SETTINGS } from '../../core/settings';
import { SECTIONS } from '../../core/settingsSchema';
import { resetGeoForTests, useGeo } from '../maps/geolocation';
import { SportAudio, DEFAULT_CONFIG } from './audio';
import {
  configFromSettings,
  initSport,
  paramsFromSettings,
  popWanted,
  stopSportForTests,
  useSport,
} from './controller';
import {
  DEMO_SECONDS,
  createDrive,
  demoSpeedKmh,
  hardAccel,
  observeFix,
  stepDrive,
  toFrame,
  type DriveEvents,
  type DriveParams,
} from './model';
import { ENGINES, ENGINE_LABELS, EXHAUST_LABELS, POP_TRIGGER_LABELS, TURBOS, TURBO_LABELS } from './profiles';

const DT = 0.04;

interface Sample {
  t: number;
  kmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  boost: number;
  events: DriveEvents;
}

/** Drive the model along a speed curve with one GPS fix per second, like the phone delivers. */
function simulate(
  speedAt: (t: number) => number,
  seconds: number,
  params: Partial<DriveParams> = {},
  engine = ENGINES.v8,
): Sample[] {
  const p: DriveParams = { profile: engine, sensitivity: 5, gearbox: true, ...params };
  const s = createDrive(engine);
  const out: Sample[] = [];
  let nextFix = 0;
  for (let t = 0; t <= seconds; t += DT) {
    if (t >= nextFix) {
      observeFix(s, speedAt(t), t);
      nextFix += 1;
    }
    const events = stepDrive(s, t, DT, p);
    out.push({
      t,
      kmh: s.speed * 3.6,
      rpm: s.rpm,
      gear: s.gear,
      throttle: s.throttle,
      boost: s.boost,
      events,
    });
  }
  return out;
}

/** 0 to 100 km/h at a constant `accel` m/s^2, then hold. */
const pull = (accel: number) => (t: number) => Math.min(100, accel * 3.6 * Math.max(0, t - 1));

describe('engine profiles', () => {
  it('has a complete profile, label and sensible numbers for every option', () => {
    for (const id of OPTIONS.sportEngine) {
      const p = ENGINES[id];
      expect(p.id).toBe(id);
      expect(ENGINE_LABELS[id].length).toBeGreaterThanOrEqual(2);
      expect(p.redline).toBeGreaterThan(p.idleRpm * 3);
      expect(p.gears).toHaveLength(6);
      expect([...p.gears].sort((a, b) => a - b)).toEqual(p.gears);
      expect(p.firesPerRev).toBeGreaterThanOrEqual(2);
    }
    for (const id of OPTIONS.sportTurbo) {
      expect(TURBOS[id].whistle[1]).toBeGreaterThan(TURBOS[id].whistle[0]);
      expect(TURBO_LABELS[id]).toBeTruthy();
    }
    for (const id of OPTIONS.sportExhaust) expect(EXHAUST_LABELS[id]).toBeTruthy();
    for (const id of OPTIONS.sportPopTrigger) expect(POP_TRIGGER_LABELS[id]).toBeTruthy();
  });

  it('offers the engines that were asked for, and more than ten', () => {
    expect(OPTIONS.sportEngine.length).toBeGreaterThanOrEqual(10);
    for (const id of ['inline4', 'v6', 'v8', 'v12', 'hellcat', 'growl', 'calm'] as const)
      expect(OPTIONS.sportEngine).toContain(id);
  });

  it('fires more often per revolution as cylinders are added', () => {
    expect(ENGINES.inline4.firesPerRev).toBeLessThan(ENGINES.v6.firesPerRev);
    expect(ENGINES.v6.firesPerRev).toBeLessThan(ENGINES.v8.firesPerRev);
    expect(ENGINES.v8.firesPerRev).toBeLessThan(ENGINES.v12.firesPerRev);
  });
});

describe('drive model', () => {
  it('idles when stopped and makes no noise events', () => {
    const run = simulate(() => 0, 5);
    const last = run.at(-1)!;
    expect(last.rpm).toBeCloseTo(ENGINES.v8.idleRpm, -1);
    expect(last.gear).toBe(1);
    expect(run.every((r) => r.events.pop === null && r.events.blowOff === 0)).toBe(true);
  });

  it('revs up through the gears on a hard pull and stays within idle..redline', () => {
    const run = simulate(pull(3.5), 14);
    const p = ENGINES.v8;
    for (const r of run) {
      expect(r.rpm).toBeGreaterThanOrEqual(p.idleRpm - 1);
      expect(r.rpm).toBeLessThanOrEqual(p.redline + 1);
    }
    const gears = run.map((r) => r.gear);
    expect(Math.max(...gears)).toBeGreaterThanOrEqual(3);
    // gears never skip upward by more than one at a time
    for (let i = 1; i < gears.length; i++) expect(Math.abs(gears[i]! - gears[i - 1]!)).toBeLessThanOrEqual(1);
    const peakThrottle = Math.max(...run.map((r) => r.throttle));
    expect(peakThrottle).toBeGreaterThan(0.6);
    expect(Math.max(...run.map((r) => r.kmh))).toBeGreaterThan(90);
  });

  it('shifts audibly: power is cut during a gear change', () => {
    const run = simulate(pull(3.5), 14);
    const shifts = run.filter((r) => r.events.shift === 'up');
    expect(shifts.length).toBeGreaterThanOrEqual(2);
    const s = createDrive(ENGINES.v8);
    s.hasFix = true;
    expect(toFrame({ ...s, shiftCut: 0.1, throttle: 1 }).load).toBeLessThan(0.3);
    expect(toFrame({ ...s, shiftCut: 0, throttle: 1 }).load).toBe(1);
  });

  it('builds turbo boost under power and blows off exactly once when the throttle closes', () => {
    // pull to 100 km/h, then brake
    const speed = (t: number) => (t < 9 ? pull(3.5)(t) : Math.max(0, 100 - 20 * (t - 9)));
    const run = simulate(speed, 16);
    expect(Math.max(...run.map((r) => r.boost))).toBeGreaterThan(0.5);
    const blows = run.filter((r) => r.events.blowOff > 0);
    expect(blows.length).toBeGreaterThanOrEqual(1);
    // the first blow-off comes only after the pull, never while boost is still building
    expect(blows[0]!.boost).toBeGreaterThan(0.1);
    const last = run.at(-1)!;
    expect(last.boost).toBeLessThan(0.05);
  });

  it('pops once on a sudden acceleration, not on gentle driving', () => {
    const hard = simulate(pull(4), 6).filter((r) => r.events.pop === 'accel');
    expect(hard).toHaveLength(1);
    const gentle = simulate(pull(0.9), 20).filter((r) => r.events.pop === 'accel');
    expect(gentle).toHaveLength(0);
  });

  it('pops on lift-off after a hard pull', () => {
    const speed = (t: number) => (t < 9 ? pull(3.5)(t) : Math.max(0, 100 - 25 * (t - 9)));
    const lifts = simulate(speed, 16).filter((r) => r.events.pop === 'lift');
    expect(lifts.length).toBeGreaterThanOrEqual(1);
  });

  it('sensitivity decides what counts as hard', () => {
    expect(hardAccel(1)).toBeGreaterThan(hardAccel(5));
    expect(hardAccel(5)).toBeGreaterThan(hardAccel(10));
    const firm = pull(2.6);
    expect(simulate(firm, 8, { sensitivity: 10 }).some((r) => r.events.pop === 'accel')).toBe(true);
    expect(simulate(firm, 8, { sensitivity: 1 }).some((r) => r.events.pop === 'accel')).toBe(false);
  });

  it('without the gearbox the revs follow speed smoothly', () => {
    const run = simulate(pull(2.5), 12, { gearbox: false });
    expect(run.every((r) => r.gear === 1)).toBe(true);
    expect(run.every((r) => r.events.shift === null)).toBe(true);
    const rpms = run.filter((_, i) => i % 25 === 0).map((r) => r.rpm);
    for (let i = 1; i < rpms.length; i++) expect(rpms[i]!).toBeGreaterThanOrEqual(rpms[i - 1]! - 60);
  });

  it('lets the car coast to a stop when the GPS goes quiet', () => {
    const s = createDrive(ENGINES.v8);
    observeFix(s, 100, 0);
    let moving = 0;
    for (let t = 0; t < 40; t += DT) {
      stepDrive(s, t, DT, { profile: ENGINES.v8, sensitivity: 5, gearbox: true });
      if (moving === 0 && t >= 6) moving = s.speed * 3.6;
    }
    expect(moving).toBeGreaterThan(90);
    expect(s.speed * 3.6).toBeLessThan(5);
  });

  it('redlines differ by engine and gearing keeps each below its own limit', () => {
    for (const id of ['inline4', 'v12', 'diesel', 'rotary'] as const) {
      const run = simulate(pull(3), 14, {}, ENGINES[id]);
      expect(Math.max(...run.map((r) => r.rpm))).toBeLessThanOrEqual(ENGINES[id].redline + 1);
    }
  });
});

describe('test sound script', () => {
  it('pulls away, lifts, brakes, pulls again and stops', () => {
    expect(demoSpeedKmh(0)).toBe(0);
    expect(demoSpeedKmh(6.3)).toBeGreaterThan(110);
    expect(demoSpeedKmh(10)).toBeLessThan(75);
    expect(demoSpeedKmh(12.4)).toBeGreaterThan(95);
    expect(demoSpeedKmh(DEMO_SECONDS)).toBe(0);
    const run = simulate(demoSpeedKmh, DEMO_SECONDS);
    expect(run.some((r) => r.events.pop === 'accel')).toBe(true);
    expect(run.some((r) => r.events.blowOff > 0)).toBe(true);
    expect(run.some((r) => r.events.shift === 'up')).toBe(true);
  });
});

/** A context whose every node accepts any call: proves the graph code runs without touching real audio. */
function fakeContext(): BaseAudioContext {
  const stub = (): unknown =>
    new Proxy(function () {}, {
      get: (_t, prop) => (prop === 'then' ? undefined : stub()),
      set: () => true,
      apply: () => stub(),
    });
  const base: Record<string, unknown> = {
    sampleRate: 44100,
    currentTime: 0,
    createBuffer: () => ({ getChannelData: () => new Float32Array(64) }),
  };
  return new Proxy(base, {
    get: (t, prop: string) => (prop in t ? t[prop] : stub()),
  }) as unknown as BaseAudioContext;
}

describe('audio graph', () => {
  it('builds, updates and plays events for every engine and turbo type without throwing', () => {
    for (const engine of OPTIONS.sportEngine) {
      for (const turbo of OPTIONS.sportTurbo) {
        const audio = new SportAudio(fakeContext());
        audio.configure({ ...DEFAULT_CONFIG, engine: ENGINES[engine], turbo }, 0);
        audio.update({ rpm: 4000, load: 0.7, boost: 0.8, speedKmh: 90, audible: true }, 0.04);
        audio.blowOff(0.9, 0.1);
        audio.dispose();
      }
    }
  });

  it('plays every exhaust style for every pop kind, and nothing when exhaust is off', () => {
    for (const exhaust of OPTIONS.sportExhaust) {
      const audio = new SportAudio(fakeContext());
      audio.configure({ ...DEFAULT_CONFIG, exhaust }, 0);
      for (const kind of ['accel', 'lift', 'shift'] as const) audio.pops(kind, 0.8, 0);
      audio.configure({ ...DEFAULT_CONFIG, exhaust, exhaustOn: false }, 0);
      audio.pops('lift', 1, 0);
      audio.dispose();
    }
  });
});

describe('settings and controller', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    resetGeoForTests();
    stopSportForTests();
  });
  afterEach(() => {
    useSettings.getState().set('sportMode', false);
    stopSportForTests();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('every sport setting is in the menu', () => {
    const ids = new Set(SECTIONS.find((s) => s.id === 'sport')!.items.map((i) => i.key));
    for (const key of Object.keys(DEFAULT_SETTINGS).filter((k) => k.startsWith('sport'))) {
      expect(ids.has(key as never), key).toBe(true);
    }
  });

  it('keeps engine, turbo and exhaust independently switchable', () => {
    const s = { ...DEFAULT_SETTINGS, sportEngineOn: false, sportTurboOn: true, sportExhaustOn: false };
    const cfg = configFromSettings(s);
    expect([cfg.engineOn, cfg.turboOn, cfg.exhaustOn]).toEqual([false, true, false]);
    expect(configFromSettings({ ...DEFAULT_SETTINGS, sportVolume: 250 }).volume).toBe(1);
    expect(configFromSettings({ ...DEFAULT_SETTINGS, sportEngine: 'v12' }).engine.id).toBe('v12');
    expect(paramsFromSettings({ ...DEFAULT_SETTINGS, sportSensitivity: 99 }).sensitivity).toBe(10);
  });

  it('honours the pop trigger setting', () => {
    expect(popWanted('acceleration', 'accel')).toBe(true);
    expect(popWanted('acceleration', 'lift')).toBe(false);
    expect(popWanted('liftoff', 'lift')).toBe(true);
    expect(popWanted('liftoff', 'accel')).toBe(false);
    expect(popWanted('both', 'accel') && popWanted('both', 'lift')).toBe(true);
    expect(popWanted('liftoff', 'shift')).toBe(true);
  });

  it('reports unsupported browsers instead of throwing', () => {
    initSport();
    useSettings.getState().set('sportMode', true);
    expect(useSport.getState().supported).toBe(false);
    expect(useSport.getState().active).toBe(false);
  });

  it('starts, follows the GPS speed and stops again', async () => {
    const ctx = fakeContext() as unknown as Record<string, unknown>;
    ctx.state = 'running';
    ctx.resume = () => Promise.resolve();
    ctx.suspend = () => Promise.resolve();
    ctx.close = () => Promise.resolve();
    class FakeAudioContext {
      constructor() {
        return ctx;
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    initSport();
    useSettings.getState().set('sportMode', true);
    expect(useSport.getState().active).toBe(true);

    const fix = (kmh: number) =>
      useGeo.getState().ingest({
        coords: {
          latitude: 41,
          longitude: 29,
          accuracy: 5,
          speed: kmh / 3.6,
          heading: 0,
        } as GeolocationCoordinates,
        timestamp: Date.now(),
      });
    fix(0);
    await new Promise((r) => setTimeout(r, 120));
    fix(60);
    await new Promise((r) => setTimeout(r, 600));
    fix(80);
    await new Promise((r) => setTimeout(r, 400));
    expect(useSport.getState().speedKmh).toBeGreaterThan(20);
    expect(useSport.getState().rpm).toBeGreaterThan(ENGINES.v8.idleRpm);

    useSettings.getState().set('sportMode', false);
    expect(useSport.getState().active).toBe(false);
  });
});
