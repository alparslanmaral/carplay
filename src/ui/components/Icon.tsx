import type { CSSProperties } from 'react';

/**
 * DriveDeck glyph set: original 24x24 drawings, 2px round-cap strokes, `f` marks filled shapes.
 * Markup is static and trusted (never user input).
 */
const GLYPHS: Record<string, string> = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v8.5h11V10"/><path d="M10.5 18.5V14h3v4.5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  map: '<path d="M4 6.5 9 5l6 2 5-1.5v12L15 19l-6-2-5 1.5z"/><path d="M9 5v12M15 7v12"/>',
  music:
    '<path d="M9 17.5V6l9-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="15.5" cy="15.5" r="2.5"/>',
  video: '<rect x="3.5" y="6" width="17" height="12" rx="3.5"/><path class="f" d="M10.5 9.5v5l4.2-2.5z"/>',
  play: '<path class="f" d="M8 5.5v13l11-6.5z"/>',
  pause:
    '<rect class="f" x="6.5" y="5" width="4" height="14" rx="1.2"/><rect class="f" x="13.5" y="5" width="4" height="14" rx="1.2"/>',
  next: '<path class="f" d="M6 6v12l9-6z"/><path d="M18 6v12"/>',
  prev: '<path class="f" d="M18 6v12l-9-6z"/><path d="M6 6v12"/>',
  stop: '<rect class="f" x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  shuffle:
    '<path d="M4 7h3.5c4 0 5 10 9 10H20"/><path d="M4 17h3.5c1.4 0 2.4-1.2 3.2-2.7"/><path d="M13.3 9.4C14.2 8 15 7 16.5 7H20"/><path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5l2.5 2.5-2.5 2.5"/>',
  repeat:
    '<path d="M5 11v-1a3 3 0 0 1 3-3h11"/><path d="m16 4 3 3-3 3"/><path d="M19 13v1a3 3 0 0 1-3 3H5"/><path d="m8 20-3-3 3-3"/>',
  'repeat-one':
    '<path d="M5 11v-1a3 3 0 0 1 3-3h11"/><path d="m16 4 3 3-3 3"/><path d="M19 13v1a3 3 0 0 1-3 3H5"/><path d="m8 20-3-3 3-3"/><path d="m11 10.8 1.6-1.1v4.8"/>',
  heart:
    '<path d="M12 19.5S4.5 15 4.5 9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7.5 1.6C19.5 15 12 19.5 12 19.5z"/>',
  'heart-fill':
    '<path class="f" d="M12 19.5S4.5 15 4.5 9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7.5 1.6C19.5 15 12 19.5 12 19.5z"/>',
  volume:
    '<path d="M4.5 10v4h3L12 17.5v-11L7.5 10z"/><path d="M15 9.5a3.7 3.7 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10"/>',
  'volume-off': '<path d="M4.5 10v4h3L12 17.5v-11L7.5 10z"/><path d="m16 9.5 4 5M20 9.5l-4 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.8"/><path d="m15 15 4.5 4.5"/>',
  sliders:
    '<path d="M4 7h3.5M12.5 7H20M4 12h9.5M18.5 12H20M4 17h2.5M11.5 17H20"/><circle cx="10" cy="7" r="2.5"/><circle cx="16" cy="12" r="2.5"/><circle cx="9" cy="17" r="2.5"/>',
  back: '<path d="m14.5 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  'chevron-up': '<path d="m6 14.5 6-6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7"/><path d="M10.5 11v5M13.5 11v5"/>',
  pencil: '<path d="m5 19 .8-3.8L15.5 5.5a2.1 2.1 0 0 1 3 3L8.8 18.2z"/><path d="m14 7 3 3"/>',
  grip: '<circle class="f" cx="9" cy="7" r="1.4"/><circle class="f" cx="15" cy="7" r="1.4"/><circle class="f" cx="9" cy="12" r="1.4"/><circle class="f" cx="15" cy="12" r="1.4"/><circle class="f" cx="9" cy="17" r="1.4"/><circle class="f" cx="15" cy="17" r="1.4"/>',
  navigate: '<path class="f" d="M20 4 4 10.5l6.3 2.2 2.2 6.3z"/>',
  crosshair:
    '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  wifi: '<path d="M4 9.5a11 11 0 0 1 16 0M7 12.8a6.5 6.5 0 0 1 10 0"/><circle class="f" cx="12" cy="17" r="1.3"/>',
  'wifi-off':
    '<path d="M4 9.5a11 11 0 0 1 16 0M7 12.8a6.5 6.5 0 0 1 10 0"/><circle class="f" cx="12" cy="17" r="1.3"/><path d="M5 5l14 14"/>',
  gauge:
    '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 13.5 3.8-4.4"/><circle class="f" cx="12" cy="13.5" r="1.4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"/>',
  moon: '<path d="M18.5 14.5A7 7 0 0 1 9.5 5.5a7.2 7.2 0 1 0 9 9z"/>',
  cloud: '<path d="M7 18h9.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7 18z"/>',
  'cloud-sun':
    '<circle cx="8.5" cy="8.5" r="2.7"/><path d="M8.5 3v1.2M3 8.5h1.2M4.7 4.7l.9.9M12.3 4.7l-.9.9"/><path d="M9 19h8a3 3 0 0 0 .3-6 4.2 4.2 0 0 0-8 .9A2.6 2.6 0 0 0 9 19z"/>',
  rain: '<path d="M7 15h9.5a3.2 3.2 0 0 0 .4-6.4 4.7 4.7 0 0 0-9 1A2.7 2.7 0 0 0 7 15z"/><path d="m9 18-.8 2M13 18l-.8 2M17 18l-.8 2"/>',
  snow: '<path d="M7 14.5h9.5a3.2 3.2 0 0 0 .4-6.4 4.7 4.7 0 0 0-9 1A2.7 2.7 0 0 0 7 14.5z"/><path d="M9 18.5h.01M13 19.5h.01M16 18h.01"/>',
  storm:
    '<path d="M7 14.5h9.5a3.2 3.2 0 0 0 .4-6.4 4.7 4.7 0 0 0-9 1A2.7 2.7 0 0 0 7 14.5z"/><path d="m12.5 15-2 3h3l-1.5 3"/>',
  fog: '<path d="M7 12h9.5a3.2 3.2 0 0 0 .4-6.4 4.7 4.7 0 0 0-9 1A2.7 2.7 0 0 0 7 12z"/><path d="M5 16h14M8 19.5h8"/>',
  star: '<path d="m12 4.5 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/>',
  briefcase:
    '<rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M4 13h16"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  external:
    '<path d="M14 5h5v5M19 5l-8 8"/><path d="M17.5 14v3.5A1.5 1.5 0 0 1 16 19H6.5A1.5 1.5 0 0 1 5 17.5V8a1.5 1.5 0 0 1 1.5-1.5H10"/>',
  phone:
    '<path d="M7.5 4.5h2.4l1.3 3.6-1.7 1.2a10 10 0 0 0 4.7 4.7l1.2-1.7 3.6 1.3v2.4a1.9 1.9 0 0 1-2 1.9A13.2 13.2 0 0 1 5.6 6.5a1.9 1.9 0 0 1 1.9-2z"/>',
  message: '<path d="M5 6.5h14v9H11l-4 3v-3H5z"/>',
  link: '<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>',
  list: '<path d="M9 7h10M9 12h10M9 17h10"/><circle class="f" cx="5.2" cy="7" r="1.1"/><circle class="f" cx="5.2" cy="12" r="1.1"/><circle class="f" cx="5.2" cy="17" r="1.1"/>',
  queue: '<path d="M4 7h12M4 12h8M4 17h8"/><path class="f" d="M15.5 12.5v6l5-3z"/>',
  disc: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2"/><path d="M12 4a8 8 0 0 1 5.6 2.4"/>',
  playlist: '<path d="M4 7h11M4 11.5h11M4 16h6"/><path d="M18 17V9l3 .8"/><circle cx="16" cy="17" r="2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><circle class="f" cx="12" cy="8" r="1.1"/>',
  warning: '<path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4.5"/><circle class="f" cx="12" cy="17" r="1"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  key: '<circle cx="8.5" cy="12" r="3.5"/><path d="M12 12h8M17 12v3M20 12v2"/>',
  download: '<path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15.5v-10M7.5 9.5 12 5l4.5 4.5M5 19.5h14"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5v4h-4"/>',
  palette:
    '<path d="M12 4a8 8 0 1 0 0 16c1.4 0 2-.9 1.6-2-.5-1.3.2-2.5 1.7-2.5H17a3 3 0 0 0 3-3A8 8 0 0 0 12 4z"/><circle class="f" cx="8" cy="11" r="1.1"/><circle class="f" cx="11" cy="7.8" r="1.1"/><circle class="f" cx="15.2" cy="8.6" r="1.1"/>',
  layout: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M10 5v14M10 12h10"/>',
  car: '<path d="M5 15.5V12l1.8-4.2A2 2 0 0 1 8.6 6.5h6.8a2 2 0 0 1 1.8 1.3L19 12v3.5"/><path d="M4 15.5h16v2.2a.8.8 0 0 1-.8.8h-1.4a.8.8 0 0 1-.8-.8v-.7H7v.7a.8.8 0 0 1-.8.8H4.8a.8.8 0 0 1-.8-.8z"/><circle class="f" cx="7.8" cy="12.5" r="1"/><circle class="f" cx="16.2" cy="12.5" r="1"/>',
  shield: '<path d="M12 4.5 19 7v5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
  bolt: '<path class="f" d="M13 3.5 6 13.5h5l-1 7 7-10h-5z"/>',
  smartphone: '<rect x="7" y="3.5" width="10" height="17" rx="2.6"/><path d="M11 17.5h2"/>',
  eye: '<path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/>',
  'eye-off':
    '<path d="M3 12s3.2-6 9-6c1.6 0 3 .4 4.200 1M21 12s-3.200 6-9 6c-1.600 0-3-.4-4.200-1"/><circle cx="12" cy="12" r="2.600"/><path d="M5 5l14 14"/>',
  copy: '<rect x="8.5" y="8.5" width="10" height="11" rx="2.2"/><path d="M15.500 8.500V6.700a1.700 1.700 0 0 0-1.700-1.700H7.200A1.700 1.700 0 0 0 5.500 6.700v8.100a1.700 1.700 0 0 0 1.700 1.700h1.300"/>',
  share:
    '<path d="M12 15V4.500M8 8.200 12 4.500l4 3.700"/><path d="M6.500 11.500H6A1.500 1.500 0 0 0 4.500 13v5A1.500 1.500 0 0 0 6 19.500h12a1.500 1.500 0 0 0 1.500-1.500v-5A1.500 1.500 0 0 0 18 11.500h-.5"/>',
  sparkle: '<path class="f" d="m12 4 1.800 5.200L19 11l-5.200 1.800L12 18l-1.800-5.200L5 11l5.200-1.800z"/>',
  mic: '<rect x="9" y="4" width="6" height="10" rx="3"/><path d="M6 11.500a6 6 0 0 0 12 0M12 17.500V20"/>',
  tv: '<rect x="3.500" y="5.500" width="17" height="11" rx="2.500"/><path d="M9 20h6M12 16.500V20"/>',
  engine:
    '<path d="M6 10h3l1-2h5l1 2h2v3h1.500v4H18l-1.500 1.500H9L7 17H6z"/><path d="M10 8V6M14 8V6M4.500 12H3M4.500 15H3"/>',
  // turn-by-turn manoeuvres
  'maneuver-straight': '<path d="M12 20V5M6.500 10.500 12 5l5.500 5.500"/>',
  'maneuver-left': '<path d="M16 20v-7a3 3 0 0 0-3-3H6.500M10.500 5.500 6 10l4.500 4.500"/>',
  'maneuver-right': '<path d="M8 20v-7a3 3 0 0 1 3-3h6.500M13.500 5.500 18 10l-4.500 4.500"/>',
  'maneuver-sharp-left':
    '<path d="M17 20V9.500a2.500 2.500 0 0 0-2.500-2.500H8M11 3.500 7.500 7 11 10.500"/>',
  'maneuver-sharp-right': '<path d="M7 20V9.500A2.500 2.500 0 0 1 9.500 7H16M13 3.500 16.500 7 13 10.500"/>',
  'maneuver-uturn': '<path d="M8 20V9.500a4 4 0 0 1 8 0V13M12.500 9.500 16 13l3.500-3.500"/>',
  'maneuver-roundabout':
    '<circle cx="12" cy="14" r="3.500"/><path d="M12 10.500V4M8.500 7.500 12 4l3.500 3.500M12 17.500V21"/>',
  flag: '<path d="M6 20.500V4.500"/><path class="f" d="M6 5h11l-2.500 3.500L17 12H6z"/>',
};

export const ICON_NAMES = Object.keys(GLYPHS);

export interface IconProps {
  name: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  title?: string;
}

export function Icon({ name, size = '1.5em', className, style, strokeWidth = 2, title }: IconProps) {
  const markup = GLYPHS[name] ?? GLYPHS['info']!;
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
      style={style}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
