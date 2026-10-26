import { create, createStore, useStore } from 'zustand';
import { getSettings, useSettings } from '../../core/settings';
import { log } from '../../core/logger';
import { syncMediaSession } from '../mediaSession';
import { setTapSoundAllowed } from '../feedback';
import { idleState, type MediaController, type MediaState, type SourceId } from './types';

const controllers = new Map<SourceId, MediaController>();

export function registerController(controller: MediaController): void {
  controllers.set(controller.id, controller);
}

export function getController(id: SourceId): MediaController | undefined {
  return controllers.get(id);
}

interface MediaManagerState {
  active: SourceId | null;
}

export const useMedia = create<MediaManagerState>(() => ({ active: null }));

export function getActiveController(): MediaController | null {
  const { active } = useMedia.getState();
  return active ? (controllers.get(active) ?? null) : null;
}

/**
 * Make `id` the active source. Two sources never play at once: the outgoing one is paused first.
 * The Media Session is re-synced here so ownership of the steering-wheel keys always follows the source:
 * Spotify releases it (the Spotify app keeps the keys), YouTube takes it.
 */
export async function setActiveSource(id: SourceId | null): Promise<void> {
  const prev = getActiveController();
  const next = id ? (controllers.get(id) ?? null) : null;
  if (prev === next) return;
  if (prev) {
    if (prev.state$.getState().playing)
      await prev.pause().catch((e) => log.warn('media', 'pause on switch failed', e));
    prev.deactivate();
  }
  useMedia.setState({ active: next?.id ?? null });
  syncMediaSession(next);
  setTapSoundAllowed(next?.id !== 'spotify');
  if (next && next.id !== 'demo') useSettings.getState().set('lastSource', next.id);
  if (next) await next.activate();
}

const IDLE = createStore<MediaState>(() => idleState('demo'));

/** Bind a component to whichever controller is active. */
export function useMediaState<T>(selector: (s: MediaState) => T): T {
  const active = useMedia((s) => s.active);
  const controller = active ? controllers.get(active) : undefined;
  return useStore(controller?.state$ ?? IDLE, selector);
}

export function useActiveController(): MediaController | null {
  const active = useMedia((s) => s.active);
  return active ? (controllers.get(active) ?? null) : null;
}

/** Which source should be active at launch, given the setting and what is registered. */
export function pickInitialSource(
  setting: 'spotify' | 'youtube' | 'last',
  last: string,
  available: SourceId[],
): SourceId | null {
  const wanted = setting === 'last' ? last : setting;
  if (available.includes(wanted as SourceId)) return wanted as SourceId;
  return available.includes('demo') ? 'demo' : (available[0] ?? null);
}

export function availableSources(): SourceId[] {
  const s = getSettings();
  return [...controllers.keys()].filter((id) => id !== 'demo' || s.demoPlayer);
}
