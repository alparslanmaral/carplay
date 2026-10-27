import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';

interface Limit {
  title: string;
  body: string;
  icon: string;
}

/** Plain-language list of everything the platform does not allow, kept in sync with the README section. */
export default function Limitations() {
  const { t } = useTranslation();
  const items = t('limits.items', { returnObjects: true }) as Limit[];
  return (
    <Screen title={t('about.limitations')}>
      <p className="dim limits-intro">{t('limits.intro')}</p>
      <div className="list">
        {items.map((l) => (
          <article key={l.title} className="card limit">
            <div className="limit__head">
              <Icon name={l.icon} size="1.5rem" />
              <h2>{l.title}</h2>
            </div>
            <p>{l.body}</p>
          </article>
        ))}
      </div>
    </Screen>
  );
}
