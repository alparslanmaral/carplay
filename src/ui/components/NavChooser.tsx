import { useTranslation } from 'react-i18next';
import { NAV_APPS } from '../../services/maps/deeplinks';
import { handOffTo, useNavChooser } from '../../services/maps/handoff';
import { Icon } from './Icon';
import { Sheet } from './Overlays';

/** "Navigate in ..." sheet shown when the preferred nav app is set to "ask". */
export function NavChooser() {
  const { t } = useTranslation();
  const place = useNavChooser((s) => s.place);
  const close = useNavChooser((s) => s.close);
  return (
    <Sheet open={!!place} onClose={close} title={t('maps.navigateIn')} subtitle={place?.name}>
      <div className="list">
        {NAV_APPS.map((a) => (
          <button
            key={a.id}
            className="row"
            onClick={() => {
              if (place) handOffTo(a.id, place);
              close();
            }}
          >
            <span className="row__lead">
              <Icon name="navigate" />
            </span>
            <span className="row__text">
              <span className="row__title">{a.label}</span>
            </span>
            <span className="row__trail">
              <Icon name="external" size="1.1em" />
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
