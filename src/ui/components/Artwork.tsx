import type { SourceId } from '../../services/media/types';
import { useSettings } from '../../core/settings';
import { Icon } from './Icon';

/**
 * Album art. Spotify artwork is never cropped into a circle (Spotify design guidelines), so the vinyl
 * shape is only used for other sources; Spotify falls back to rounded corners.
 */
export function Artwork({
  url,
  playing,
  source,
  className,
}: {
  url?: string | null;
  playing: boolean;
  source: SourceId | null;
  className?: string;
}) {
  const shape = useSettings((s) => s.artworkShape);
  const effective = shape === 'vinyl' && source === 'spotify' ? 'rounded' : shape;
  const cls = `art art--${effective}${playing ? ' is-playing' : ''}${className ? ` ${className}` : ''}`;
  if (effective === 'vinyl') {
    return (
      <div className={cls}>
        <div className="art__disc">
          {url ? <img className="art__label" src={url} alt="" /> : <Icon name="music" size="30%" />}
        </div>
      </div>
    );
  }
  return (
    <div className={cls}>
      {url ? (
        <img className="art__img" src={url} alt="" draggable={false} />
      ) : (
        <Icon name="music" size="30%" />
      )}
    </div>
  );
}
