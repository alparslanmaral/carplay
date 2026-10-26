import { getFeatures } from '../core/features';
import { getSettings } from '../core/settings';

let ctx: AudioContext | null = null;

/**
 * Tap click via WebAudio. Callers must make sure DriveDeck does not own media playback elsewhere:
 * opening an audio context can take the iOS audio session, so `allowSound` is false while Spotify is the source.
 */
function click(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1400;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch {
    /* audio unavailable */
  }
}

let allowSound = true;
export function setTapSoundAllowed(value: boolean): void {
  allowSound = value;
}

export function tapFeedback(): void {
  const s = getSettings();
  if (s.haptics && getFeatures().vibration) navigator.vibrate(8);
  if (s.tapSounds && allowSound) click();
}

/** One delegated listener instead of wiring every button. */
export function installTapFeedback(): () => void {
  const handler = (e: PointerEvent) => {
    const el = e.target instanceof Element ? e.target.closest('button, [role="button"], a') : null;
    if (el && !(el as HTMLButtonElement).disabled) tapFeedback();
  };
  document.addEventListener('pointerdown', handler, { passive: true });
  return () => document.removeEventListener('pointerdown', handler);
}
