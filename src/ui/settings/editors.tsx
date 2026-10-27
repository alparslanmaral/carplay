import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { allApps, appLabel, moveItem, resolveHomeApps, type AppDef } from '../../core/apps';
import { downscaleToDataUrl } from '../../core/image';
import { ACCENT_PRESETS, OPTIONS, useSettings } from '../../core/settings';
import { GRADIENTS, gradientCss } from '../../core/theme';
import { toast } from '../../core/toast';
import { AppTile } from '../components/AppIcon';
import { Icon } from '../components/Icon';
import { WIDGETS } from '../widgets/widgets';
import { EditorCard, Segmented } from './controls';

/* ---------- accent ---------- */

export function AccentEditor() {
  const { t } = useTranslation();
  const accent = useSettings((s) => s.accent);
  const set = useSettings((s) => s.set);
  const isPreset = ACCENT_PRESETS.some((p) => p.toLowerCase() === accent.toLowerCase());
  return (
    <EditorCard itemId="custom_accent">
      <div className="swatches" role="radiogroup" aria-label={t('set.items.custom_accent.label')}>
        {ACCENT_PRESETS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={accent.toLowerCase() === c}
            aria-label={c}
            className="swatch"
            style={{ '--sw': c } as CSSProperties}
            onClick={() => set('accent', c)}
          />
        ))}
        <label
          className="swatch swatch--custom"
          aria-checked={!isPreset}
          role="radio"
          style={isPreset ? undefined : ({ '--sw': accent } as CSSProperties)}
        >
          <Icon name="palette" size="1.1rem" />
          <input
            type="color"
            className="sr-only"
            value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#4c8dff'}
            aria-label={t('settings.customColor')}
            onChange={(e) => set('accent', e.target.value)}
          />
        </label>
      </div>
    </EditorCard>
  );
}

/* ---------- wallpaper ---------- */

