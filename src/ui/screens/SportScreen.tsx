import { useTranslation } from 'react-i18next';
import { useRouter } from '../../core/router';
import { useSettings } from '../../core/settings';
import { SECTIONS, isItemVisible } from '../../core/settingsSchema';
import { getFeatures } from '../../core/features';
import { formatSpeed, speedLabel } from '../../core/units';
import { playDemo, useSport } from '../../services/sport/controller';
import { ENGINES } from '../../services/sport/profiles';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { SettingRow } from '../settings/controls';

const R = 80;
const C = 2 * Math.PI * R;
const SWEEP = 0.75;

/** 270-degree rev counter with a red zone; the arc is drawn with dash lengths so it needs no trigonometry. */
function Tach({ rpm, redline }: { rpm: number; redline: number }) {
  const frac = Math.min(1, Math.max(0, rpm / redline));
  const red = 0.88;
  return (
    <svg className="tach__svg" viewBox="0 0 200 200" aria-hidden="true">
      <g transform="rotate(135 100 100)" fill="none" strokeWidth="14" strokeLinecap="round">
        <circle className="tach__track" cx="100" cy="100" r={R} strokeDasharray={`${SWEEP * C} ${C}`} />
        <circle
          className="tach__red"
          cx="100"
          cy="100"
          r={R}
          strokeDasharray={`${(1 - red) * SWEEP * C} ${C}`}
          strokeDashoffset={-red * SWEEP * C}
        />
        <circle
          className="tach__value"
          cx="100"
          cy="100"
          r={R}
          strokeDasharray={`${Math.max(0.001, frac * SWEEP * C)} ${C}`}
        />
      </g>
    </svg>
  );
}

export default function SportScreen() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { sportMode, sportEngine } = settings;
  const speedUnit = settings.speedUnit;
  const { active, locked, demo, supported, rpm, gear, boost, speedKmh } = useSport();
  const profile = ENGINES[sportEngine];
  const section = SECTIONS.find((s) => s.id === 'sport')!;
  const features = getFeatures();
  const rows = section.items.filter((i) => i.id !== 'sportMode' && isItemVisible(i, settings, features));

  let status = t('sport.off');
  if (!supported) status = t('sport.unsupported');
  else if (sportMode && locked) status = t('sport.tapToEnable');
  else if (sportMode) status = t('sport.listening');

  return (
    <Screen
      title={t('sport.title')}
      actions={
        <button
          className="btn btn--icon btn--ghost"
          aria-label={t('sport.settings')}
          onClick={() => useRouter.getState().open('settings', { section: 'sport' })}
        >
          <Icon name="sliders" />
        </button>
      }
    >
      <div className="sport">
        <div className="sport__hero">
          <div className="tach" data-live={active} role="img" aria-label={`${Math.round(rpm)} rpm`}>
            <Tach rpm={active ? rpm : 0} redline={profile.redline} />
            <div className="tach__center">
              <strong className="tach__rpm tabular">{active ? Math.round(rpm / 10) * 10 : '—'}</strong>
              <span className="tach__unit">{t('sport.rpm')}</span>
              <span className="tach__gear tabular">
                {t('sport.gear')} {active && settings.sportGearbox ? gear : '–'}
              </span>
            </div>
          </div>
          <div className="sport__stats">
            <div className="sport__stat">
              <strong className="tabular">{formatSpeed(speedKmh, speedUnit)}</strong>
              <span>{speedLabel(speedUnit)}</span>
            </div>
            <div className="sport__stat">
              <div
                className="sport__bar"
                role="img"
                aria-label={`${t('sport.boost')} ${Math.round(boost * 100)}%`}
              >
                <span style={{ width: `${Math.round(boost * 100)}%` }} />
              </div>
              <span>{t('sport.boost')}</span>
            </div>
          </div>
        </div>

        <div className="sport__controls">
          <button
            className={`btn btn--block sport__toggle${sportMode ? ' btn--primary' : ''}`}
            aria-pressed={sportMode}
            onClick={() => settings.set('sportMode', !sportMode)}
          >
            <Icon name="engine" /> {sportMode ? t('sport.on') : t('sport.off')}
            <span className="sport__toggle-action">{sportMode ? t('sport.turnOff') : t('sport.turnOn')}</span>
          </button>
          <p className="sport__status dim" role="status">
            {status}
          </p>
          <button className="btn btn--block" onClick={playDemo} aria-pressed={demo}>
            <Icon name={demo ? 'stop' : 'play'} /> {demo ? t('sport.stopTest') : t('sport.test')}
          </button>
          <p className="dim sport__hint">{t('sport.testHint')}</p>
        </div>
      </div>

      <div className="sport__rows">
        {rows.map((item) => (
          <SettingRow key={item.id} item={item} />
        ))}
      </div>
      <p className="dim sport__hint">{t('sport.muteSwitch')}</p>
    </Screen>
  );
}
