import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { productionSources, publicApiViolations } from './demo-public-api.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'projects/demo/src');
const appFile = join(srcRoot, 'app/fixture.ts');
const serverFile = join(srcRoot, 'server.ts');

const violations = (text, path = appFile) => publicApiViolations({ path, text, srcRoot });
const rejects = (text, path) => assert.notDeepEqual(violations(text, path), []);
const accepts = (text, path) => assert.deepEqual(violations(text, path), []);

describe('public API guard', () => {
  test('accepts Angular, rxjs, ngx-excalidraw and sibling app files', () =>
    accepts(`
      import { Component } from '@angular/core';
      import { provideServerRendering } from '@angular/ssr';
      import { filter } from 'rxjs';
      import { map } from 'rxjs/operators';
      import { ExcalidrawComponent, type ExcalidrawImperativeAPI } from 'ngx-excalidraw';
      import { appConfig } from './app.config';
      import { App } from '../app/app';
      const href = window.location.href;
    `));

  test('rejects Excalidraw and React imports', () => {
    rejects(`import type { AppState } from '@excalidraw/excalidraw/types';`);
    rejects(`import React from 'react';`);
    rejects(`export { createRoot } from 'react-dom/client';`);
    rejects(`type A = import('@excalidraw/excalidraw').AppState;`);
  });

  test('rejects relative imports that leave the demo sources', () => {
    rejects(
      `import type { AppState } from '../../../../node_modules/@excalidraw/excalidraw/types';`,
    );
    rejects(`import { hooks } from '../e2e/e2e-hooks.config';`);
    rejects(`import { x } from '../../../ngx-excalidraw/src/lib/react-bridge';`);
    rejects(`import { x } from './node_modules/react';`);
  });

  test('checks CommonJS and dynamic imports like static ones', () => {
    rejects(`const excalidraw = require('@excalidraw/excalidraw');`);
    rejects(`import excalidraw = require('@excalidraw/excalidraw');`);
    rejects(`const excalidraw = await import('@excalidraw/excalidraw');`);
    rejects(`const name = 'react'; const react = await import(name);`);
    rejects(`const name = 'react'; const react = require(name);`);
  });

  test('rejects double-underscore names however they reach the global object', () => {
    rejects(`const { __excalidrawApi } = window;`);
    rejects(`const key = '__excalidrawApi'; (window as any)[key] = 1;`);
    rejects('const id = 1; (window as any)[`__hook${id}`] = 1;');
    rejects('(window as any)[`__hook`] = 1;');
    rejects(`(globalThis as any).window.__excalidrawApi = 1;`);
    rejects(`(document.defaultView as any).__excalidrawApi = 1;`);
    rejects(`let w: any; w = window; w.__excalidrawApi = 1;`);
  });

  test('rejects writing onto the global object', () => {
    rejects(`Object.assign(window, { hook: 1 });`);
    rejects(`Object.assign(globalThis, { hook: 1 });`);
    rejects(`Object.assign(self, { hook: 1 });`);
    rejects(`Object.assign(document.defaultView!, { hook: 1 });`);
    rejects(`Object.defineProperty(window, 'hook', { value: 1 });`);
    rejects(`Reflect.set(globalThis, 'hook', 1);`);
  });

  test('allows express and node built-ins in the server entry only', () => {
    const serverImports = `
      import express from 'express';
      import { join } from 'node:path';
      import { AngularNodeAppEngine } from '@angular/ssr/node';
    `;
    accepts(serverImports, serverFile);
    rejects(`import express from 'express';`);
    rejects(`import { join } from 'node:path';`);
    rejects(`import React from 'react';`, serverFile);
  });

  test('fails closed on sources it cannot parse', () =>
    rejects(`import { Component } from '@angular/core'; const = ;`));
});

describe('the demo production sources', () => {
  const sources = productionSources(srcRoot);

  test('cover the browser and server entries and the app, but not the e2e build', () => {
    const names = sources.map((file) => relative(srcRoot, file));
    for (const entry of ['main.ts', 'main.server.ts', 'server.ts', join('app', 'app.ts')]) {
      assert.ok(names.includes(entry), entry);
    }
    assert.deepEqual(
      names.filter((name) => name.startsWith('e2e') || name.endsWith('.spec.ts')),
      [],
    );
  });

  for (const file of sources) {
    test(`${relative(root, file)} uses only the public API`, () =>
      assert.deepEqual(
        publicApiViolations({ path: file, text: readFileSync(file, 'utf8'), srcRoot }),
        [],
      ));
  }
});
