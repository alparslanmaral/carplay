import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

export interface PageResult<T> {
  items: T[];
  total: number;
}

/**
 * Infinite-scrolling list. `load(offset)` returns one page; the next page is requested when the sentinel
 * under the list scrolls into view. Changing `resetKey` starts over. Pages are cached by the loaders themselves.
 */
export function PagedList<T>({
  resetKey,
  load,
  header,
  renderRow,
  empty,
}: {
  resetKey: string;
  load: (offset: number) => Promise<PageResult<T>>;
  header?: (items: T[]) => ReactNode;
  renderRow: (item: T, index: number, all: T[]) => ReactNode;
  empty: string;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const generation = useRef(0);

  const loadMore = useCallback(
    async (offset: number) => {
      if (busy.current) return;
      busy.current = true;
      const gen = generation.current;
      setLoading(true);
      setError(null);
      try {
        const page = await load(offset);
        if (gen !== generation.current) return;
        setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
        setTotal(page.total);
      } catch (e) {
        if (gen === generation.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        busy.current = false;
        if (gen === generation.current) setLoading(false);
      }
    },
    [load],
  );

  useEffect(() => {
    generation.current++;
    busy.current = false;
    setItems([]);
    setTotal(null);
    void loadMore(0);
    // `load` identity may change every render; only an explicit resetKey restarts the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const hasMore = total !== null && items.length < total;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore(items.length);
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, items.length, loadMore, error]);

  return (
    <div className="paged">
      {header?.(items)}
      <div className="list">{items.map((item, i) => renderRow(item, i, items))}</div>
      {total === 0 && !loading && !error && <div className="empty">{empty}</div>}
      <div ref={sentinel} className="paged__sentinel">
        {loading && <div className="spinner" aria-label={t('common.loading')} />}
        {error && (
          <div className="notice" data-tone="bad">
            <Icon name="warning" />
            <div className="notice__text">{error}</div>
            <button className="btn btn--sm" onClick={() => void loadMore(items.length)}>
              {t('common.retry')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
