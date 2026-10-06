# ngx-excalidraw — design

Angular 22+ wrapper around `@excalidraw/excalidraw` (React). Package name: `ngx-excalidraw`.

## Decisions

- **Toolchain**: Angular **22.2.x**, Node **24** (`.nvmrc`; Angular CLI 22 needs Node ≥22.22 or ≥24.15).
  Peer range `@angular/core|common >=22.0.0 <23.0.0`, `@excalidraw/excalidraw ^0.18.0`,
  `react|react-dom ^18.2.0 || ^19.0.0`. The original goal said Angular 21+; the floor moved to 22
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
  - `sceneChange` output is coalesced and skips emits when `getSceneVersion` is unchanged.
- **Inputs**: reactive (pushed into the mounted editor) = `theme`, `viewModeEnabled`,
  `zenModeEnabled`, `gridModeEnabled`, `langCode`, `UIOptions`. Mount-only (Excalidraw 0.18 reads
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
- **Assets**: `provideExcalidraw({ assetPath })` sets `window.EXCALIDRAW_ASSET_PATH` before import
  (self-hosted fonts); unset = Excalidraw's CDN default.
- **Libraries** (`.excalidrawlib` item collections): the bridge runs Excalidraw's own
  `useHandleLibrary` hook with an adapter bridged from Angular (`EXCALIDRAW_LIBRARY_ADAPTER`,
  `localStorage` adapter provided), yielding persistence and the `#addLibrary` URL import.
  `libraryItems` input, `libraryChange` output.
- **Utilities**: lazily exposed `exportToSvg` / `exportToBlob` / `serializeAsJSON`.
- **Workspace resolution**: `ngx-excalidraw` maps to the library _source_ in `tsconfig` paths; the
  packaged artifact is verified by the install test.
- **Tests (local, non-negotiable)**: Vitest (`@angular/build:unit-test`), Playwright e2e against the
  built SSR demo (never reusing an existing server), plus the pack-and-install script.

## Slice plan (one branch each, merged to main in order)

1. `chore/scaffold` — done.
2. `chore/angular-22` — done.
3. `feat/lazy-mount` — done.
4. `feat/inputs` — theme/viewMode/zenMode/gridMode/langCode/initialData etc. pushed without remount.
5. `feat/scene-change` — coalesced `sceneChange` output.
6. `feat/libraries` — `libraryItems` / `libraryChange`, adapter token + localStorage adapter,
   `useHandleLibrary` wiring, `#addLibrary` flow + e2e.
7. `feat/export` — export helpers.
8. `test/install` — pack + fresh-app install script, chunk-split assertion on the packaged output.
9. `docs/readme` — README usage; remove the hand-maintained version constant.
