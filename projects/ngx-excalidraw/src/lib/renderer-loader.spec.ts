import { TestBed } from '@angular/core/testing';
import { EXCALIDRAW_RENDERER_LOADER, preloadWith } from './renderer-loader';
import type { ExcalidrawRendererFactory } from './renderer';

describe('default Excalidraw renderer loader', () => {
  it('shares one bundle import between concurrent callers', () => {
    const load = TestBed.inject(EXCALIDRAW_RENDERER_LOADER);
    const first = load();
    first.catch(() => undefined);
    expect(load()).toBe(first);
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
