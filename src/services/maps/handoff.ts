import { create } from 'zustand';
import { getSettings, type Place } from '../../core/settings';
import { openExternal } from '../../ui/launch';
import { navUrl, type NavAppId } from './deeplinks';
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

export function handOffTo(app: NavAppId, place: Place): void {
  addRecent(place);
  openExternal(navUrl(app, place.lat, place.lng));
}

/** One-tap hand-off to the preferred navigation app, or the chooser when the preference is "ask". */
export function navigateTo(place: Place): void {
  const pref = getSettings().navApp;
  if (pref === 'ask') useNavChooser.getState().open(place);
  else handOffTo(pref, place);
}
