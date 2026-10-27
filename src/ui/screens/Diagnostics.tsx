import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { useDriving } from '../../core/driving';
import { getFeatures } from '../../core/features';
import { clearLogs, getLogs, subscribeLogs } from '../../core/logger';
import { toast } from '../../core/toast';
import { useGeo } from '../../services/maps/geolocation';
import { useMedia } from '../../services/media/manager';
import { mediaSessionDiagnostics } from '../../services/mediaSession';
import { useSpotifyApiState } from '../../services/spotify/api';
import { readToken as spotifyToken } from '../../services/spotify/auth';
import { spotifyController } from '../../services/spotify/controller';
import { readToken as youtubeToken } from '../../services/youtube/auth';
import { useWakeLockState } from '../../services/wakeLock';
import { Screen } from '../components/Screen';
import { useNow } from '../hooks/useClock';
import { usePwaStatus } from '../../core/pwa';

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="diag-row">
      <span className="dim">{label}</span>
      <span className="diag-row__value tabular" data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

function ago(ts: number | null | undefined, now: number): string {
  if (!ts) return '-';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
}

function until(ts: number | null | undefined, now: number): { text: string; tone?: 'ok' | 'bad' } {
  if (!ts) return { text: '-' };
  const s = Math.round((ts - now) / 1000);
  if (s <= 0) return { text: 'expired', tone: 'bad' };
  return { text: s > 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`, tone: 'ok' };
}

function useLogs() {
  const [, bump] = useState(0);
  useEffect(() => subscribeLogs(() => bump((n) => n + 1)), []);
  return getLogs();
}

export default function Diagnostics() {
  const { t } = useTranslation();
  const nowDate = useNow(1000);
  const now = nowDate.getTime();
  const features = getFeatures();
  const geo = useGeo();
  const driving = useDriving();
  const wake = useWakeLockState();
  const active = useMedia((s) => s.active);
  const sp = useStore(spotifyController.state$, (s) => s);
  const spApi = useSpotifyApiState();
  const ms = mediaSessionDiagnostics();
  const pwa = usePwaStatus();
  const logs = useLogs();
  const spTok = spotifyToken();
  const ytTok = youtubeToken();
  const spExp = until(spTok?.expiresAt, now);
  const ytExp = until(ytTok?.expiresAt, now);

  return (
    <Screen title={t('about.diagnostics')}>
      <section className="card diag">
        <h2 className="card__title">{t('diag.media')}</h2>
        <Row label={t('diag.activeSource')} value={active ?? t('common.none')} />
        <Row
          label={t('diag.mediaSession')}
          value={
            !ms.supported
              ? t('diag.unsupported')
              : ms.attached
                ? `${t('diag.ownedBy')} ${ms.attached} (${ms.playbackState})`
                : t('diag.released')
          }
          tone={ms.attached ? 'warn' : 'ok'}
        />
        <Row label={t('diag.mediaSessionTitle')} value={ms.metadataTitle ?? '-'} />
        <Row
          label={t('diag.spotifyStatus')}
          value={`${sp.status}${sp.statusMessage ? ` (${sp.statusMessage})` : ''}`}
          tone={sp.status === 'ready' ? 'ok' : undefined}
        />
        <Row label={t('diag.spotifyPoll')} value={ago(sp.updatedAt, now)} />
        <Row
          label={t('diag.spotifyHttp')}
          value={spApi.lastStatus ? `${spApi.lastStatus} · ${ago(spApi.lastAt, now)}` : '-'}
          tone={spApi.lastStatus && spApi.lastStatus >= 400 ? 'bad' : undefined}
        />
        <Row
          label={t('diag.spotifyRate')}
          value={
            spApi.blockedUntil > now ? `${Math.ceil((spApi.blockedUntil - now) / 1000)} s` : t('diag.none')
          }
        />
        <Row
          label={t('diag.spotifyToken')}
          value={spTok ? spExp.text : t('diag.signedOut')}
          tone={spExp.tone}
        />
        <Row
          label={t('diag.youtubeToken')}
          value={ytTok ? ytExp.text : t('diag.signedOut')}
          tone={ytExp.tone}
        />
      </section>

      <section className="card diag">
        <h2 className="card__title">{t('diag.device')}</h2>
        <Row
          label={t('diag.wakeLock')}
          value={wake.status}
          tone={wake.status === 'held' ? 'ok' : wake.status === 'denied' ? 'bad' : undefined}
        />
        {wake.lastError && <Row label={t('diag.wakeLockError')} value={wake.lastError} tone="bad" />}
        <Row
          label={t('diag.pwaInstalled')}
          value={features.standalone ? t('common.yes') : t('common.no')}
          tone={features.standalone ? 'ok' : 'warn'}
        />
        <Row
          label={t('diag.serviceWorker')}
          value={pwa.worker}
          tone={pwa.worker === 'active' ? 'ok' : 'warn'}
        />
        <Row label={t('diag.updateAvailable')} value={pwa.updateReady ? t('common.yes') : t('common.no')} />
        <Row label={t('diag.online')} value={navigator.onLine ? t('common.yes') : t('common.no')} />
        <Row label={t('diag.platform')} value={features.ios ? 'iOS / iPadOS' : navigator.platform || '-'} />
      </section>

      <section className="card diag">
        <h2 className="card__title">{t('diag.gps')}</h2>
        <Row
          label={t('diag.gpsStatus')}
          value={geo.status}
          tone={geo.status === 'watching' ? 'ok' : geo.status === 'denied' ? 'bad' : undefined}
        />
        <Row
          label={t('diag.gpsAccuracy')}
          value={geo.accuracy !== null ? `±${Math.round(geo.accuracy)} m` : '-'}
          tone={geo.accuracy !== null && geo.accuracy > 65 ? 'warn' : undefined}
        />
        <Row label={t('diag.gpsSpeed')} value={`${geo.speedKmh.toFixed(1)} km/h (${geo.speedSource})`} />
        <Row label={t('diag.gpsFix')} value={ago(geo.ts, now)} />
        <Row
          label={t('diag.gpsHeading')}
          value={geo.heading !== null ? `${Math.round(geo.heading)}°` : '-'}
        />
        <Row
          label={t('diag.drivingLock')}
          value={
            driving.moving ? (driving.passenger ? t('diag.passenger') : t('diag.locked')) : t('diag.parked')
          }
          tone={driving.moving && !driving.passenger ? 'bad' : 'ok'}
        />
        {geo.error && <Row label={t('diag.gpsError')} value={geo.error} tone="bad" />}
      </section>

      <section className="card diag">
        <h2 className="card__title">{t('diag.features')}</h2>
        {Object.entries(features).map(([k, v]) => (
          <Row key={k} label={k} value={v ? t('common.yes') : t('common.no')} tone={v ? 'ok' : undefined} />
        ))}
      </section>

      <section className="card diag">
        <h2 className="card__title">{t('diag.log')}</h2>
        <div className="set-actions">
          <button
            className="btn btn--sm"
            onClick={async () => {
              const text = logs
                .map((l) => `${new Date(l.ts).toISOString()} ${l.level} [${l.scope}] ${l.message}`)
                .join('\n');
              try {
                await navigator.clipboard.writeText(text);
                toast(t('diag.logCopied'), 'ok');
              } catch {
                toast(t('settings.data.copyFailed'), 'bad');
              }
            }}
          >
            {t('common.copy')}
          </button>
          <button className="btn btn--sm" onClick={clearLogs}>
            {t('destinations.clear')}
          </button>
        </div>
        <pre className="diag-log">
          {logs
            .slice(-60)
            .reverse()
            .map(
              (l) =>
                `${new Date(l.ts).toLocaleTimeString()} ${l.level.toUpperCase().padEnd(5)} [${l.scope}] ${l.message}`,
            )
            .join('\n') || t('diag.logEmpty')}
        </pre>
      </section>
    </Screen>
  );
}
