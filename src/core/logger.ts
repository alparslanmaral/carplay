export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
}

const MAX_ENTRIES = 300;
const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function push(level: LogLevel, scope: string, message: string, data?: unknown): void {
  entries.push({ ts: Date.now(), level, scope, message, data });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  if (level === 'warn') console.warn(`[${scope}]`, message, data ?? '');
  else if (level === 'error') console.error(`[${scope}]`, message, data ?? '');
  listeners.forEach((l) => l());
}

export const log = {
  debug: (scope: string, message: string, data?: unknown) => push('debug', scope, message, data),
  info: (scope: string, message: string, data?: unknown) => push('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => push('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => push('error', scope, message, data),
};

export function getLogs(): readonly LogEntry[] {
  return entries;
}

export function subscribeLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearLogs(): void {
  entries.length = 0;
  listeners.forEach((l) => l());
}
