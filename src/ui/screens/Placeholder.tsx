import { useTranslation } from 'react-i18next';
import type { ScreenId } from '../../core/router';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';

/** Visible stand-in for screens whose milestone has not landed yet. Removed once every screen exists. */
export function Placeholder({ screen }: { screen: ScreenId }) {
  const { t } = useTranslation();
  return (
    <Screen title={screen}>
      <div className="empty">
        <Icon name="info" size="3rem" />
        <strong>{t('placeholder.title')}</strong>
        <span>{t('placeholder.body')}</span>
      </div>
    </Screen>
  );
}
