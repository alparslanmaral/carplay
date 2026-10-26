# DriveDeck - Plan

An installable in-car dashboard PWA for iPhone (dark, glanceable, big touch targets).
Static hosting, no backend. Vite + React + TypeScript (strict), Zustand, MapLibre GL, vite-plugin-pwa.

## Milestones

| #   | Scope                                                                                                     | Exit criteria                               |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| M1  | Project shell, settings store (persist), theme engine, stack router, feature detection, logger, i18n      | build + lint + tests + screenshots + commit |
| M2  | Layout chassis (rail/dock), Home (paged, edit mode), Dashboard + widgets, Now Playing with mock player    | same                                        |
| M3  | Spotify PKCE auth, API client (429 handling), polling, `SpotifyRemoteController`, Spotify screen          | same                                        |
| M4  | Maps: MapLibre, geolocation watcher, search, destination sheet, favorites/recents, nav hand-off           | same                                        |
| M5  | YouTube: GIS token flow, Data API client + cache, IFrame player, `YouTubePlayerController`, Media Session | same                                        |
| M6  | Full settings menu (schema driven, searchable), accounts/data, diagnostics, onboarding, limitations       | same                                        |
| M7  | PWA polish (icons, update prompt, offline), tests, README, final review                                   | same                                        |

After each milestone: `npm run build`, `npm run lint`, `npm test`, Playwright screenshots at 390x844 and 844x390 (`npm run shots`), then `git commit`.

## Decisions (made without asking, as requested)

1. **Name / branding.** App is "DriveDeck". No Apple marks, no "CarPlay" in UI or app name. All icons are original inline SVG glyphs (2px round-cap stroke style, one `Icon` component). System font stack only.
2. **Spotify and YouTube names.** Text only, no logos redrawn. Spotify content always links back to Spotify ("Open in Spotify"); album art is never cropped into a vinyl circle for Spotify (their design guidelines), only for YouTube/demo. YouTube player is the unmodified IFrame player, always visible; a "Parked-only" safety overlay is shown only while the driving lock is active.
3. **Media key ownership.** A single module `services/mediaSession` owns `navigator.mediaSession`. It attaches only for sources that play audio inside DriveDeck (YouTube). When Spotify is active it is released and, if it was never attached, never touched. No silent audio anywhere.
4. **State management.** Zustand everywhere (settings with `persist`, router, geolocation, driving lock, media). Controllers expose a vanilla zustand store as `state$`.
5. **Routing.** In-memory stack router (no URL routes). Stack is persisted so that returning from a Maps hand-off restores the exact screen instantly. OAuth callbacks are the only URL-driven flow (`?code=&state=`), cleaned with `history.replaceState`.
6. **Vite `base: './'`** so one build works on any static host path. Redirect URI = `origin + pathname`.
7. **Spotify.** Authorization Code + PKCE, tokens in `localStorage`, refresh single-flight. iOS keeps Safari and home-screen-app storage separate, so a "connection code" (copy/paste of the tokens) lets the user sign in using Safari and import into the PWA. Honest limitation documented.
8. **YouTube.** Google Identity Services token flow (access token, 1 h, silent re-request). Optional API key lets search work without sign-in. `playlistItems?playlistId=LL` for liked videos, falling back to `videos?myRating=like`. All Data API responses cached with TTL (search is 100 quota units).
9. **Maps.** Default provider MapLibre with raster tiles (CARTO Positron/Dark Matter for light/dark - OSM data; Esri World Imagery for satellite). Google Maps JS and MapKit JS are optional adapters behind the same `MapAdapter` interface and fall back to MapLibre if the key is missing or loading fails. Search: Photon (default) or Nominatim (debounced, attribution shown, <= 1 req/s), Google Places (New) when a key is set.
10. **Settings.** One flat typed `Settings` object. The menu is generated from a declarative schema (`core/settingsSchema.ts`) that also provides the searchable index and the English strings (registered into i18next so a Turkish pack only needs the same keys). Custom editors (dock, home pages, widgets, shortcuts, favorites, wallpaper, accounts) are separate components referenced from the schema. Settings the browser cannot support (haptics, wake lock, ...) are hidden via `requires`.
11. **Units.** Speeds and thresholds are stored in km/h and metres internally; the UI converts.
12. **Demo player.** A clearly labelled "Demo player" source (no accounts needed) drives the Now Playing UI in M2 and stays available (Media > Demo player) for trying the UI and for Playwright screenshots. It never touches Media Session.
13. **Tests.** Vitest for pure logic (PKCE, API retry, router, settings migration, units, sun calc, deep links, media-session ownership, position interpolation, i18n key coverage). Playwright for smoke + screenshots (Chromium with iPhone-like viewport/touch).
14. **Tooling.** Node LTS + Git were installed via winget on this machine at the user's request (they were missing).

## Platform limits (all surfaced in-app under About > Known limitations and in the README)

- Steering-wheel keys: handled by iOS for whichever app owns Now Playing - in Spotify mode that is Spotify itself.
- No Spotify Web Playback SDK on iOS; Premium required for control; "Open Spotify" prompt + auto transfer retry.
- No orientation lock, no Fullscreen API, no guaranteed background audio, no Battery/Vibration API (feature-detected, hidden).
- No embedded turn-by-turn: deep-link hand-off to Apple Maps / Google Maps / Waze.
- YouTube IFrame only plays in the foreground; no audio extraction; parked-only by default.
- OAuth redirect flows inside iOS standalone web apps can be awkward (storage is partitioned from Safari) - connection-code fallback.
