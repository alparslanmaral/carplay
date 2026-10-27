import { ENGINE_LABELS, EXHAUST_LABELS, POP_TRIGGER_LABELS, TURBO_LABELS } from '../services/sport/profiles';
import type { Features } from './features';
import { OPTIONS, type Settings } from './settings';

/**
 * Declarative description of the whole settings menu. The menu, the search index and the English strings
 * (registered into i18next under `set.*`) are all generated from this, so adding a language only needs the same
 * keys translated and adding a setting means adding one entry here.
 */

export type ItemType = 'toggle' | 'select' | 'slider' | 'text' | 'secret' | 'time' | 'custom';

/** Named value formatters, resolved in the UI (some depend on the speed unit). */
export type Format =
  'px' | 'percent' | 'seconds' | 'minutes' | 'speed' | 'weight' | 'percentPoints' | 'offAtZero' | 'count';

export type CustomEditor =
  | 'accent'
  | 'wallpaper'
  | 'dock'
  | 'widgets'
  | 'homePages'
  | 'shortcuts'
  | 'favorites'
  | 'clearRecents'
  | 'accounts'
  | 'data'
  | 'about';

/** Settings keys each custom editor reads/writes (used to prove every setting is reachable from the menu). */
export const CUSTOM_EDITOR_KEYS: Record<CustomEditor, (keyof Settings)[]> = {
  accent: ['accent'],
  wallpaper: ['wallpaperKind', 'wallpaperGradient', 'wallpaperImage', 'wallpaperDim', 'wallpaperBlur'],
  dock: ['dockItems'],
  widgets: ['dashboardWidgets'],
  homePages: ['homeOrder', 'homeHidden'],
  shortcuts: ['shortcuts'],
  favorites: ['favorites'],
  clearRecents: ['recents'],
  accounts: [],
  data: [],
  about: [],
};

/** Keys that are internal state, not preferences: set by the app itself, intentionally not in the menu. */
export const INTERNAL_KEYS: (keyof Settings)[] = ['lastSource', 'onboardingDone'];

export interface SettingItem {
  /** unique id, also the i18n key */
  id: string;
  type: ItemType;
  key?: keyof Settings;
  label: string;
  hint?: string;
  /** extra search terms */
  keywords?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  format?: Format;
  placeholder?: string;
  custom?: CustomEditor;
  /** Hidden when the browser lacks this capability (iOS has no Vibration API, for example). */
  requires?: keyof Features;
  visibleIf?: (s: Settings) => boolean;
}

export interface SettingSection {
  id: string;
  icon: string;
  title: string;
  items: SettingItem[];
}

const opts = <K extends keyof typeof OPTIONS>(key: K, labels: Record<(typeof OPTIONS)[K][number], string>) =>
  (OPTIONS[key] as readonly string[]).map((value) => ({
    value,
    label: (labels as Record<string, string>)[value]!,
  }));

const toggle = (
  key: keyof Settings,
  label: string,
  hint?: string,
  extra: Partial<SettingItem> = {},
): SettingItem => ({
  id: key,
  type: 'toggle',
  key,
  label,
  hint,
  ...extra,
});
const select = (
  key: keyof Settings,
  label: string,
  options: SettingItem['options'],
  hint?: string,
  extra: Partial<SettingItem> = {},
): SettingItem => ({ id: key, type: 'select', key, label, hint, options, ...extra });
const slider = (
  key: keyof Settings,
  label: string,
  min: number,
  max: number,
  step: number,
  format: Format,
  hint?: string,
  extra: Partial<SettingItem> = {},
): SettingItem => ({ id: key, type: 'slider', key, label, hint, min, max, step, format, ...extra });
const text = (
  key: keyof Settings,
  label: string,
  hint?: string,
  extra: Partial<SettingItem> = {},
): SettingItem => ({
  id: key,
  type: 'text',
  key,
  label,
  hint,
  ...extra,
});
const secret = (key: keyof Settings, label: string, hint?: string): SettingItem => ({
  id: key,
  type: 'secret',
  key,
  label,
  hint,
});
const custom = (
  id: CustomEditor,
  label: string,
  hint?: string,
  extra: Partial<SettingItem> = {},
): SettingItem => ({
  id: `custom_${id}`,
  type: 'custom',
  custom: id,
  label,
  hint,
  ...extra,
});

