import { useEffect, useState } from 'react';
import { useMediaState } from '../../services/media/manager';
import { interpolatePosition } from '../../services/media/types';

/** Live playback position of the active source, re-rendered ~4x/s while playing. */
export function usePosition(intervalMs = 250): number {
  const playing = useMediaState((s) => s.playing);
  const positionMs = useMediaState((s) => s.positionMs);
  const positionAt = useMediaState((s) => s.positionAt);
  const durationMs = useMediaState((s) => s.durationMs);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => tick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [playing, intervalMs]);
  return interpolatePosition({ playing, positionMs, positionAt, durationMs });
}
