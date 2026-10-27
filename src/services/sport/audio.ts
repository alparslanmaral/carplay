import {
  ENGINES,
  TURBOS,
  type EngineProfile,
  type ExhaustId,
  type TurboId,
  type TurboProfile,
} from './profiles';
import type { PopKind } from './model';

/**
 * The sound of sport mode, synthesised with the Web Audio API (no samples, no <audio> element, no Media
 * Session). It is written against BaseAudioContext so the same code runs live and in an OfflineAudioContext
 * for tests. Every method takes the time to act at, so scheduling is sample-accurate and independent of timers.
 */

export interface SportAudioConfig {
  engineOn: boolean;
  engine: EngineProfile;
  turboOn: boolean;
  turbo: TurboId;
  exhaustOn: boolean;
  exhaust: ExhaustId;
  /** All 0..1 */
  volume: number;
  engineVolume: number;
  turboVolume: number;
  exhaustVolume: number;
}

export interface AudioFrame {
  rpm: number;
  /** Throttle load 0..1 (already reduced during a gear change). */
  load: number;
  boost: number;
  speedKmh: number;
  /** Engine should sound at all (false when stopped and the idle sound is off). */
  audible: boolean;
}

export const DEFAULT_CONFIG: SportAudioConfig = {
  engineOn: true,
  engine: ENGINES.v8,
  turboOn: true,
  turbo: 'classic',
  exhaustOn: true,
  exhaust: 'popcorn',
  volume: 0.6,
  engineVolume: 1,
  turboVolume: 0.8,
  exhaustVolume: 0.8,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** Smoothing time constant for parameter changes (seconds). */
const GLIDE = 0.035;

function makeNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function loopSource(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function shaperCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1 + drive * 9;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
  return curve;
}

function periodicWave(ctx: BaseAudioContext, p: EngineProfile): PeriodicWave {
  const n = p.harmonics + 1;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let h = 1; h < n; h++) imag[h] = h ** -p.tilt * (h % 2 === 1 ? p.odd : p.even);
  return ctx.createPeriodicWave(real, imag);
}

/* ------------------------------------------------------------------ engine */

class EngineVoice {
  readonly out: GainNode;
  private readonly nodes: AudioScheduledSourceNode[] = [];
  private readonly osc1: OscillatorNode;
  private readonly osc2: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly lumpLfo: OscillatorNode;
  private readonly raspLfo: OscillatorNode;
  private readonly whine: OscillatorNode;
  private readonly lp: BiquadFilterNode;
  private readonly noiseBand: BiquadFilterNode;
  private readonly noiseGain: GainNode;
  private readonly body: GainNode;
  private readonly whineGain: GainNode;

  constructor(
    ctx: BaseAudioContext,
    noise: AudioBuffer,
    private readonly p: EngineProfile,
  ) {
    const osc = (type: OscillatorType = 'sine') => {
      const o = ctx.createOscillator();
      o.type = type;
      this.nodes.push(o);
      return o;
    };
    const wave = periodicWave(ctx, p);
    this.osc1 = osc();
    this.osc1.setPeriodicWave(wave);
    this.osc2 = osc();
    this.osc2.setPeriodicWave(wave);
    this.osc2.detune.value = p.detuneCents;
    this.sub = osc();
    this.lumpLfo = osc();
    this.raspLfo = osc();
    this.whine = osc();

    const oscMix = ctx.createGain();
    oscMix.gain.value = 0.5;
    this.osc1.connect(oscMix);
    this.osc2.connect(oscMix);

    // Uneven firing: a once-per-crank-turn dip in level.
    const lump = ctx.createGain();
    lump.gain.value = 1 - p.lump * 0.35;
    const lumpDepth = ctx.createGain();
    lumpDepth.gain.value = p.lump * 0.35;
    this.lumpLfo.connect(lumpDepth).connect(lump.gain);
    oscMix.connect(lump);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.12 + p.lump * 0.3;
    this.sub.connect(subGain);

    this.noiseBand = ctx.createBiquadFilter();
    this.noiseBand.type = 'bandpass';
    this.noiseBand.Q.value = 0.8;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    const ns = loopSource(ctx, noise);
    this.nodes.push(ns);
    ns.connect(this.noiseBand).connect(this.noiseGain);

    const mix = ctx.createGain();
    lump.connect(mix);
    subGain.connect(mix);
    this.noiseGain.connect(mix);

    // Roughness: fast amplitude wobble (diesel clatter, rotary buzz).
    const rough = ctx.createGain();
    rough.gain.value = 1 - p.rasp * 0.5;
    const roughDepth = ctx.createGain();
    roughDepth.gain.value = p.rasp * 0.5;
    this.raspLfo.connect(roughDepth).connect(rough.gain);
    mix.connect(rough);

    const shaper = ctx.createWaveShaper();
    shaper.curve = shaperCurve(p.growl);
    shaper.oversample = '2x';
    rough.connect(shaper);

    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = p.cutoff.q;
    this.lp.frequency.value = p.cutoff.base;
    shaper.connect(this.lp);

    this.body = ctx.createGain();
    this.body.gain.value = 0;
    this.lp.connect(this.body);

    this.out = ctx.createGain();
    this.body.connect(this.out);

    // Supercharger whine bypasses the distortion so it stays clean and thin.
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain).connect(this.out);

