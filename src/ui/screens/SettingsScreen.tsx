import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getFeatures } from '../../core/features';
import { useRouter, type Params } from '../../core/router';
import { clearRecents } from '../../services/maps/places';
import { useSettings } from '../../core/settings';
import {
  SECTIONS,
  isItemVisible,
  searchSettings,
  type SettingItem,
  type SettingSection,
} from '../../core/settingsSchema';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { useLayout } from '../hooks/useViewport';
import { TextInput } from '../components/TextInput';
import { AppIconPreview } from '../settings/preview';
import { AboutEditor, AccountsEditor, DataEditor } from '../settings/accounts';
import { SettingRow, EditorCard } from '../settings/controls';
import {
  AccentEditor,
  DockEditor,
  HomePagesEditor,
  WallpaperEditor,
  WidgetsEditor,
} from '../settings/editors';
import { ShortcutsManager } from '../settings/shortcuts';
import { FavoritesManager } from './Destinations';
import { confirmDialog } from '../../core/dialogs';
import { toast } from '../../core/toast';

function ClearRecents() {
  const { t } = useTranslation();
  const count = useSettings((s) => s.recents.length);
  return (
    <EditorCard itemId="custom_clearRecents">
      <button
        className="btn btn--danger"
        disabled={count === 0}
        onClick={async () => {
          const ok = await confirmDialog({
            title: t('destinations.clearTitle'),
            tone: 'danger',
            confirmLabel: t('destinations.clear'),
          });
          if (ok) {
            clearRecents();
            toast(t('settings.recentsCleared'), 'ok');
          }
        }}
      >
        <Icon name="trash" /> {t('destinations.clear')} ({count})
      </button>
    </EditorCard>
  );
}

function FavoritesEditor() {
  return (
    <EditorCard itemId="custom_favorites">
      <FavoritesManager manage />
    </EditorCard>
  );
}

const CUSTOM: Record<string, () => ReactNode> = {
  accent: () => <AccentEditor />,
  wallpaper: () => <WallpaperEditor />,
  dock: () => <DockEditor />,
  widgets: () => <WidgetsEditor />,
  homePages: () => <HomePagesEditor />,
  shortcuts: () => <ShortcutsManager />,
  favorites: () => <FavoritesEditor />,
  clearRecents: () => <ClearRecents />,
  accounts: () => <AccountsEditor />,
  data: () => <DataEditor />,
  about: () => <AboutEditor />,
};

function ItemView({ item }: { item: SettingItem }) {
  if (item.type === 'custom') return <>{CUSTOM[item.custom!]?.()}</>;
  return <SettingRow item={item} />;
}

export default function SettingsScreen({ params }: { params: Params }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const features = getFeatures();
  const layout = useLayout();
  const [query, setQuery] = useState('');
  const sectionId = params.section;
  const section = SECTIONS.find((s) => s.id === sectionId);

  const visible = (item: SettingItem) => isItemVisible(item, settings, features);
  const itemText = (item: SettingItem) => ({
    label: t(`set.items.${item.id}.label`),
    hint: item.hint ? t(`set.items.${item.id}.hint`) : '',
  });
  const hits = useMemo(
    () => searchSettings(query, itemText, (s) => t(`set.sections.${s.id}.title`), visible),
    // visible() depends on settings/features; recompute with them
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, settings, t],
  );

  const open = (s: SettingSection) => useRouter.getState().push('settings', { section: s.id });

  const search = (
    <div className="set-search">
      <Icon name="search" />
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('settings.search')}
        aria-label={t('settings.search')}
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="search"
      />
      {query && (
        <button
          className="btn btn--icon btn--ghost btn--sm"
          aria-label={t('common.close')}
          onClick={() => setQuery('')}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );

  // Landscape phones are short: the search box lives in the header row there instead of under it.
  const inHeader = layout === 'landscape';
  const frame = (title: string, children: ReactNode) => (
    <Screen title={title} actions={inHeader ? search : undefined}>
      {!inHeader && search}
      {children}
    </Screen>
  );

  if (query.trim()) {
    const groups = SECTIONS.map((s) => ({
      s,
      items: hits.filter((h) => h.section.id === s.id).map((h) => h.item),
    })).filter((g) => g.items.length);
    return frame(
      t('apps.settings'),
      <>
        {groups.length === 0 && <div className="empty">{t('settings.noMatches', { q: query })}</div>}
        {groups.map(({ s, items }) => (
          <div key={s.id} className="set-group">
            <h2 className="section-title">{t(`set.sections.${s.id}.title`)}</h2>
            {items.map((item) => (
              <ItemView key={item.id} item={item} />
            ))}
          </div>
        ))}
      </>,
    );
  }

  if (section) {
    const items = section.items.filter(visible);
    return frame(
      t(`set.sections.${section.id}.title`),
      <>
        {section.id === 'appearance' && <AppIconPreview />}
        <div className="set-group">
          {items.map((item) => (
            <ItemView key={item.id} item={item} />
          ))}
        </div>
      </>,
    );
  }

  return frame(
    t('apps.settings'),
    <>
      <div className="list">
        {SECTIONS.map((s) => (
          <button key={s.id} className="row" onClick={() => open(s)}>
            <span className="row__lead">
              <Icon name={s.icon} />
            </span>
            <span className="row__text">
              <span className="row__title">{t(`set.sections.${s.id}.title`)}</span>
              <span className="row__sub">{t(`settings.sectionHint.${s.id}`)}</span>
            </span>
            <span className="row__trail">
              <Icon name="chevron-right" />
            </span>
          </button>
        ))}
      </div>
    </>,
  );
}
