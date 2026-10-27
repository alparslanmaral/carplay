import { useTranslation } from 'react-i18next';
import { useSettings } from '../../core/settings';
import { WIDGET_MAP, type WidgetDef } from '../widgets/widgets';
import { useLayout } from '../hooks/useViewport';

function WidgetCard({ def }: { def: WidgetDef }) {
  const { t } = useTranslation();
  const Body = def.component;
  if (def.bare) {
    return (
      <div className="widget widget--bare" data-widget={def.id}>
        <Body />
      </div>
    );
  }
  return (
    <section className="card widget" data-widget={def.id} aria-label={t(def.titleKey)}>
      <Body />
    </section>
  );
}

export default function Dashboard() {
  const layout = useLayout();
  const ids = useSettings((s) => s.dashboardWidgets);
  const split = useSettings((s) => s.dashboardSplit);
  // Ids without an implementation (for example a widget removed in a later version) are skipped.
  const simplified = useSettings((s) => s.simplified);
  const widgets = ids
    .filter((id) => !simplified || ['map', 'nowplaying', 'speed'].includes(id))
    .map((id) => WIDGET_MAP.get(id))
    .filter((w): w is WidgetDef => !!w);
  const map = widgets.find((w) => w.id === 'map');
  const rest = widgets.filter((w) => w.id !== 'map');

  if (layout === 'landscape') {
    return (
      <div
        className="dash dash--landscape"
        style={{ gridTemplateColumns: map ? `minmax(0, ${split}fr) minmax(0, ${100 - split}fr)` : undefined }}
        data-has-map={!!map}
      >
        {map && <WidgetCard def={map} />}
        <div className="dash__col scroll-y">
          {rest.map((w) => (
            <WidgetCard key={w.id} def={w} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="dash dash--portrait scroll-y">
      {widgets.map((w) => (
        <WidgetCard key={w.id} def={w} />
      ))}
    </div>
  );
}