    for (const n of this.nodes) n.start();
  }

  update(rpm: number, load: number, audible: boolean, at: number): void {
    const p = this.p;
    const f0 = (rpm / 60) * p.firesPerRev;
    const rpmNorm = clamp(rpm / p.redline, 0, 1);
    this.osc1.frequency.setTargetAtTime(f0, at, GLIDE);
    this.osc2.frequency.setTargetAtTime(f0, at, GLIDE);
    this.sub.frequency.setTargetAtTime(f0 / 2, at, GLIDE);
    this.lumpLfo.frequency.setTargetAtTime(rpm / 60, at, GLIDE);
    this.raspLfo.frequency.setTargetAtTime(Math.max(1, f0 * p.raspRate), at, GLIDE);
    this.whine.frequency.setTargetAtTime((rpm / 60) * 14, at, GLIDE);
    const cutoff = clamp(p.cutoff.base + p.cutoff.perKrpm * (rpm / 1000) + p.cutoff.load * load, 200, 12000);
    this.lp.frequency.setTargetAtTime(cutoff, at, GLIDE);
    this.noiseBand.frequency.setTargetAtTime(250 + rpm * 0.18, at, GLIDE);
    this.noiseGain.gain.setTargetAtTime(p.noise * 0.2 * (0.25 + 0.75 * load), at, GLIDE);
    const level = 0.4 * rpmNorm + 0.6 * load;
    this.body.gain.setTargetAtTime(audible ? p.gain * 0.45 * (0.2 + 0.8 * level) : 0, at, 0.08);
    this.whineGain.gain.setTargetAtTime(
      audible ? p.whine * 0.1 * (0.15 + 0.85 * load) * rpmNorm : 0,
      at,
      GLIDE,
    );
  }

  dispose(): void {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.out.disconnect();
  }
}

/* ------------------------------------------------------------------- turbo */

