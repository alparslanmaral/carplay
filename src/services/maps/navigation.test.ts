import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../../core/settings';
import { navUrl } from './deeplinks';
import { resetGeoForTests, useGeo } from './geolocation';
import {
  RESUME_WINDOW_MS,
  previewRoute,
  resumeNavigation,
  setAvoid,
  startGuidance,
  stopNavigation,
  useNav,
} from './navigation';
import { decodePolyline } from './polyline';
import { bounds, cumulativeDistances, nextManeuverIndex, remainingSeconds, snapToRoute } from './routeMath';
import { buildRequest, maneuverKind, parseRoute } from './routing';

/** Encoder counterpart of decodePolyline, so fixtures can be written as plain coordinates. */
function encode(points: { lat: number; lng: number }[], precision = 6): string {
  const f = 10 ** precision;
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const put = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * f);
    const lng = Math.round(p.lng * f);
    put(lat - pLat);
    put(lng - pLng);
    pLat = lat;
    pLng = lng;
  }
  return out;
}

/** A straight road going north from (41, 29): 0.01 degrees of latitude is about 1112 m. */
const LINE = [0, 0.0025, 0.005, 0.0075, 0.01].map((d) => ({ lat: 41 + d, lng: 29 }));
const TOTAL_M = cumulativeDistances(LINE).at(-1)!;

function valhallaBody(hasToll = false) {
  return {
    trip: {
      summary: { length: TOTAL_M / 1000, time: 120, has_toll: hasToll, has_ferry: false },
      legs: [
        {
          shape: encode(LINE),
          maneuvers: [
            { type: 1, instruction: 'Drive north.', length: 0.6, time: 70, street_names: ['Main St'] },
            {
              type: 10,
              instruction: 'Turn right onto Side St.',
              verbal_pre_transition_instruction: 'Turn right onto Side Street.',
              length: (TOTAL_M - 600) / 1000,
              time: 50,
              street_names: ['Side St'],
            },
            { type: 4, instruction: 'You have arrived.', length: 0, time: 0 },
          ],
        },
      ],
    },
  };
}

function stubFetch(body: unknown = valhallaBody(), status = 200) {
  const fn = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const fix = (lat: number, lng: number, ts: number, accuracy = 10) =>
  useGeo.getState().ingest({
    coords: { latitude: lat, longitude: lng, accuracy, speed: 10, heading: 0 } as GeolocationCoordinates,
    timestamp: ts,
  });

const dest = { id: 'd', name: 'Destination', lat: 41.01, lng: 29 };

beforeEach(() => {
  useSettings.getState().reset();
  stopNavigation();
  resetGeoForTests();
});
afterEach(() => {
  stopNavigation();
  vi.unstubAllGlobals();
});

describe('polyline', () => {
  it('round-trips coordinates at 6 digits', () => {
    const pts = [
      { lat: 41.008238, lng: 28.978359 },
      { lat: 41.0099, lng: 28.9801 },
      { lat: -33.8688, lng: 151.2093 },
    ];
    const back = decodePolyline(encode(pts));
    expect(back).toHaveLength(3);
    back.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(pts[i]!.lat, 6);
      expect(p.lng).toBeCloseTo(pts[i]!.lng, 6);
    });
  });
  it('rejects truncated input', () => {
    expect(() => decodePolyline('_p~iF~ps|U_ulL~ugC_', 5)).toThrow();
  });
});

