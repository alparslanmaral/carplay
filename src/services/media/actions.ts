import { getSettings } from '../../core/settings';
import { clamp } from '../../core/units';
import { log } from '../../core/logger';
import { getActiveController } from './manager';
import { smartPrevious } from './smart';
import { interpolatePosition } from './types';

async function run(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    log.warn('media', `${label} failed`, e);
  }
}

export const mediaActions = {
  togglePlay: () =>
    run('togglePlay', async () => {
      const c = getActiveController();
      if (!c) return;
      if (c.state$.getState().playing) await c.pause();
      else await c.play();
    }),
  next: () => run('next', async () => void (await getActiveController()?.next())),
  previous: () =>
    run('previous', async () => {
      const c = getActiveController();
      if (c) await smartPrevious(c);
    }),
  seekBy: (deltaMs: number) =>
    run('seekBy', async () => {
      const c = getActiveController();
      if (!c) return;
      const st = c.state$.getState();
      await c.seek(clamp(interpolatePosition(st) + deltaMs, 0, st.durationMs || Number.MAX_SAFE_INTEGER));
    }),
  seekStep: (dir: 1 | -1) => mediaActions.seekBy(dir * getSettings().seekStep * 1000),
  volumeStep: (dir: 1 | -1) =>
    run('volumeStep', async () => {
      const c = getActiveController();
      const v = c?.state$.getState().volume;
      if (!c || v === null || v === undefined) return;
      await c.setVolume(clamp(v + dir * getSettings().volumeStep, 0, 100));
    }),
};
