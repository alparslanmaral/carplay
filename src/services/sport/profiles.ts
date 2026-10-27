import type { Settings } from '../../core/settings';

export type EngineId = Settings['sportEngine'];
export type TurboId = Settings['sportTurbo'];
export type ExhaustId = Settings['sportExhaust'];

/**
 * Everything the synthesiser needs to know about one engine. Frequencies follow real engine physics: a 4-stroke
 * fires `firesPerRev` times per crankshaft turn, so the fundamental is rpm / 60 * firesPerRev; the rest is a
 * harmonic spectrum, a few distortion/roughness knobs and a filter that opens with revs and throttle.
 */
export interface EngineProfile {
  id: EngineId;
  /** Firing events per crankshaft revolution (cylinders / 2 for a 4-stroke). */
  firesPerRev: number;
  idleRpm: number;
  redline: number;
  /** km/h per 1000 rpm in gears 1..6 (a simple automatic uses these to pick the gear). */
  gears: number[];
  /** Spectrum: number of harmonics, 1/n^tilt roll-off, odd / even harmonic emphasis. */
  harmonics: number;
  tilt: number;
  odd: number;
  even: number;
  /** Second oscillator detune (cents): beating adds thickness and growl. */
  detuneCents: number;
  /** Cylinder-to-cylinder unevenness 0..1 (the V8 "lope", boxer burble). */
  lump: number;
  /** Waveshaper drive 0..1. */
  growl: number;
  /** Intake / mechanical noise level 0..1. */
  noise: number;
  /** Amplitude roughness 0..1 and its rate as a multiple of the firing frequency. */
  rasp: number;
  raspRate: number;
  /** Low-pass filter: base + perKrpm * krpm + load * load (Hz) and resonance. */
  cutoff: { base: number; perKrpm: number; load: number; q: number };
  /** Supercharger whine level 0..1. */
  whine: number;
  /** Overall level of this engine relative to the others. */
  gain: number;
}

const SPORT_GEARS = [7.5, 13, 19, 26, 34, 43];
const TALL_GEARS = [8.5, 15, 22.5, 31, 41, 52];
const DIESEL_GEARS = [10.5, 18.5, 28, 38, 50, 64];

