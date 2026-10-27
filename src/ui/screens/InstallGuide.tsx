import { useTranslation } from 'react-i18next';
import { getFeatures } from '../../core/features';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';

/** iOS install instructions (also shown from onboarding). */
export function InstallSteps() {
  const { t } = useTranslation();
  const steps = t('install.steps', { returnObjects: true }) as {
    title: string;
    body: string;
    icon: string;
  }[];
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s.title} className="card step">
          <span className="step__n">{i + 1}</span>
          <Icon name={s.icon} size="1.75rem" />
          <div>
            <strong>{s.title}</strong>
            <p className="dim">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function InstallGuide() {
  const { t } = useTranslation();
  const f = getFeatures();
  return (
    <Screen title={t('about.install')}>
      <div
        className="notice"
        data-tone={f.standalone ? undefined : 'bad'}
        style={{ marginBottom: '0.75rem' }}
      >
        <Icon name={f.standalone ? 'check' : 'info'} size="1.5rem" />
        <div className="notice__text">
          <div className="notice__title">
            {f.standalone ? t('install.installed') : t('install.notInstalled')}
          </div>
          <div className="notice__body">
            {f.standalone
              ? t('install.installedBody')
              : f.ios
                ? t('install.iosBody')
                : t('install.otherBody')}
          </div>
        </div>
      </div>
      <InstallSteps />
      <h2 className="section-title">{t('install.tipsTitle')}</h2>
      <ul className="tips">
        {(t('install.tips', { returnObjects: true }) as string[]).map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </Screen>
  );
}
