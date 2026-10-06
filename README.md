# ngx-excalidraw

An Angular 22+ wrapper for the [Excalidraw](https://github.com/excalidraw/excalidraw) editor. It
renders an SSR-safe placeholder on the server and lazy-loads React and Excalidraw only after the
app first becomes stable. It works in zoneless apps and with zone.js, supports Excalidraw
libraries (`.excalidrawlib` files and `#addLibrary` links), and has a `mainMenu` input to hide
Excalidraw's main menu.

## Install

```sh
npm install @getvoicify/ngx-excalidraw @excalidraw/excalidraw react react-dom
```

```ts
import { Component } from '@angular/core';
import { ExcalidrawComponent } from '@getvoicify/ngx-excalidraw';

@Component({
  selector: 'app-board',
  imports: [ExcalidrawComponent],
  template: `<ngx-excalidraw style="height: 600px" />`,
})
export class Board {}
```

The editor also needs Excalidraw's CSS, usually wired up through `provideExcalidraw`. The
[package README](projects/ngx-excalidraw/README.md) covers that setup, along with the inputs,
outputs, scene actions, libraries and SSR. The same README ships in the npm package.

## Repository layout

| Path                                                 | Contents                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| [`projects/ngx-excalidraw`](projects/ngx-excalidraw) | The library.                                                      |
| [`projects/demo`](projects/demo)                     | A server-rendered Angular demo app. The e2e tests run against it. |
| [`e2e`](e2e)                                         | Playwright tests.                                                 |
| [`scripts`](scripts)                                 | The packed-tarball install test and the demo's public-API guard.  |
| [`docs/design.md`](docs/design.md)                   | Design decisions and the reasons behind them.                     |

## Development

The workspace needs Node 24 (see `.nvmrc`).

```sh
nvm use
npm ci
```

| Command                                   | What it does                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                | Runs the library unit tests (zoneless, then with zone.js), the demo unit tests and the script tests once.                          |
| `npm run test:watch`                      | Runs the library unit tests in watch mode.                                                                                         |
| `npm run e2e`                             | Builds the demo, serves it on port 4310, and runs the Playwright tests.                                                            |
| `npm run e2e:ui`                          | Runs the same tests in Playwright's UI mode.                                                                                       |
| `npm run e2e:headed`                      | Runs the same tests in a visible browser.                                                                                          |
| `npm run build:lib`                       | Builds the package into `dist/ngx-excalidraw`.                                                                                     |
| `npm run test:install`                    | Packs `dist/ngx-excalidraw` (run `build:lib` first) and installs it into fresh Angular 22 SSR apps, on React 19 and on React 18.2. |
| `npm start`                               | Starts the demo dev server on <http://localhost:4200>.                                                                             |
| `npm run build:demo && npm run serve:ssr` | Builds the demo and serves it with SSR on <http://localhost:4000> (`PORT` overrides this).                                         |

The e2e run always starts its own server and never reuses one that is already running. If port
4310 is taken, set `E2E_PORT`, for example `E2E_PORT=4333 npm run e2e`. Extra arguments go through
to Playwright, for example `npm run e2e:headed -- e2e/library.spec.ts`.

### Trying the demo by hand

With `npm start` or `serve:ssr` running:

- **Draw** shapes. The `elements:` counter updates, and stays still while you hover, pan or zoom.
- **Dark theme** and **View mode** update the editor in place, without a remount.
- **Export SVG** renders the current scene below the buttons.
- **Libraries.** Open
  <http://localhost:4200/#addLibrary=http%3A%2F%2Flocalhost%3A4200%2Fsample.excalidrawlib> (use
  port 4000 in both places for `serve:ssr`) and confirm the prompt. The `library:` counter goes up
  and `addLibrary` disappears from the URL. The demo uses `libraryUrlValidator()`, so it accepts
  libraries from its own origin and from Excalidraw's official sources
  (<https://libraries.excalidraw.com> and the main branch of the official
  `excalidraw/excalidraw-libraries` repository).
- **Browse libraries.** In the editor's library panel, choose **Browse libraries**, pick a library
  on libraries.excalidraw.com and choose **Add to Excalidraw**. You come back to the demo and the
  library is imported.
- **Main menu.** Untick **Main menu**, or open the demo with `?mainMenu=false`, to hide Excalidraw's
  main menu and block its actions: the open, save and export shortcuts, reset canvas, help, and
  dropping scene files onto the canvas.
- **Remove editor** destroys the component and tears down the editor.
- **SSR.** The `serve:ssr` page source contains the server-rendered placeholder, and the Network
  tab shows the Excalidraw chunk requested only after the page settles.

## License

MIT. See [LICENSE](LICENSE).

[Excalidraw](https://github.com/excalidraw/excalidraw) is MIT-licensed by its authors.
