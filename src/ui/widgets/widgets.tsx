import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { allApps, SHORTCUT_PREFIX } from '../../core/apps';
import { getLastKnownPosition } from '../../core/lastPos';
import { useRouter } from '../../core/router';
import { useSettings } from '../../core/settings';
import { formatDistance, formatSpeed, haversine, speedLabel } from '../../core/units';
import { fetchWeather, describeWeather, type Weather } from '../../services/weather';
import { useGeo } from '../../services/maps/geolocation';
import { getFavorite } from '../../services/maps/places';
import { navigateTo } from '../../services/maps/handoff';
import { mediaActions } from '../../services/media/actions';
import { useMedia, useMediaState } from '../../services/media/manager';
import { Icon } from '../components/Icon';
import { useClock } from '../hooks/useClock';
import { launchApp } from '../launch';
import { MapWidget } from './MapWidget';

/* ---------- Now Playing ---------- */
function NowPlayingWidget() {
  const { t } = useTranslation();
  const active = useMedia((s) => s.active);
  const track = useMediaState((s) => s.track);
  const playing = useMediaState((s) => s.playing);
  const open = () => useRouter.getState().open('nowplaying');
  if (!active || !track) {
    return (
      <button className="widget-np widget-np--empty" onClick={open}>
        <Icon name="music" size="2rem" />
        <span className="dim">{t('nowplaying.nothing')}</span>
      </button>
    );
  }
  return (
    <div className="widget-np">
      <button className="widget-np__main" onClick={open} aria-label={t('nowplaying.open')}>
        {track.artworkUrl ? (
          <img className="widget-np__art" src={track.artworkUrl} alt="" />
        ) : (
          <span className="widget-np__art">
            <Icon name="music" />
          </span>
        )}
        <span className="widget-np__text">
          <span className="widget-np__title ellipsis">{track.title}</span>
          <span className="widget-np__artist dim ellipsis">{track.artist}</span>
        </span>
      </button>
      <div className="widget-np__controls">
        <button
          className="btn btn--icon btn--ghost"
          onClick={() => void mediaActions.previous()}
          aria-label={t('nowplaying.previous')}
        >
          <Icon name="prev" />
        </button>
        <button
          className="btn btn--icon btn--primary"
          onClick={() => void mediaActions.togglePlay()}
          aria-label={playing ? t('nowplaying.pause') : t('nowplaying.play')}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button
          className="btn btn--icon btn--ghost"
          onClick={() => void mediaActions.next()}
          aria-label={t('nowplaying.next')}
        >
          <Icon name="next" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Speed ---------- */
function SpeedWidget() {
  const { t } = useTranslation();
  const speed = useGeo((s) => s.speedKmh);
  const status = useGeo((s) => s.status);
  const accuracy = useGeo((s) => s.accuracy);
  const start = useGeo((s) => s.start);
  const unit = useSettings((s) => s.speedUnit);
  const alertAt = useSettings((s) => s.speedAlert);
  const show = useSettings((s) => s.showSpeedWidget);
  const live = status === 'watching';
  const over = alertAt > 0 && speed > alertAt;
  if (!show) return null;
  return (
    <div className="widget-speed" data-alert={over}>
      <div className="widget-speed__value tabular">{live ? formatSpeed(speed, unit) : '--'}</div>
      <div className="widget-speed__unit">{speedLabel(unit)}</div>
      {live ? (
        <div className="widget-speed__sub dim">{accuracy !== null ? `±${Math.round(accuracy)} m` : ''}</div>
      ) : (
        <button className="btn btn--sm" onClick={start}>
          <Icon name="crosshair" size="1.1em" />
          {t('dashboard.enableLocation')}
        </button>
      )}
    </div>
  );
}

/* ---------- Clock ---------- */
function ClockWidget() {
  const { now, time, suffix } = useClock();
  return (
    <div className="widget-clock">
      <div className="widget-clock__time tabular">
        {time}
        {suffix && <small>{suffix}</small>}
      </div>
      <div className="widget-clock__date dim">
        {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  );
}

/* ---------- Weather ---------- */
type WeatherState =
  { kind: 'loading' } | { kind: 'nolocation' } | { kind: 'error' } | { kind: 'ok'; data: Weather };

export function useWeather(): WeatherState {
  const lat = useGeo((s) => s.lat);
  const lng = useGeo((s) => s.lng);
  const fahrenheit = useSettings((s) => s.speedUnit === 'mph');
  const [state, setState] = useState<WeatherState>({ kind: 'loading' });
  const pos = lat !== null && lng !== null ? { lat, lng } : getLastKnownPosition();
  const key = pos ? `${pos.lat.toFixed(1)},${pos.lng.toFixed(1)}` : null;
  useEffect(() => {
    if (!pos) return setState({ kind: 'nolocation' });
    let live = true;
    const load = () =>
      fetchWeather(pos.lat, pos.lng, fahrenheit)
        .then((data) => live && setState({ kind: 'ok', data }))
        .catch(() => live && setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
    void load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => {
      live = false;
      clearInterval(id);
    };
    // `pos` is derived from `key`; depending on the object would refetch on every GPS fix
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fahrenheit]);
  return state;
}

function WeatherWidget() {
  const { t } = useTranslation();
  const state = useWeather();
  if (state.kind === 'loading') return <div className="widget-weather dim">{t('common.loading')}</div>;
  if (state.kind === 'nolocation')
    return <div className="widget-weather dim">{t('dashboard.weatherNoLocation')}</div>;
  if (state.kind === 'error') return <div className="widget-weather dim">{t('dashboard.weatherError')}</div>;
  const { data } = state;
  const look = describeWeather(data.code, data.isDay);
  return (
    <div className="widget-weather">
      <Icon name={look.icon} size="2.75rem" />
      <div>
        <div className="widget-weather__temp tabular">
          {Math.round(data.temperature)}°{data.fahrenheit ? 'F' : 'C'}
        </div>
        <div className="dim">{t(`weather.${look.label}`)}</div>
      </div>
      <div className="widget-weather__wind dim">
        <Icon name="navigate" size="1em" /> {Math.round(data.windKmh)} km/h
      </div>
    </div>
  );
}

/* ---------- Recent destinations ---------- */
function RecentsWidget() {
  const { t } = useTranslation();
  const recents = useSettings((s) => s.recents);
  const unit = useSettings((s) => s.distanceUnit);
  const lat = useGeo((s) => s.lat);
  const lng = useGeo((s) => s.lng);
  if (recents.length === 0) return <div className="dim">{t('dashboard.noRecents')}</div>;
  return (
    <div className="list">
      {recents.slice(0, 3).map((p) => (
        <button key={p.id} className="row row--tight" onClick={() => navigateTo(p)}>
          <span className="row__lead">
            <Icon name="pin" />
          </span>
          <span className="row__text">
            <span className="row__title ellipsis">{p.name}</span>
            {lat !== null && lng !== null && (
              <span className="row__sub">{formatDistance(haversine(lat, lng, p.lat, p.lng), unit)}</span>
            )}
          </span>
          <span className="row__trail">
            <Icon name="navigate" size="1.1em" />
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Quick actions ---------- */
function QuickActionsWidget() {
  const { t } = useTranslation();
  const shortcuts = useSettings((s) => s.shortcuts);
  const favorites = useSettings((s) => s.favorites);
  const home = favorites.find((f) => f.kind === 'home') ?? getFavorite('home');
  const work = favorites.find((f) => f.kind === 'work');
  const apps = allApps(shortcuts);
  return (
    <div className="quick">
      <button className="btn quick__btn" disabled={!home} onClick={() => home && navigateTo(home)}>
        <Icon name="home" /> {t('dashboard.goHome')}
      </button>
      <button className="btn quick__btn" disabled={!work} onClick={() => work && navigateTo(work)}>
        <Icon name="briefcase" /> {t('dashboard.goWork')}
      </button>
      {shortcuts.slice(0, 4).map((s) => {
        const app = apps.get(SHORTCUT_PREFIX + s.id);
        return (
          <button key={s.id} className="btn quick__btn" onClick={() => app && launchApp(app)}>
            <Icon name={s.icon} /> <span className="ellipsis">{s.name}</span>
          </button>
        );
      })}
      {!home && !work && <p className="dim quick__hint">{t('dashboard.setFavoritesHint')}</p>}
    </div>
  );
}

export interface WidgetDef {
  id: string;
  titleKey: string;
  icon: string;
  component: ComponentType;
  /** Rendered without the card chrome (the widget draws its own surface). */
  bare?: boolean;
}

export const WIDGETS: WidgetDef[] = [
  { id: 'map', titleKey: 'widgets.map', icon: 'map', component: MapWidget, bare: true },
  { id: 'nowplaying', titleKey: 'widgets.nowplaying', icon: 'music', component: NowPlayingWidget },
  { id: 'speed', titleKey: 'widgets.speed', icon: 'gauge', component: SpeedWidget },
  { id: 'clock', titleKey: 'widgets.clock', icon: 'clock', component: ClockWidget },
  { id: 'weather', titleKey: 'widgets.weather', icon: 'cloud-sun', component: WeatherWidget },
  { id: 'recents', titleKey: 'widgets.recents', icon: 'pin', component: RecentsWidget },
  { id: 'actions', titleKey: 'widgets.actions', icon: 'bolt', component: QuickActionsWidget },
];

export const WIDGET_MAP = new Map(WIDGETS.map((w) => [w.id, w]));
