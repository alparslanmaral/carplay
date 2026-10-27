import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Allowed values for every enumerated setting. Single source of truth for types, validation and the menu. */
export const OPTIONS = {
  theme: ['dark', 'light', 'sunset', 'system'],
  wallpaperKind: ['solid', 'gradient', 'art', 'image'],
  iconShape: ['squircle', 'circle', 'rounded'],
  gridColumns: ['auto', '3', '4', '5', '6'],
  animationSpeed: ['off', 'fast', 'normal', 'slow'],
  pageTransition: ['slide', 'fade', 'zoom', 'none'],
  clockFormat: ['24', '12'],
  railPosition: ['left', 'right', 'bottom'],
  orientationPref: ['auto', 'landscape', 'portrait'],
  startScreen: ['home', 'dashboard', 'last'],
  defaultSource: ['spotify', 'youtube', 'last'],
  defaultShuffle: ['keep', 'on', 'off'],
  defaultRepeat: ['keep', 'off', 'context', 'track'],
  nowPlayingBg: ['art', 'solid', 'gradient'],
  artworkShape: ['rounded', 'square', 'vinyl'],
  ytWhileMoving: ['blocked', 'allowed'],
  navApp: ['drivedeck', 'apple', 'google', 'waze', 'ask'],
  mapProvider: ['maplibre', 'google', 'mapkit'],
  mapStyle: ['auto', 'light', 'dark', 'satellite'],
  mapOrientation: ['north', 'heading'],
  speedUnit: ['kmh', 'mph'],
  distanceUnit: ['km', 'mi'],
  searchProvider: ['photon', 'nominatim', 'google'],
  gpsMode: ['high', 'balanced'],
} as const;

type Opt<K extends keyof typeof OPTIONS> = (typeof OPTIONS)[K][number];

export const ACCENT_PRESETS = [
  '#4c8dff',
  '#7c5cff',
  '#b05cff',
  '#ff5ca8',
  '#ff5c5c',
  '#ff8a3d',
  '#ffc83d',
  '#7ddc4a',
  '#2fd39a',
  '#25c7d9',
  '#8fa3b8',
  '#f2f2f7',
] as const;

export interface Shortcut {
  id: string;
  name: string;
  /** Icon glyph name from the Icon set. */
  icon: string;
  /** http(s) URL or URL scheme such as tel:, sms:, waze:// */
  url: string;
}

export interface Place {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  kind?: 'home' | 'work' | 'custom';
  ts?: number;
}

export interface Settings {
  // Appearance
  theme: Opt<'theme'>;
  accent: string;
  wallpaperKind: Opt<'wallpaperKind'>;
  wallpaperGradient: number;
  wallpaperImage: string;
  wallpaperDim: number;
  wallpaperBlur: number;
  iconShape: Opt<'iconShape'>;
  iconSize: number;
  showLabels: boolean;
  gridColumns: Opt<'gridColumns'>;
  uiScale: number;
  fontWeight: number;
  textScale: number;
  cornerRadius: number;
  glassBlur: number;
  animationSpeed: Opt<'animationSpeed'>;
  pageTransition: Opt<'pageTransition'>;
  clockFormat: Opt<'clockFormat'>;
  clockSeconds: boolean;
  showDate: boolean;
  railPosition: Opt<'railPosition'>;
  railWidth: number;
  dockItems: string[];

  // Layout
  orientationPref: Opt<'orientationPref'>;
  dashboardWidgets: string[];
  dashboardSplit: number;
  homeOrder: string[];
  homeHidden: string[];
  shortcuts: Shortcut[];
  startScreen: Opt<'startScreen'>;
  idleReturnMinutes: number;

  // Media
  defaultSource: Opt<'defaultSource'>;
  lastSource: string;
  autoResume: boolean;
  seekStep: number;
  prevRestartsTrack: boolean;
  defaultShuffle: Opt<'defaultShuffle'>;
  defaultRepeat: Opt<'defaultRepeat'>;
  nowPlayingBg: Opt<'nowPlayingBg'>;
  artworkShape: Opt<'artworkShape'>;
  showQueue: boolean;
  showLike: boolean;
  showProgress: boolean;
  volumeStep: number;
  demoPlayer: boolean;
  spotifyAutoTransfer: boolean;
  spotifyDeviceName: string;
  spotifyPollSeconds: number;
  ytAutoplayNext: boolean;
  ytLoopPlaylist: boolean;
  ytCaptions: boolean;
  ytWhileMoving: Opt<'ytWhileMoving'>;

