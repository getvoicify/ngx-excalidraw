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
- **Main menu**: `mainMenu` (reactive, default `true`); `false` means the main menu and its actions
  are unavailable, not just the button. Excalidraw 0.18 has no prop for it: it renders
  `DefaultMainMenu` unless a custom `<MainMenu>` child is given (which always renders the trigger
  itself), and `UIOptions.canvasActions` only trims items. Mechanism:
  - host class `ngx-excalidraw--no-main-menu` (host binding, so it is in the SSR HTML and nothing
    flashes after hydration) and `:host(.ngx-excalidraw--no-main-menu) ::ng-deep
:is(.main-menu-trigger, .help-icon) { display: none }`. `::ng-deep` under `:host(...)` reaches
    React's DOM (which emulated encapsulation never attributes) while staying scoped to this host;
    `ViewEncapsulation.None` would make the component's other styles global. The phone layout
    renders the same trigger. `.help-icon` is the footer Help button, the menu's Help item
    duplicated.
  - an open canvas menu (`appState.openMenu === 'canvas'`) is closed with `updateScene` outside
    the zone. Nothing else opens it: no shortcut, and the bridge does not render `<CommandPalette>`
    (its "Canvas background" command would).
  - `guardMainMenuActions` (attached by an effect while hidden and mounted, outside the zone):
    a capture `keydown` listener on the document that drops Ctrl/Cmd+O, Ctrl/Cmd+S,
    Ctrl/Cmd+Shift+E, Ctrl/Cmd+Backspace/Delete and `?` aimed at the editor (any target when
    `handleKeyboardGlobally`), except from text entry (textarea, text/number/password input,
    contenteditable), mirroring Excalidraw's `isWritableElement`; and a capture `drop` listener on
    the host that holds back every dropped file and replays it (a new `DragEvent` with the same
    coordinates) only if its type is one of Excalidraw's image types and its bytes lack
    `application/vnd.excalidraw+json` (the PNG `tEXt` keyword and the SVG payload comment
    Excalidraw reads a scene from). Drops without files (library items, links) pass.
  - why not `canvasActions` (merging `loadScene`/`saveToActiveFile`/... `false` over the
    consumer's `UIOptions`): it gates only actions the `ActionManager` dispatches (Cmd+O, Cmd+S).
    Cmd+Shift+E and `?` are handled directly in `App.onKeyDown` (`saveAsImage: false` only stops
    rendering the dialog; `openDialog` stays `imageExport` and the dialog would appear once the menu
    returns), Cmd+Backspace/Delete opens the reset confirm whose confirm runs `actionClearCanvas`
    via `executeAction` (no gate), and drops call `loadFileToCanvas` directly. Also,
    `Excalidraw`'s memo comparator compares only the previous `canvasActions` keys, so a consumer
    that passes `canvasActions` would not see the merge at runtime. One guard covers every path.
  - Cmd+Shift+S (save to disk) is unreachable in 0.18: `onKeyDown` upper-cases a shifted letter
    before the action's `key === 's'` test.
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
  origin plus the official sources": over https only, origin `https://libraries.excalidraw.com`
  and path prefix `https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/`
  (other refs serve pull-request content, which anyone can open); exact extra origins (normalised
  at construction, which throws on anything but a bare origin); and `location.origin` resolved
  per check (SSR-safe in app config). Non-http(s) URLs (so opaque origins never match), URLs with
  credentials and unparseable URLs are rejected. The libraries site's "Add to Excalidraw" returns to
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
- **Consumer API** (owner directive: the demo, a real consumer, imports only `ngx-excalidraw`,
  Angular and rxjs; `scripts/demo-public-api.test.mjs` enforces it on `projects/demo/src/app` by
  parsing imports and `window.__*` accesses):
  - the Excalidraw types consumers handle are re-exported type-only (no runtime import; the
    install test's fesm import scan stays the guard).
  - `ExcalidrawSceneChange.nonDeletedElements` beside `elements`: `elements` keeps tombstones because
    persistence and collaboration reconcile on them. Named after Excalidraw's own
    `NonDeletedExcalidrawElement` / `getNonDeletedElements`; `visibleElements` was rejected because
    Excalidraw's renderer uses "visible" for elements inside the viewport.
  - `scene` (read-only signal): the latest emitted change, `undefined` until the first and again
    once the editor is torn down.
  - `ready` (computed from the handed-over API): true from the moment `api` emits until teardown or
    failure. Readiness is not inferred from `scene()`, which would rely on Excalidraw firing
    `onChange` on mount.
  - `exportToSvg` / `exportToBlob` / `serializeAsJSON` on the component read the mounted editor's
    elements (`getSceneElements`, non-deleted; `serializeAsJSON` drops deleted ones itself in both
    `local` and `database` modes), appState and files and delegate to `ExcalidrawData`; they reject
    while no editor is mounted. Their option types are hand-written from 0.18's
    `utils/export.d.ts`, because 0.18 re-exports its export functions from `@excalidraw/utils/export`,
    which does not resolve for consumers, so `typeof import('@excalidraw/excalidraw').exportToSvg`
    is `any` (this also makes `ExcalidrawData`'s export signatures and `ExportToSvgOptions` /
    `ExportToBlobOptions` `any`).
  - `api` stays as the escape hatch for imperative calls the wrapper does not cover.
  - export preview: a `data:image/svg+xml` URL on `<img [src]>`; Angular 22's URL sanitizer
    (`SAFE_URL_PATTERN`) blocks only `javascript:`, and a data URL needs no revocation. Kept in the
    demo, not the library: it is one line of plain Angular.
  - e2e instrumentation lives in the demo's `e2e` build configuration (`src/e2e/main.e2e.ts`, output
    `dist/demo-e2e`, used by Playwright's web server), which decorates the public
    `loadDefaultExcalidrawRenderer` through `EXCALIDRAW_RENDERER_LOADER` to expose the API and count
    hand-overs and scene changes. The counts are taken at the renderer callbacks, one step before the
    outputs; the outputs themselves are covered by the DOM the demo renders from them.
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
