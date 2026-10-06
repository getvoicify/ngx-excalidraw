import { TestBed } from '@angular/core/testing';
import { EXCALIDRAW_RENDERER_LOADER } from './renderer-loader';

describe('default Excalidraw renderer loader', () => {
  it('shares one bundle import between concurrent callers', () => {
    const load = TestBed.inject(EXCALIDRAW_RENDERER_LOADER);
    const first = load();
    first.catch(() => undefined);
    expect(load()).toBe(first);
  });
});
