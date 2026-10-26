import { clamp } from './units';
import type { Settings } from './settings';
import { isNight } from './sun';
import { getLastKnownPosition } from './lastPos';

export type ResolvedTheme = 'dark' | 'light';

type Trio = [string, string, string];
interface GradientDef {
  id: string;
  dark: Trio;
  light: Trio;
}

/** 8 wallpaper gradients. Each is [glow 1, glow 2, base]. */
export const GRADIENTS: GradientDef[] = [
  { id: 'midnight', dark: ['#1c2b4d', '#2b1f4a', '#080a10'], light: ['#cfe0ff', '#e3d9ff', '#f3f5fb'] },
  { id: 'aurora', dark: ['#12494a', '#3b1d63', '#070b10'], light: ['#c4f1ec', '#e2d4ff', '#f2f8f8'] },
  { id: 'ember', dark: ['#5a2412', '#3d1230', '#0b0708'], light: ['#ffdcc7', '#ffd0e0', '#fbf5f2'] },
  { id: 'forest', dark: ['#15402a', '#10323d', '#070b09'], light: ['#d3f0dc', '#cfe8f0', '#f3f8f4'] },
  { id: 'ocean', dark: ['#0e3a63', '#0c5a63', '#06090e'], light: ['#cde6ff', '#c7f1f0', '#f1f6fb'] },
  { id: 'dusk', dark: ['#4b2260', '#63233f', '#0a070c'], light: ['#ead6ff', '#ffd3e2', '#f8f3fa'] },
  { id: 'graphite', dark: ['#2a2e36', '#1d2026', '#0a0b0d'], light: ['#e3e6ec', '#d5d9e0', '#f5f6f8'] },
  { id: 'sunrise', dark: ['#5d3a12', '#5a1f2c', '#0c0807'], light: ['#ffe8c2', '#ffd5cf', '#fbf6ef'] },
];

export function gradientCss(index: number, mode: ResolvedTheme): string {
  const g = GRADIENTS[clamp(Math.round(index), 0, GRADIENTS.length - 1)]!;
  const [a, b, base] = g[mode];
  return `radial-gradient(120% 90% at 0% 0%, ${a} 0%, transparent 62%), radial-gradient(110% 90% at 100% 100%, ${b} 0%, transparent 60%), ${base}`;
}

export const ANIMATION_MS: Record<Settings['animationSpeed'], number> = {
  off: 0,
  fast: 140,
  normal: 240,
  slow: 400,
};

export interface ThemeContext {
  systemDark: boolean;
  now: Date;
  pos: { lat: number; lng: number } | null;
}

export function resolveTheme(theme: Settings['theme'], ctx: ThemeContext): ResolvedTheme {
  switch (theme) {
    case 'dark':
      return 'dark';
    case 'light':
      return 'light';
    case 'system':
      return ctx.systemDark ? 'dark' : 'light';
    case 'sunset':
      return isNight(ctx.now, ctx.pos) ? 'dark' : 'light';
  }
}

/** Black or white, whichever reads better on the given #rrggbb colour. */
export function contrastOn(hex: string): '#000000' | '#ffffff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#000000' : '#ffffff';
}

export function touchTargetPx(s: Pick<Settings, 'touchTarget' | 'largeTargets'>): number {
  const base = clamp(s.touchTarget, 64, 96);
  return s.largeTargets ? Math.max(base, 88) : base;
}

/** The CSS custom properties derived from settings. Pure so it can be unit tested. */
export function computeVars(s: Settings, resolved: ResolvedTheme): Record<string, string> {
  const ms = ANIMATION_MS[s.animationSpeed];
  return {
    '--accent': s.accent,
    '--on-accent': contrastOn(s.accent),
    '--scale': String(clamp(s.uiScale, 80, 140) / 100),
    '--text-scale': String(clamp(s.textScale, 85, 135) / 100),
    '--font-weight': String(clamp(s.fontWeight, 400, 700)),
    '--radius': `${clamp(s.cornerRadius, 0, 36)}px`,
    '--blur': `${clamp(s.glassBlur, 0, 48)}px`,
    '--touch': `${touchTargetPx(s)}px`,
    '--icon-size': `${clamp(s.iconSize, 48, 120)}px`,
    '--rail-w': `${clamp(s.railWidth, 88, 168)}px`,
    '--dur': `${ms}ms`,
    '--wallpaper-dim': String(clamp(s.wallpaperDim, 0, 90) / 100),
    '--wallpaper-blur': `${clamp(s.wallpaperBlur, 0, 30)}px`,
    '--night-dim': s.dimEnabled ? String(clamp(s.dimLevel, 0, 85) / 100) : '0',
    '--wallpaper-base':
      s.wallpaperKind === 'gradient' || s.wallpaperKind === 'art'
        ? gradientCss(s.wallpaperGradient, resolved)
        : resolved === 'dark'
          ? '#0b0d12'
          : '#eef0f5',
  };
}

export function applyTheme(
  s: Settings,
  resolved: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = resolved;
  root.dataset.anim = s.animationSpeed;
  root.dataset.transition = s.pageTransition;
  root.dataset.iconShape = s.iconShape;
  root.dataset.simplified = s.simplified ? 'true' : 'false';
  root.style.colorScheme = resolved;
  for (const [k, v] of Object.entries(computeVars(s, resolved))) root.style.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', resolved === 'dark' ? '#0b0d12' : '#eef0f5');
}

export function currentThemeContext(): ThemeContext {
  return {
    systemDark: typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
    now: new Date(),
    pos: getLastKnownPosition(),
  };
}

/** Is `now` inside the HH:MM window (handles windows that cross midnight)? */
export function inTimeWindow(now: Date, start: string, end: string): boolean {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(start);
  const b = toMin(end);
  if (a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}
