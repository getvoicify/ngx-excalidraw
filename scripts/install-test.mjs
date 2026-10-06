import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, parse, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'ngx-excalidraw-install-')));
const keepScratch = process.env.KEEP_INSTALL_TEST === '1';
const startedAt = Date.now();
const results = [];
const REACT_RANGES = ['^19', '^18.2'];
let server;
let checkPrefix = '';

const EXPECTED_PEERS = {
  '@angular/common': '>=22.0.0 <23.0.0',
  '@angular/core': '>=22.0.0 <23.0.0',
  '@excalidraw/excalidraw': '^0.18.0',
  react: '^18.2.0 || ^19.0.0',
  'react-dom': '^18.2.0 || ^19.0.0',
  rxjs: '^7.4.0',
};
const EXCALIDRAW_MARKER = 'excalidraw-container';

function cleanup() {
  stopServer();
  if (!keepScratch) rmSync(scratch, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => process.exit(130));
}

function step(name) {
  console.log(`\n> ${name}`);
}

const outsideRepoEnv = Object.fromEntries(
  Object.entries(process.env)
    .filter(([key]) => !/^npm_|^INIT_CWD$/i.test(key))
    .map(([key, value]) =>
      key === 'PATH'
        ? [
            key,
            value
              .split(delimiter)
              .filter((entry) => !entry.startsWith(root))
              .join(delimiter),
          ]
        : [key, value],
    ),
);

function run(command, args, cwd) {
  const env = cwd.startsWith(root) ? process.env : outsideRepoEnv;
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}\n${output.slice(-6000)}`);
  }
  return result.stdout;
}

function check(checkName, ok, detail = '') {
  const name = `${checkPrefix}${checkName}`;
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

const staticImports = (source) =>
  [...source.matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+)["']/g)].map((m) => m[1]);
const dynamicImports = (source) =>
  [...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);

function assertPackage(packageDir) {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  const files = filesUnder(packageDir).map((file) => relative(packageDir, file));

  for (const [name, range] of Object.entries(EXPECTED_PEERS)) {
    const actual = manifest.peerDependencies?.[name];
    check(`peer ${name} is "${range}"`, actual === range, `got ${JSON.stringify(actual)}`);
  }
  check('sideEffects is false', manifest.sideEffects === false, `got ${manifest.sideEffects}`);

  const types = manifest.exports?.['.']?.types;
  check(
    'package exports types that exist in the tarball',
    typeof types === 'string' && files.includes(types.replace(/^\.\//, '')),
    `exports["."].types = ${types}`,
  );

  check('ships README.md', files.includes('README.md'), files.join(', '));

  const specFiles = files.filter((file) => /\.spec\b|zone-setup/.test(file));
  check('no spec files in the tarball', specFiles.length === 0, specFiles.join(', '));
  const mapsWithTests = files
    .filter((file) => file.endsWith('.map'))
    .filter((file) =>
      JSON.parse(readFileSync(join(packageDir, file), 'utf8')).sources.some((source) =>
        /\.spec\.ts$|zone-setup/.test(source),
      ),
    );
  check('no source map covers test files', mapsWithTests.length === 0, mapsWithTests.join(', '));

  const fesm = files.filter((file) => file.endsWith('.mjs'));
  const sources = Object.fromEntries(
    fesm.map((file) => [file, readFileSync(join(packageDir, file), 'utf8')]),
  );
  const external = /^(react|react-dom|@excalidraw\/excalidraw)(\/.*)?$/;
  const staticReact = fesm.filter((file) =>
    staticImports(sources[file]).some((s) => external.test(s)),
  );
  check(
    'no fesm file statically imports react, react-dom or excalidraw',
    staticReact.length === 0,
    staticReact.join(', '),
  );

  const bridge = fesm.find((file) => /react-bridge/.test(file));
  check('react-bridge is a separate fesm chunk', Boolean(bridge), fesm.join(', '));
  if (bridge) {
    const bridgeImports = dynamicImports(sources[bridge]);
    for (const specifier of ['react', 'react-dom/client', '@excalidraw/excalidraw']) {
      check(
        `react-bridge dynamically imports ${specifier}`,
        bridgeImports.includes(specifier),
        bridgeImports.join(', '),
      );
    }
    const entry = manifest.exports?.['.']?.default?.replace(/^\.\//, '');
    const bridgeName = bridge.split('/').pop();
    check(
      'the entry loads react-bridge only through a dynamic import',
      dynamicImports(sources[entry] ?? '').some((s) => s.endsWith(bridgeName)) &&
        !staticImports(sources[entry] ?? '').some((s) => s.endsWith(bridgeName)),
      `entry ${entry}`,
    );
  }
}

const CONSUMER_APP = `import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  ExcalidrawComponent,
  type ExcalidrawImperativeAPI,
  type ExcalidrawSceneChange,
} from 'ngx-excalidraw';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ExcalidrawComponent],
  styles: 'ngx-excalidraw { height: 80vh; }',
  template: \`
    <p>elements: {{ elementCount() }}</p>
    <ngx-excalidraw
      theme="light"
      viewModeEnabled
      [gridModeEnabled]="false"
      [initialData]="{ elements: [] }"
      (api)="onApi($event)"
      (sceneChange)="onSceneChange($event)"
      (libraryChange)="libraryCount.set($event.length)"
      (editorError)="failed.set(true)"
    />
  \`,
})
export class App {
  protected readonly elementCount = signal(0);
  protected readonly libraryCount = signal(0);
  protected readonly failed = signal(false);
  protected api?: ExcalidrawImperativeAPI;

  protected onApi(api: ExcalidrawImperativeAPI): void {
    this.api = api;
  }

  protected onSceneChange(change: ExcalidrawSceneChange): void {
    this.elementCount.set(change.elements.length);
  }
}
`;

