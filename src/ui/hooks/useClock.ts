import { useEffect, useState } from 'react';
import { useSettings } from '../../core/settings';

/** Re-renders every second (when seconds are shown) or every 10 s otherwise. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    const onVisible = () => !document.hidden && setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

export function formatClock(
  now: Date,
  opts: { hour12: boolean; seconds: boolean },
): { time: string; suffix: string } {
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  let suffix = '';
  if (opts.hour12) {
    suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
  }
  const hh = opts.hour12 ? String(h) : String(h).padStart(2, '0');
  return { time: opts.seconds ? `${hh}:${m}:${s}` : `${hh}:${m}`, suffix };
}

export function useClock() {
  const hour12 = useSettings((s) => s.clockFormat === '12');
  const seconds = useSettings((s) => s.clockSeconds);
  const now = useNow(seconds ? 1000 : 5000);
  return { now, ...formatClock(now, { hour12, seconds }) };
}
