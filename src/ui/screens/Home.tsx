import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appLabel, moveItem, paginate, resolveHomeApps, type AppDef } from '../../core/apps';
import { useSettings } from '../../core/settings';
import { AppTile } from '../components/AppIcon';
import { Icon } from '../components/Icon';
import { launchApp } from '../launch';

interface Drag {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
}

const LONG_PRESS_MS = 550;
/** Apps kept in simplified mode (Settings stays so the mode can be switched off again). */
export const SIMPLIFIED_APPS = ['maps', 'spotify', 'youtube', 'nowplaying', 'settings'];
export const SIMPLIFIED_SCALE = 1.5;

/** Number of columns/rows that fit the pager, derived from the measured area and the icon size. */
export function gridCapacity(
  width: number,
  height: number,
  opts: { iconSize: number; labels: boolean; columns: 'auto' | '3' | '4' | '5' | '6' },
): { cols: number; rows: number } {
  const itemW = opts.iconSize + 28;
  const itemH = opts.iconSize + (opts.labels ? 44 : 22);
  const cols = opts.columns === 'auto' ? Math.max(2, Math.floor(width / itemW)) : Number(opts.columns);
  const rows = Math.max(1, Math.floor(height / itemH));
  return { cols, rows };
}

export function Home() {
  const { t } = useTranslation();
  const order = useSettings((s) => s.homeOrder);
  const hidden = useSettings((s) => s.homeHidden);
  const shortcuts = useSettings((s) => s.shortcuts);
  const iconSize = useSettings((s) => s.iconSize);
  const labels = useSettings((s) => s.showLabels);
  const columns = useSettings((s) => s.gridColumns);
  const patch = useSettings((s) => s.patch);
  const scale = useSettings((s) => s.uiScale);

  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const simplified = useSettings((s) => s.simplified);

  const apps = useMemo(() => {
    const all = resolveHomeApps(order, hidden, shortcuts, { includeHidden: editing });
    // Simplified mode: only the essentials, in big tiles, and no editing.
    return simplified ? all.filter((a) => SIMPLIFIED_APPS.includes(a.id)) : all;
  }, [order, hidden, shortcuts, editing, simplified]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cols, rows } = gridCapacity(size.w, size.h, {
    iconSize: ((iconSize * scale) / 100) * (simplified ? SIMPLIFIED_SCALE : 1),
    labels,
    columns,
  });
  const perPage = cols * rows;
  const pages = useMemo(() => paginate(apps, perPage), [apps, perPage]);
  const pageCount = pages.length;

  // Keep the pager aligned to the current page when the layout changes (rotation, scale, edit mode).
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager || size.w === 0) return;
    const clamped = Math.min(page, pageCount - 1);
    if (clamped !== page) setPage(clamped);
    pager.scrollTo({ left: clamped * pager.clientWidth, behavior: 'auto' });
  }, [size.w, pageCount, page]);

  const onScroll = useCallback(() => {
    const pager = pagerRef.current;
    if (!pager || pager.clientWidth === 0) return;
    const idx = Math.round(pager.scrollLeft / pager.clientWidth);
    setPage((p) => (p === idx ? p : idx));
  }, []);

  const goPage = (i: number) => {
    const pager = pagerRef.current;
    if (!pager) return;
    const clamped = Math.max(0, Math.min(pageCount - 1, i));
    pager.scrollTo({ left: clamped * pager.clientWidth, behavior: 'smooth' });
  };

  const fullOrder = useMemo(
    () => resolveHomeApps(order, [], shortcuts, { includeHidden: true }).map((a) => a.id),
    [order, shortcuts],
  );

  const toggleHidden = (id: string) =>
    patch({ homeHidden: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] });

  /* ---------- drag to reorder (edit mode) ---------- */
  const onPointerDown = (e: React.PointerEvent, app: AppDef) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const begin = () => {
      suppressClick.current = true;
      target.setPointerCapture?.(e.pointerId);
      setDrag({
        id: app.id,
        x: start.x,
        y: start.y,
        dx: start.x - rect.left,
        dy: start.y - rect.top,
        size: rect.width,
      });
    };
    if (editing) begin();
    else {
      pressTimer.current = setTimeout(() => {
        setEditing(true);
        begin();
      }, LONG_PRESS_MS);
    }
  };

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) {
      // Moving a finger before the long-press fires means the user is scrolling the pager.
      if (pressTimer.current && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) clearPress();
      return;
    }
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-app-id]');
    const overId = over?.dataset.appId;
    if (overId && overId !== drag.id) {
      const from = fullOrder.indexOf(drag.id);
      const to = fullOrder.indexOf(overId);
      if (from !== -1 && to !== -1) patch({ homeOrder: moveItem(fullOrder, from, to) });
    }
    // Dwell near the left/right edge flips pages so an icon can travel across pages.
    const area = areaRef.current?.getBoundingClientRect();
    if (area) {
      const edge = e.clientX < area.left + 36 ? -1 : e.clientX > area.right - 36 ? 1 : 0;
      if (edge !== 0 && !edgeTimer.current) {
        edgeTimer.current = setTimeout(() => {
          goPage(page + edge);
          edgeTimer.current = null;
        }, 650);
      } else if (edge === 0 && edgeTimer.current) {
        clearTimeout(edgeTimer.current);
        edgeTimer.current = null;
      }
    }
  };

  const endDrag = () => {
    clearPress();
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
    edgeTimer.current = null;
    setDrag(null);
    // The click that follows a drag/long-press must not launch the app.
    setTimeout(() => (suppressClick.current = false), 50);
  };

  const dragApp = drag ? apps.find((a) => a.id === drag.id) : undefined;

  return (
    <div className="home">
      <div className="home__area" ref={areaRef}>
        <div
          className="home__pager"
          ref={pagerRef}
          onScroll={onScroll}
          data-editing={editing}
          style={{ gridAutoColumns: '100%' }}
        >
          {pages.map((items, pi) => (
            <div
              key={pi}
              className="home__page"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {items.map((app) => {
                const isHidden = hidden.includes(app.id);
                const label = appLabel(app, shortcuts, t);
                return (
                  <div
                    key={app.id}
                    className="home__cell"
                    data-app-id={app.id}
                    data-editing={editing}
                    data-hidden={isHidden}
                    data-dragging={drag?.id === app.id}
                    onPointerDown={(e) => onPointerDown(e, app)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <button
                      className="app-icon"
                      aria-label={label}
                      onClick={() => {
                        if (suppressClick.current || editing) return;
                        launchApp(app);
                      }}
                    >
                      <AppTile app={app} />
                      {labels && <span className="app-icon__label ellipsis">{label}</span>}
                    </button>
                    {editing && (
                      <button
                        className="home__badge"
                        aria-label={isHidden ? t('home.show') : t('home.hide')}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => toggleHidden(app.id)}
                      >
                        <Icon name={isHidden ? 'eye' : 'eye-off'} size="1rem" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="home__footer">
        <div className="home__dots" role="tablist" aria-label={t('home.pages')}>
          {pageCount > 1 &&
            pages.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === page}
                aria-label={t('home.page', { n: i + 1 })}
                className="home__dot"
                onClick={() => goPage(i)}
              />
            ))}
        </div>
        {!simplified && (
          <button
            className={`btn btn--sm ${editing ? 'btn--primary' : 'btn--ghost'} home__edit`}
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
          >
            <Icon name={editing ? 'check' : 'pencil'} size="1.1em" />
            {editing ? t('common.done') : t('home.edit')}
          </button>
        )}
      </div>

      {drag && dragApp && (
        <div
          className="home__ghost"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.size }}
          aria-hidden="true"
        >
          <AppTile app={dragApp} />
        </div>
      )}
    </div>
  );
}
