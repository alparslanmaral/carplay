import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../core/router';
import { toast } from '../../core/toast';
import { useMedia, useMediaState } from '../../services/media/manager';
import { startLogin } from '../../services/spotify/auth';
import { openSpotifyApp, spotifyController } from '../../services/spotify/controller';
import { Icon } from './Icon';

/** True when the active source has a problem the notice explains (so empty-state text can stay out of the way). */
export function useNoticeVisible(): boolean {
  const source = useMedia((s) => s.active);
  const status = useMediaState((s) => s.status);
  return source === 'spotify' && !['ready', 'idle', 'connecting'].includes(status);
}

/** Explains why a source cannot play right now and offers the one action that fixes it. */
export function MediaNotice() {
  const { t } = useTranslation();
  const visible = useNoticeVisible();
  const message = useMediaState((s) => s.statusMessage);
  const status = useMediaState((s) => s.status);
  if (!visible) return null;

  const connect = () => startLogin().catch((e: Error) => toast(e.message, 'bad'));
  const retry = () => void spotifyController.poll().catch(() => undefined);

  let title: string;
  let body: string;
  let actions: ReactNode;
  let tone: 'warn' | 'bad' = 'warn';
  switch (status) {
    case 'unauthorized':
      if (message === 'not-configured') {
        title = t('spotify.notConfiguredTitle');
        body = t('spotify.notConfiguredBody');
        actions = (
          <button
            className="btn btn--primary"
            onClick={() => useRouter.getState().open('settings', { section: 'accounts' })}
          >
            {t('spotify.openSettings')}
          </button>
        );
      } else {
        title = t('spotify.connectTitle');
        body = t('spotify.connectBody');
        actions = (
          <button className="btn btn--primary" onClick={connect}>
            {t('spotify.connect')}
          </button>
        );
      }
      break;
    case 'needs-device':
      title = t('spotify.openAppTitle');
      body = message === 'device-idle' ? t('spotify.openAppIdle') : t('spotify.openAppBody');
      actions = (
        <>
          <button className="btn btn--primary" onClick={openSpotifyApp}>
            <Icon name="external" size="1.1em" />
            {t('spotify.openApp')}
          </button>
          <button className="btn" onClick={retry}>
            {t('common.retry')}
          </button>
        </>
      );
      break;
    case 'premium-required':
      title = t('spotify.premiumTitle');
      body = t('spotify.premiumBody');
      actions = <></>;
      break;
    case 'rate-limited':
      title = t('spotify.rateLimitedTitle');
      body = t('spotify.rateLimitedBody');
      actions = <></>;
      break;
    default:
      tone = 'bad';
      title = t('spotify.errorTitle');
      body = message ?? '';
      actions = (
        <button className="btn" onClick={retry}>
          {t('common.retry')}
        </button>
      );
  }
  return (
    <div className="notice" data-tone={tone} role="alert">
      <Icon name={tone === 'bad' ? 'warning' : 'info'} size="1.75rem" />
      <div className="notice__text">
        <div className="notice__title">{title}</div>
        <div className="notice__body">{body}</div>
      </div>
      <div className="notice__actions">{actions}</div>
    </div>
  );
}
