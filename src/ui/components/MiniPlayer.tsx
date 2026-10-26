import { useTranslation } from 'react-i18next';
import { useRouter } from '../../core/router';
import { mediaActions } from '../../services/media/actions';
import { useMedia, useMediaState } from '../../services/media/manager';
import { Icon } from './Icon';

/** Rail / dock slot: artwork + title (opens Now Playing) and a play/pause button. */
export function MiniPlayer({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  const active = useMedia((s) => s.active);
  const track = useMediaState((s) => s.track);
  const playing = useMediaState((s) => s.playing);
  const open = () => useRouter.getState().open('nowplaying');
  if (!active) return null;
  return (
    <div className="mini" data-compact={compact}>
      <button className="mini__open dock-btn" onClick={open} aria-label={t('nowplaying.open')}>
        {track?.artworkUrl ? (
          <img className="mini__art" src={track.artworkUrl} alt="" />
        ) : (
          <span className="mini__art mini__art--empty">
            <Icon name="music" />
          </span>
        )}
      </button>
      <button
        className="mini__pp dock-btn"
        onClick={() => void mediaActions.togglePlay()}
        aria-label={playing ? t('nowplaying.pause') : t('nowplaying.play')}
        disabled={!track}
      >
        <Icon name={playing ? 'pause' : 'play'} size="1.6rem" />
      </button>
    </div>
  );
}
