import { describe, expect, it } from 'vitest';
import type { Features } from './features';
import { DEFAULT_SETTINGS, OPTIONS, type Settings } from './settings';
import {
  ALL_ITEMS,
  CUSTOM_EDITOR_KEYS,
  INTERNAL_KEYS,
  SECTIONS,
  isItemVisible,
  searchSettings,
  settingsEnglish,
  type SettingItem,
} from './settingsSchema';
import { validateShortcutUrl } from './shortcuts';
import { fitWithin } from './image';
import { formatSettingValue } from '../ui/settings/controls';

const allFeatures: Features = {
  wakeLock: true,
  vibration: true,
  battery: false,
  fullscreen: false,
  mediaSession: true,
  geolocation: true,
  serviceWorker: true,
  orientationLock: false,
  notifications: false,
  standalone: true,
  ios: true,
};

describe('settings schema integrity', () => {
  it('has unique item ids', () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every keyed item points at a real setting of the matching type', () => {
    for (const item of ALL_ITEMS.filter((i) => i.key)) {
      const def = DEFAULT_SETTINGS[item.key!];
      expect(def, item.id).not.toBeUndefined();
      if (item.type === 'toggle') expect(typeof def, item.id).toBe('boolean');
      if (item.type === 'slider') expect(typeof def, item.id).toBe('number');
      if (['select', 'text', 'secret', 'time'].includes(item.type))
        expect(typeof def, item.id).toBe('string');
    }
  });

  it('select options match the allowed values exactly', () => {
    for (const item of ALL_ITEMS.filter((i) => i.type === 'select')) {
      const allowed = (OPTIONS as Record<string, readonly string[]>)[item.key!];
      expect(allowed, item.id).toBeDefined();
      expect(
        item.options!.map((o) => o.value),
        item.id,
      ).toEqual([...allowed!]);
    }
  });

  it('slider defaults sit inside their range and on a step', () => {
    for (const item of ALL_ITEMS.filter((i) => i.type === 'slider')) {
      const v = DEFAULT_SETTINGS[item.key!] as number;
      expect(v, item.id).toBeGreaterThanOrEqual(item.min!);
      expect(v, item.id).toBeLessThanOrEqual(item.max!);
      expect((v - item.min!) % item.step!, item.id).toBe(0);
    }
  });

  it('every setting is reachable from the menu (or is internal state)', () => {
    const covered = new Set<string>([
      ...ALL_ITEMS.flatMap((i) => (i.key ? [i.key] : [])),
      ...ALL_ITEMS.flatMap((i) => (i.custom ? CUSTOM_EDITOR_KEYS[i.custom] : [])),
      ...INTERNAL_KEYS,
    ]);
    const missing = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).filter((k) => !covered.has(k));
    expect(missing).toEqual([]);
  });

  it('covers every area the product brief lists', () => {
    const ids = new Set(ALL_ITEMS.map((i) => i.id));
    for (const needed of [
      'theme',
      'custom_accent',
      'custom_wallpaper',
      'iconShape',
      'iconSize',
      'showLabels',
      'gridColumns',
      'uiScale',
      'fontWeight',
      'textScale',
      'cornerRadius',
      'glassBlur',
      'animationSpeed',
      'pageTransition',
      'clockFormat',
      'clockSeconds',
      'showDate',
      'railPosition',
      'railWidth',
      'custom_dock',
      'orientationPref',
      'custom_widgets',
      'dashboardSplit',
      'custom_homePages',
      'custom_shortcuts',
      'startScreen',
      'idleReturnMinutes',
      'defaultSource',
      'autoResume',
      'seekStep',
      'prevRestartsTrack',
      'defaultShuffle',
      'defaultRepeat',
      'nowPlayingBg',
      'artworkShape',
      'showQueue',
      'showLike',
      'showProgress',
      'volumeStep',
      'spotifyAutoTransfer',
      'spotifyDeviceName',
      'spotifyPollSeconds',
      'ytAutoplayNext',
      'ytLoopPlaylist',
      'ytCaptions',
      'ytWhileMoving',
      'navApp',
      'mapProvider',
      'mapStyle',
      'mapOrientation',
      'autoZoom',
      'showTraffic',
      'speedUnit',
      'distanceUnit',
      'showSpeedWidget',
      'speedAlert',
      'searchProvider',
      'regionBias',
      'custom_favorites',
      'recentsLimit',
      'custom_clearRecents',
      'autoHandoff',
      'gpsMode',
      'keepAwake',
      'dimEnabled',
      'dimLevel',
      'dimScheduleEnabled',
      'lockInput',
      'lockSpeed',
      'passengerOverride',
      'largeTargets',
      'simplified',
      'tapSounds',
      'haptics',
      'custom_accounts',
      'googleMapsKey',
      'mapkitToken',
      'custom_data',
      'custom_about',
    ]) {
      expect(ids.has(needed), needed).toBe(true);
    }
  });
});