const CONSUMER_CONFIG = `import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import {
  localStorageLibraryAdapter,
  provideExcalidraw,
  provideExcalidrawLibrary,
} from 'ngx-excalidraw';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideExcalidraw({ styleUrl: 'excalidraw.css' }),
    provideExcalidrawLibrary({ adapter: localStorageLibraryAdapter() }),
  ],
};
`;

const CONSUMER_SERVER_ROUTES = `import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }];
`;

function patchConsumer(app) {
  writeFileSync(join(app, 'src/app/app.ts'), CONSUMER_APP);
  writeFileSync(join(app, 'src/app/app.config.ts'), CONSUMER_CONFIG);
  writeFileSync(join(app, 'src/app/app.routes.server.ts'), CONSUMER_SERVER_ROUTES);
  rmSync(join(app, 'src/app/app.html'), { force: true });
  rmSync(join(app, 'src/app/app.spec.ts'), { force: true });

  const tsconfigPath = join(app, 'tsconfig.json');
  const tsconfig = JSON.parse(
    readFileSync(tsconfigPath, 'utf8').replace(/^\s*\/\*.*\*\/\s*$/gm, ''),
  );
  tsconfig.compilerOptions.strict = true;
  tsconfig.angularCompilerOptions.strictTemplates = true;
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

  const workspacePath = join(app, 'angular.json');
  const workspace = JSON.parse(readFileSync(workspacePath, 'utf8'));
  workspace.projects.consumer.architect.build.options.styles.push({
    input: 'node_modules/@excalidraw/excalidraw/dist/prod/index.css',
    inject: false,
    bundleName: 'excalidraw',
  });
  workspace.projects.consumer.architect.build.options.security = { allowedHosts: ['localhost'] };
  writeFileSync(workspacePath, JSON.stringify(workspace, null, 2));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function fetchRoot(port) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`SSR server exited ${server.exitCode} before serving`);
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (!response.ok) throw new Error(`GET / returned ${response.status}`);
      return await response.text();
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

function initialScripts(html, browserDir) {
  const queue = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.js)"/g)].map((m) =>
    m[1].replace(/^\//, ''),
  );
  const seen = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(join(browserDir, file), 'utf8');
    for (const specifier of staticImports(source)) {
      if (specifier.startsWith('./')) queue.push(join(dirname(file), specifier));
    }
  }
  return [...seen];
}

async function assertConsumer(app) {
  try {
    await assertServedConsumer(app);
  } finally {
    stopServer();
  }
}

function stopServer() {
  if (server && server.exitCode === null) server.kill('SIGTERM');
}

