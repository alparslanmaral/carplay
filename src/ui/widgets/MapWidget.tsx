import { useRouter } from '../../core/router';
import { useNav } from '../../services/maps/navigation';
import { MapCanvas } from '../components/MapCanvas';
import { WidgetNavOverlay } from '../components/NavPanels';

/**
 * Dashboard map card. Non-interactive (so it never fights page scrolling); a tap opens the full Maps screen.
 * It mirrors the trip in progress: route line, next turn and arrival, so the dashboard is a navigation view too.
 */
export function MapWidget() {
  const destination = useNav((s) => s.destination);
  const route = useNav((s) => s.route);
  const guiding = useNav((s) => s.phase === 'guiding');
  return (
    <div className="widget-map glass">
      <MapCanvas
        interactive={false}
        destination={destination}
        route={route?.coords ?? null}
        guiding={guiding}
        onActivate={() => useRouter.getState().open('maps')}
      />
      <WidgetNavOverlay />
    </div>
  );
}
