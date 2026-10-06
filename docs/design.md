# ngx-excalidraw — design

Angular 22+ wrapper around `@excalidraw/excalidraw` (React). Package name: `ngx-excalidraw`.

## Decisions

- **Toolchain**: Angular **22.2.x**, Node **24** (`.nvmrc`; Angular CLI 22 needs Node ≥22.22 or ≥24.15).
  Peer range `@angular/core|common >=22.0.0 <23.0.0`, `@excalidraw/excalidraw ^0.18.0`,
  `react|react-dom ^18.2.0 || ^19.0.0`, `rxjs ^7.4.0` (operators imported from the `rxjs` root
  need 7.2+; 7.4 is Angular 22's own rxjs 7 floor). The original goal said Angular 21+; the floor moved to 22
  (approved by the owner) because `resource()` is `@experimental` in 21 and `@publicApi` from 22.0,
  and a library must not ship on an experimental API. Installability is proven by packing the
  library and installing the tarball into a fresh Angular 22 app (script-driven).
- **Declarative style** (owner preference): state is signals derived with `resource`/`computed`,
  side effects live in `effect`s whose cleanup owns teardown; no mutable guard flags.
- **Zoneless-first, zone-compatible**: no reliance on zone.js; React work runs via
  `NgZone.runOutsideAngular` (a no-op when zoneless) so pointer moves never trigger CD in zone apps.
  Both modes are test-locked (`test` target zoneless, `test-zone` target with zone.js).
- **SSR**: nothing touches `window`/`document`/React at import or construction time; on the server
  the component renders only a placeholder (projected `[placeholder]` content or a default).
  Hydration-safe. React owns a mount element created imperatively after load, never in the template.
- **When the bundle loads**: only in the browser, and only after `ApplicationRef` first becomes
  stable (3s fallback for apps that never settle). `resource()` always registers a `PendingTask`, so
  loading earlier would hold app stability (hydration cleanup, service-worker `registerWhenStable`)
  hostage to a ~1MB download. "First settled" is one root-level signal shared by every instance —
  per-instance signals let one editor's pending task block the next editor. It subscribes outside
  the Angular zone (a zone timer would itself prevent stability) and is a constant `false` on the
  server (no timers, SSR never delayed).
- **API hand-over**: Excalidraw 0.18 calls `excalidrawAPI` from its constructor, during render and
  before its editor commits (`InitializeApp` renders a loading screen first). The bridge passes a
  probe child to `<Excalidraw>` whose `useEffect` hands the API to Angular once, after the editor
  commits. Anything later passed as Excalidraw `children` must keep the probe.
- **Failure handling**: a failed bundle load is retried by the next mount (`memoizeUntilRejected`);
  a failed stylesheet link is removed so it is re-requested; load and mount failures, and crashes
  inside Excalidraw (caught by an error boundary in the bridge, since React 19's `root.render` never
  throws them synchronously), emit `editorError`, tear the editor down and restore the placeholder. `preloadExcalidraw()` resolves `true`/`false`.
- **Performance**:
  - React/Excalidraw are never in the initial chunk (e2e asserts the initial HTML's JS has no
    Excalidraw code and that the chunk is requested only after first stability).
  - One React root per component; later input changes go through `render(props)` / `excalidrawAPI`
    — never remount.
  - `sceneChange` emits only scene edits: the bridge passes Excalidraw one stable `onChange` per
    editor (so its memoization holds), keeps the latest call, and once per animation frame — outside
    the Angular zone — compares `hashElementsVersion` (exported by 0.18; `getSceneVersion` is
    deprecated there), the file ids and the appState keys Excalidraw exports
    (`viewBackgroundColor`, `gridModeEnabled`, `gridSize`, `gridStep`) against the last emission; only a changed scene re-enters
    the zone. Hover, pan, zoom and selection never emit. Destroy flushes a pending change
    synchronously (same dedupe) and emits nothing afterwards; so does the page becoming hidden
    (`visibilitychange` to hidden, `pagehide`), since frames stop running in hidden tabs; the component tears the renderer down
    in `ngOnDestroy`, because Angular destroys outputs before effect cleanups run. The
    first scene seen after mount is emitted. Excalidraw already throttles pointer moves to one per
    frame, so a drag still emits about once per frame. Each emission carries a fresh `elements`
    array, but the element objects are Excalidraw's own and mutated in place on later edits —
    treat them as read-only and serialize (e.g. `serializeAsJSON`) to persist; deep-cloning per
    frame was rejected for large-scene cost.
- **Inputs**: reactive (pushed into the mounted editor) = `theme`, `viewModeEnabled`,
  `zenModeEnabled`, `gridModeEnabled`, `langCode`, `UIOptions`, `libraryReturnUrl`. Mount-only (Excalidraw 0.18 reads
  them only at mount; changing them later is ignored on purpose) = `initialData`,
  `handleKeyboardGlobally` (toggling it later breaks Excalidraw's keyboard listeners),
  `objectsSnapModeEnabled`, `name`, `autoFocus`, `detectScroll`. Unset inputs are never sent, so
  Excalidraw defaults apply. `theme` going from `'dark'` to unset stays dark (Excalidraw only applies
  a defined theme); pass `'light'` explicitly — the wrapper does not default it because a defined
  theme hides Excalidraw's own theme toggle.
- **Errors**: `editorError` output covers bundle load failures, renderer creation failures and
  runtime crashes inside Excalidraw (caught by an error boundary in the bridge — React 19's
  `root.render` never throws synchronously). The editor is torn down and the placeholder returns.
- **Renderer seam**: the component never imports React. `EXCALIDRAW_RENDERER_LOADER` (default:
  dynamic `import()` of `react-bridge.ts`) yields `(host, callbacks) => { render(props); destroy() }`.
  The bridge is built from injectable React modules (`createRendererFactory`) so it is unit-tested
  with real React and a fake Excalidraw; ng-packagr keeps it as its own chunk with react/excalidraw
  as external dynamic imports.
- **CSS**: Excalidraw's `index.css` is not imported by the library. `provideExcalidraw({ styleUrl })`
  injects a `<link>` once per document before first mount (recommended consumer setup: an
  `angular.json` styles entry with `inject: false, bundleName: "excalidraw"`). Without `styleUrl`
  the consumer includes the CSS globally.
- **Assets**: `provideExcalidraw({ assetPath })` sets `window.EXCALIDRAW_ASSET_PATH` (self-hosted
  fonts); unset = Excalidraw's CDN default. Excalidraw reads it when fonts load, not at import.
- **Where config applies**: put `provideExcalidraw` in the application config. Provided on a lazy
  route it reaches only the editors under that route; the root `ExcalidrawData` service sees the
  root config alone, so a route-level `assetPath` does not apply to its exports. The global is
  last-writer-wins per page.
- **Libraries** (`.excalidrawlib` item collections): opt-in through
  `provideExcalidrawLibrary({ adapter?, validateLibraryUrl? })`, separate from `provideExcalidraw`
  because Excalidraw's `useHandleLibrary` reads the URL and installs a global `hashchange` listener —
  apps that never asked for libraries must not get that. The bridge runs the hook beside the editor
  with the API as React state set by the probe (the hook's effect depends only on the API value).
  Only one mounted editor per page runs it (a root-level first-come claim that passes to the next
  live editor when the owner is destroyed): each hook would otherwise import an `#addLibrary` link
  again and its cleanup resets Excalidraw's module-level save state for the others.
  Without `validateLibraryUrl` Excalidraw's own default applies (kept, because the libraries site's
  "Add to Excalidraw" relies on it): any `excalidraw.com` host or subdomain over http or https
  (its hostname regex leaves dots unescaped) and anything under
  `raw.githubusercontent.com/excalidraw/excalidraw-libraries/` on any branch. A custom
  `validateLibraryUrl` replaces that list rather than extending it, and Excalidraw 0.18 does not
  export its default, so `libraryUrlValidator({ origins?, allowOwnOrigin = true })` provides "own
  origin plus the official sources": https only, origin `https://libraries.excalidraw.com`, path
  prefix `https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/` (other refs serve
  pull-request content, which anyone can open), exact extra origins,
  and `location.origin` resolved per check (SSR-safe in app config); URLs with credentials and
  unparseable URLs are rejected. The libraries site's "Add to Excalidraw" returns to
  `libraryReturnUrl` with `#addLibrary=<file url>&token=<editor id>`; its files may be the legacy v1
  `library` format, which Excalidraw restores to v2 items before the adapter saves them (e2e-locked).
  An import comes from `#addLibrary=<url>` or the legacy
  `?addLibrary=<url>` query, asks `window.confirm` unless the hash's `token` equals the editor's
  `id`, then Excalidraw strips `addLibrary` with `history.replaceState({}, …)`; its `hashchange`
  handler also calls `replaceState` and `stopImmediatePropagation` for `addLibrary` hashes. Both
  drop `history.state`, so the Angular Router's navigation id and restored scroll position are
  lost for that entry, and router listeners after Excalidraw's never see that `hashchange`. `localStorageLibraryAdapter(key)` touches storage only inside
  `load`/`save`; `load` yields nothing on missing, corrupt or unreadable data, while `save` rejects
  on failure as Excalidraw's adapter contract requires, so Excalidraw reports it. `libraryChange`
  emits every library update (including the adapter's initial load). `libraryReturnUrl` is
  reactive. Seed items with `initialData.libraryItems` (mount-only, merged) or
  `api.updateLibrary(...)`; there is no `libraryItems` input.
- **Utilities**: the root-provided `ExcalidrawData` service exposes `exportToSvg`, `exportToBlob`,
  `serializeAsJSON`, `loadFromBlob` and `loadLibraryFromBlob` with Excalidraw 0.18's signatures, all
  returning promises. Named for Excalidraw's own `data/` module (scene and library data in and out);
  `Files` was rejected because Excalidraw's `BinaryFiles` means embedded images. It imports
  `@excalidraw/excalidraw` on first call (`EXCALIDRAW_MODULE_LOADER` seam, memoized until rejected,
  root `assetPath` set before any export runs) — the same module the bridge imports, so the bundler
  emits one chunk (e2e-locked). Each method takes Excalidraw's own parameter list and forwards it
  verbatim. On the server every call rejects without importing.
- **Workspace resolution**: `ngx-excalidraw` maps to the library _source_ in `tsconfig` paths; the
  packaged artifact is verified by the install test.
- **Tests (local, non-negotiable)**: Vitest (`@angular/build:unit-test`), Playwright e2e against the
  built SSR demo (never reusing an existing server), plus `npm run test:install`: it packs the
  production build, asserts the tarball (peer ranges, `sideEffects`, types, no tests, react-bridge
  a separate chunk importing react/excalidraw dynamically), installs it with its peers into a fresh
  `ng new --ssr --zoneless` Angular 22 app (once with React 19, once with React 18.2) with strict templates, builds it, and asserts the
  server-rendered `/` shows only the placeholder and that Excalidraw code is in a lazy chunk, never
  in the initial JS. npm installs it without `--force`; with React 19 it only warns (ERESOLVE
  overriding) about the `react ^16.8 || ^17 || ^18` peers of Excalidraw 0.18's nested Radix packages.

## Slice plan (one branch each, merged to main in order)

1. `chore/scaffold` — done.
2. `chore/angular-22` — done.
3. `feat/lazy-mount` — done.
4. `feat/inputs` — theme/viewMode/zenMode/gridMode/langCode/initialData etc. pushed without remount.
5. `feat/scene-change` — coalesced `sceneChange` output.
6. `feat/libraries` — `libraryChange` / `libraryReturnUrl`, `provideExcalidrawLibrary` + localStorage adapter,
   `useHandleLibrary` wiring, `#addLibrary` flow + e2e.
7. `feat/export` — export helpers.
8. `test/install` — pack + fresh-app install script, chunk-split assertion on the packaged output.
9. `docs/readme` — README usage; remove the hand-maintained version constant.
