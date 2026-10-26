import type { Paged } from './api';

/**
 * YouTube pages by opaque token, the list UI pages by offset. This keeps a token per offset so the
 * list can ask for "the page starting at N". `total` is only a lower bound while more pages exist.
 */
export function cursorLoader<T>(fetchPage: (token: string) => Promise<Paged<T>>) {
  const tokens = new Map<number, string>([[0, '']]);
  return async (offset: number): Promise<{ items: T[]; total: number }> => {
    let token = tokens.get(offset) ?? '';
    let items: T[] = [];
    let next: string | null = null;
    // A page can be entirely private/deleted videos: skip ahead (bounded) instead of stalling the list.
    for (let guard = 0; guard < 5; guard++) {
      const r = await fetchPage(token);
      items = r.items;
      next = r.next;
      if (items.length > 0 || !next) break;
      token = next;
    }
    if (next) tokens.set(offset + items.length, next);
    return { items, total: offset + items.length + (next ? 1 : 0) };
  };
}