describe('visibility', () => {
  const item = (id: string) => ALL_ITEMS.find((i) => i.id === id)!;
  it('hides settings the browser cannot support', () => {
    expect(isItemVisible(item('haptics'), DEFAULT_SETTINGS, allFeatures)).toBe(true);
    expect(isItemVisible(item('haptics'), DEFAULT_SETTINGS, { ...allFeatures, vibration: false })).toBe(
      false,
    );
    expect(isItemVisible(item('keepAwake'), DEFAULT_SETTINGS, { ...allFeatures, wakeLock: false })).toBe(
      false,
    );
  });
  it('hides dependent settings until their parent is on', () => {
    expect(isItemVisible(item('dimLevel'), DEFAULT_SETTINGS, allFeatures)).toBe(false);
    expect(isItemVisible(item('dimLevel'), { ...DEFAULT_SETTINGS, dimEnabled: true }, allFeatures)).toBe(
      true,
    );
    expect(
      isItemVisible(item('railWidth'), { ...DEFAULT_SETTINGS, railPosition: 'bottom' }, allFeatures),
    ).toBe(false);
    expect(
      isItemVisible(
        item('dashboardSplit'),
        { ...DEFAULT_SETTINGS, dashboardWidgets: ['clock'] },
        allFeatures,
      ),
    ).toBe(false);
  });
});

describe('English strings and search', () => {
  const en = settingsEnglish() as {
    sections: Record<string, { title: string }>;
    items: Record<string, { label: string; opt?: Record<string, string> }>;
  };
  it('has a label for every item, section and option', () => {
    for (const s of SECTIONS) expect(en.sections[s.id]?.title, s.id).toBeTruthy();
    for (const i of ALL_ITEMS) {
      expect(en.items[i.id]?.label, i.id).toBeTruthy();
      for (const o of i.options ?? [])
        expect(en.items[i.id]?.opt?.[o.value], `${i.id}.${o.value}`).toBeTruthy();
    }
  });

  const text = (i: SettingItem) => ({ label: en.items[i.id]!.label, hint: i.hint ?? '' });
  const sectionTitle = (s: (typeof SECTIONS)[number]) => s.title;
  const all = () => true;
  it('finds settings by label, hint, keyword and section', () => {
    expect(searchSettings('speed alert', text, sectionTitle, all).map((h) => h.item.id)).toContain(
      'speedAlert',
    );
    expect(searchSettings('colour', text, sectionTitle, all).map((h) => h.item.id)).toContain(
      'custom_accent',
    );
    expect(searchSettings('passenger', text, sectionTitle, all).length).toBeGreaterThan(0);
    expect(searchSettings('spotify', text, sectionTitle, all).length).toBeGreaterThan(3);
    expect(searchSettings('driving', text, sectionTitle, all).length).toBeGreaterThan(5);
    expect(searchSettings('zzzzqq', text, sectionTitle, all)).toEqual([]);
    expect(searchSettings('   ', text, sectionTitle, all)).toEqual([]);
  });
  it('requires every term and skips invisible items', () => {
    expect(searchSettings('speed zzzz', text, sectionTitle, all)).toEqual([]);
    expect(searchSettings('haptic', text, sectionTitle, (i) => i.id !== 'haptics')).toEqual([]);
  });
});

describe('value formatting', () => {
  it('formats in the user-facing unit', () => {
    expect(formatSettingValue('px', 22, { speedUnit: 'kmh' })).toBe('22 px');
    expect(formatSettingValue('speed', 100, { speedUnit: 'kmh' })).toBe('100 km/h');
    expect(formatSettingValue('speed', 100, { speedUnit: 'mph' })).toBe('62 mph');
    expect(formatSettingValue('speed', 0, { speedUnit: 'mph' })).toBe('Off');
    expect(formatSettingValue('offAtZero', 0, { speedUnit: 'kmh' })).toBe('Off');
    expect(formatSettingValue('offAtZero', 5, { speedUnit: 'kmh' })).toBe('5 min');
    expect(formatSettingValue('weight', 600, { speedUnit: 'kmh' })).toBe('Semibold');
  });
});

describe('shortcut URLs', () => {
  it('accepts web links, bare domains and app schemes', () => {
    expect(validateShortcutUrl('https://example.com/a')).toEqual({ ok: true, url: 'https://example.com/a' });
    expect(validateShortcutUrl('example.com')).toEqual({ ok: true, url: 'https://example.com' });
    expect(validateShortcutUrl('tel:+905551234567')).toEqual({ ok: true, url: 'tel:+905551234567' });
    expect(validateShortcutUrl('sms:+905551234567')).toMatchObject({ ok: true });
    expect(validateShortcutUrl('waze://?q=cafe')).toMatchObject({ ok: true });
    expect(validateShortcutUrl('localhost:3000/x')).toMatchObject({ ok: true });
  });
  it('rejects script/data/file schemes, empty and nonsense input', () => {
    expect(validateShortcutUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'blocked' });
    expect(validateShortcutUrl('JaVaScRiPt:alert(1)')).toEqual({ ok: false, reason: 'blocked' });
    expect(validateShortcutUrl('data:text/html,hi')).toEqual({ ok: false, reason: 'blocked' });
    expect(validateShortcutUrl('file:///etc/passwd')).toEqual({ ok: false, reason: 'blocked' });
    expect(validateShortcutUrl('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateShortcutUrl('hello')).toEqual({ ok: false, reason: 'invalid' });
    expect(validateShortcutUrl('tel:')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('image helpers', () => {
  it('scales down, never up, and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1, 5000, 1600)).toEqual({ width: 1, height: 1600 });
  });
});
