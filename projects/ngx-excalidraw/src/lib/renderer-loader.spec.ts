import { TestBed } from '@angular/core/testing';
import { EXCALIDRAW_RENDERER_LOADER, loadDefaultExcalidrawRenderer } from '../public-api';
import { preloadWith } from './renderer-loader';
import type { ExcalidrawRendererFactory } from './renderer';

describe('default Excalidraw renderer loader', () => {
  it('defaults to the shared, memoized bundle import that consumers can decorate', () => {
    expect(TestBed.inject(EXCALIDRAW_RENDERER_LOADER)).toBe(loadDefaultExcalidrawRenderer);
  });
});

describe('preloading Excalidraw', () => {
  it('reports true once the bundle has loaded', async () => {
    await expect(preloadWith(() => Promise.resolve({} as ExcalidrawRendererFactory))).resolves.toBe(
      true,
    );
  });

  it('reports false without throwing when the bundle fails to load', async () => {
    await expect(preloadWith(() => Promise.reject(new Error('offline')))).resolves.toBe(false);
  });
});
