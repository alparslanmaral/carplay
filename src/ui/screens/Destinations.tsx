import { useTranslation } from 'react-i18next';
import { confirmDialog } from '../../core/dialogs';
import { useRouter } from '../../core/router';
import { useSettings, type Place } from '../../core/settings';
import { navigateTo } from '../../services/maps/handoff';
import { clearRecents, removeFavorite, renameFavorite } from '../../services/maps/places';
import { Icon } from '../components/Icon';
import { PlaceRow } from '../components/PlaceRow';
import { Screen } from '../components/Screen';
import { TextInput } from '../components/TextInput';

const showOnMap = (p: Place) => useRouter.getState().open('maps', { dest: p.id });
const rank = (p: Place) => (p.kind === 'home' ? 0 : p.kind === 'work' ? 1 : 2);

/** Favorites list (Home, Work, custom). `manage` adds rename fields; used by Settings > Maps. */
export function FavoritesManager({ manage = false }: { manage?: boolean }) {
  const { t } = useTranslation();
  const favorites = useSettings((s) => s.favorites);
  const sorted = [...favorites].sort((a, b) => rank(a) - rank(b));
  const missing = [
    !favorites.some((f) => f.kind === 'home') && t('apps.home'),
    !favorites.some((f) => f.kind === 'work') && t('destinations.work'),
  ].filter(Boolean);
  return (
    <div className="list">
      {sorted.map((p) => (
        <div key={p.id} className="fav">
          <PlaceRow
            place={p}
            onOpen={() => showOnMap(p)}
            onNavigate={() => navigateTo(p)}
            trailing={
              <button
                className="btn btn--icon btn--ghost"
                aria-label={t('common.remove')}
                onClick={async (e) => {
                  e.stopPropagation();
                  const ok = await confirmDialog({
                    title: t('destinations.removeTitle', { name: p.name }),
                    tone: 'danger',
                    confirmLabel: t('common.remove'),
                  });
                  if (ok) removeFavorite(p.id);
                }}
              >
                <Icon name="trash" />
              </button>
            }
          />
          {manage && (
            <TextInput
              defaultValue={p.name}
              aria-label={t('destinations.rename', { name: p.name })}
              onBlur={(e) => e.target.value.trim() && renameFavorite(p.id, e.target.value.trim())}
            />
          )}
        </div>
      ))}
      {missing.length > 0 && (
        <p className="dim">{t('destinations.slotsHint', { slots: missing.join(' / ') })}</p>
      )}
    </div>
  );
}

export default function Destinations() {
  const { t } = useTranslation();
  const recents = useSettings((s) => s.recents);
  return (
    <Screen title={t('apps.destinations')}>
      <h2 className="section-title">{t('destinations.favorites')}</h2>
      <FavoritesManager />
      <div className="section-head">
        <h2 className="section-title">{t('destinations.recents')}</h2>
        {recents.length > 0 && (
          <button
            className="btn btn--sm btn--ghost"
            onClick={async () => {
              const ok = await confirmDialog({
                title: t('destinations.clearTitle'),
                tone: 'danger',
                confirmLabel: t('destinations.clear'),
              });
              if (ok) clearRecents();
            }}
          >
            {t('destinations.clear')}
          </button>
        )}
      </div>
      {recents.length === 0 ? (
        <p className="dim">{t('dashboard.noRecents')}</p>
      ) : (
        <div className="list">
          {recents.map((p) => (
            <PlaceRow key={p.id} place={p} onOpen={() => showOnMap(p)} onNavigate={() => navigateTo(p)} />
          ))}
        </div>
      )}
      <button
        className="btn btn--block"
        style={{ marginTop: '1rem' }}
        onClick={() => useRouter.getState().open('maps')}
      >
        <Icon name="search" /> {t('destinations.searchMaps')}
      </button>
    </Screen>
  );
}