export function WallpaperEditor() {
  const { t } = useTranslation();
  const kind = useSettings((s) => s.wallpaperKind);
  const gradient = useSettings((s) => s.wallpaperGradient);
  const image = useSettings((s) => s.wallpaperImage);
  const dim = useSettings((s) => s.wallpaperDim);
  const blur = useSettings((s) => s.wallpaperBlur);
  const set = useSettings((s) => s.set);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const kinds = OPTIONS.wallpaperKind.map((v) => ({ value: v, label: t(`settings.wallpaper.${v}`) }));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      set('wallpaperImage', await downscaleToDataUrl(f));
      set('wallpaperKind', 'image');
    } catch {
      toast(t('settings.wallpaper.failed'), 'bad');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <EditorCard itemId="custom_wallpaper">
      <Segmented
        value={kind}
        options={kinds}
        onChange={(v) => set('wallpaperKind', v as typeof kind)}
        label={t('set.items.custom_wallpaper.label')}
      />
      {(kind === 'gradient' || kind === 'art') && (
        <div className="swatches" style={{ marginTop: '0.75rem' }}>
          {GRADIENTS.map((g, i) => (
            <button
              key={g.id}
              role="radio"
              aria-checked={gradient === i}
              aria-label={g.id}
              className="swatch swatch--wide"
              style={{ '--sw': gradientCss(i, 'dark') } as CSSProperties}
              onClick={() => set('wallpaperGradient', i)}
            />
          ))}
        </div>
      )}
      {kind === 'art' && <p className="set-row__hint">{t('settings.wallpaper.artHint')}</p>}
      {kind === 'image' && (
        <div className="set-actions">
          <button className="btn" disabled={busy} onClick={() => file.current?.click()}>
            <Icon name="upload" /> {image ? t('settings.wallpaper.replace') : t('settings.wallpaper.choose')}
          </button>
          {image && (
            <button className="btn btn--danger" onClick={() => set('wallpaperImage', '')}>
              <Icon name="trash" /> {t('common.remove')}
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      )}
      <label className="set-sub">
        <span>{t('settings.wallpaper.dim')}</span>
        <input
          className="slider"
          type="range"
          min={0}
          max={90}
          step={5}
          value={dim}
          style={{ '--pct': `${(dim / 90) * 100}%` } as React.CSSProperties}
          onChange={(e) => set('wallpaperDim', Number(e.target.value))}
        />
        <span className="tabular">{dim}%</span>
      </label>
      {kind === 'image' && (
        <label className="set-sub">
          <span>{t('settings.wallpaper.blur')}</span>
          <input
            className="slider"
            type="range"
            min={0}
            max={30}
            step={2}
            value={blur}
            style={{ '--pct': `${(blur / 30) * 100}%` } as React.CSSProperties}
            onChange={(e) => set('wallpaperBlur', Number(e.target.value))}
          />
          <span className="tabular">{blur}px</span>
        </label>
      )}
    </EditorCard>
  );
}

/* ---------- reorderable lists ---------- */

function ReorderRow({
  index,
  count,
  onMove,
  lead,
  title,
  trailing,
  dimmed,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  lead: ReactNode;
  title: string;
  trailing?: ReactNode;
  dimmed?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="row row--tight reorder" data-dimmed={dimmed}>
      <span className="row__lead row__lead--plain">{lead}</span>
      <span className="row__text">
        <span className="row__title ellipsis">{title}</span>
      </span>
      <span className="row__trail">
        {trailing}
        <button
          className="btn btn--icon btn--ghost btn--sm"
          disabled={index === 0}
          aria-label={t('settings.moveUp')}
          onClick={() => onMove(index - 1)}
        >
          <Icon name="chevron-up" />
        </button>
        <button
          className="btn btn--icon btn--ghost btn--sm"
          disabled={index === count - 1}
          aria-label={t('settings.moveDown')}
          onClick={() => onMove(index + 1)}
        >
          <Icon name="chevron-down" />
        </button>
      </span>
    </div>
  );
}

const MAX_DOCK = 6;

export function DockEditor() {
  const { t } = useTranslation();
  const dock = useSettings((s) => s.dockItems);
  const shortcuts = useSettings((s) => s.shortcuts);
  const set = useSettings((s) => s.set);
  const apps = allApps(shortcuts);
  const label = (a: AppDef) => appLabel(a, shortcuts, t);
  const pinned = dock.map((id) => apps.get(id)).filter((a): a is AppDef => !!a);
  const available = [...apps.values()].filter((a) => !dock.includes(a.id) && a.id !== 'settings');
  return (
    <EditorCard itemId="custom_dock">
      <div className="list">
        {pinned.map((a, i) => (
          <ReorderRow
            key={a.id}
            index={i}
            count={pinned.length}
            onMove={(to) => set('dockItems', moveItem(dock, i, to))}
            lead={<AppTile app={a} size={40} />}
            title={label(a)}
            trailing={
              <button
                className="btn btn--icon btn--ghost btn--sm"
                aria-label={t('common.remove')}
                onClick={() =>
                  set(
                    'dockItems',
                    dock.filter((d) => d !== a.id),
                  )
                }
              >
                <Icon name="close" />
              </button>
            }
          />
        ))}
        {pinned.length === 0 && <p className="set-row__hint">{t('settings.dock.empty')}</p>}
      </div>
      {dock.length < MAX_DOCK && available.length > 0 && (
        <>
          <p className="set-row__hint">{t('settings.dock.add', { max: MAX_DOCK })}</p>
          <div className="chips-row">
            {available.map((a) => (
              <button key={a.id} className="btn btn--sm" onClick={() => set('dockItems', [...dock, a.id])}>
                <Icon name="plus" size="1.1em" /> {label(a)}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="set-row__hint">{t('settings.dock.fitNote')}</p>
    </EditorCard>
  );
}

export function WidgetsEditor() {
  const { t } = useTranslation();
  const enabled = useSettings((s) => s.dashboardWidgets);
  const set = useSettings((s) => s.set);
  const known = enabled.filter((id) => WIDGETS.some((w) => w.id === id));
  const off = WIDGETS.filter((w) => !known.includes(w.id));
  return (
    <EditorCard itemId="custom_widgets">
      <div className="list">
        {known.map((id, i) => {
          const w = WIDGETS.find((x) => x.id === id)!;
          return (
            <ReorderRow
              key={id}
              index={i}
              count={known.length}
              onMove={(to) => set('dashboardWidgets', moveItem(known, i, to))}
              lead={<Icon name={w.icon} />}
              title={t(w.titleKey)}
              trailing={
                <button
                  className="btn btn--icon btn--ghost btn--sm"
                  aria-label={t('settings.hide')}
                  onClick={() =>
                    set(
                      'dashboardWidgets',
                      known.filter((k) => k !== id),
                    )
                  }
                >
                  <Icon name="eye-off" />
                </button>
              }
            />
          );
        })}
        {off.map((w) => (
          <div key={w.id} className="row row--tight" data-dimmed>
            <span className="row__lead row__lead--plain">
              <Icon name={w.icon} />
            </span>
            <span className="row__text">
              <span className="row__title">{t(w.titleKey)}</span>
            </span>
            <span className="row__trail">
              <button
                className="btn btn--icon btn--ghost btn--sm"
                aria-label={t('settings.show')}
                onClick={() => set('dashboardWidgets', [...known, w.id])}
              >
                <Icon name="eye" />
              </button>
            </span>
          </div>
        ))}
      </div>
    </EditorCard>
  );
}

export function HomePagesEditor() {
  const { t } = useTranslation();
  const order = useSettings((s) => s.homeOrder);
  const hidden = useSettings((s) => s.homeHidden);
  const shortcuts = useSettings((s) => s.shortcuts);
  const patch = useSettings((s) => s.patch);
  const apps = resolveHomeApps(order, hidden, shortcuts, { includeHidden: true });
  const ids = apps.map((a) => a.id);
  return (
    <EditorCard itemId="custom_homePages">
      <div className="list">
        {apps.map((a, i) => {
          const isHidden = hidden.includes(a.id);
          return (
            <ReorderRow
              key={a.id}
              index={i}
              count={apps.length}
              dimmed={isHidden}
              onMove={(to) => patch({ homeOrder: moveItem(ids, i, to) })}
              lead={<AppTile app={a} size={40} />}
              title={appLabel(a, shortcuts, t)}
              trailing={
                <button
                  className="btn btn--icon btn--ghost btn--sm"
                  aria-label={isHidden ? t('settings.show') : t('settings.hide')}
                  aria-pressed={isHidden}
                  onClick={() =>
                    patch({
                      homeOrder: ids,
                      homeHidden: isHidden ? hidden.filter((h) => h !== a.id) : [...hidden, a.id],
                    })
                  }
                >
                  <Icon name={isHidden ? 'eye-off' : 'eye'} />
                </button>
              }
            />
          );
        })}
      </div>
      <p className="set-row__hint">{t('settings.homePages.note')}</p>
    </EditorCard>
  );
}