export const ENGINES: Record<EngineId, EngineProfile> = {
  inline4: {
    id: 'inline4',
    firesPerRev: 2,
    idleRpm: 850,
    redline: 7200,
    gears: SPORT_GEARS,
    harmonics: 18,
    tilt: 1.1,
    odd: 1,
    even: 0.85,
    detuneCents: 7,
    lump: 0.12,
    growl: 0.3,
    noise: 0.25,
    rasp: 0.12,
    raspRate: 1.5,
    cutoff: { base: 1700, perKrpm: 480, load: 2600, q: 0.9 },
    whine: 0,
    gain: 0.95,
  },
  inline6: {
    id: 'inline6',
    firesPerRev: 3,
    idleRpm: 750,
    redline: 7000,
    gears: SPORT_GEARS,
    harmonics: 18,
    tilt: 1.3,
    odd: 1,
    even: 0.7,
    detuneCents: 4,
    lump: 0.05,
    growl: 0.2,
    noise: 0.2,
    rasp: 0.06,
    raspRate: 1.5,
    cutoff: { base: 1600, perKrpm: 520, load: 2400, q: 0.8 },
    whine: 0,
    gain: 1,
  },
  flat6: {
    id: 'flat6',
    firesPerRev: 3,
    idleRpm: 800,
    redline: 8000,
    gears: SPORT_GEARS,
    harmonics: 20,
    tilt: 1.0,
    odd: 1,
    even: 0.5,
    detuneCents: 16,
    lump: 0.3,
    growl: 0.4,
    noise: 0.3,
    rasp: 0.22,
    raspRate: 1.5,
    cutoff: { base: 1900, perKrpm: 520, load: 2800, q: 1.0 },
    whine: 0,
    gain: 1,
  },
  v6: {
    id: 'v6',
    firesPerRev: 3,
    idleRpm: 780,
    redline: 7000,
    gears: SPORT_GEARS,
    harmonics: 18,
    tilt: 1.15,
    odd: 1,
    even: 0.75,
    detuneCents: 9,
    lump: 0.2,
    growl: 0.32,
    noise: 0.25,
    rasp: 0.1,
    raspRate: 1.5,
    cutoff: { base: 1500, perKrpm: 500, load: 2500, q: 0.9 },
    whine: 0,
    gain: 1,
  },
  v8: {
    id: 'v8',
    firesPerRev: 4,
    idleRpm: 700,
    redline: 6500,
    gears: SPORT_GEARS,
    harmonics: 22,
    tilt: 0.95,
    odd: 1,
    even: 0.9,
    detuneCents: 11,
    lump: 0.55,
    growl: 0.5,
    noise: 0.3,
    rasp: 0.18,
    raspRate: 1.5,
    cutoff: { base: 1200, perKrpm: 560, load: 2300, q: 1.1 },
    whine: 0,
    gain: 1.05,
  },
  v8flat: {
    id: 'v8flat',
    firesPerRev: 4,
    idleRpm: 900,
    redline: 8400,
    gears: SPORT_GEARS,
    harmonics: 24,
    tilt: 0.8,
    odd: 1,
    even: 0.7,
    detuneCents: 6,
    lump: 0.08,
    growl: 0.35,
    noise: 0.25,
    rasp: 0.1,
    raspRate: 1.5,
    cutoff: { base: 2600, perKrpm: 600, load: 3200, q: 1.2 },
    whine: 0,
    gain: 0.95,
  },
  v10: {
    id: 'v10',
    firesPerRev: 5,
    idleRpm: 900,
    redline: 8800,
    gears: SPORT_GEARS,
    harmonics: 24,
    tilt: 0.85,
    odd: 1,
    even: 0.8,
    detuneCents: 8,
    lump: 0.12,
    growl: 0.3,
    noise: 0.25,
    rasp: 0.1,
    raspRate: 1.5,
    cutoff: { base: 2400, perKrpm: 600, load: 3200, q: 1.1 },
    whine: 0,
    gain: 0.95,
  },
  v12: {
    id: 'v12',
    firesPerRev: 6,
    idleRpm: 750,
    redline: 8600,
    gears: SPORT_GEARS,
    harmonics: 22,
    tilt: 1.0,
    odd: 1,
    even: 0.9,
    detuneCents: 5,
    lump: 0.03,
    growl: 0.15,
    noise: 0.2,
    rasp: 0.04,
    raspRate: 1.5,
    cutoff: { base: 2000, perKrpm: 620, load: 3000, q: 0.9 },
    whine: 0,
    gain: 0.95,
  },
  hellcat: {
    id: 'hellcat',
    firesPerRev: 4,
    idleRpm: 700,
    redline: 6200,
    gears: TALL_GEARS,
    harmonics: 22,
    tilt: 0.9,
    odd: 1,
    even: 0.95,
    detuneCents: 14,
    lump: 0.6,
    growl: 0.65,
    noise: 0.35,
    rasp: 0.25,
    raspRate: 1.5,
    cutoff: { base: 1300, perKrpm: 600, load: 2600, q: 1.2 },
    whine: 0.7,
    gain: 1.1,
  },
  rotary: {
    id: 'rotary',
    firesPerRev: 2,
    idleRpm: 900,
    redline: 9000,
    gears: SPORT_GEARS,
    harmonics: 24,
    tilt: 0.7,
    odd: 0.6,
    even: 1,
    detuneCents: 20,
    lump: 0.1,
    growl: 0.5,
    noise: 0.35,
    rasp: 0.5,
    raspRate: 2.5,
    cutoff: { base: 3000, perKrpm: 600, load: 3000, q: 1.3 },
    whine: 0,
    gain: 0.9,
  },
  diesel: {
    id: 'diesel',
    firesPerRev: 2,
    idleRpm: 750,
    redline: 4600,
    gears: DIESEL_GEARS,
    harmonics: 16,
    tilt: 1.4,
    odd: 1,
    even: 0.8,
    detuneCents: 12,
    lump: 0.2,
    growl: 0.3,
    noise: 0.4,
    rasp: 0.8,
    raspRate: 0.5,
    cutoff: { base: 900, perKrpm: 420, load: 1600, q: 0.9 },
    whine: 0,
    gain: 1,
  },
  growl: {
    id: 'growl',
    firesPerRev: 4,
    idleRpm: 700,
    redline: 6200,
    gears: SPORT_GEARS,
    harmonics: 20,
    tilt: 1.2,
    odd: 1,
    even: 0.9,
    detuneCents: 26,
    lump: 0.65,
    growl: 0.95,
    noise: 0.45,
    rasp: 0.55,
    raspRate: 1.5,
    cutoff: { base: 850, perKrpm: 380, load: 1900, q: 1.4 },
    whine: 0,
    gain: 1.15,
  },
  calm: {
    id: 'calm',
    firesPerRev: 3,
    idleRpm: 750,
    redline: 6500,
    gears: TALL_GEARS,
    harmonics: 10,
    tilt: 1.8,
    odd: 1,
    even: 0.5,
    detuneCents: 3,
    lump: 0.03,
    growl: 0.05,
    noise: 0.1,
    rasp: 0,
    raspRate: 1.5,
    cutoff: { base: 650, perKrpm: 160, load: 700, q: 0.7 },
    whine: 0,
    gain: 0.55,
  },
};