class TurboVoice {
  readonly out: GainNode;
  private readonly nodes: AudioScheduledSourceNode[] = [];
  private readonly w1: OscillatorNode;
  private readonly w2: OscillatorNode;
  private readonly w1Gain: GainNode;
  private readonly w2Gain: GainNode;
  private readonly whooshBand: BiquadFilterNode;
  private readonly whooshGain: GainNode;
  private readonly hissGain: GainNode;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly noise: AudioBuffer,
    private readonly t: TurboProfile,
  ) {
    this.out = ctx.createGain();
    const osc = () => {
      const o = ctx.createOscillator();
      o.type = t.wave;
      this.nodes.push(o);
      return o;
    };
    this.w1 = osc();
    this.w2 = osc();
    this.w1Gain = ctx.createGain();
    this.w2Gain = ctx.createGain();
    this.w1Gain.gain.value = 0;
    this.w2Gain.gain.value = 0;
    this.w1.connect(this.w1Gain).connect(this.out);
    this.w2.connect(this.w2Gain).connect(this.out);

    this.whooshBand = ctx.createBiquadFilter();
    this.whooshBand.type = 'bandpass';
    this.whooshBand.Q.value = 0.9;
    this.whooshGain = ctx.createGain();
    this.whooshGain.gain.value = 0;
    const n1 = loopSource(ctx, noise);
    this.nodes.push(n1);
    n1.connect(this.whooshBand).connect(this.whooshGain).connect(this.out);

    const hiss = ctx.createBiquadFilter();
    hiss.type = 'highpass';
    hiss.frequency.value = 5000;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    const n2 = loopSource(ctx, noise);
    this.nodes.push(n2);
    n2.connect(hiss).connect(this.hissGain).connect(this.out);

    for (const n of this.nodes) n.start();
  }

  update(boost: number, load: number, audible: boolean, at: number): void {
    const t = this.t;
    const b = audible ? clamp(boost, 0, 1) : 0;
    const f = t.whistle[0] + (t.whistle[1] - t.whistle[0]) * b ** 0.8;
    this.w1.frequency.setTargetAtTime(f, at, 0.05);
    this.w2.frequency.setTargetAtTime(f * (t.twin || 1), at, 0.05);
    const g = t.whistleGain * 0.24 * b ** 1.6;
    this.w1Gain.gain.setTargetAtTime(g, at, 0.05);
    this.w2Gain.gain.setTargetAtTime(t.twin ? g : 0, at, 0.05);
    this.whooshBand.frequency.setTargetAtTime(450 + 1500 * b, at, 0.06);
    this.whooshGain.gain.setTargetAtTime(t.whoosh * 0.45 * b * (0.4 + 0.6 * load), at, 0.06);
    this.hissGain.gain.setTargetAtTime(t.hiss * 0.15 * b, at, 0.06);
  }

  /** Throttle lifted at boost: the air has nowhere to go. */
  blowOff(intensity: number, at: number, dest: AudioNode): void {
    const t = this.t;
    const i = clamp(intensity, 0.2, 1) * 1.6;
    const tail = t.blowTail * (0.5 + 0.5 * i);
    const burst = (start: number, from: number, to: number, dur: number, gain: number, q = 0.7) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      f.frequency.setValueAtTime(from, start);
      f.frequency.exponentialRampToValueAtTime(Math.max(50, to), start + dur);
      const e = this.ctx.createGain();
      e.gain.setValueAtTime(0.0001, start);
      e.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      e.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(f).connect(e).connect(dest);
      src.start(start, Math.random() * 1.5, dur + 0.05);
      src.stop(start + dur + 0.05);
      src.onended = () => e.disconnect();
    };
    if (t.blow === 'flutter') {
      // Compressor surge: a train of short chirps that thins out, with a falling whistle underneath.
      const pulses = 4 + Math.round(3 * i);
      let at2 = at;
      for (let k = 0; k < pulses; k++) {
        burst(at2, 2400, 900, 0.05, t.blowGain * 0.55 * (1 - k / (pulses + 2)), 1.6);
        at2 += 0.065 + k * 0.012;
      }
      const tone = this.ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(t.whistle[1] * 0.8, at);
      tone.frequency.exponentialRampToValueAtTime(t.whistle[0] * 0.7, at + 0.45);
      const e = this.ctx.createGain();
      e.gain.setValueAtTime(0.0001, at);
      e.gain.exponentialRampToValueAtTime(0.05 * i, at + 0.02);
      e.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
      tone.connect(e).connect(dest);
      tone.start(at);
      tone.stop(at + 0.5);
      tone.onended = () => e.disconnect();
      return;
    }
    burst(at, 7500, 2200, tail, t.blowGain * 0.7 * i, 0.6);
    burst(at, 3200, 900, tail * 1.2, t.blowGain * 0.45 * i, 0.5);
    if (t.blow === 'dump') {
      // A race dump valve has a thump in front of the hiss.
      const thump = this.ctx.createOscillator();
      thump.frequency.setValueAtTime(150, at);
      thump.frequency.exponentialRampToValueAtTime(55, at + 0.12);
      const e = this.ctx.createGain();
      e.gain.setValueAtTime(0.0001, at);
      e.gain.exponentialRampToValueAtTime(0.5 * i, at + 0.01);
      e.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      thump.connect(e).connect(dest);
      thump.start(at);
      thump.stop(at + 0.2);
      thump.onended = () => e.disconnect();
    }
  }

  dispose(): void {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.out.disconnect();
  }
}

/* ----------------------------------------------------------------- exhaust */

interface PopSpec {
  count: [number, number];
  gap: [number, number];
  band: [number, number];
  q: number;
  decay: [number, number];
  gain: [number, number];
  thump: number;
  type: BiquadFilterType;
}

const POPS: Record<ExhaustId, PopSpec> = {
  popcorn: {
    count: [5, 12],
    gap: [0.04, 0.14],
    band: [350, 1100],
    q: 1.2,
    decay: [0.03, 0.06],
    gain: [0.5, 1],
    thump: 0,
    type: 'bandpass',
  },
  burble: {
    count: [7, 15],
    gap: [0.07, 0.17],
    band: [180, 340],
    q: 0.9,
    decay: [0.08, 0.15],
    gain: [0.5, 0.85],
    thump: 0.35,
    type: 'lowpass',
  },
  bangs: {
    count: [1, 3],
    gap: [0.18, 0.4],
    band: [500, 900],
    q: 0.7,
    decay: [0.07, 0.12],
    gain: [0.9, 1],
    thump: 0.9,
    type: 'bandpass',
  },
  crackle: {
    count: [14, 28],
    gap: [0.02, 0.055],
    band: [1800, 3600],
    q: 1.4,
    decay: [0.012, 0.026],
    gain: [0.25, 0.5],
    thump: 0,
    type: 'bandpass',
  },
};

const BURST_SCALE: Record<PopKind, number> = { accel: 0.6, lift: 1, shift: 0.25 };

/* ------------------------------------------------------------------- facade */

