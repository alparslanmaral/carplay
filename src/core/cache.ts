/**
 * Small TTL cache: memory first, mirrored to localStorage so API quota (YouTube search = 100 units) and
 * rate limits (Spotify 429) are spent once. All storage access is try/caught - private mode must not break anything.
 */
const PREFIX = 'dd.cache.';

interface Entry<T> {
  v: T;
  exp: number;
}

const memory = new Map<string, Entry<unknown>>();

function now(): number {
  return Date.now();
}

export function cacheGet<T>(key: string): T | undefined {
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit) {
    if (hit.exp > now()) return hit.v;
    memory.delete(key);
  }
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry.exp <= now()) {
      localStorage.removeItem(PREFIX + key);
      return undefined;
    }
    memory.set(key, entry);
    return entry.v;
  } catch {
    return undefined;
  }
}

/** Returns a stale value too (for "show something while refreshing"). */
export function cachePeek<T>(key: string): T | undefined {
  const hit = memory.get(key) as Entry<T> | undefined;
  if (hit) return hit.v;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry<T>).v : undefined;
  } catch {
    return undefined;
  }
}

function prune(): void {
  try {
    const t = now();
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        if ((JSON.parse(localStorage.getItem(k) ?? '{}') as Entry<unknown>).exp <= t) doomed.push(k);
      } catch {
        doomed.push(k);
      }
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const entry: Entry<T> = { v: value, exp: now() + ttlMs };
  memory.set(key, entry);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    prune();
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch {
      /* quota still exceeded: memory copy is enough for this session */
    }
  }
}

export function cacheDelete(prefix = ''): void {
  for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX + prefix)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function clearAllCaches(): void {
  cacheDelete('');
}

export function cacheStats(): { entries: number; bytes: number } {
  let entries = 0;
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      entries++;
      bytes += (localStorage.getItem(k) ?? '').length * 2;
    }
  } catch {
    /* ignore */
  }
  return { entries, bytes };
}

/** Run `fetcher` unless a fresh cached value exists. Concurrent callers share one request. */
const inflight = new Map<string, Promise<unknown>>();
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = fetcher()
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