describe('route maths', () => {
  const cum = cumulativeDistances(LINE);
  it('measures the road in metres', () => {
    expect(TOTAL_M).toBeGreaterThan(1100);
    expect(TOTAL_M).toBeLessThan(1125);
  });
  it('snaps a position onto the line and reports the sideways offset', () => {
    const on = snapToRoute(LINE, cum, { lat: 41.005, lng: 29 });
    expect(on.along).toBeCloseTo(TOTAL_M / 2, -1);
    expect(on.offM).toBeLessThan(1);
    // 0.0005 degrees of longitude at 41N is about 42 m
    const beside = snapToRoute(LINE, cum, { lat: 41.005, lng: 29.0005 });
    expect(beside.offM).toBeGreaterThan(35);
    expect(beside.offM).toBeLessThan(50);
  });
  it('prefers the stretch near the previous answer when the road crosses itself', () => {
    // out and back along the same street: a position at the middle belongs to the leg we are on
    const there = [...LINE, ...[...LINE].reverse().slice(1)];
    const c = cumulativeDistances(there);
    const mid = { lat: 41.005, lng: 29 };
    const first = snapToRoute(there, c, mid, 0);
    const second = snapToRoute(there, c, mid, 6);
    expect(first.along).toBeLessThan(TOTAL_M);
    expect(second.along).toBeGreaterThan(TOTAL_M);
  });
  it('finds the next manoeuvre and the time still to go', () => {
    const route = parseRoute(valhallaBody());
    expect(nextManeuverIndex(route.maneuvers, 10)).toBe(1);
    expect(nextManeuverIndex(route.maneuvers, 650)).toBe(2);
    expect(remainingSeconds(route.maneuvers, route.durationS, 0)).toBeCloseTo(120, 0);
    expect(remainingSeconds(route.maneuvers, route.durationS, 300)).toBeCloseTo(85, 0);
    expect(remainingSeconds(route.maneuvers, route.durationS, TOTAL_M)).toBeCloseTo(0, 0);
  });
  it('bounds returns the two opposite corners', () => {
    expect(bounds(LINE)).toEqual([
      { lat: 41, lng: 29 },
      { lat: 41.01, lng: 29 },
    ]);
    expect(bounds([])).toEqual([]);
  });
});

describe('routing request', () => {
  it('asks Valhalla to avoid tolls and motorways only when told to', () => {
    const a = { lat: 1, lng: 2 };
    const b = { lat: 3, lng: 4 };
    const neutral = buildRequest(a, b, { avoidTolls: false, avoidHighways: false });
    expect(neutral.costing_options.auto.use_tolls).toBe(0.5);
    expect(neutral.locations[0]).toMatchObject({ lat: 1, lon: 2 });
    const strict = buildRequest(a, b, { avoidTolls: true, avoidHighways: true });
    expect(strict.costing_options.auto).toEqual({ use_tolls: 0, use_highways: 0 });
  });
  it('turns the answer into metres, seconds and running offsets', () => {
    const r = parseRoute(valhallaBody(true));
    expect(r.hasToll).toBe(true);
    expect(r.coords).toHaveLength(LINE.length);
    expect(r.maneuvers.map((m) => Math.round(m.startM))).toEqual([0, 600, Math.round(TOTAL_M)]);
    expect(r.maneuvers[1]!.startS).toBe(70);
    expect(r.maneuvers[1]!.spoken).toBe('Turn right onto Side Street.');
    expect(r.maneuvers[0]!.spoken).toBe('Drive north.');
  });
  it('reports a missing route', () => {
    expect(() => parseRoute({ error: 'No path could be found for input' })).toThrow(/No path/);
  });
  it('groups maneuver types into glyphs', () => {
    expect(maneuverKind(10)).toBe('right');
    expect(maneuverKind(15)).toBe('left');
    expect(maneuverKind(12)).toBe('uturn');
    expect(maneuverKind(26)).toBe('roundabout');
    expect(maneuverKind(5)).toBe('arrive');
    expect(maneuverKind(1)).toBe('straight');
    expect(maneuverKind(999)).toBe('straight');
  });
});

describe('Google link carries the avoid preferences', () => {
  it('adds avoid only when asked', () => {
    expect(navUrl('google', 1, 2)).not.toContain('avoid');
    expect(navUrl('google', 1, 2, { tolls: true })).toContain('&avoid=tolls');
    expect(navUrl('google', 1, 2, { tolls: true, highways: true })).toContain('&avoid=tolls%7Chighways');
    expect(navUrl('waze', 1, 2, { tolls: true })).toBe('https://waze.com/ul?ll=1,2&navigate=yes');
  });
});

