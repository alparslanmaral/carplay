import { useTranslation } from 'react-i18next';
import { BUILTIN_APPS } from '../../core/apps';
import { useSettings } from '../../core/settings';
import { AppTile } from '../components/AppIcon';
import { Icon } from '../components/Icon';

/** Live preview strip for Appearance: it reads the same design tokens as the real UI, so changes show instantly. */
export function AppIconPreview() {
  const { t } = useTranslation();
  const labels = useSettings((s) => s.showLabels);
  const sample = BUILTIN_APPS.slice(0, 4);
  return (
    <div className="card set-preview" aria-label={t('settings.preview')}>
      <div className="set-preview__icons">
        {sample.map((app) => (
          <div key={app.id} className="set-preview__app">
            <AppTile app={app} />
            {labels && <span className="app-icon__label">{t(`apps.${app.labelKey}`)}</span>}
          </div>
        ))}
      </div>
      <div className="set-preview__row">
        <button className="btn btn--primary">
          <Icon name="play" size="1.1em" /> {t('nowplaying.play')}
        </button>
        <div className="seg" role="presentation">
          <span className="seg__item" aria-checked="true" role="presentation">
            A
          </span>
          <span className="seg__item">B</span>
        </div>
        <button className="toggle" role="switch" aria-checked="true" aria-label="preview" tabIndex={-1} />
      </div>
    </div>
  );
}
