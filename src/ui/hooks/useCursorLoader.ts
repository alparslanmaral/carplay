import { useMemo, useRef } from 'react';
import type { Paged } from '../../services/youtube/api';
import { cursorLoader } from '../../services/youtube/paging';

/** A cursorLoader that keeps its page tokens for as long as `key` stays the same. */
export function useCursorLoader<T>(key: string, fetchPage: (token: string) => Promise<Paged<T>>) {
  const latest = useRef(fetchPage);
  latest.current = fetchPage;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => cursorLoader<T>((token) => latest.current(token)), [key]);
}
