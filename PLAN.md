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

**Status: M1-M7 complete.** Each milestone is one commit (`git log --oneline`). Per-milestone screenshots are in the git history (`docs/screenshots/M1`..`M6`); the final set is `docs/screenshots/final`.

## Decisions added while building

15. **Spotify API changes (Feb 2026).** Player endpoints are unchanged, but development-mode apps lost the per-type save/contains routes (now `/me/library`, by URI) and `GET /me` no longer returns `product`. The client tries the new routes and falls back to the legacy ones on 400/404/405, and Premium is detected from a `403 PREMIUM_REQUIRED` on the first command (and from `product` when present).
16. **Nominatim is submit-only.** Its usage policy forbids autocomplete, so only Photon and Google Places search while typing; Nominatim searches on Enter, at most 1 request per second.
17. **Media Session is taken lazily.** A source that owns it (YouTube) only registers handlers once it has a track, and releases them when the player is closed. Merely being "last used source" never steals the keys.
18. **One persistent YouTube host.** The IFrame player lives in a single fixed element that follows a slot on the YouTube / Now Playing screens and becomes a mini player (356x200 video + control strip) elsewhere, so it stays visible and unmodified. The "Parked-only" overlay is a deliberate safety exception to "always visible".
19. **Touch targets are real boxes.** Every interactive element is at least `--tt` (64 px, up to 96, scaled by UI scale) in both dimensions - toggles, swatches, segmented items and the home-edit badge draw their small visuals inside a 64 px element. An e2e audit enforces this on every screen in both orientations.
20. **Settings are validated on import.** Free-text settings that reach CSS or parsers (accent, wallpaper data URL, times, region code) must match a strict pattern, so an imported file cannot inject CSS or remote URLs.
21. **Simplified mode** = Home with only Maps, Spotify, YouTube, Now Playing and Settings in 1.5x tiles, no edit mode, and a dashboard reduced to map / Now Playing / speed.
22. **Dev-only hooks.** `window.__dd` (stores, for e2e) exists only in the dev server; `?demo=1`, `?screen=` and `?skipOnboarding=1` are documented conveniences.
23. **Screenshots** were taken with Chromium and stubbed network (deterministic tiles, fake IFrame API, mocked Spotify/YouTube/Open-Meteo/Photon). They show layout, not real content or real iOS rendering.

## Not verified on real hardware

No iPhone, car or live Spotify / Google / Apple / Google-Maps credentials were available during development. Verified in automated tests: logic, layouts, the offline shell and manifest. **Needs a real-device check:** Spotify and Google sign-in inside the installed app, steering-wheel keys in both modes, the Wake Lock in standalone mode, Google Maps / MapKit adapters, and the YouTube IFrame player on iOS.

## Decisions (made without asking, as requested)

1. **Name / branding.** App is "DriveDeck". No Apple marks, no "CarPlay" in UI or app name. All icons are original inline SVG glyphs (2px round-cap stroke style, one `Icon` component). System font stack only.
2. **Spotify and YouTube names.** Text only, no logos redrawn. Spotify content always links back to Spotify ("Open in Spotify"); album art is never cropped into a vinyl circle for Spotify (their design guidelines), only for YouTube/demo. YouTube player is the unmodified IFrame player, always visible; a "Parked-only" safety overlay is shown only while the driving lock is active.
3. **Media key ownership.** A single module `services/mediaSession` owns `navigator.mediaSession`. It attaches only for sources that play audio inside DriveDeck (YouTube). When Spotify is active it is released and, if it was never attached, never touched. No silent audio anywhere.
4. **State management.** Zustand everywhere (settings with `persist`, router, geolocation, driving lock, media). Controllers expose a vanilla zustand store as `state$`.
5. **Routing.** In-memory stack router (no URL routes). Stack is persisted so that returning from a Maps hand-off restores the exact screen instantly. OAuth callbacks are the only URL-driven flow (`?code=&state=`), cleaned with `history.replaceState`.
6. **Vite `base: './'`** so one build works on any static host path. Redirect URI = `origin + pathname`.
7. **Spotify.** Authorization Code + PKCE, tokens in `localStorage`, refresh single-flight. iOS keeps Safari and home-screen-app storage separate, so a "connection code" (copy/paste of the tokens) lets the user sign in using Safari and import into the PWA. Honest limitation documented.
8. **YouTube.** Google Identity Services token flow (access token, 1 h, silent re-request). Optional API key lets search work without sign-in. `playlistItems?playlistId=LL` for liked videos, falling back to `videos?myRating=like`. All Data API responses cached with TTL (search is 100 quota units).
9. **Maps.** Default provider MapLibre with VersaTiles vector styles (colorful/eclipse for light/dark - OSM data, no key; Esri World Imagery raster for satellite). CARTO raster tiles were used first but now answer "API KEY REQUIRED". Google Maps JS and MapKit JS are optional adapters behind the same `MapAdapter` interface and fall back to MapLibre if the key is missing or loading fails. Search: Photon (default) or Nominatim (debounced, attribution shown, <= 1 req/s), Google Places (New) when a key is set.
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
