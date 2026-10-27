import { useTranslation } from 'react-i18next';
import { useSettings } from '../../core/settings';
import { formatDistance } from '../../core/units';
import { useNavChooser } from '../../services/maps/handoff';
import {
  setAvoid,
  startGuidance,
  stopNavigation,
  refreshRoute,
  useNav,
} from '../../services/maps/navigation';
import { maneuverKind } from '../../services/maps/routing';
import { Icon } from './Icon';

/** "1 h 25 min" / "12 min". */
export function formatTripTime(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function useEta(seconds: number): string {
  const twelve = useSettings((s) => s.clockFormat) === '12';
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: twelve,
  });
}

/** Route summary shown before guidance starts: time, distance, tolls, avoid options and the Start button. */
export function RouteSheet() {
  const { t } = useTranslation();
  const phase = useNav((s) => s.phase);
  const destination = useNav((s) => s.destination);
  const route = useNav((s) => s.route);
  const error = useNav((s) => s.error);
  const unit = useSettings((s) => s.distanceUnit);
  const avoidTolls = useSettings((s) => s.avoidTolls);
  const avoidHighways = useSettings((s) => s.avoidHighways);
  const eta = useEta(route?.durationS ?? 0);
  if (!destination) return null;
  return (
    <div className="maps__sheet glass" role="dialog" aria-label={destination.name}>
      <div className="maps__sheet-head">
        <div className="maps__sheet-text">
          <h2 className="ellipsis">{destination.name}</h2>
          {destination.address && <p className="dim ellipsis">{destination.address}</p>}
        </div>
        <button className="btn btn--icon btn--ghost" onClick={stopNavigation} aria-label={t('common.close')}>
          <Icon name="close" />
        </button>
      </div>

      {phase === 'routing' && (
        <p className="nav__status">
          <span className="spinner nav__spinner" /> {t('maps.nav.calculating')}
        </p>
      )}

      {phase !== 'routing' && error && (
        <div className="notice" data-tone="bad">
          <Icon name="warning" />
          <div className="notice__text">{error}</div>
        </div>
      )}

      {phase !== 'routing' && route && (
        <>
          <p className="nav__summary">
            <strong className="tabular">{formatTripTime(route.durationS)}</strong>
            <span className="tabular">{formatDistance(route.distanceM, unit)}</span>
            <span className="dim">{t('maps.nav.arrives', { time: eta })}</span>
          </p>
          <p className="nav__notes">
            {route.hasToll ? (
              <span className="nav__note" data-tone="warn">
                <Icon name="warning" size="1.1em" /> {t('maps.nav.hasToll')}
              </span>
            ) : avoidTolls ? (
              <span className="nav__note">
                <Icon name="check" size="1.1em" /> {t('maps.nav.noToll')}
              </span>
            ) : null}
            {route.hasFerry && (
              <span className="nav__note" data-tone="warn">
                <Icon name="warning" size="1.1em" /> {t('maps.nav.hasFerry')}
              </span>
            )}
          </p>
        </>
      )}

      <div className="maps__sheet-row">
        <button
          className="btn btn--sm"
          aria-pressed={avoidTolls}
          data-on={avoidTolls}
          onClick={() => setAvoid({ avoidTolls: !avoidTolls })}
        >
          <Icon name={avoidTolls ? 'check' : 'plus'} size="1.1em" /> {t('maps.nav.avoidTolls')}
        </button>
        <button
          className="btn btn--sm"
          aria-pressed={avoidHighways}
          data-on={avoidHighways}
          onClick={() => setAvoid({ avoidHighways: !avoidHighways })}
        >
          <Icon name={avoidHighways ? 'check' : 'plus'} size="1.1em" /> {t('maps.nav.avoidHighways')}
        </button>
      </div>

      {route ? (
        <button className="btn btn--primary btn--block maps__go" onClick={startGuidance}>
          <Icon name="navigate" /> {t('maps.nav.start')}
        </button>
      ) : (
        phase !== 'routing' && (
          <button className="btn btn--primary btn--block maps__go" onClick={refreshRoute}>
            <Icon name="refresh" /> {t('maps.nav.retry')}
          </button>
        )
      )}
      <div className="maps__sheet-row">
        <button className="btn" onClick={() => useNavChooser.getState().open(destination)}>
          <Icon name="external" size="1.1em" /> {t('maps.otherApp')}
        </button>
      </div>
    </div>
  );
}

/** Next manoeuvre card, shown in place of the search field while guiding. */
export function GuidanceBanner() {
  const { t } = useTranslation();
  const unit = useSettings((s) => s.distanceUnit);
  const route = useNav((s) => s.route);
  const nextIdx = useNav((s) => s.nextIdx);
  const toNextM = useNav((s) => s.toNextM);
  const rerouting = useNav((s) => s.rerouting);
  const arrived = useNav((s) => s.arrived);
  const next = route?.maneuvers[nextIdx];
  if (!route || !next) return null;
  const kind = arrived ? 'arrive' : maneuverKind(next.type);
  const glyph = kind === 'arrive' ? 'flag' : `maneuver-${kind}`;
  return (
    <div className="nav__banner glass" role="status" aria-live="polite">
      <Icon name={glyph} size="2.75rem" strokeWidth={2.4} />
      <div className="nav__banner-text">
        <strong className="nav__dist tabular">
          {arrived ? t('maps.nav.arrived') : formatDistance(toNextM, unit)}
        </strong>
        <span className="nav__instr ellipsis-2">
          {rerouting ? t('maps.nav.rerouting') : arrived ? '' : next.text}
        </span>
      </div>
    </div>
  );
}

/** Trip totals and the End / voice buttons while guiding. */
export function GuidanceBar() {
  const { t } = useTranslation();
  const unit = useSettings((s) => s.distanceUnit);
  const voice = useSettings((s) => s.navVoice);
  const remainingM = useNav((s) => s.remainingM);
  const remainingS = useNav((s) => s.remainingS);
  const arrived = useNav((s) => s.arrived);
  const eta = useEta(remainingS);
  return (
    <div className="maps__sheet glass nav__bar">
      <div className="nav__totals">
        <strong className="tabular">{eta}</strong>
        <span className="tabular">{formatTripTime(remainingS)}</span>
        <span className="tabular dim">{formatDistance(remainingM, unit)}</span>
      </div>
      <button
        className="btn btn--icon btn--ghost"
        aria-pressed={voice}
        aria-label={voice ? t('maps.nav.voiceOff') : t('maps.nav.voiceOn')}
        onClick={() => useSettings.getState().set('navVoice', !voice)}
      >
        <Icon name={voice ? 'volume' : 'volume-off'} />
      </button>
      <button className="btn btn--danger" onClick={stopNavigation}>
        <Icon name="close" size="1.1em" /> {arrived ? t('maps.nav.done') : t('maps.nav.end')}
      </button>
    </div>
  );
}
