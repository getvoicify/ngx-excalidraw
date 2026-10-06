# ngx-excalidraw

An Angular component for the [Excalidraw](https://github.com/excalidraw/excalidraw) editor. It is
SSR-safe, works with or without zone.js, and loads React and Excalidraw lazily, after your app first
settles.

## Requirements

- Angular 22 (`@angular/core` and `@angular/common` `>=22.0.0 <23.0.0`)
- `@excalidraw/excalidraw` `^0.18.0`
- `react` and `react-dom` `^18.2.0 || ^19.0.0`
- `rxjs` `^7.4.0`

```sh
npm install ngx-excalidraw @excalidraw/excalidraw react react-dom
```

## Setup

The library does not import Excalidraw's CSS. Emit it as a separate, non-injected stylesheet in
`angular.json` (`projects.<app>.architect.build.options.styles`):

```json
"styles": [
  "src/styles.css",
  {
    "input": "node_modules/@excalidraw/excalidraw/dist/prod/index.css",
    "inject": false,
    "bundleName": "excalidraw"
  }
]
```

Then point the library at it in your application config. The `<link>` is added once per document,
before the first editor mounts:

```ts
import { ApplicationConfig } from '@angular/core';
import { provideExcalidraw } from 'ngx-excalidraw';

export const appConfig: ApplicationConfig = {
  providers: [provideExcalidraw({ styleUrl: 'excalidraw.css' })],
};
```

If you leave out `styleUrl`, include Excalidraw's CSS globally yourself.

`assetPath` sets `window.EXCALIDRAW_ASSET_PATH`, where Excalidraw loads its fonts from. When it is
unset, fonts come from Excalidraw's CDN. To self-host, copy the fonts with an `assets` entry,
`{ "glob": "**/*", "input": "node_modules/@excalidraw/excalidraw/dist/prod/fonts", "output": "fonts" }`,
and pass `provideExcalidraw({ styleUrl: 'excalidraw.css', assetPath: '/' })`.

Put `provideExcalidraw` in the application config. When it is provided on a lazy route, it reaches
only the editors under that route, and `ExcalidrawData` still sees only the root config.

### Expected warnings

With React 19, `npm install` prints `ERESOLVE overriding peer dependency` warnings. They come from
Radix packages nested inside `@excalidraw/excalidraw` 0.18, which declare
`react ^16.8 || ^17.0 || ^18.0`. They are harmless, and the install needs neither `--force` nor
`--legacy-peer-deps`.

`ng build` warns that React and several of Excalidraw's dependencies are not ESM (CommonJS). They
all end up in the lazy Excalidraw chunk, not the initial bundle. To silence the warnings, add this
list to `projects.<app>.architect.build.options` in `angular.json`:

```json
"allowedCommonJsDependencies": [
  "@braintree/sanitize-url",
  "@excalidraw/markdown-to-text",
  "canvas-roundrect-polyfill",
  "cytoscape-cose-bilkent",
  "cytoscape-fcose",
  "dayjs",
  "es6-promise-pool",
  "fastdom",
  "fuzzy",
  "lodash.debounce",
  "lodash.throttle",
  "pica",
  "png-chunk-text",
  "png-chunks-encode",
  "png-chunks-extract",
  "react",
  "react-dom",
  "scheduler",
  "use-sync-external-store"
]
```

## Usage

The editor fills its host, so give the host a height. Anything marked `placeholder` is shown until
the editor mounts. That covers the server render, the bundle download, and the case where the
editor fails.

```ts
import { Component, signal } from '@angular/core';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ExcalidrawComponent, type ExcalidrawSceneChange } from 'ngx-excalidraw';

@Component({
  selector: 'app-whiteboard',
  imports: [ExcalidrawComponent],
  styles: `
    ngx-excalidraw {
      height: 600px;
    }
  `,
  template: `
    <ngx-excalidraw
      [theme]="dark() ? 'dark' : 'light'"
      viewModeEnabled
      (api)="api.set($event)"
      (sceneChange)="onSceneChange($event)"
      (editorError)="onEditorError($event)"
    >
      <p placeholder>Loading the editor…</p>
    </ngx-excalidraw>
  `,
})
export class Whiteboard {
  protected readonly dark = signal(false);
  protected readonly api = signal<ExcalidrawImperativeAPI | undefined>(undefined);

  protected onSceneChange({ elements }: ExcalidrawSceneChange): void {
    console.log(`${elements.length} elements`);
  }

  protected onEditorError(error: unknown): void {
    console.error(error);
  }
}
```

### Inputs

The types are Excalidraw 0.18's `ExcalidrawProps`. Boolean inputs also accept attribute form
(`viewModeEnabled`). An input you leave unset is never sent, so Excalidraw's own default applies.

| Input                    | Updates the mounted editor |
| ------------------------ | -------------------------- |
| `theme`                  | yes                        |
| `viewModeEnabled`        | yes                        |
| `zenModeEnabled`         | yes                        |
| `gridModeEnabled`        | yes                        |
| `langCode`               | yes                        |
| `UIOptions`              | yes                        |
| `libraryReturnUrl`       | yes                        |
| `initialData`            | no, read once at mount     |
| `handleKeyboardGlobally` | no, read once at mount     |
| `objectsSnapModeEnabled` | no, read once at mount     |
| `name`                   | no, read once at mount     |
| `autoFocus`              | no, read once at mount     |
| `detectScroll`           | no, read once at mount     |

Excalidraw 0.18 reads the mount-only inputs only when it mounts, so later changes to them are
ignored. Reactive inputs update the editor in place, without remounting it.

### Outputs

| Output          | Payload                   | Emits                                                         |
| --------------- | ------------------------- | ------------------------------------------------------------- |
| `api`           | `ExcalidrawImperativeAPI` | once the editor has mounted                                   |
| `sceneChange`   | `ExcalidrawSceneChange`   | when the scene changes, at most once per animation frame      |
| `libraryChange` | `LibraryItems`            | on every library update, including the adapter's initial load |
| `editorError`   | `unknown`                 | when loading, mounting, or a crash inside Excalidraw fails    |

The `sceneChange` payload is `{ elements, appState, files, version }`.

- **It only fires for real edits.** Hover, pan, zoom and selection never emit. Changes are
  coalesced per frame and compared on element versions, file ids, and the appState keys Excalidraw
  persists (`viewBackgroundColor`, `gridModeEnabled`, `gridSize`, `gridStep`). The first scene
  after mount is emitted, and a drag emits about once per frame.
- **Treat the elements as read-only.** `elements` is a fresh array on every emission, but the
  element objects are Excalidraw's own, and Excalidraw mutates them in place. To persist the scene,
  serialize it (for example with `ExcalidrawData.serializeAsJSON`) instead of keeping references.
- **A pending change is flushed** synchronously when the component is destroyed or the page becomes
  hidden (`visibilitychange` to hidden, or `pagehide`). Nothing is emitted after destroy.

When `editorError` emits, the editor is torn down and the placeholder returns. A failed bundle load
is retried by the next editor that mounts.

## Libraries

Library support (`.excalidrawlib` item collections, `#addLibrary` links) is opt-in. This is
separate from `provideExcalidraw` because Excalidraw's library handling reads the URL and installs
a global `hashchange` listener.

```ts
import { ApplicationConfig } from '@angular/core';
import {
  libraryUrlValidator,
  localStorageLibraryAdapter,
  provideExcalidraw,
  provideExcalidrawLibrary,
} from 'ngx-excalidraw';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExcalidraw({ styleUrl: 'excalidraw.css' }),
    provideExcalidrawLibrary({
      adapter: localStorageLibraryAdapter('my-app-library'),
      validateLibraryUrl: libraryUrlValidator({ origins: ['https://libraries.example.com'] }),
    }),
  ],
};
```

- **`adapter`** persists the library. `localStorageLibraryAdapter(key = 'ngx-excalidraw-library')`
  touches storage only inside `load` and `save`. `load` yields nothing when the data is missing,
  corrupt or unreadable. `save` rejects on failure, so Excalidraw reports the error. Any
  Excalidraw `LibraryPersistenceAdapter` (`ExcalidrawLibraryAdapter`) works.
- **`validateLibraryUrl`** decides which URLs an `#addLibrary` link may import from. A custom
  validator **replaces** Excalidraw's allow-list rather than extending it, so a validator that
  only allows your own origin rejects the official libraries site.
- **`libraryUrlValidator({ origins?, allowOwnOrigin = true })`** builds a validator that accepts:
  - the official libraries site, `https://libraries.excalidraw.com` (https only);
  - anything on the official repository's `main` branch,
    `https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/`. Other refs (pull
    requests, other branches, commit SHAs) are rejected, since anyone can open a pull request there;
  - the page's own origin, read from `location.origin` each time a URL is checked (so it is safe
    to build in an SSR app config), unless `allowOwnOrigin` is `false`;
  - each of `origins`, matched exactly.

  It rejects everything else, including non-http(s) and opaque URLs, lookalike hosts, other ports, URLs with credentials and
  unparseable URLs.