describe('guidance', () => {
  it('needs a GPS fix before it can plan', async () => {
    const f = stubFetch();
    await previewRoute(dest);
    expect(f).not.toHaveBeenCalled();
    expect(useNav.getState()).toMatchObject({ phase: 'preview', route: null });
    expect(useNav.getState().error).toMatch(/GPS/);
  });

  it('previews a route and re-plans when the avoid options change', async () => {
    const f = stubFetch();
    fix(41, 29, 1000);
    await previewRoute(dest);
    expect(useNav.getState().phase).toBe('preview');
    expect(useNav.getState().route?.maneuvers).toHaveLength(3);
    expect(useSettings.getState().recents[0]!.id).toBe('d');
    setAvoid({ avoidTolls: true });
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    const body = JSON.parse((f.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.costing_options.auto.use_tolls).toBe(0);
    expect(useSettings.getState().avoidTolls).toBe(true);
  });

  it('shows the error text when routing fails', async () => {
    stubFetch({ error: 'No path could be found for input', error_code: 442 }, 400);
    fix(41, 29, 1000);
    await previewRoute(dest);
    expect(useNav.getState().route).toBeNull();
    expect(useNav.getState().error).toMatch(/No road route/);
  });

  it('follows progress, announces the turn once and arrives', async () => {
    stubFetch();
    useSettings.getState().set('navVoice', true);
    const spoken: string[] = [];
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: (u: { text: string }) => spoken.push(u.text),
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );

    fix(41, 29, 1000);
    await previewRoute(dest);
    startGuidance();
    expect(useNav.getState().phase).toBe('guiding');
    expect(spoken).toEqual(['Drive north.']);

    fix(41.0015, 29, 2000); // ~167 m along, 433 m before the turn
    expect(useNav.getState().nextIdx).toBe(1);
    expect(useNav.getState().toNextM).toBeGreaterThan(400);
    expect(spoken).toHaveLength(1);

    fix(41.0035, 29, 3000); // ~390 m along, 210 m before the turn
    fix(41.0036, 29, 4000);
    expect(spoken).toEqual(['Drive north.', 'Turn right onto Side Street.']);

    fix(41.0078, 29, 5000); // past the turn, heading for the end
    expect(useNav.getState().nextIdx).toBe(2);
    expect(useNav.getState().arrived).toBe(false);

    fix(41.0099, 29, 6000);
    expect(useNav.getState().arrived).toBe(true);
    expect(spoken.at(-1)).toBe('You have arrived.');
  });

  it('reroutes after three fixes off the road, but not on one bad fix or a poor signal', async () => {
    const f = stubFetch();
    fix(41, 29, 1000);
    await previewRoute(dest);
    startGuidance();
    expect(f).toHaveBeenCalledTimes(1);

    fix(41.004, 29.002, 2000); // ~170 m off
    expect(f).toHaveBeenCalledTimes(1);
    fix(41.004, 29, 3000); // back on the road resets the counter
    fix(41.005, 29.002, 4000);
    fix(41.005, 29.002, 5000);
    expect(f).toHaveBeenCalledTimes(1);
    fix(41.005, 29.002, 6000, 300); // accuracy 300 m: a tunnel, not a wrong turn
    expect(f).toHaveBeenCalledTimes(1);
    fix(41.005, 29.002, 7000);
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    const from = JSON.parse((f.mock.calls[1]![1] as RequestInit).body as string).locations[0];
    expect(from).toMatchObject({ lat: 41.005, lon: 29.002 });
  });

  it('keeps the trip so a restarted app can pick it up, and forgets it when ended', async () => {
    stubFetch();
    fix(41, 29, 1000);
    await previewRoute(dest);
    expect(localStorage.getItem('dd.nav')).toBeNull();
    startGuidance();
    expect(JSON.parse(localStorage.getItem('dd.nav')!).destination.id).toBe('d');
    stopNavigation();
    expect(localStorage.getItem('dd.nav')).toBeNull();
    expect(useNav.getState().phase).toBe('idle');
  });

  it('resumes a saved trip once a position is known, and ignores an old one', async () => {
    const f = stubFetch();
    localStorage.setItem('dd.nav', JSON.stringify({ destination: dest, ts: Date.now() }));
    expect(resumeNavigation()).toBe(true);
    expect(useNav.getState().phase).toBe('routing');
    expect(f).not.toHaveBeenCalled();
    fix(41, 29, 1000);
    await vi.waitFor(() => expect(useNav.getState().phase).toBe('guiding'));
    expect(f).toHaveBeenCalledTimes(1);

    stopNavigation();
    localStorage.setItem(
      'dd.nav',
      JSON.stringify({ destination: dest, ts: Date.now() - RESUME_WINDOW_MS - 1000 }),
    );
    expect(resumeNavigation()).toBe(false);
  });
});
