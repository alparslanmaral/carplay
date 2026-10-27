import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFeatures } from '../../core/features';
import { useRouter } from '../../core/router';
import { OPTIONS, useSettings } from '../../core/settings';
import { toast } from '../../core/toast';
import { useGeo } from '../../services/maps/geolocation';
import { isConfigured as spotifyConfigured, startLogin, useSpotifyAuth } from '../../services/spotify/auth';
import { isConfigured as googleConfigured, signIn, useYouTubeAuth } from '../../services/youtube/auth';
import { Icon } from '../components/Icon';
import { InstallSteps } from './InstallGuide';

const STEP_KEY = 'dd.onboardingStep';
const STEPS = ['welcome', 'location', 'accounts', 'layout', 'done'] as const;
type Step = (typeof STEPS)[number];

function loadStep(): number {
  try {
    const n = Number(sessionStorage.getItem(STEP_KEY) ?? localStorage.getItem(STEP_KEY));
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
  } catch {
    return 0;
  }
}

function RailChoice({
  value,
  selected,
  onPick,
}: {
  value: (typeof OPTIONS.railPosition)[number];
  selected: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button className="rail-choice" role="radio" aria-checked={selected} onClick={onPick}>
      <span className="rail-choice__screen" data-rail={value}>
        <span className="rail-choice__rail" />
        <span className="rail-choice__main" />
      </span>
      <span>{t(`set.items.railPosition.opt.${value}`)}</span>
    </button>
  );
}

export default function Onboarding() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(loadStep);
  const step: Step = STEPS[index]!;
  const f = getFeatures();
  const geo = useGeo();
  const spConnected = useSpotifyAuth((s) => s.connected);
  const ytConnected = useYouTubeAuth((s) => s.connected);
  const rail = useSettings((s) => s.railPosition);
  const set = useSettings((s) => s.set);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, n));
    setIndex(next);
    try {
      localStorage.setItem(STEP_KEY, String(next));
    } catch {
      /* ignore */
    }
  };
  const finish = () => {
    set('onboardingDone', true);
    try {
      localStorage.removeItem(STEP_KEY);
    } catch {
      /* ignore */
    }
    useRouter.getState().reset('home');
  };

  return (
    <section className="onb" aria-label={t('onboarding.title')}>
      <div className="onb__body scroll-y">
        {step === 'welcome' && (
          <>
            <div className="onb__hero">
              <Icon name="gauge" size="4rem" />
              <h1>{t('onboarding.welcome')}</h1>
              <p className="dim">{t('onboarding.welcomeBody')}</p>
            </div>
            {!f.standalone && (
              <div className="onb__card card">
                <h2 className="card__title">{t('onboarding.installTitle')}</h2>
                <p className="dim">{f.ios ? t('install.iosBody') : t('install.otherBody')}</p>
                <InstallSteps />
              </div>
            )}
          </>
        )}

        {step === 'location' && (
          <div className="onb__hero">
            <Icon name="crosshair" size="4rem" />
            <h1>{t('onboarding.locationTitle')}</h1>
            <p className="dim">{t('onboarding.locationBody')}</p>
            {geo.status === 'watching' ? (
              <span className="chip" data-tone="ok">
                <Icon name="check" size="1em" /> {t('onboarding.locationOn')}
              </span>
            ) : geo.status === 'denied' ? (
              <p className="set-error">{t('maps.locationDenied')}</p>
            ) : (
              <button className="btn btn--primary" onClick={() => useGeo.getState().start()}>
                {t('onboarding.allowLocation')}
              </button>
            )}
          </div>
        )}

        {step === 'accounts' && (
          <div className="onb__hero">
            <Icon name="music" size="4rem" />
            <h1>{t('onboarding.accountsTitle')}</h1>
            <p className="dim">{t('onboarding.accountsBody')}</p>
            <div className="onb__actions">
              <button
                className="btn btn--primary"
                disabled={spConnected || !spotifyConfigured()}
                onClick={() => startLogin().catch((e: Error) => toast(e.message, 'bad'))}
              >
                {spConnected ? t('onboarding.spotifyConnected') : t('spotify.connect')}
              </button>
              <button
                className="btn"
                disabled={ytConnected || !googleConfigured()}
                onClick={() => signIn().catch((e: Error) => toast(e.message, 'bad', 6000))}
              >
                {ytConnected ? t('onboarding.youtubeConnected') : t('youtube.signIn')}
              </button>
            </div>
            {(!spotifyConfigured() || !googleConfigured()) && (
              <p className="faint">{t('onboarding.notConfiguredHint')}</p>
            )}
            <p className="faint">{t('onboarding.skipHint')}</p>
          </div>
        )}

        {step === 'layout' && (
          <div className="onb__hero">
            <Icon name="layout" size="4rem" />
            <h1>{t('onboarding.layoutTitle')}</h1>
            <p className="dim">{t('onboarding.layoutBody')}</p>
            <div className="rail-choices" role="radiogroup" aria-label={t('set.items.railPosition.label')}>
              {OPTIONS.railPosition.map((v) => (
                <RailChoice key={v} value={v} selected={rail === v} onPick={() => set('railPosition', v)} />
              ))}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="onb__hero">
            <Icon name="check" size="4rem" />
            <h1>{t('onboarding.doneTitle')}</h1>
            <p className="dim">{t('onboarding.doneBody')}</p>
          </div>
        )}
      </div>

      <footer className="onb__footer">
        <button className="btn btn--ghost" disabled={index === 0} onClick={() => go(index - 1)}>
          {t('common.back')}
        </button>
        <div className="home__dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className="home__dot" aria-selected={i === index} />
          ))}
        </div>
        {step === 'done' ? (
          <button className="btn btn--primary" onClick={finish}>
            {t('onboarding.start')}
          </button>
        ) : (
          <button className="btn btn--primary" onClick={() => go(index + 1)}>
            {step === 'accounts' && !spConnected && !ytConnected
              ? t('onboarding.skip')
              : t('onboarding.next')}
          </button>
        )}
      </footer>
    </section>
  );
}
