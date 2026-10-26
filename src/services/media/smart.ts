import { getSettings } from '../../core/settings';
import { interpolatePosition, type MediaController } from './types';

export const RESTART_THRESHOLD_MS = 3000;

/** "Previous" restarts the track when more than 3 s in (setting), otherwise goes to the previous track. */
export async function smartPrevious(controller: MediaController): Promise<void> {
  const state = controller.state$.getState();
  if (
    getSettings().prevRestartsTrack &&
    state.caps.seek &&
    interpolatePosition(state) > RESTART_THRESHOLD_MS
  ) {
    await controller.seek(0);
  } else {
    await controller.previous();
  }
}
