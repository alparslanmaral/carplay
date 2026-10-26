import { useEffect, useState } from 'react';
import { useSettings } from '../../core/settings';

export interface Viewport {
  width: number;
  height: number;
}

function read(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read);
  useEffect(() => {
    const onResize = () => setVp(read());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return vp;
}

export type LayoutMode = 'landscape' | 'portrait';

export function resolveLayout(pref: 'auto' | 'landscape' | 'portrait', vp: Viewport): LayoutMode {
  if (pref !== 'auto') return pref;
  return vp.width > vp.height ? 'landscape' : 'portrait';
}

export function useLayout(): LayoutMode {
  const vp = useViewport();
  const pref = useSettings((s) => s.orientationPref);
  return resolveLayout(pref, vp);
}
