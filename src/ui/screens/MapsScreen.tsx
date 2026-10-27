import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Params } from '../../core/router';
import { useSettings, type Place } from '../../core/settings';
import { formatSpeed, speedLabel } from '../../core/units';
import { toast } from '../../core/toast';
import { navAppLabel } from '../../services/maps/deeplinks';
import { reverseGeocode, resolveResult, ATTRIBUTION, type SearchResult } from '../../services/maps/geocode';
import { useGeo } from '../../services/maps/geolocation';
import { navigateTo, useNavChooser } from '../../services/maps/handoff';
import { stopNavigation, useNav } from '../../services/maps/navigation';
import { removeFavorite, saveFavorite } from '../../services/maps/places';
import { Icon } from '../components/Icon';
import { BackButton } from '../components/Screen';
import { MapCanvas } from '../components/MapCanvas';
import { GuidanceBanner, GuidanceBar, RouteSheet } from '../components/NavPanels';
import { PlaceRow, usePlaceDistance } from '../components/PlaceRow';
import { TextInput } from '../components/TextInput';
import { usePlaceSearch } from '../hooks/usePlaceSearch';

type Assign = 'home' | 'work' | null;

function SpeedBadge() {
  const unit = useSettings((s) => s.speedUnit);
  const show = useSettings((s) => s.showSpeedWidget);
  const alertAt = useSettings((s) => s.speedAlert);
  const speed = useGeo((s) => s.speedKmh);
  const live = useGeo((s) => s.status === 'watching');
  if (!show || !live) return null;
  return (
    <div className="maps__speed glass" data-alert={alertAt > 0 && speed > alertAt}>
      <strong className="tabular">{formatSpeed(speed, unit)}</strong>
      <span>{speedLabel(unit)}</span>
    </div>
  );
}