export const ENGINE_LABELS: Record<EngineId, string> = {
  inline4: 'Inline-4 (hot hatch)',
  inline6: 'Inline-6 (smooth)',
  flat6: 'Flat-6 (boxer)',
  v6: 'V6',
  v8: 'V8 (muscle)',
  v8flat: 'V8 flat-plane (screamer)',
  v10: 'V10',
  v12: 'V12 (silky)',
  hellcat: 'Hellcat (supercharged V8)',
  rotary: 'Rotary',
  diesel: 'Diesel',
  growl: 'Rough growl (deep and hoarse)',
  calm: 'Calm and quiet',
};

/** How a turbo sounds: whistle range, noise layers and what happens when the throttle closes. */
export interface TurboProfile {
  /** Whistle frequency at no boost / full boost (Hz). */
  whistle: [number, number];
  whistleGain: number;
  wave: OscillatorType;
  /** Second whistle at this frequency ratio (0 = none), for twin-turbo beating. */
  twin: number;
  /** Inhale: band-passed noise that swells with boost. */
  whoosh: number;
  /** Hiss: high-passed noise that swells with boost. */
  hiss: number;
  /** What the throttle-lift does. */
  blow: 'psh' | 'dump' | 'flutter';
  blowGain: number;
  /** Seconds the blow-off rings out at full boost. */
  blowTail: number;
}

export const TURBOS: Record<TurboId, TurboProfile> = {
  classic: {
    whistle: [1500, 4800],
    whistleGain: 0.55,
    wave: 'sine',
    twin: 0,
    whoosh: 0.3,
    hiss: 0.2,
    blow: 'psh',
    blowGain: 0.8,
    blowTail: 0.55,
  },
  whoosh: {
    whistle: [900, 2400],
    whistleGain: 0.12,
    wave: 'sine',
    twin: 0,
    whoosh: 1,
    hiss: 0.3,
    blow: 'psh',
    blowGain: 1,
    blowTail: 0.8,
  },
  flutter: {
    whistle: [1800, 5200],
    whistleGain: 0.4,
    wave: 'sine',
    twin: 0,
    whoosh: 0.25,
    hiss: 0.15,
    blow: 'flutter',
    blowGain: 1.5,
    blowTail: 0.7,
  },
  twin: {
    whistle: [1300, 4200],
    whistleGain: 0.4,
    wave: 'sine',
    twin: 1.19,
    whoosh: 0.3,
    hiss: 0.2,
    blow: 'psh',
    blowGain: 0.85,
    blowTail: 0.5,
  },
  race: {
    whistle: [2300, 7200],
    whistleGain: 0.7,
    wave: 'triangle',
    twin: 0,
    whoosh: 0.4,
    hiss: 0.35,
    blow: 'dump',
    blowGain: 1.1,
    blowTail: 0.7,
  },
  subtle: {
    whistle: [1200, 3200],
    whistleGain: 0.3,
    wave: 'sine',
    twin: 0,
    whoosh: 0.2,
    hiss: 0.1,
    blow: 'psh',
    blowGain: 0.45,
    blowTail: 0.35,
  },
};

export const TURBO_LABELS: Record<TurboId, string> = {
  classic: 'Classic whistle + blow-off',
  whoosh: 'Whoosh (inhale and exhale)',
  flutter: 'Flutter (stu-tu-tu)',
  twin: 'Twin turbo',
  race: 'Race turbo (loud)',
  subtle: 'Subtle',
};

export const EXHAUST_LABELS: Record<ExhaustId, string> = {
  popcorn: 'Popcorn crackle',
  burble: 'Burble',
  bangs: 'Loud bangs',
  crackle: 'Fine crackle',
};

export const POP_TRIGGER_LABELS: Record<Settings['sportPopTrigger'], string> = {
  acceleration: 'On hard acceleration',
  liftoff: 'On lift-off',
  both: 'Both',
};
