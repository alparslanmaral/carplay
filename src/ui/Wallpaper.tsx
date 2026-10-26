import { useSettings } from '../core/settings';

/** Fixed background layer: solid / gradient / blurred album art / uploaded image, always with a dim overlay. */
export function Wallpaper({ artUrl }: { artUrl?: string | null }) {
  const kind = useSettings((s) => s.wallpaperKind);
  const image = useSettings((s) => s.wallpaperImage);
  return (
    <div className="wallpaper" aria-hidden="true">
      <div className="wallpaper__base" />
      {kind === 'image' && image && (
        <div className="wallpaper__img" style={{ backgroundImage: `url(${image})` }} />
      )}
      {kind === 'art' && artUrl && <img className="wallpaper__art" src={artUrl} alt="" />}
      <div className="wallpaper__dim" />
    </div>
  );
}