export const SECTIONS: SettingSection[] = [
  {
    id: 'appearance',
    icon: 'palette',
    title: 'Appearance',
    items: [
      select(
        'theme',
        'Theme',
        opts('theme', { dark: 'Dark', light: 'Light', sunset: 'Auto by sunset', system: 'Follow system' }),
        'Sunset mode uses your last GPS position to switch at sunrise and sunset.',
        { keywords: 'dark mode light night day' },
      ),
      custom('accent', 'Accent color', 'Buttons, highlights and the map marker.', {
        keywords: 'colour color',
      }),
      custom('wallpaper', 'Wallpaper', 'Solid, gradient, blurred album art or your own image.', {
        keywords: 'background image gradient blur dim',
      }),
      select(
        'iconShape',
        'Icon shape',
        opts('iconShape', { squircle: 'Squircle', circle: 'Circle', rounded: 'Rounded square' }),
      ),
      slider('iconSize', 'Icon size', 48, 110, 4, 'px'),
      toggle('showLabels', 'Show icon labels'),
      select(
        'gridColumns',
        'Home grid columns',
        opts('gridColumns', { auto: 'Auto', '3': '3', '4': '4', '5': '5', '6': '6' }),
        'Auto fits as many as the screen allows.',
      ),
      slider('uiScale', 'UI scale', 80, 140, 5, 'percent', 'Scales every size in the app.'),
      slider('fontWeight', 'Font weight', 400, 700, 100, 'weight'),
      slider('textScale', 'Text size', 85, 135, 5, 'percent'),
      slider('cornerRadius', 'Corner radius', 0, 36, 2, 'px'),
      slider(
        'glassBlur',
        'Glass blur',
        0,
        48,
        4,
        'px',
        'Strength of the frosted panels. Lower is lighter on older iPhones.',
      ),
      select(
        'animationSpeed',
        'Animation speed',
        opts('animationSpeed', { off: 'Off', fast: 'Fast', normal: 'Normal', slow: 'Slow' }),
        'The iOS "Reduce Motion" setting always wins.',
      ),
      select(
        'pageTransition',
        'Page transition',
        opts('pageTransition', { slide: 'Slide', fade: 'Fade', zoom: 'Zoom', none: 'None' }),
      ),
      select('clockFormat', 'Clock format', opts('clockFormat', { '24': '24-hour', '12': '12-hour' })),
      toggle('clockSeconds', 'Show seconds'),
      toggle('showDate', 'Show date in the side rail'),
      select(
        'railPosition',
        'Rail position',
        opts('railPosition', { left: 'Left', right: 'Right', bottom: 'Bottom' }),
        'Where the side rail sits in landscape. Portrait always uses a bottom dock.',
        {
          keywords: 'dock side bar',
        },
      ),
      slider('railWidth', 'Rail width', 88, 168, 8, 'px', undefined, {
        visibleIf: (s) => s.railPosition !== 'bottom',
      }),
      custom('dock', 'Dock items', 'Apps pinned next to the Home button.', {
        keywords: 'pinned shortcuts rail',
      }),
    ],
  },
  {
    id: 'layout',
    icon: 'layout',
    title: 'Layout',
    items: [
      select(
        'orientationPref',
        'Orientation preference',
        opts('orientationPref', { auto: 'Auto', landscape: 'Landscape layout', portrait: 'Portrait layout' }),
        'Chooses the layout, not the screen rotation: iOS web apps cannot lock orientation.',
      ),
      custom('widgets', 'Dashboard widgets', 'Choose and order what the dashboard shows.', {
        keywords: 'widget picker order',
      }),
      slider(
        'dashboardSplit',
        'Dashboard split',
        30,
        70,
        5,
        'percentPoints',
        'Width of the map card in landscape.',
        {
          visibleIf: (s) => s.dashboardWidgets.includes('map'),
        },
      ),
      custom(
        'homePages',
        'Home pages',
        'Reorder apps and hide the ones you do not need. Pages fill automatically.',
        { keywords: 'apps icons order hide pages' },
      ),
      custom(
        'shortcuts',
        'Custom shortcuts',
        'Add tiles for any web link or URL scheme (tel:, sms:, waze://).',
        { keywords: 'url link phone call' },
      ),
      select(
        'startScreen',
        'Start screen',
        opts('startScreen', { home: 'Home', dashboard: 'Dashboard', last: 'Last used' }),
      ),
      slider(
        'idleReturnMinutes',
        'Return to Home after',
        0,
        30,
        1,
        'offAtZero',
        'Goes back to Home after this many idle minutes. 0 turns it off.',
        { keywords: 'idle timeout auto return' },
      ),
    ],
  },
  {
    id: 'media',
    icon: 'music',
    title: 'Media',
    items: [
      select(
        'defaultSource',
        'Default source',
        opts('defaultSource', { spotify: 'Spotify', youtube: 'YouTube', last: 'Last used' }),
      ),
      toggle(
        'demoPlayer',
        'Demo player',
        'A silent stand-in so you can try Now Playing without any account.',
      ),
      toggle(
        'autoResume',
        'Auto-resume on launch',
        'Resumes Spotify when the app opens and playback is paused.',
      ),
      slider(
        'seekStep',
        'Seek step',
        5,
        60,
        5,
        'seconds',
        'Used by the skip buttons and the steering-wheel seek keys.',
      ),
      toggle(
        'prevRestartsTrack',
        'Previous restarts the track',
        'Restarts the song if more than 3 seconds in, otherwise goes back.',
      ),
      select(
        'defaultShuffle',
        'Shuffle default',
        opts('defaultShuffle', { keep: 'Keep as is', on: 'Always on', off: 'Always off' }),
      ),
      select(
        'defaultRepeat',
        'Repeat default',
        opts('defaultRepeat', { keep: 'Keep as is', off: 'Off', context: 'All', track: 'One track' }),
      ),
      select(
        'nowPlayingBg',
        'Now Playing background',
        opts('nowPlayingBg', { art: 'Blurred art', solid: 'Solid', gradient: 'Art color' }),
      ),
      select(
        'artworkShape',
        'Artwork shape',
        opts('artworkShape', { rounded: 'Rounded', square: 'Square', vinyl: 'Vinyl' }),
        'Vinyl is not applied to Spotify artwork (Spotify design guidelines).',
      ),
      toggle('showQueue', 'Show up-next queue'),
      toggle('showLike', 'Show like button'),
      toggle('showProgress', 'Show progress bar'),
      slider('volumeStep', 'Volume step', 2, 25, 1, 'percentPoints'),
      toggle(
        'spotifyAutoTransfer',
        'Spotify: auto-transfer playback',
        'Moves playback to this iPhone when the Spotify app is open but idle.',
      ),
      text(
        'spotifyDeviceName',
        'Spotify: preferred device name',
        'Leave empty to use the active device or this iPhone.',
        { placeholder: 'e.g. iPhone' },
      ),
      slider(
        'spotifyPollSeconds',
        'Spotify: refresh interval',
        1,
        5,
        1,
        'seconds',
        'How often DriveDeck asks Spotify what is playing. Pauses while the app is hidden.',
      ),
      toggle('ytAutoplayNext', 'YouTube: autoplay next'),
      toggle('ytLoopPlaylist', 'YouTube: loop playlist'),
      toggle('ytCaptions', 'YouTube: captions', 'Takes effect the next time a video starts.'),
      select(
        'ytWhileMoving',
        'YouTube while moving',
        opts('ytWhileMoving', { blocked: 'Blocked', allowed: 'Allowed' }),
        'Blocked pauses video above the driving-lock speed and shows a "Parked-only" screen.',
      ),
    ],
  },
  {
    id: 'maps',
    icon: 'map',
    title: 'Maps',
    items: [
      select(
        'navApp',
        'Navigation app',
        opts('navApp', {
          drivedeck: 'DriveDeck (open source)',
          apple: 'Apple Maps',
          google: 'Google Maps',
          waze: 'Waze',
          ask: 'Ask every time',
        }),
        'DriveDeck draws the route and guides you inside the app (OpenStreetMap data). The other apps take over the screen.',
      ),
      toggle(
        'avoidTolls',
        'Avoid toll roads',
        'Used by DriveDeck routes and Google Maps. Waze and Apple Maps have their own toggle in their settings.',
        { keywords: 'toll motorway highway otoyol ucretli' },
      ),
      toggle('avoidHighways', 'Avoid motorways', 'Used by DriveDeck routes and Google Maps.', {
        keywords: 'highway freeway',
      }),
      toggle(
        'navVoice',
        'Voice guidance (DriveDeck)',
        'Speaks turns aloud with the iPhone voice. It can briefly pause music from the Spotify app.',
        { keywords: 'speech spoken sound' },
      ),
      toggle(
        'autoHandoff',
        'Hand off right after choosing',
        'Skips the destination sheet and opens the navigation app immediately.',
      ),
      select(
        'mapProvider',
        'Map provider',
        opts('mapProvider', { maplibre: 'OpenStreetMap', google: 'Google Maps', mapkit: 'Apple MapKit' }),
        'Google and MapKit need a key or token under Accounts and data. Falls back to OpenStreetMap if unavailable.',
      ),
      select(
        'mapStyle',
        'Map style',
        opts('mapStyle', { auto: 'Auto', light: 'Light', dark: 'Dark', satellite: 'Satellite' }),
      ),
      select(
        'mapOrientation',
        'Map orientation',
        opts('mapOrientation', { north: 'North up', heading: 'Heading up' }),
      ),
      toggle('autoZoom', 'Auto-zoom by speed'),
      toggle('showTraffic', 'Traffic layer', 'Only available with Google Maps or Apple MapKit.'),
      select('speedUnit', 'Speed unit', opts('speedUnit', { kmh: 'km/h', mph: 'mph' })),
      select('distanceUnit', 'Distance unit', opts('distanceUnit', { km: 'Kilometres', mi: 'Miles' })),
      toggle('showSpeedWidget', 'Show speed'),
      slider(
        'speedAlert',
        'Speed alert',
        0,
        200,
        5,
        'speed',
        'Turns the speed red above this value. 0 turns it off.',
      ),
      select(
        'searchProvider',
        'Search provider',
        opts('searchProvider', {
          photon: 'Photon (OpenStreetMap)',
          nominatim: 'Nominatim (OpenStreetMap)',
          google: 'Google Places',
        }),
        'Nominatim does not allow search-as-you-type, so it searches when you press Search. Google needs an API key.',
      ),
      text(
        'regionBias',
        'Search region',
        'Two-letter country code to prefer, e.g. TR or DE. Empty uses your position.',
        { placeholder: 'TR' },
      ),
      custom('favorites', 'Favorites', 'Home, Work and saved places.', {
        keywords: 'home work saved places',
      }),
      slider('recentsLimit', 'Recent destinations kept', 0, 30, 1, 'count'),
      custom('clearRecents', 'Clear recent destinations'),
      select(
        'gpsMode',
        'GPS accuracy',
        opts('gpsMode', { high: 'High', balanced: 'Balanced' }),
        'High uses more battery but follows you more closely.',
      ),
    ],
  },
  {
    id: 'sport',
    icon: 'engine',
    title: 'Sport mode',
    items: [
      toggle(
        'sportMode',
        'Sport mode',
        'Synthesised engine, turbo and exhaust sounds that follow your real speed and acceleration, through the iPhone or the car speakers. Works only while DriveDeck is open on screen.',
        { keywords: 'engine sound fake exhaust turbo motor' },
      ),
      toggle('sportEngineOn', 'Engine sound', 'The engine note that rises and falls with speed.', {
        keywords: 'motor rev rpm',
      }),
      select(
        'sportEngine',
        'Engine type',
        opts('sportEngine', ENGINE_LABELS),
        'Changes the number of cylinders, the character and the redline.',
        {
          visibleIf: (s) => s.sportEngineOn,
          keywords: 'v8 v12 v6 hellcat four cylinder boxer rotary diesel',
        },
      ),
      toggle(
        'sportTurboOn',
        'Turbo whistle and blow-off',
        'Whistle and inhale while accelerating, a blow-off hiss when you lift off.',
        { keywords: 'turbo whistle boost blow off bov flutter' },
      ),
      select('sportTurbo', 'Turbo type', opts('sportTurbo', TURBO_LABELS), undefined, {
        visibleIf: (s) => s.sportTurboOn,
        keywords: 'stutu flutter whoosh twin',
      }),
      toggle('sportExhaustOn', 'Exhaust pops', 'Crackles and bangs from the exhaust.', {
        keywords: 'popcorn exhaust crackle burble bang egzoz',
      }),
      select('sportExhaust', 'Exhaust style', opts('sportExhaust', EXHAUST_LABELS), undefined, {
        visibleIf: (s) => s.sportExhaustOn,
      }),
      select(
        'sportPopTrigger',
        'Pops happen',
        opts('sportPopTrigger', POP_TRIGGER_LABELS),
        'Hard acceleration is detected from the change in GPS speed. Gear changes at full throttle always bang.',
        { visibleIf: (s) => s.sportExhaustOn },
      ),
      slider('sportVolume', 'Sport volume', 0, 100, 5, 'percent', 'Master volume of all sport sounds.'),
      slider('sportEngineVolume', 'Engine volume', 0, 100, 5, 'percent', undefined, {
        visibleIf: (s) => s.sportEngineOn,
      }),
      slider('sportTurboVolume', 'Turbo volume', 0, 100, 5, 'percent', undefined, {
        visibleIf: (s) => s.sportTurboOn,
      }),
      slider('sportExhaustVolume', 'Exhaust volume', 0, 100, 5, 'percent', undefined, {
        visibleIf: (s) => s.sportExhaustOn,
      }),
      slider(
        'sportSensitivity',
        'Sensitivity',
        1,
        10,
        1,
        'count',
        'How easily acceleration counts as hard. Higher reacts to gentler pulls.',
      ),
      toggle('sportIdle', 'Idle sound when stopped', 'The engine keeps idling at traffic lights.'),
      toggle(
        'sportGearbox',
        'Simulated gearbox',
        'Revs rise and fall through gears. Off gives one smooth, continuous rev range.',
      ),
      toggle(
        'sportPreciseGps',
        'Maximum GPS precision',
        'While sport mode is on, asks for the freshest, most accurate position with no cached fixes. Uses more battery.',
        { keywords: 'gps accuracy precise' },
      ),
    ],
  },
  {
    id: 'driving',
    icon: 'car',
    title: 'Driving and safety',
    items: [
      toggle('keepAwake', 'Keep screen awake', 'Stops the iPhone from locking while DriveDeck is open.', {
        requires: 'wakeLock',
      }),
      toggle('dimEnabled', 'Night dim overlay', 'Darkens the screen below the iOS brightness limit.', {
        keywords: 'night brightness',
      }),
      slider('dimLevel', 'Dim level', 10, 85, 5, 'percent', undefined, { visibleIf: (s) => s.dimEnabled }),
      toggle('dimScheduleEnabled', 'Dim on a schedule', undefined, { visibleIf: (s) => s.dimEnabled }),
      {
        id: 'dimStart',
        type: 'time',
        key: 'dimStart',
        label: 'Dim from',
        visibleIf: (s) => s.dimEnabled && s.dimScheduleEnabled,
      },
      {
        id: 'dimEnd',
        type: 'time',
        key: 'dimEnd',
        label: 'Dim until',
        visibleIf: (s) => s.dimEnabled && s.dimScheduleEnabled,
      },
      toggle('lockInput', 'Lock typing while moving', 'Blocks the keyboard above the speed below.'),
      slider('lockSpeed', 'Lock speed', 3, 40, 1, 'speed', undefined, {
        visibleIf: (s) => s.lockInput || s.ytWhileMoving === 'blocked',
      }),
      toggle(
        'passengerOverride',
        'Passenger override',
        'Lets a passenger confirm they are not driving to unlock typing and YouTube.',
      ),
      toggle('largeTargets', 'Large touch targets', 'Makes every button at least 88 px.'),
      slider(
        'touchTarget',
        'Touch target size',
        64,
        96,
        4,
        'px',
        'Minimum size of buttons. Never below 64 px.',
      ),
      toggle(
        'simplified',
        'Simplified mode',
        'Home shows only Maps, Spotify, YouTube, Now Playing and Settings in big tiles.',
      ),
      toggle(
        'tapSounds',
        'Tap sounds',
        'Not used while Spotify is the active source, so it can keep the steering-wheel buttons.',
      ),
      toggle('haptics', 'Haptic feedback', undefined, { requires: 'vibration' }),
    ],
  },
  {
    id: 'accounts',
    icon: 'key',
    title: 'Accounts and data',
    items: [
      custom('accounts', 'Spotify and YouTube', 'Connect, disconnect and check token status.', {
        keywords: 'login sign in connect token spotify youtube google',
      }),
      secret(
        'googleMapsKey',
        'Google Maps API key',
        'Stored on this device only. Used for Google Maps and Google Places.',
      ),
      secret(
        'mapkitToken',
        'Apple MapKit JS token',
        'A signed JWT from your Apple developer account. Stored on this device only.',
      ),
      secret('youtubeApiKey', 'YouTube API key', 'Lets search and public playlists work without signing in.'),
      text(
        'spotifyClientId',
        'Spotify Client ID override',
        'Optional. Overrides the build-time VITE_SPOTIFY_CLIENT_ID.',
      ),
      text(
        'googleClientId',
        'Google Client ID override',
        'Optional. Overrides the build-time VITE_GOOGLE_CLIENT_ID.',
      ),
      custom(
        'data',
        'Backup, reset and caches',
        'Export or import settings, reset to defaults, clear cached data.',
        { keywords: 'export import json reset cache clear backup' },
      ),
    ],
  },
  {
    id: 'about',
    icon: 'info',
    title: 'About',
    items: [
      custom('about', 'About DriveDeck', 'Version, known limitations and diagnostics.', {
        keywords: 'version limitations diagnostics',
      }),
    ],
  },
];

