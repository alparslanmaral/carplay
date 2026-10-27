import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { useDriving } from '../../core/driving';
import { useRouter } from '../../core/router';
import { useMedia } from '../../services/media/manager';
import { useYouTubeGate, useYouTubeSurface, youtubeController } from '../../services/youtube/controller';
import { Icon } from './Icon';

/**
 * The YouTube IFrame player has to stay in the DOM, visible and unmodified, for as long as a video is loaded -
 * so it lives in ONE persistent host. Screens that want the player render a <PlayerSlot/> placeholder and the
 * host moves over it; everywhere else it shrinks to a mini player (the API requires at least 200 px).
 */
interface SlotState {
  el: HTMLElement | null;
  register: (el: HTMLElement) => void;
  unregister: (el: HTMLElement) => void;
}

export const usePlayerSlot = create<SlotState>((set, get) => ({
  el: null,
  register: (el) => set({ el }),
  unregister: (el) => get().el === el && set({ el: null }),
}));

export function PlayerSlot({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useYouTubeSurface((s) => s.visible);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    usePlayerSlot.getState().register(el);
    return () => usePlayerSlot.getState().unregister(el);
  }, []);
  return (
    <div ref={ref} className={`player-slot${className ? ` ${className}` : ''}`} data-empty={!visible}>
      {!visible && <Icon name="video" size="3rem" />}
    </div>
  );
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MINI_W = 356;
export const MINI_H = 200;
/** Control strip above the mini player: the buttons never cover the video itself. */
export const MINI_BAR = 64;

/** Bottom-right corner of the main area; the video part is never smaller than the 200 px the player API requires. */
export function miniRect(main: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width'>): Rect {
  const width = Math.max(200, Math.min(MINI_W, main.width - 16));
  const height = MINI_H + MINI_BAR;
  return { left: main.right - width - 8, top: main.bottom - height - 8, width, height };
}

function ParkedOverlay({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="ythost__parked" data-compact={compact} role="alert">
      <Icon name="lock" size={compact ? '1.75rem' : '2.5rem'} />
      <strong>{t('youtube.parkedTitle')}</strong>
      {!compact && <span>{t('youtube.parkedBody')}</span>}
      <button className="btn btn--sm btn--primary" onClick={() => useDriving.getState().openPrompt()}>
        {t('youtube.imPassenger')}
      </button>
    </div>
  );
}

export function YouTubeHost() {
  const { t } = useTranslation();
  const visible = useYouTubeSurface((s) => s.visible);
  const slot = usePlayerSlot((s) => s.el);
  const blocked = useYouTubeGate((s) => s.blocked);
  const active = useMedia((s) => s.active);
  const [rect, setRect] = useState<Rect | null>(null);
  const setContainer = useCallback((el: HTMLDivElement | null) => youtubeController.setContainer(el), []);

  const measure = useCallback(() => {
    if (slot && slot.isConnected) {
      const r = slot.getBoundingClientRect();
      setRect((prev) =>
        prev &&
        prev.left === r.left &&
        prev.top === r.top &&
        prev.width === r.width &&
        prev.height === r.height
          ? prev
          : { left: r.left, top: r.top, width: r.width, height: r.height },
      );
    } else {
      const main = document.querySelector('.chassis__main')?.getBoundingClientRect();
      if (main) setRect(miniRect(main));
    }
  }, [slot]);

  useLayoutEffect(() => {
    if (!visible) return;
    measure();
    // Follow the slot through screen transitions (translate animations) for a moment after it changes.
    let raf = 0;
    const until = performance.now() + 700;
    const loop = () => {
      measure();
      if (performance.now() < until) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = slot ? new ResizeObserver(measure) : null;
    if (slot) ro?.observe(slot);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [visible, slot, measure]);

  if (!visible || !rect) return null;
  const mini = !slot;
  const showParked = blocked && active === 'youtube';
  return (
    <div
      className="ythost"
      data-mode={mini ? 'mini' : 'slot'}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      {mini && (
        <div className="ythost__bar">
          <span className="ythost__label">YouTube</span>
          <button
            className="btn btn--icon btn--sm"
            aria-label={t('youtube.openPlayer')}
            onClick={() => useRouter.getState().open('youtube')}
          >
            <Icon name="external" size="1.1em" />
          </button>
          <button
            className="btn btn--icon btn--sm"
            aria-label={t('youtube.closePlayer')}
            onClick={() => void youtubeController.close()}
          >
            <Icon name="close" size="1.1em" />
          </button>
        </div>
      )}
      <div className="ythost__video">
        <div className="ythost__player" ref={setContainer} />
        {showParked && <ParkedOverlay compact={mini} />}
      </div>
    </div>
  );
}
