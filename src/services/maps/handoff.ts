import { create } from 'zustand';
import { getSettings, type Place } from '../../core/settings';
import { openExternal } from '../../ui/launch';
import { navUrl, type NavTarget } from './deeplinks';
import { navigateInApp } from './navigation';
import { addRecent } from './places';

interface ChooserState {
  place: Place | null;
  open: (place: Place) => void;
  close: () => void;
}

/** State for the "Navigate in ..." chooser sheet (navApp = ask). */
export const useNavChooser = create<ChooserState>((set) => ({
  place: null,
  open: (place) => set({ place }),
  close: () => set({ place: null }),
}));

export function handOffTo(app: NavTarget, place: Place): void {
  if (app === 'drivedeck') return navigateInApp(place);
  addRecent(place);
  const { avoidTolls, avoidHighways } = getSettings();
  openExternal(navUrl(app, place.lat, place.lng, { tolls: avoidTolls, highways: avoidHighways }));
}

/** One-tap navigation in the preferred app, or the chooser when the preference is "ask". */
export function navigateTo(place: Place): void {
  const pref = getSettings().navApp;
  if (pref === 'ask') useNavChooser.getState().open(place);
  else handOffTo(pref, place);
}
