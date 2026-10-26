import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../core/router';
import { useSettings } from '../../core/settings';
import { mediaActions } from '../../services/media/actions';
import { useActiveController, useMedia, useMediaState } from '../../services/media/manager';
import type { RepeatMode } from '../../services/media/types';
import { Artwork } from '../components/Artwork';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Overlays';
import { Scrubber } from '../components/Scrubber';
import { useArtColor } from '../hooks/useArtColor';
import { useLayout } from '../hooks/useViewport';

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'context', context: 'track', track: 'off' };

function VolumeRow() {
  const { t } = useTranslation();
  const volume = useMediaState((s) => s.volume);
  const supported = useMediaState((s) => s.caps.volume);
  const controller = useActiveController();
  const step = useSettings((s) => s.volumeStep);
  if (!supported || volume === null) {
    return (
      <p className="np__hint dim">
        <Icon name="volume" size="1.1em" /> {t('nowplaying.volumeExternal')}
      </p>
    );
  }
  return (
    <div className="np__volume">
      <button
        className="btn btn--icon btn--ghost"
        aria-label={t('nowplaying.volumeDown')}
        onClick={() => void controller?.setVolume(Math.max(0, volume - step))}
      >
        <Icon name="volume-off" />
      </button>
      <input
        className="slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={volume}
        aria-label={t('nowplaying.volume')}
        style={{ '--pct': `${volume}%` } as CSSProperties}
        onChange={(e) => void controller?.setVolume(Number(e.target.value))}
      />
      <button
        className="btn btn--icon btn--ghost"
        aria-label={t('nowplaying.volumeUp')}
        onClick={() => void controller?.setVolume(Math.min(100, volume + step))}
      >
        <Icon name="volume" />
      </button>
    </div>
  );
}

function QueueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queue = useMediaState((s) => s.queue);
  return (
    <Sheet open={open} onClose={onClose} title={t('nowplaying.upNext')}>
      {queue.length === 0 ? (
        <p className="dim">{t('nowplaying.queueEmpty')}</p>
      ) : (
        <div className="list">
          {queue.map((q, i) => (
            <div className="row" key={`${q.id}-${i}`}>
              <div className="row__lead">
                {q.artworkUrl ? <img src={q.artworkUrl} alt="" /> : <Icon name="music" />}
              </div>
              <div className="row__text">
                <div className="row__title ellipsis">{q.title}</div>
                <div className="row__sub ellipsis">{q.artist}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export default function NowPlaying() {
  const { t } = useTranslation();
  const source = useMedia((s) => s.active);
  const controller = useActiveController();
  const track = useMediaState((s) => s.track);
  const playing = useMediaState((s) => s.playing);
  const shuffle = useMediaState((s) => s.shuffle);
  const repeat = useMediaState((s) => s.repeat);
  const liked = useMediaState((s) => s.liked);
  const caps = useMediaState((s) => s.caps);
  const deviceName = useMediaState((s) => s.deviceName);
  const bg = useSettings((s) => s.nowPlayingBg);
  const showQueue = useSettings((s) => s.showQueue);
  const showLike = useSettings((s) => s.showLike);
  const showProgress = useSettings((s) => s.showProgress);
  const seekStep = useSettings((s) => s.seekStep);
  const layout = useLayout();
  const [queueOpen, setQueueOpen] = useState(false);
  const artColor = useArtColor(bg === 'gradient' ? track?.artworkUrl : null);

  if (!source || !controller || !track) {
    return (
      <section className="np np--empty" aria-label={t('apps.nowplaying')}>
        <div className="empty">
          <Icon name="music" size="3.5rem" />
          <strong>{t('nowplaying.nothing')}</strong>
          <span>{t('nowplaying.nothingHint')}</span>
          <div className="sheet__actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn--primary" onClick={() => useRouter.getState().open('spotify')}>
              {t('apps.spotify')}
            </button>
            <button className="btn" onClick={() => useRouter.getState().open('youtube')}>
              {t('apps.youtube')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const style = {
    '--np-tint': artColor ?? 'var(--accent)',
  } as CSSProperties;

  return (
    <section className="np" data-layout={layout} data-bg={bg} style={style} aria-label={t('apps.nowplaying')}>
      {bg === 'art' && track.artworkUrl && <img className="np__bgart" src={track.artworkUrl} alt="" />}
      <div className="np__art">
        <Artwork url={track.artworkUrl} playing={playing} source={source} />
      </div>

      <div className="np__panel">
        <div className="np__meta">
          <div className="np__badges">
            <span className="chip" data-tone={source === 'spotify' ? 'ok' : undefined}>
              <Icon name={source === 'youtube' ? 'video' : 'music'} size="1em" />
              {controller.label}
            </span>
            {deviceName && (
              <span className="chip">
                <Icon name="smartphone" size="1em" />
                {deviceName}
              </span>
            )}
            {source === 'spotify' && track.webUrl && (
              <a className="chip" data-tone="accent" href={track.webUrl} target="_blank" rel="noreferrer">
                {t('nowplaying.openInSpotify')}
              </a>
            )}
          </div>
          <h1 className="np__title ellipsis-2">{track.title}</h1>
          <p className="np__artist ellipsis">{track.artist}</p>
          {track.album && <p className="np__album dim ellipsis">{track.album}</p>}
        </div>

        {showProgress && <Scrubber />}

        <div className="np__transport">
          <button
            className="btn btn--icon btn--ghost np__seek"
            onClick={() => void mediaActions.seekStep(-1)}
            disabled={!caps.seek}
            aria-label={t('nowplaying.back', { s: seekStep })}
          >
            <span className="np__seeklabel">-{seekStep}</span>
          </button>
          <button
            className="btn btn--icon np__skip"
            onClick={() => void mediaActions.previous()}
            aria-label={t('nowplaying.previous')}
          >
            <Icon name="prev" size="2rem" />
          </button>
          <button
            className="btn btn--icon btn--primary np__play"
            onClick={() => void mediaActions.togglePlay()}
            aria-label={playing ? t('nowplaying.pause') : t('nowplaying.play')}
          >
            <Icon name={playing ? 'pause' : 'play'} size="2.75rem" />
          </button>
          <button
            className="btn btn--icon np__skip"
            onClick={() => void mediaActions.next()}
            aria-label={t('nowplaying.next')}
          >
            <Icon name="next" size="2rem" />
          </button>
          <button
            className="btn btn--icon btn--ghost np__seek"
            onClick={() => void mediaActions.seekStep(1)}
            disabled={!caps.seek}
            aria-label={t('nowplaying.forward', { s: seekStep })}
          >
            <span className="np__seeklabel">+{seekStep}</span>
          </button>
        </div>

        <div className="np__extras">
          {caps.shuffle && (
            <button
              className="btn btn--icon btn--ghost"
              aria-pressed={shuffle}
              aria-label={t('nowplaying.shuffle')}
              onClick={() => void controller.setShuffle(!shuffle)}
            >
              <Icon name="shuffle" />
            </button>
          )}
          {caps.repeat && (
            <button
              className="btn btn--icon btn--ghost"
              aria-pressed={repeat !== 'off'}
              aria-label={t('nowplaying.repeat')}
              onClick={() => void controller.setRepeat(NEXT_REPEAT[repeat])}
            >
              <Icon name={repeat === 'track' ? 'repeat-one' : 'repeat'} />
            </button>
          )}
          {caps.like && showLike && (
            <button
              className="btn btn--icon btn--ghost"
              aria-pressed={liked === true}
              aria-label={liked ? t('nowplaying.unlike') : t('nowplaying.like')}
              onClick={() => void controller.toggleLike()}
              style={liked ? { color: 'var(--accent)' } : undefined}
            >
              <Icon name={liked ? 'heart-fill' : 'heart'} />
            </button>
          )}
          {caps.queue && showQueue && (
            <button
              className="btn btn--icon btn--ghost"
              aria-label={t('nowplaying.upNext')}
              onClick={() => {
                void controller.refreshQueue();
                setQueueOpen(true);
              }}
            >
              <Icon name="queue" />
            </button>
          )}
          <VolumeRow />
        </div>
      </div>
      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} />
    </section>
  );
}
