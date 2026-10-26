import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration, formatSpeed, haversine, kmhToUnit, unitToKmh } from './units';
import { isNight, sunTimes } from './sun';
import { computeVars, contrastOn, inTimeWindow, resolveTheme, touchTargetPx } from './theme';
import { DEFAULT_SETTINGS } from './settings';
import { moveItem, paginate, resolveHomeApps } from './apps';
import { RELEASE_DELAY_MS, evaluateMoving } from './driving';
import { formatClock } from '../ui/hooks/useClock';
import { gridCapacity } from '../ui/screens/Home';

describe('units', () => {
  it('converts speed both ways', () => {
    expect(formatSpeed(100, 'kmh')).toBe('100');
    expect(formatSpeed(100, 'mph')).toBe('62');
    expect(unitToKmh(kmhToUnit(87, 'mph'), 'mph')).toBeCloseTo(87);
    expect(formatSpeed(-3, 'kmh')).toBe('0');
  });
  it('formats distances', () => {
    expect(formatDistance(450, 'km')).toBe('450 m');
    expect(formatDistance(3200, 'km')).toBe('3.2 km');
    expect(formatDistance(42_000, 'km')).toBe('42 km');
    expect(formatDistance(16_500, 'mi')).toBe('10 mi');
    expect(formatDistance(4_000, 'mi')).toBe('2.5 mi');
    expect(formatDistance(Number.NaN, 'km')).toBe('-');
  });
  it('haversine: Istanbul to Ankara is ~350 km', () => {
    const d = haversine(41.0082, 28.9784, 39.9334, 32.8597) / 1000;
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(360);
  });
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(74_000)).toBe('1:14');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });
});

describe('sun', () => {
  it('Istanbul midsummer day is long, midwinter short', () => {
    const summer = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 41, 29);
    const winter = sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), 41, 29);
    const len = (t: ReturnType<typeof sunTimes>) => (t.sunset!.getTime() - t.sunrise!.getTime()) / 3600000;
    expect(len(summer)).toBeGreaterThan(14.5);
    expect(len(summer)).toBeLessThan(15.5);
    expect(len(winter)).toBeGreaterThan(9);
    expect(len(winter)).toBeLessThan(10);
  });
  it('isNight follows the sun', () => {
    const pos = { lat: 41, lng: 29 };
    expect(isNight(new Date(Date.UTC(2026, 5, 21, 9, 0)), pos)).toBe(false); // noon local
    expect(isNight(new Date(Date.UTC(2026, 5, 21, 23, 30)), pos)).toBe(true); // ~02:30 local
  });
  it('polar night / day', () => {
    expect(sunTimes(new Date(Date.UTC(2026, 11, 21)), 80, 0).alwaysDown).toBe(true);
    expect(sunTimes(new Date(Date.UTC(2026, 5, 21)), 80, 0).alwaysUp).toBe(true);
  });
  it('falls back to a fixed window without a position', () => {
    const noon = new Date(2026, 0, 1, 12, 0);
    const late = new Date(2026, 0, 1, 23, 0);
    expect(isNight(noon, null)).toBe(false);
    expect(isNight(late, null)).toBe(true);
  });
});

