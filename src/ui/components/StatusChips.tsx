import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGeo } from '../../services/maps/geolocation';
import { useDriving } from '../../core/driving';
import { useSettings } from '../../core/settings';
import { Icon } from './Icon';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

type Tone = 'ok' | 'warn' | 'bad' | undefined;

export function gpsTone(status: string, accuracy: number | null): Tone {
  if (status === 'watching') return accuracy !== null && accuracy > 65 ? 'warn' : 'ok';
  if (status === 'denied' || status === 'unavailable' || status === 'error') return 'bad';
  return undefined;
}

/** GPS / connectivity / driving-lock indicators, shared by the rail and the portrait status bar. */
export function StatusChips({ showLock = true }: { showLock?: boolean }) {
  const { t } = useTranslation();
  const online = useOnline();
  const status = useGeo((s) => s.status);
  const accuracy = useGeo((s) => s.accuracy);
  const moving = useDriving((s) => s.moving);
  const passenger = useDriving((s) => s.passenger);
  const lockInput = useSettings((s) => s.lockInput);
  return (
    <div className="status-chips">
      <span className="status-chip" data-tone={gpsTone(status, accuracy)} title={t(`status.gps.${status}`)}>
        <Icon name="crosshair" size="1.1rem" />
      </span>
      <span
        className="status-chip"
        data-tone={online ? undefined : 'bad'}
        title={online ? t('status.online') : t('status.offline')}
      >
        <Icon name={online ? 'wifi' : 'wifi-off'} size="1.1rem" />
      </span>
      {showLock && lockInput && moving && (
        <span className="status-chip" data-tone={passenger ? 'warn' : 'bad'} title={t('status.locked')}>
          <Icon name="lock" size="1.1rem" />
        </span>
      )}
    </div>
  );
}
