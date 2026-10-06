# tutela-draw

This workspace holds the `ngx-excalidraw` library, an Angular 22+ wrapper around
`@excalidraw/excalidraw`, and an SSR demo app.

- Library: [`projects/ngx-excalidraw`](projects/ngx-excalidraw). For install and usage, see its
  [README](projects/ngx-excalidraw/README.md); that same README ships with the package.
- Demo: [`projects/demo`](projects/demo), a server-rendered Angular app that the e2e tests run
  against.
- Design decisions: [`docs/design.md`](docs/design.md).

## Development

The workspace needs Node 24 (see `.nvmrc`).

```sh
nvm use
npm ci
```

| Command                                   | What it does                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm test`                                | Runs the library unit tests (zoneless, then with zone.js) and the demo unit tests, once.            |
| `npm run test:watch`                      | Runs the library unit tests in watch mode.                                                          |
| `npm run e2e`                             | Builds the demo, serves it on port 4310 (`E2E_PORT` overrides this), and runs the Playwright tests. |
| `npm run e2e:ui`                          | Runs the same tests in Playwright's UI mode.                                                        |
| `npm run e2e:headed`                      | Runs the same tests in a visible browser.                                                           |
| `npm run test:install`                    | Packs the library and installs the tarball into a fresh Angular 22 app.                             |
| `npm run build:lib`                       | Builds the package into `dist/ngx-excalidraw`.                                                      |
| `npm start`                               | Starts the demo dev server on <http://localhost:4200>.                                              |
| `npm run build:demo && npm run serve:ssr` | Builds the demo and serves it with SSR on <http://localhost:4000> (`PORT` overrides this).          |

The e2e run always starts its own server; it never reuses one that is already running. If port
4310 is taken, set `E2E_PORT`, for example `E2E_PORT=4333 npm run e2e`. Extra arguments go through
to Playwright, for example `npm run e2e:headed -- e2e/library.spec.ts`.

### Trying the demo by hand

With `npm start` or `serve:ssr` running:

- **Draw** shapes. The `elements:` counter updates, and stays still while you hover, pan or zoom.
- **Toggles.** Use **Dark theme** and **View mode** to update the editor in place, without a
  remount.
- **Export SVG** renders the current scene below the buttons.
- **Libraries.** Open the demo's sample library through an `#addLibrary` link. On the dev server,
  that is
  <http://localhost:4200/#addLibrary=http%3A%2F%2Flocalhost%3A4200%2Fsample.excalidrawlib>
  (use port 4000 in both places for `serve:ssr`). Confirm the prompt: the `library:` counter goes
  up and `addLibrary` disappears from the URL. The demo only accepts libraries from its own
  origin.
- **Remove editor** destroys the component and tears down the editor.
- **SSR.** View the source of the `serve:ssr` page to see the server-rendered placeholder. In the
  Network tab, the Excalidraw chunk is requested only after the page settles.
