import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp, formatDuration } from '../../core/units';
import { useSettings } from '../../core/settings';
import { useActiveController, useMediaState } from '../../services/media/manager';
import { usePosition } from '../hooks/usePosition';

/** Seek bar with a 64px-tall touch area. Dragging previews; the seek is sent on release. */
export function Scrubber() {
  const position = usePosition();
  const duration = useMediaState((s) => s.durationMs);
  const canSeek = useMediaState((s) => s.caps.seek);
  const controller = useActiveController();
  const step = useSettings((s) => s.seekStep) * 1000;
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fromEvent = (e: PointerEvent): number => {
    const rect = ref.current!.getBoundingClientRect();
    return clamp((e.clientX - rect.left) / rect.width, 0, 1) * duration;
  };

  const shown = drag ?? position;
  const pct = duration > 0 ? clamp(shown / duration, 0, 1) * 100 : 0;
  const enabled = canSeek && duration > 0;

  const onKey = (e: KeyboardEvent) => {
    if (!enabled) return;
    if (e.key === 'ArrowRight') void controller?.seek(clamp(position + step, 0, duration));
    if (e.key === 'ArrowLeft') void controller?.seek(clamp(position - step, 0, duration));
  };

  return (
    <div className="scrub">
      <div
        ref={ref}
        className="scrub__track"
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={Math.round(shown / 1000)}
        aria-valuetext={`${formatDuration(shown)} of ${formatDuration(duration)}`}
        aria-disabled={!enabled}
        data-dragging={drag !== null}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (!enabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(fromEvent(e));
        }}
        onPointerMove={(e) => drag !== null && setDrag(fromEvent(e))}
        onPointerUp={(e) => {
          if (drag === null) return;
          const target = fromEvent(e);
          setDrag(null);
          void controller?.seek(target);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="scrub__rail">
          <div className="scrub__fill" style={{ width: `${pct}%` }} />
          <div className="scrub__thumb" style={{ left: `${pct}%` }} />
        </div>
      </div>
      <div className="scrub__times tabular">
        <span>{formatDuration(shown)}</span>
        <span>{duration > 0 ? `-${formatDuration(Math.max(0, duration - shown))}` : ''}</span>
      </div>
    </div>
  );
}