describe('theme', () => {
  const ctx = { systemDark: false, now: new Date(), pos: null };
  it('resolves explicit and system themes', () => {
    expect(resolveTheme('dark', ctx)).toBe('dark');
    expect(resolveTheme('light', ctx)).toBe('light');
    expect(resolveTheme('system', { ...ctx, systemDark: true })).toBe('dark');
  });
  it('picks readable text colour on accents', () => {
    expect(contrastOn('#ffffff')).toBe('#000000');
    expect(contrastOn('#0b0d12')).toBe('#ffffff');
    expect(contrastOn('#ffc83d')).toBe('#000000');
  });
  it('clamps touch targets to 64..96 and enforces large mode', () => {
    expect(touchTargetPx({ touchTarget: 40, largeTargets: false })).toBe(64);
    expect(touchTargetPx({ touchTarget: 200, largeTargets: false })).toBe(96);
    expect(touchTargetPx({ touchTarget: 64, largeTargets: true })).toBe(88);
  });
  it('writes design tokens from settings', () => {
    const vars = computeVars(
      { ...DEFAULT_SETTINGS, uiScale: 120, animationSpeed: 'off', cornerRadius: 10 },
      'dark',
    );
    expect(vars['--scale']).toBe('1.2');
    expect(vars['--dur']).toBe('0ms');
    expect(vars['--radius']).toBe('10px');
    expect(vars['--wallpaper-base']).toContain('gradient');
  });
  it('time windows can cross midnight', () => {
    expect(inTimeWindow(new Date(2026, 0, 1, 23, 0), '21:00', '06:30')).toBe(true);
    expect(inTimeWindow(new Date(2026, 0, 1, 3, 0), '21:00', '06:30')).toBe(true);
    expect(inTimeWindow(new Date(2026, 0, 1, 12, 0), '21:00', '06:30')).toBe(false);
    expect(inTimeWindow(new Date(2026, 0, 1, 12, 0), '08:00', '08:00')).toBe(false);
  });
});

describe('home apps', () => {
  it('resolves order, hidden items and appends new shortcuts', () => {
    const sc = [{ id: 'a1', name: 'Mom', icon: 'phone', url: 'tel:123' }];
    const apps = resolveHomeApps(['maps', 'settings', 'bogus'], ['settings'], sc);
    expect(apps.map((a) => a.id)).toContain('maps');
    expect(apps.map((a) => a.id)).not.toContain('settings');
    expect(apps.map((a) => a.id)).not.toContain('bogus');
    expect(apps.at(-1)!.id).toBe('sc:a1');
    expect(
      resolveHomeApps(['maps'], ['maps'], [], { includeHidden: true }).some((a) => a.id === 'maps'),
    ).toBe(true);
  });
  it('paginates and reorders', () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([], 4)).toEqual([[]]);
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2], 5, 0)).toEqual([1, 2]);
  });
  it('computes grid capacity from the measured area', () => {
    const portrait = gridCapacity(374, 560, { iconSize: 72, labels: true, columns: 'auto' });
    expect(portrait.cols).toBe(3);
    expect(portrait.rows).toBeGreaterThanOrEqual(4);
    expect(gridCapacity(700, 300, { iconSize: 72, labels: true, columns: '4' }).cols).toBe(4);
  });
});

describe('driving lock hysteresis', () => {
  const mk = (over: Partial<Parameters<typeof evaluateMoving>[0]>) => ({
    wasMoving: false,
    belowSince: null,
    speedKmh: 0,
    threshold: 8,
    now: 10_000,
    ...over,
  });
  it('locks immediately above the threshold', () => {
    expect(evaluateMoving(mk({ speedKmh: 20 }))).toEqual({ moving: true, belowSince: null });
  });
  it('holds the lock until speed stays low for the release delay', () => {
    const first = evaluateMoving(mk({ wasMoving: true, speedKmh: 2 }));
    expect(first).toEqual({ moving: true, belowSince: 10_000 });
    const later = evaluateMoving(
      mk({ wasMoving: true, speedKmh: 2, belowSince: 10_000, now: 10_000 + RELEASE_DELAY_MS }),
    );
    expect(later.moving).toBe(false);
  });
  it('resets the release timer when speed picks up again', () => {
    expect(evaluateMoving(mk({ wasMoving: true, speedKmh: 30, belowSince: 5_000 })).belowSince).toBeNull();
  });
});

describe('clock', () => {
  it('formats 24h and 12h', () => {
    const d = new Date(2026, 0, 1, 15, 7, 9);
    expect(formatClock(d, { hour12: false, seconds: false })).toEqual({ time: '15:07', suffix: '' });
    expect(formatClock(d, { hour12: true, seconds: true })).toEqual({ time: '3:07:09', suffix: 'PM' });
    expect(formatClock(new Date(2026, 0, 1, 0, 5), { hour12: true, seconds: false })).toEqual({
      time: '12:05',
      suffix: 'AM',
    });
  });
});