  // Maps
  navApp: Opt<'navApp'>;
  avoidTolls: boolean;
  avoidHighways: boolean;
  navVoice: boolean;
  mapProvider: Opt<'mapProvider'>;
  mapStyle: Opt<'mapStyle'>;
  mapOrientation: Opt<'mapOrientation'>;
  autoZoom: boolean;
  showTraffic: boolean;
  speedUnit: Opt<'speedUnit'>;
  distanceUnit: Opt<'distanceUnit'>;
  showSpeedWidget: boolean;
  /** km/h, 0 = off */
  speedAlert: number;
  searchProvider: Opt<'searchProvider'>;
  /** ISO 3166-1 alpha-2 country code, empty = bias to current position */
  regionBias: string;
  favorites: Place[];
  recents: Place[];
  recentsLimit: number;
  autoHandoff: boolean;
  gpsMode: Opt<'gpsMode'>;

  // Driving and safety
  keepAwake: boolean;
  dimEnabled: boolean;
  dimLevel: number;
  dimScheduleEnabled: boolean;
  dimStart: string;
  dimEnd: string;
  lockInput: boolean;
  /** km/h */
  lockSpeed: number;
  passengerOverride: boolean;
  largeTargets: boolean;
  touchTarget: number;
  simplified: boolean;
  tapSounds: boolean;
  haptics: boolean;

  // Accounts and data (kept locally only)
  googleMapsKey: string;
  mapkitToken: string;
  youtubeApiKey: string;
  spotifyClientId: string;
  googleClientId: string;

  // Misc
  onboardingDone: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: ACCENT_PRESETS[0],
  wallpaperKind: 'gradient',
  wallpaperGradient: 0,
  wallpaperImage: '',
  wallpaperDim: 35,
  wallpaperBlur: 0,
  iconShape: 'squircle',
  iconSize: 72,
  showLabels: true,
  gridColumns: 'auto',
  uiScale: 100,
  fontWeight: 500,
  textScale: 100,
  cornerRadius: 22,
  glassBlur: 24,
  animationSpeed: 'normal',
  pageTransition: 'slide',
  clockFormat: '24',
  clockSeconds: false,
  showDate: true,
  railPosition: 'left',
  railWidth: 112,
  dockItems: ['maps', 'spotify', 'youtube'],

  orientationPref: 'auto',
  dashboardWidgets: ['map', 'nowplaying', 'speed', 'clock', 'weather', 'recents', 'actions'],
  dashboardSplit: 55,
  homeOrder: ['dashboard', 'maps', 'spotify', 'youtube', 'nowplaying', 'destinations', 'settings'],
  homeHidden: [],
  shortcuts: [],
  startScreen: 'home',
  idleReturnMinutes: 0,

  defaultSource: 'last',
  lastSource: 'spotify',
  autoResume: false,
  seekStep: 15,
  prevRestartsTrack: true,
  defaultShuffle: 'keep',
  defaultRepeat: 'keep',
  nowPlayingBg: 'art',
  artworkShape: 'rounded',
  showQueue: true,
  showLike: true,
  showProgress: true,
  volumeStep: 10,
  demoPlayer: false,
  spotifyAutoTransfer: true,
  spotifyDeviceName: '',
  spotifyPollSeconds: 2,
  ytAutoplayNext: true,
  ytLoopPlaylist: false,
  ytCaptions: false,
  ytWhileMoving: 'blocked',

  navApp: 'apple',
  avoidTolls: false,
  avoidHighways: false,
  navVoice: false,
  mapProvider: 'maplibre',
  mapStyle: 'auto',
  mapOrientation: 'north',
  autoZoom: true,
  showTraffic: false,
  speedUnit: 'kmh',
  distanceUnit: 'km',
  showSpeedWidget: true,
  speedAlert: 0,
  searchProvider: 'photon',
  regionBias: '',
  favorites: [],
  recents: [],
  recentsLimit: 12,
  autoHandoff: false,
  gpsMode: 'high',

