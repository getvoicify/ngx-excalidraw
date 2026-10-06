# ngx-excalidraw — design

Angular 21+ wrapper around `@excalidraw/excalidraw` (React). Package name: `ngx-excalidraw`.

## Decisions

- **Toolchain**: workspace built with Angular CLI **21.2.x** (the oldest supported major — partial-compiled
  libraries built on N link on N and later). Peer range `@angular/core|common >=21.0.0 <23.0.0`,
  `@excalidraw/excalidraw ^0.18.0`, `react|react-dom ^18.2.0 || ^19.0.0`. Installability is proven by
  packing the library and installing the tarball into fresh Angular **21 and 22** apps (script-driven).
- **Zoneless-first**: signals inputs/outputs, `ChangeDetectionStrategy.OnPush`, no reliance on zone.js;
  React work runs via `NgZone.runOutsideAngular` when zone.js is present so pointer moves never trigger CD.
- **SSR**: nothing touches `window`/`document`/React at import or construction time. The React +
  Excalidraw bundle is loaded with dynamic `import()` inside `afterNextRender`, so on the server the
  component renders only a sized placeholder (projected `[placeholder]` content or a default).
  Hydration-safe (placeholder identical on server and first client render).
- **Performance**:
  - React/Excalidraw are never in the initial chunk — dynamic import → separate lazy chunk (asserted
    by a build-output test).
  - One React root per component; input changes after mount are pushed through `excalidrawAPI`
    (`updateScene`, `updateLibrary`) or a cheap re-render of props — never remount.
  - `sceneChange` output is coalesced (rAF/configurable debounce) and skips emits when the scene
    version (`getSceneVersion`) is unchanged; avoids flooding Angular with every pointer move.
  - Optional `preload()` helper to warm the chunk (e.g. on hover / idle).
- **Libraries** (Excalidraw "libraries" = reusable item collections, `.excalidrawlib`):
  - `libraryItems` input, `libraryChange` output.
  - `#addLibrary=<url>&token=<t>` import flow (excalidraw.com "Add to Excalidraw") with configurable
    `libraryReturnUrl`, handled by the wrapper (equivalent of React's `useHandleLibrary`).
  - Pluggable persistence via an `EXCALIDRAW_LIBRARY_ADAPTER` injection token (`load()`/`save()`),
    with a `localStorage` adapter provided (browser-only, SSR-safe).
  - `loadLibraryFromBlob` / `.excalidrawlib` file import helper.
- **Utilities**: `ExcalidrawExport` service lazily exposing `exportToSvg` / `exportToBlob` /
  `serializeAsJSON` (same lazy chunk, browser-only guard).
- **Tests (local, non-negotiable)**: Vitest unit/component tests (Angular CLI `@angular/build:unit-test`),
  Playwright e2e against the demo app served with SSR (draw, library import, SSR HTML assertions,
  hydration with no console errors), plus the pack-and-install script.

## Slice plan (one branch each, merged to main in order)

1. `chore/scaffold` — workspace, library + SSR demo app, vitest + playwright wiring, one smoke test each.
2. `feat/lazy-mount` — component: SSR placeholder, browser-only lazy mount/unmount of Excalidraw, `api` output.
3. `feat/inputs` — theme/viewMode/zenMode/gridMode/langCode/initialData inputs pushed without remount.
4. `feat/scene-change` — coalesced `sceneChange` output.
5. `feat/libraries` — `libraryItems` / `libraryChange`, adapter token + localStorage adapter.
6. `feat/library-url-import` — `#addLibrary` flow.
7. `feat/export` — export service.
8. `test/install` — pack + fresh-app install script for Angular 21 & 22, chunk-split assertion.
9. `docs/readme` — README usage.