async function assertServedConsumer(app) {
  const port = await freePort();
  server = spawn(process.execPath, [join(app, 'dist/consumer/server/server.mjs')], {
    cwd: app,
    env: { ...outsideRepoEnv, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => (serverOutput += chunk));
  server.stderr.on('data', (chunk) => (serverOutput += chunk));

  let html = '';
  try {
    html = await fetchRoot(port);
  } catch (error) {
    check('SSR server renders /', false, `${error.message}\n${serverOutput.slice(-3000)}`);
    return;
  }
  check(
    'server-rendered HTML contains the placeholder inside <ngx-excalidraw>',
    /<ngx-excalidraw[^>]*>[\s\S]*class="ngx-excalidraw-placeholder"/.test(html),
  );
  check(
    'server-rendered HTML contains no Excalidraw editor',
    !/class="(?:[^"]*\s)?excalidraw(?:\s[^"]*)?"/.test(html) && !html.includes('<canvas'),
  );

  const browserDir = join(app, 'dist/consumer/browser');
  const initial = initialScripts(html, browserDir);
  check('index.html references initial JS', initial.length > 0);
  const initialWithExcalidraw = initial.filter((file) =>
    readFileSync(join(browserDir, file), 'utf8').includes(EXCALIDRAW_MARKER),
  );
  check(
    'no initial JS (or its static imports) contains Excalidraw code',
    initialWithExcalidraw.length === 0,
    initialWithExcalidraw.join(', '),
  );
  const lazyWithExcalidraw = filesUnder(browserDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => relative(browserDir, file))
    .filter((file) => !initial.includes(file))
    .filter((file) => readFileSync(join(browserDir, file), 'utf8').includes(EXCALIDRAW_MARKER));
  check('a lazy chunk contains Excalidraw code', lazyWithExcalidraw.length > 0);
  check(
    'the inject:false Excalidraw stylesheet is emitted but not linked',
    existsSync(join(browserDir, 'excalidraw.css')) && !/href="[^"]*excalidraw\.css"/.test(html),
  );
}

async function main() {
  step('build ngx-excalidraw (production, partial compilation)');
  run('npx', ['ng', 'build', 'ngx-excalidraw', '--configuration', 'production'], root);

  step(`pack into ${scratch}`);
  const [packed] = JSON.parse(
    run(
      'npm',
      ['pack', join(root, 'dist/ngx-excalidraw'), '--pack-destination', scratch, '--json'],
      root,
    ),
  );
  const tarball = join(scratch, packed.filename);
  const unpacked = join(scratch, 'unpacked');
  mkdirSync(unpacked);
  run('tar', ['-xzf', tarball, '-C', unpacked], scratch);

  step('assert tarball contents');
  assertPackage(join(unpacked, 'package'));

  for (const reactRange of REACT_RANGES) {
    checkPrefix = `[react@${reactRange}] `;
    try {
      await installInto(join(scratch, `consumer-react-${reactRange.replace(/\W/g, '')}`), {
        tarball,
        reactRange,
      });
    } catch (error) {
      check('consumer phase ran to completion', false, error.message);
    }
  }
  checkPrefix = '';
}

async function installInto(app, { tarball, reactRange }) {
  step(`${checkPrefix}generate a fresh Angular 22 SSR zoneless app`);
  run(
    'npx',
    [
      '-y',
      '@angular/cli@22',
      'new',
      'consumer',
      `--directory=${app}`,
      '--ssr',
      '--zoneless',
      '--style=css',
      '--skip-git',
      '--skip-install',
      '--package-manager=npm',
      '--ai-config=none',
      '--defaults',
      '--interactive=false',
    ],
    parse(scratch).root,
  );

  step(`${checkPrefix}install the tarball and its peers`);
  run(
    'npm',
    [
      'install',
      '--save',
      '--no-audit',
      '--no-fund',
      '--prefer-offline',
      tarball,
      '@excalidraw/excalidraw@^0.18',
      `react@${reactRange}`,
      `react-dom@${reactRange}`,
    ],
    app,
  );
  const installedMajors = ['react', 'react-dom'].map(
    (name) =>
      JSON.parse(readFileSync(join(app, 'node_modules', name, 'package.json'), 'utf8')).version,
  );
  check(
    `installs react and react-dom ${reactRange}`,
    installedMajors.every((version) => version.split('.')[0] === reactRange.match(/\d+/)[0]),
    installedMajors.join(', '),
  );

  step(`${checkPrefix}use <ngx-excalidraw> in the consumer and build it (SSR, strict templates)`);
  patchConsumer(app);
  let buildFailure = '';
  try {
    run('npx', ['ng', 'build'], app);
  } catch (error) {
    buildFailure = error.message;
  }
  check('consumer builds without errors', !buildFailure, buildFailure);
  if (buildFailure) return;

  step(`${checkPrefix}serve the consumer and assert the build output`);
  await assertConsumer(app);
}

try {
  await main();
} catch (error) {
  check('install test ran to completion', false, error.message);
}

const failed = results.filter((result) => !result.ok);
const seconds = Math.round((Date.now() - startedAt) / 1000);
console.log(
  `\n${failed.length === 0 ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length} checks in ${seconds}s` +
    (keepScratch ? ` (scratch kept at ${scratch})` : ''),
);
for (const result of failed) console.log(`  FAIL ${result.name}`);
process.exit(failed.length === 0 ? 0 : 1);