export const ALL_ITEMS: SettingItem[] = SECTIONS.flatMap((s) => s.items);

/** Is the item shown given the current settings and browser capabilities? */
export function isItemVisible(item: SettingItem, settings: Settings, features: Features): boolean {
  if (item.requires && !features[item.requires]) return false;
  return item.visibleIf ? item.visibleIf(settings) : true;
}

/** The English resource tree registered into i18next under `set`. */
export function settingsEnglish(): Record<string, unknown> {
  const sections: Record<string, { title: string }> = {};
  const items: Record<string, { label: string; hint?: string; opt?: Record<string, string> }> = {};
  for (const section of SECTIONS) {
    sections[section.id] = { title: section.title };
    for (const item of section.items) {
      items[item.id] = {
        label: item.label,
        ...(item.hint ? { hint: item.hint } : {}),
        ...(item.options ? { opt: Object.fromEntries(item.options.map((o) => [o.value, o.label])) } : {}),
      };
    }
  }
  return { sections, items };
}

export interface SearchHit {
  section: SettingSection;
  item: SettingItem;
}

/**
 * Search across every section. `text` resolves translated strings so searching works in any language;
 * keywords stay English as extra synonyms.
 */
export function searchSettings(
  query: string,
  text: (item: SettingItem) => { label: string; hint: string },
  sectionTitle: (s: SettingSection) => string,
  visible: (item: SettingItem) => boolean,
): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const section of SECTIONS) {
    for (const item of section.items) {
      if (!visible(item)) continue;
      const { label, hint } = text(item);
      const haystack =
        `${label} ${hint} ${item.keywords ?? ''} ${sectionTitle(section)} ${item.key ?? ''}`.toLowerCase();
      if (terms.every((t) => haystack.includes(t))) hits.push({ section, item });
    }
  }
  return hits;
}
