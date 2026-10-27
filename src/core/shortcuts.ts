import type { Shortcut } from './settings';

/** Schemes that run script or read local data have no business in a launcher tile. */
const BLOCKED_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'file', 'blob', 'about']);

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: 'empty' | 'blocked' | 'invalid' };

/**
 * Accepts web links and app URL schemes (tel:, sms:, waze://, spotify:...). A bare "example.com/page" gets
 * https:// in front. Anything that could execute script is rejected.
 */
export function validateShortcutUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  // "localhost:3000" and "host:80/path" look like schemes; treat host:port as a web address.
  const looksLikeHostPort = match && /^[^:/\s]+:\d+(\/|$)/.test(raw);
  if (!match || looksLikeHostPort) {
    const candidate = `https://${raw}`;
    try {
      const u = new URL(candidate);
      return u.hostname.includes('.') || u.hostname === 'localhost'
        ? { ok: true, url: candidate }
        : { ok: false, reason: 'invalid' };
    } catch {
      return { ok: false, reason: 'invalid' };
    }
  }
  const scheme = match[1]!.toLowerCase();
  if (BLOCKED_SCHEMES.has(scheme)) return { ok: false, reason: 'blocked' };
  const rest = raw.slice(match[0].length).replace(/^\/\//, '');
  if (!rest.trim()) return { ok: false, reason: 'invalid' };
  return { ok: true, url: raw };
}

export function newShortcutId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const SHORTCUT_ICONS = [
  'phone',
  'message',
  'link',
  'home',
  'star',
  'pin',
  'car',
  'music',
  'video',
  'bolt',
  'briefcase',
  'user',
  'key',
  'tv',
  'mic',
  'sun',
] as const;

export function upsertShortcut(list: Shortcut[], item: Shortcut): Shortcut[] {
  return list.some((s) => s.id === item.id)
    ? list.map((s) => (s.id === item.id ? item : s))
    : [...list, item];
}