  keepAwake: true,
  dimEnabled: false,
  dimLevel: 40,
  dimScheduleEnabled: false,
  dimStart: '21:00',
  dimEnd: '06:30',
  lockInput: true,
  lockSpeed: 8,
  passengerOverride: true,
  largeTargets: false,
  touchTarget: 64,
  simplified: false,
  tapSounds: false,
  haptics: false,

  googleMapsKey: '',
  mapkitToken: '',
  youtubeApiKey: '',
  spotifyClientId: '',
  googleClientId: '',

  onboardingDone: false,
};

/** Keys that hold credentials and are left out of exports unless the user opts in. */
export const SECRET_KEYS: (keyof Settings)[] = ['googleMapsKey', 'mapkitToken', 'youtubeApiKey'];

export const SETTINGS_VERSION = 1;
const STORAGE_KEY = 'dd.settings';

/**
 * Free-text settings that end up in CSS or are parsed as times/codes must have the right shape, otherwise a
 * hand-edited or malicious import could inject CSS (e.g. a remote wallpaper URL used for tracking).
 */
export const STRING_PATTERNS: Partial<Record<keyof Settings, RegExp>> = {
  accent: /^#[0-9a-fA-F]{6}$/,
  wallpaperImage: /^(data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+)?$/,
  dimStart: /^([01]\d|2[0-3]):[0-5]\d$/,
  dimEnd: /^([01]\d|2[0-3]):[0-5]\d$/,
  regionBias: /^([A-Za-z]{2})?$/,
};

/**
 * Keep only keys that exist in the defaults and have a compatible type / allowed value.
 * Used for imports and for migrating stored data, so a hand-edited or old file can never poison the store.
 */
export function sanitizeSettings(input: unknown): Partial<Settings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!(key in src)) continue;
    const value = src[key];
    const def = DEFAULT_SETTINGS[key];
    if (Array.isArray(def)) {
      if (Array.isArray(value)) out[key] = value;
    } else if (typeof def === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    } else if (typeof def === 'boolean') {
      if (typeof value === 'boolean') out[key] = value;
    } else if (typeof def === 'string') {
      if (typeof value !== 'string') continue;
      const allowed = (OPTIONS as Record<string, readonly string[]>)[key];
      if (allowed && !allowed.includes(value)) continue;
      const pattern = STRING_PATTERNS[key];
      if (pattern && !pattern.test(value)) continue;
      out[key] = value;
    }
  }
  return out as Partial<Settings>;
}

interface SettingsActions {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  patch: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export type SettingsStore = Settings & SettingsActions;

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      patch: (patch) => set(patch),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: STORAGE_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(DEFAULT_SETTINGS))
          out[key] = (state as unknown as Record<string, unknown>)[key];
        return out as unknown as SettingsStore;
      },
      migrate: (persisted) => ({ ...DEFAULT_SETTINGS, ...sanitizeSettings(persisted) }) as SettingsStore,
    },
  ),
);

export function getSettings(): Settings {
  return useSettings.getState();
}

export interface SettingsExport {
  app: 'drivedeck';
  version: number;
  exportedAt: string;
  settings: Partial<Settings>;
}

export function exportSettings(includeSecrets = false): string {
  const state = useSettings.getState();
  const settings: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!includeSecrets && SECRET_KEYS.includes(key)) continue;
    settings[key] = state[key];
  }
  const payload: SettingsExport = {
    app: 'drivedeck',
    version: SETTINGS_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings as Partial<Settings>,
  };
  return JSON.stringify(payload, null, 2);
}

/** Returns the number of settings applied, throws on files that are clearly not a DriveDeck export. */
export function importSettings(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }
  const obj = parsed as Partial<SettingsExport> | null;
  if (!obj || obj.app !== 'drivedeck' || typeof obj.settings !== 'object') {
    throw new Error('Not a DriveDeck settings file');
  }
  const clean = sanitizeSettings(obj.settings);
  useSettings.getState().patch(clean);
  return Object.keys(clean).length;
}