- **Without `validateLibraryUrl`**, Excalidraw's default allow-list applies:
  - any `excalidraw.com` host or subdomain, over http or https. Its hostname regex leaves the dots
    unescaped, so it matches more hosts than it appears to.
  - anything under `raw.githubusercontent.com/excalidraw/excalidraw-libraries/`, on any branch.

  It does not include your own origin.

- **Browse libraries.** Excalidraw's library menu links to `libraries.excalidraw.com` with
  `libraryReturnUrl` (default: the current origin and path) as the return address. Its "Add to
  Excalidraw" button sends the user back with `#addLibrary=<library file url>&token=<editor id>`. The import
  only succeeds if the validator accepts `libraries.excalidraw.com`, which both the default and
  `libraryUrlValidator()` do. Files there may be in the legacy v1 format; Excalidraw converts them.
- **Import flow.** A link of the form `#addLibrary=<encoded url>` (or the legacy
  `?addLibrary=<url>`) asks the user to confirm with `window.confirm`, then imports the library.
  Excalidraw then strips `addLibrary` from the URL with `history.replaceState({}, …)`.
- **Router caveat.** Excalidraw's `hashchange` handler for `addLibrary` hashes calls
  `stopImmediatePropagation`. As a result, `history.state` is dropped for that entry, so the
  Angular Router loses its navigation id and restored scroll position there. Router listeners
  registered after Excalidraw's never see that `hashchange`.
