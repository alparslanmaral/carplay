import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../core/settings';
import { DEMO_TRACKS, DemoController } from './demo';
import { interpolatePosition } from './types';
import { smartPrevious } from './smart';
import { pickInitialSource } from './manager';

beforeEach(() => {
  useSettings.getState().reset();
});

describe('interpolatePosition', () => {
  const base = { playing: true, positionMs: 10_000, positionAt: 1_000_000, durationMs: 60_000 };
  it('advances while playing', () => {
    expect(interpolatePosition(base, 1_005_000)).toBe(15_000);
  });
  it('holds while paused', () => {
    expect(interpolatePosition({ ...base, playing: false }, 1_005_000)).toBe(10_000);
  });
  it('clamps to the duration and never goes backwards', () => {
    expect(interpolatePosition(base, 1_900_000)).toBe(60_000);
    expect(interpolatePosition(base, 900_000)).toBe(10_000);
  });
  it('does not clamp when the duration is unknown', () => {
    expect(interpolatePosition({ ...base, durationMs: 0 }, 1_005_000)).toBe(15_000);
  });
});

describe('DemoController', () => {
  it('declares it never owns the Media Session', () => {
    expect(new DemoController().ownsMediaSession).toBe(false);
  });

  it('plays, pauses, skips and wraps around', async () => {
    const c = new DemoController();
    await c.activate();
    expect(c.state$.getState().track?.id).toBe(DEMO_TRACKS[0]!.id);
    await c.play();
    expect(c.state$.getState().playing).toBe(true);
    await c.next();
    expect(c.state$.getState().track?.id).toBe(DEMO_TRACKS[1]!.id);
    expect(c.state$.getState().playing).toBe(true);
    await c.pause();
    await c.previous();
    await c.previous();
    expect(c.state$.getState().track?.id).toBe(DEMO_TRACKS.at(-1)!.id);
    c.deactivate();
  });

  it('applies shuffle/repeat defaults from settings on activate', async () => {
    useSettings.getState().patch({ defaultShuffle: 'on', defaultRepeat: 'track' });
    const c = new DemoController();
    await c.activate();
    expect(c.state$.getState().shuffle).toBe(true);
    expect(c.state$.getState().repeat).toBe('track');
    c.deactivate();
  });

  it('toggles like per track', async () => {
    const c = new DemoController();
    await c.activate();
    await c.toggleLike();
    expect(c.state$.getState().liked).toBe(true);
    await c.next();
    expect(c.state$.getState().liked).toBe(false);
    c.deactivate();
  });
});

describe('smartPrevious', () => {
  it('restarts the track when more than 3 s in, otherwise goes back', async () => {
    const c = new DemoController();
    await c.activate();
    const seek = vi.spyOn(c, 'seek');
    const prev = vi.spyOn(c, 'previous');
    await c.play();
    c.state$.setState({ positionMs: 10_000, positionAt: Date.now() });
    await smartPrevious(c);
    expect(seek).toHaveBeenCalledWith(0);
    expect(prev).not.toHaveBeenCalled();
    c.state$.setState({ positionMs: 1_000, positionAt: Date.now() });
    await smartPrevious(c);
    expect(prev).toHaveBeenCalledTimes(1);
    c.deactivate();
  });

  it('always goes to the previous track when the setting is off', async () => {
    useSettings.getState().set('prevRestartsTrack', false);
    const c = new DemoController();
    await c.activate();
    const prev = vi.spyOn(c, 'previous');
    c.state$.setState({ positionMs: 30_000, positionAt: Date.now() });
    await smartPrevious(c);
    expect(prev).toHaveBeenCalled();
    c.deactivate();
  });
});

describe('pickInitialSource', () => {
  it('uses the explicit default or the last-used source when available', () => {
    expect(pickInitialSource('youtube', 'spotify', ['spotify', 'youtube'])).toBe('youtube');
    expect(pickInitialSource('last', 'spotify', ['spotify', 'youtube'])).toBe('spotify');
  });
  it('falls back to demo, then the first source, then nothing', () => {
    expect(pickInitialSource('spotify', 'spotify', ['demo'])).toBe('demo');
    expect(pickInitialSource('spotify', 'spotify', ['youtube'])).toBe('youtube');
    expect(pickInitialSource('spotify', 'spotify', [])).toBeNull();
  });
});