function DestinationSheet({ place, onClose }: { place: Place; onClose: () => void }) {
  const { t } = useTranslation();
  const navApp = useSettings((s) => s.navApp);
  const favorites = useSettings((s) => s.favorites);
  const distance = usePlaceDistance();
  const [saving, setSaving] = useState(false);
  const saved = favorites.find((f) => f.id === place.id || (f.lat === place.lat && f.lng === place.lng));
  const label =
    navApp === 'ask' ? t('maps.navigateIn') : t('maps.navigateInApp', { app: navAppLabel(navApp) });
  const dist = distance(place);
  return (
    <div className="maps__sheet glass" role="dialog" aria-label={place.name}>
      <div className="maps__sheet-head">
        <div className="maps__sheet-text">
          <h2 className="ellipsis">{place.name}</h2>
          {place.address && <p className="dim ellipsis">{place.address}</p>}
          {dist && (
            <p className="maps__dist">
              <Icon name="navigate" size="1em" /> {t('maps.straightLine', { d: dist })}
            </p>
          )}
        </div>
        <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="close" />
        </button>
      </div>
      <button className="btn btn--primary btn--block maps__go" onClick={() => navigateTo(place)}>
        <Icon name="navigate" /> {label}
      </button>
      <div className="maps__sheet-row">
        {navApp !== 'ask' && (
          <button className="btn" onClick={() => useNavChooser.getState().open(place)}>
            <Icon name="external" size="1.1em" /> {t('maps.otherApp')}
          </button>
        )}
        {saved ? (
          <button className="btn" onClick={() => removeFavorite(saved.id)}>
            <Icon name="star" size="1.1em" style={{ fill: 'currentColor' }} /> {t('maps.saved')}
          </button>
        ) : (
          <button className="btn" onClick={() => setSaving((v) => !v)} aria-expanded={saving}>
            <Icon name="star" size="1.1em" /> {t('maps.saveFavorite')}
          </button>
        )}
      </div>
      {saving && !saved && (
        <div className="maps__sheet-row">
          {(['home', 'work', 'custom'] as const).map((kind) => (
            <button
              key={kind}
              className="btn btn--sm"
              onClick={() => {
                saveFavorite(place, kind);
                setSaving(false);
                toast(t('maps.savedAs', { kind: t(`maps.kind.${kind}`) }), 'ok');
              }}
            >
              <Icon name={kind === 'home' ? 'home' : kind === 'work' ? 'briefcase' : 'star'} size="1.1em" />
              {t(`maps.kind.${kind}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MapsScreen({ params }: { params: Params }) {
  const { t } = useTranslation();
  const favorites = useSettings((s) => s.favorites);
  const recents = useSettings((s) => s.recents);
  const provider = useSettings((s) => s.searchProvider);
  const autoHandoff = useSettings((s) => s.autoHandoff);
  const geoStatus = useGeo((s) => s.status);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitNonce, setSubmitNonce] = useState(0);
  const [selected, setSelected] = useState<Place | null>(null);
  const [assign, setAssign] = useState<Assign>(null);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [following, setFollowing] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = usePlaceSearch(query, submitNonce);
  const pinSeq = useRef(0);
  const navPhase = useNav((s) => s.phase);
  const navDestination = useNav((s) => s.destination);
  const navRoute = useNav((s) => s.route);
  const guiding = navPhase === 'guiding';
  const routing = navPhase === 'routing' || navPhase === 'preview';

  // Choosing something else while a route is only being previewed drops that preview; guidance is ended
  // explicitly with the End button.
  const dropPreview = () => {
    if (useNav.getState().phase !== 'guiding') stopNavigation();
  };

  // Opened from Destinations / a widget with ?dest=<place id>.
  const destId = params.dest;
  useEffect(() => {
    if (!destId) return;
    const found = [...favorites, ...recents].find((p) => p.id === destId);
    if (found) setSelected(found);
    // only react to the param, not to later edits of the lists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destId]);

  const showPanel = focused || query.length > 0;

  const pick = async (result: SearchResult) => {
    try {
      const place = await resolveResult(result, {
        googleKey: useSettings.getState().googleMapsKey,
        language: 'en',
      });
      setQuery('');
      setFocused(false);
      inputRef.current?.blur();
      dropPreview();
      if (assign) {
        saveFavorite(place, assign);
        toast(t('maps.savedAs', { kind: t(`maps.kind.${assign}`) }), 'ok');
        setAssign(null);
        setSelected(place);
        return;
      }
      if (autoHandoff) return navigateTo(place);
      setSelected(place);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'bad');
    }
  };

  const openPlace = (place: Place) => {
    setQuery('');
    setFocused(false);
    inputRef.current?.blur();
    dropPreview();
    if (autoHandoff) navigateTo(place);
    else setSelected(place);
  };

  const dropPin = async (p: { lat: number; lng: number }) => {
    // While driving a route, stray taps on the map must not open a new destination.
    if (useNav.getState().phase === 'guiding') return;
    dropPreview();
    const seq = ++pinSeq.current;
    setFocused(false);
    inputRef.current?.blur();
    const placeholder: Place = {
      id: `pin:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`,
      name: t('maps.droppedPin'),
      lat: p.lat,
      lng: p.lng,
    };
    setSelected(placeholder);
    const info = await reverseGeocode(p.lat, p.lng);
    if (seq === pinSeq.current) setSelected({ ...placeholder, name: info.name, address: info.address });
  };

  const home = favorites.find((f) => f.kind === 'home');
  const work = favorites.find((f) => f.kind === 'work');
  const customs = favorites.filter((f) => f.kind === 'custom');

  const chips = useMemo(
    () => [
      { key: 'home', icon: 'home', label: t('apps.home'), place: home, slot: 'home' as const },
      { key: 'work', icon: 'briefcase', label: t('destinations.work'), place: work, slot: 'work' as const },
    ],
    [home, work, t],
  );

  return (
    <section className="maps" aria-label={t('apps.maps')}>
      <MapCanvas
        className="maps__map"
        destination={navDestination ?? selected}
        route={navRoute?.coords ?? null}
        guiding={guiding}
        onTap={dropPin}
        recenterNonce={recenterNonce}
        onFollowChange={setFollowing}
      />

      <div className="maps__top">
        <BackButton />
        {guiding && <GuidanceBanner />}
        <div className="maps__search glass" hidden={guiding}>
          <Icon name="search" />
          <TextInput
            ref={inputRef}
            value={query}
            placeholder={assign ? t('maps.searchFor', { what: t(`maps.kind.${assign}`) }) : t('maps.search')}
            aria-label={t('maps.search')}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            onFocus={() => setFocused(true)}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSubmitNonce((n) => n + 1)}
          />
          {(query || focused) && (
            <button
              className="btn btn--icon btn--ghost"
              aria-label={t('common.close')}
              onClick={() => {
                setQuery('');
                setFocused(false);
                setAssign(null);
                inputRef.current?.blur();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {showPanel && !guiding && (
        <div className="maps__panel glass scroll-y" role="listbox" aria-label={t('maps.results')}>
          {search.tooShort ? (
            <>
              <div className="maps__chips">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    className="btn btn--sm"
                    onClick={() =>
                      c.place ? openPlace(c.place) : (setAssign(c.slot), inputRef.current?.focus())
                    }
                  >
                    <Icon name={c.icon} size="1.1em" />
                    {c.place ? c.label : t('maps.setSlot', { slot: c.label })}
                  </button>
                ))}
                {customs.map((p) => (
                  <button key={p.id} className="btn btn--sm" onClick={() => openPlace(p)}>
                    <Icon name="star" size="1.1em" />
                    <span className="ellipsis">{p.name}</span>
                  </button>
                ))}
              </div>
              {recents.slice(0, 5).map((p) => (
                <PlaceRow key={p.id} place={p} onOpen={() => openPlace(p)} onNavigate={() => navigateTo(p)} />
              ))}
              {recents.length === 0 && <p className="dim maps__hint">{t('maps.typeToSearch')}</p>}
            </>
          ) : (
            <>
              {search.loading && <div className="spinner" style={{ margin: '0.75rem auto' }} />}
              {!search.live && !search.loading && search.results.length === 0 && !search.error && (
                <p className="dim maps__hint">{t('maps.pressSearch')}</p>
              )}
              {search.error && (
                <p className="maps__hint" style={{ color: 'var(--danger)' }}>
                  {search.error}
                </p>
              )}
              {!search.loading && search.live && search.results.length === 0 && !search.error && (
                <p className="dim maps__hint">{t('maps.noResults')}</p>
              )}
              {search.results.map((r) => (
                <button
                  key={r.id}
                  className="row row--tight"
                  role="option"
                  aria-selected={false}
                  onClick={() => void pick(r)}
                >
                  <span className="row__lead">
                    <Icon name="pin" />
                  </span>
                  <span className="row__text">
                    <span className="row__title ellipsis">{r.name}</span>
                    <span className="row__sub ellipsis">{r.address}</span>
                  </span>
                </button>
              ))}
              <p className="maps__attr dim">{ATTRIBUTION[provider]}</p>
            </>
          )}
        </div>
      )}

      <div className="maps__bottom">
        <div className="maps__fabs">
          <SpeedBadge />
          <button
            className="btn btn--icon glass"
            aria-label={t('maps.locate')}
            aria-pressed={following && geoStatus === 'watching'}
            onClick={() => setRecenterNonce((n) => n + 1)}
            style={following && geoStatus === 'watching' ? { color: 'var(--accent)' } : undefined}
          >
            <Icon name="crosshair" size="1.7rem" />
          </button>
        </div>
        {guiding ? (
          <GuidanceBar />
        ) : routing ? (
          <RouteSheet />
        ) : (
          selected && <DestinationSheet place={selected} onClose={() => setSelected(null)} />
        )}
        {geoStatus === 'denied' && (
          <div className="notice" data-tone="bad">
            <Icon name="warning" />
            <div className="notice__text">{t('maps.locationDenied')}</div>
          </div>
        )}
      </div>
    </section>
  );
}
