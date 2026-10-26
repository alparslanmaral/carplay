import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Place } from '../../core/settings';
import { useSettings } from '../../core/settings';
import { formatDistance, haversine } from '../../core/units';
import { getLastKnownPosition } from '../../core/lastPos';
import { useGeo } from '../../services/maps/geolocation';
import { Icon } from './Icon';

export function usePlaceDistance(): (p: { lat: number; lng: number }) => string {
  const unit = useSettings((s) => s.distanceUnit);
  const lat = useGeo((s) => s.lat);
  const lng = useGeo((s) => s.lng);
  const origin = lat !== null && lng !== null ? { lat, lng } : getLastKnownPosition();
  return (p) => (origin ? formatDistance(haversine(origin.lat, origin.lng, p.lat, p.lng), unit) : '');
}

const KIND_ICON = { home: 'home', work: 'briefcase', custom: 'star' } as const;

/** Row for a saved or recent place. Tapping the row shows it on the map, the trailing button navigates. */
export function PlaceRow({
  place,
  onOpen,
  onNavigate,
  trailing,
}: {
  place: Place;
  onOpen: () => void;
  onNavigate?: () => void;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  const distance = usePlaceDistance();
  const icon = place.kind ? KIND_ICON[place.kind] : 'pin';
  const sub = [distance(place), place.address].filter(Boolean).join(' · ');
  return (
    <div className="row" role="button" tabIndex={0} onClick={onOpen}>
      <span className="row__lead">
        <Icon name={icon} />
      </span>
      <span className="row__text">
        <span className="row__title ellipsis">{place.name}</span>
        {sub && <span className="row__sub ellipsis">{sub}</span>}
      </span>
      <span className="row__trail">
        {trailing}
        {onNavigate && (
          <button
            className="btn btn--icon btn--primary"
            aria-label={t('maps.navigate')}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate();
            }}
          >
            <Icon name="navigate" size="1.4rem" />
          </button>
        )}
      </span>
    </div>
  );
}