export class SportAudio {
  readonly master: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly engineGroup: GainNode;
  private readonly turboGroup: GainNode;
  private readonly exhaustGroup: GainNode;
  private readonly noise: AudioBuffer;
  private engine: EngineVoice | null = null;
  private turbo: TurboVoice | null = null;
  private cfg: SportAudioConfig = DEFAULT_CONFIG;
  private activePops = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode = ctx.destination,
  ) {
    this.noise = makeNoise(ctx);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.2;
    this.engineGroup = ctx.createGain();
    this.turboGroup = ctx.createGain();
    this.exhaustGroup = ctx.createGain();
    this.engineGroup.connect(this.master);
    this.turboGroup.connect(this.master);
    this.exhaustGroup.connect(this.master);
    this.master.connect(this.comp).connect(destination);
    this.configure(DEFAULT_CONFIG);
  }

  configure(cfg: SportAudioConfig, at = this.ctx.currentTime): void {
    const prev = this.cfg;
    this.cfg = cfg;
    if (!this.engine || prev.engine.id !== cfg.engine.id) {
      this.engine?.dispose();
      this.engine = new EngineVoice(this.ctx, this.noise, cfg.engine);
      this.engine.out.connect(this.engineGroup);
    }
    if (!this.turbo || prev.turbo !== cfg.turbo) {
      this.turbo?.dispose();
      this.turbo = new TurboVoice(this.ctx, this.noise, TURBOS[cfg.turbo]);
      this.turbo.out.connect(this.turboGroup);
    }
    // Curve so the slider feels even: perceived loudness is roughly logarithmic.
    this.master.gain.setTargetAtTime(cfg.volume ** 1.6, at, 0.05);
    this.engineGroup.gain.setTargetAtTime(cfg.engineOn ? cfg.engineVolume : 0, at, 0.05);
    this.turboGroup.gain.setTargetAtTime(cfg.turboOn ? cfg.turboVolume : 0, at, 0.05);
    this.exhaustGroup.gain.setTargetAtTime(cfg.exhaustOn ? cfg.exhaustVolume : 0, at, 0.05);
  }

  update(frame: AudioFrame, at = this.ctx.currentTime): void {
    this.engine?.update(frame.rpm, frame.load, frame.audible, at);
    this.turbo?.update(frame.boost, frame.load, frame.audible, at);
  }

  blowOff(intensity: number, at = this.ctx.currentTime): void {
    if (this.cfg.turboOn) this.turbo?.blowOff(intensity, at, this.turboGroup);
  }

  /** A burst of exhaust pops starting at `at`. */
  pops(kind: PopKind, intensity: number, at = this.ctx.currentTime): void {
    if (!this.cfg.exhaustOn) return;
    const spec = POPS[this.cfg.exhaust];
    const i = clamp(intensity, 0.2, 1);
    const n = Math.max(
      1,
      Math.round(rand(spec.count[0], spec.count[1]) * BURST_SCALE[kind] * (0.5 + 0.5 * i)),
    );
    let t = at + (kind === 'accel' ? rand(0.1, 0.4) : 0.02);
    for (let k = 0; k < n; k++) {
      this.pop(spec, t, i);
      t += rand(spec.gap[0], spec.gap[1]);
    }
  }

  private pop(spec: PopSpec, at: number, intensity: number): void {
    if (this.activePops > 60) return;
    const ctx = this.ctx;
    const decay = rand(spec.decay[0], spec.decay[1]);
    const gain = rand(spec.gain[0], spec.gain[1]) * (0.5 + 0.5 * intensity) * 1.8;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = spec.type;
    f.frequency.value = rand(spec.band[0], spec.band[1]);
    f.Q.value = spec.q;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, at);
    e.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    e.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    src.connect(f).connect(e).connect(this.exhaustGroup);
    src.start(at, Math.random() * 1.5, decay + 0.05);
    src.stop(at + decay + 0.05);
    this.activePops++;
    src.onended = () => {
      this.activePops--;
      e.disconnect();
    };
    if (spec.thump > 0 && Math.random() < 0.7) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(rand(110, 160), at);
      o.frequency.exponentialRampToValueAtTime(45, at + 0.1);
      const te = ctx.createGain();
      te.gain.setValueAtTime(0.0001, at);
      te.gain.exponentialRampToValueAtTime(spec.thump * intensity * 1.5, at + 0.006);
      te.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      o.connect(te).connect(this.exhaustGroup);
      o.start(at);
      o.stop(at + 0.15);
      o.onended = () => te.disconnect();
    }
  }

  dispose(): void {
    this.engine?.dispose();
    this.turbo?.dispose();
    this.engine = null;
    this.turbo = null;
    for (const n of [this.engineGroup, this.turboGroup, this.exhaustGroup, this.master, this.comp])
      n.disconnect();
  }
}
