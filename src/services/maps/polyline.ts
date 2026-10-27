import type { LatLngLike } from './adapter';

/** Decode an encoded polyline (Valhalla uses 6 decimal digits, Google-style uses 5). */
export function decodePolyline(encoded: string, precision = 6): LatLngLike[] {
  const factor = 10 ** precision;
  const out: LatLngLike[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error('Truncated polyline');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}
