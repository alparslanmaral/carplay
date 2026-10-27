import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  OPTIONS,
  exportSettings,
  importSettings,
  sanitizeSettings,
  useSettings,
} from './settings';

beforeEach(() => {
  useSettings.getState().reset();
});

describe('settings store', () => {
  it('starts from defaults and updates single keys', () => {
    expect(useSettings.getState().theme).toBe('dark');
    useSettings.getState().set('accent', '#ff5c5c');
    expect(useSettings.getState().accent).toBe('#ff5c5c');
  });

  it('persists to localStorage under dd.settings', () => {
    useSettings.getState().set('seekStep', 30);
    const raw = JSON.parse(localStorage.getItem('dd.settings')!);
    expect(raw.state.seekStep).toBe(30);
    expect(raw.state.set).toBeUndefined();
  });

  it('reset restores defaults', () => {
    useSettings.getState().patch({ uiScale: 130, railPosition: 'right' });
    useSettings.getState().reset();
    expect(useSettings.getState().uiScale).toBe(DEFAULT_SETTINGS.uiScale);
    expect(useSettings.getState().railPosition).toBe('left');
  });

  it('has a valid default for every enumerated setting', () => {
    for (const [key, allowed] of Object.entries(OPTIONS)) {
      const value = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
      if (value === undefined) continue; // option list without a setting of the same name (e.g. clockFormat)
      expect(allowed as readonly unknown[], key).toContain(value);
    }
  });
});

describe('sanitizeSettings', () => {
  it('drops unknown keys, wrong types and values outside the allowed set', () => {
    const clean = sanitizeSettings({
      theme: 'neon',
      accent: '#123456',
      uiScale: 'big',
      seekStep: 20,
      evil: true,
      showLabels: 'yes',
      dockItems: ['maps'],
    });
    expect(clean).toEqual({ accent: '#123456', seekStep: 20, dockItems: ['maps'] });
  });

  it('rejects strings that could inject CSS or break parsing', () => {
    const clean = sanitizeSettings({
      accent: 'red; background: url(https://evil.example/x)',
      wallpaperImage: 'https://evil.example/track.png',
      dimStart: '25:99',
      dimEnd: '06:30',
      regionBias: 'Turkey',
    });
    expect(clean).toEqual({ dimEnd: '06:30' });
    expect(sanitizeSettings({ accent: '#FFaa00', regionBias: 'tr', wallpaperImage: '' })).toEqual({
      accent: '#FFaa00',
      regionBias: 'tr',
      wallpaperImage: '',
    });
    expect(
      sanitizeSettings({ wallpaperImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }).wallpaperImage,
    ).toBeTruthy();
    expect(
      sanitizeSettings({ wallpaperImage: 'data:text/html;base64,PHNjcmlwdD4=' }).wallpaperImage,
    ).toBeUndefined();
  });

  it('rejects non-objects', () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings([1, 2])).toEqual({});
    expect(sanitizeSettings('x')).toEqual({});
  });
});

describe('export / import', () => {
  it('round-trips settings', () => {
    useSettings.getState().patch({ accent: '#abcdef', railPosition: 'bottom', seekStep: 45 });
    const json = exportSettings();
    useSettings.getState().reset();
    const n = importSettings(json);
    expect(n).toBeGreaterThan(10);
    expect(useSettings.getState().accent).toBe('#abcdef');
    expect(useSettings.getState().railPosition).toBe('bottom');
    expect(useSettings.getState().seekStep).toBe(45);
  });

  it('leaves API keys out unless asked', () => {
    useSettings.getState().set('googleMapsKey', 'SECRET');
    expect(exportSettings()).not.toContain('SECRET');
    expect(exportSettings(true)).toContain('SECRET');
  });

  it('rejects files that are not DriveDeck exports', () => {
    expect(() => importSettings('nope')).toThrow('Not valid JSON');
    expect(() => importSettings(JSON.stringify({ hello: 1 }))).toThrow('Not a DriveDeck');
  });

  it('ignores invalid values inside an otherwise valid file', () => {
    importSettings(
      JSON.stringify({ app: 'drivedeck', version: 1, settings: { theme: 'bogus', seekStep: 10 } }),
    );
    expect(useSettings.getState().theme).toBe('dark');
    expect(useSettings.getState().seekStep).toBe(10);
  });
});
