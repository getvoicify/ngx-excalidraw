import { InjectionToken } from '@angular/core';
import { memoizeUntilRejected } from './memoize-until-rejected';
import type { ExcalidrawRendererFactory } from './renderer';

export type ExcalidrawRendererLoader = () => Promise<ExcalidrawRendererFactory>;

export const loadDefaultExcalidrawRenderer: ExcalidrawRendererLoader = memoizeUntilRejected(() =>
  import('./react-bridge').then((bridge) => bridge.loadExcalidrawRenderer()),
);

export const EXCALIDRAW_RENDERER_LOADER = new InjectionToken<ExcalidrawRendererLoader>(
  'EXCALIDRAW_RENDERER_LOADER',
  {
    providedIn: 'root',
    factory: () => loadDefaultExcalidrawRenderer,
  },
);

export function preloadWith(load: ExcalidrawRendererLoader): Promise<boolean> {
  return load().then(
    () => true,
    () => false,
  );
}

export function preloadExcalidraw(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return preloadWith(loadDefaultExcalidrawRenderer);
}
