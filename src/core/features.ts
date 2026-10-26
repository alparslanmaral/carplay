/** Feature detection. Everything optional on iOS is checked here so the UI can hide what a browser cannot do. */
export interface Features {
  wakeLock: boolean;
  vibration: boolean;
  battery: boolean;
  fullscreen: boolean;
  mediaSession: boolean;
  geolocation: boolean;
  serviceWorker: boolean;
  orientationLock: boolean;
  notifications: boolean;
  /** Running as an installed home-screen app. */
  standalone: boolean;
  ios: boolean;
}

let cache: Features | null = null;

export function detectFeatures(): Features {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & {
    standalone?: boolean;
    getBattery?: unknown;
  };
  const doc = typeof document !== 'undefined' ? document : undefined;
  const ua = nav.userAgent ?? '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  const standalone =
    nav.standalone === true ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  return {
    wakeLock: 'wakeLock' in nav,
    vibration: typeof nav.vibrate === 'function',
    battery: typeof nav.getBattery === 'function',
    fullscreen: !!doc && !!doc.documentElement && typeof doc.documentElement.requestFullscreen === 'function',
    mediaSession: 'mediaSession' in nav,
    geolocation: 'geolocation' in nav,
    serviceWorker: 'serviceWorker' in nav,
    orientationLock:
      typeof screen !== 'undefined' &&
      !!(screen.orientation as (ScreenOrientation & { lock?: unknown }) | undefined)?.lock &&
      !ios,
    notifications: typeof Notification !== 'undefined',
    standalone,
    ios,
  };
}

export function getFeatures(): Features {
  cache ??= detectFeatures();
  return cache;
}

export function resetFeaturesCache(): void {
  cache = null;
}
