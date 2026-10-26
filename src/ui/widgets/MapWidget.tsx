import { useRouter } from '../../core/router';
import { MapCanvas } from '../components/MapCanvas';

/** Dashboard map card. Non-interactive (so it never fights page scrolling); a tap opens the full Maps screen. */
export function MapWidget() {
  return (
    <div className="widget-map glass">
      <MapCanvas interactive={false} onActivate={() => useRouter.getState().open('maps')} />
    </div>
  );
}
