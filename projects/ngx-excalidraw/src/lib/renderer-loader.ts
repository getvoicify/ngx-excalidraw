import { InjectionToken } from '@angular/core';
import type { ExcalidrawRendererFactory } from './renderer';

export type ExcalidrawRendererLoader = () => Promise<ExcalidrawRendererFactory>;

let defaultRenderer: Promise<ExcalidrawRendererFactory> | undefined;

export const loadDefaultExcalidrawRenderer: ExcalidrawRendererLoader = () =>
  (defaultRenderer ??= import('./react-bridge').then((bridge) => bridge.loadExcalidrawRenderer()));

export const EXCALIDRAW_RENDERER_LOADER = new InjectionToken<ExcalidrawRendererLoader>(
  'EXCALIDRAW_RENDERER_LOADER',
  {
    providedIn: 'root',
    factory: () => loadDefaultExcalidrawRenderer,
  },
);

export function preloadExcalidraw(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return loadDefaultExcalidrawRenderer().then(
    () => undefined,
    () => undefined,
  );
}
