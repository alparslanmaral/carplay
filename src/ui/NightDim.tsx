import { useEffect, useState } from 'react';
import { useSettings } from '../core/settings';
import { inTimeWindow } from '../core/theme';

/** Black overlay for night driving: always on, or only inside the scheduled window. Taps pass through. */
export function NightDim() {
  const enabled = useSettings((s) => s.dimEnabled);
  const scheduled = useSettings((s) => s.dimScheduleEnabled);
  const start = useSettings((s) => s.dimStart);
  const end = useSettings((s) => s.dimEnd);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!scheduled) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [scheduled]);
  const active = enabled && (!scheduled || inTimeWindow(now, start, end));
  if (!active) return null;
  return <div className="night-dim" aria-hidden="true" />;
}