- **One editor per page handles the library.** The first mounted editor claims it. When that
  editor is destroyed, the claim passes to the next live one.
- **Seeding items.** To seed items, use `initialData.libraryItems` (mount-only, merged) or
  `api.updateLibrary(...)`. There is no `libraryItems` input.

## SSR and performance

- **On the server**, only the placeholder renders. Nothing touches `window`, `document` or React
  at import or construction time, and hydration is safe.
- **In the browser**, React and Excalidraw are never in the initial chunk. The bundle (about 1 MB)
  starts loading only after `ApplicationRef` first becomes stable, with a 3 s fallback for apps
  that never settle, so it does not hold up hydration or `registerWhenStable`. Editors on the same
  page share one load.
- **Change detection.** The component works in zoneless and zone.js apps. Excalidraw runs outside
  the Angular zone, so pointer moves trigger no change detection. Outputs re-enter the zone.
- **Preloading.** To start the download earlier (for example, when the user hovers a link to the
  editor), call `preloadExcalidraw()`. It resolves `true` once the bundle is loaded, and `false` on
  the server or on failure.

## `ExcalidrawData`

`ExcalidrawData` is a root-provided service that wraps Excalidraw's data utilities with their 0.18
signatures. Every method returns a promise.

The methods are `exportToSvg`, `exportToBlob`, `serializeAsJSON`, `loadFromBlob`, and
`loadLibraryFromBlob`.

It imports `@excalidraw/excalidraw` on first call. This is the same chunk the editor uses, so it is
only downloaded once. On the server, every call rejects.

```ts
import { inject, Injectable } from '@angular/core';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ExcalidrawData } from 'ngx-excalidraw';

@Injectable({ providedIn: 'root' })
export class WhiteboardFiles {
  private readonly data = inject(ExcalidrawData);

  toSvg(api: ExcalidrawImperativeAPI): Promise<SVGSVGElement> {
    return this.data.exportToSvg({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    });
  }

  toJson(api: ExcalidrawImperativeAPI): Promise<string> {
    return this.data.serializeAsJSON(
      api.getSceneElements(),
      api.getAppState(),
      api.getFiles(),
      'local',
    );
  }

  async open(api: ExcalidrawImperativeAPI, file: Blob): Promise<void> {
    const { elements, appState, files } = await this.data.loadFromBlob(file, null, null);
    api.addFiles(Object.values(files));
    api.updateScene({ elements, appState });
  }
}
```

## Known Excalidraw quirks

- **Theme.** Changing `theme` from `'dark'` to unset leaves the editor dark, because Excalidraw
  only applies a defined theme. Pass `'light'` explicitly. The wrapper does not default `theme`,
  because a defined theme hides Excalidraw's own theme toggle.
- **Asset path.** `window.EXCALIDRAW_ASSET_PATH` is a single page-wide global, so the last
  `assetPath` written wins.
