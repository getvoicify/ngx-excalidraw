export const NGX_EXCALIDRAW_VERSION = '0.0.1';

export { ExcalidrawComponent } from './lib/excalidraw.component';
export { provideExcalidraw, type ExcalidrawConfig } from './lib/provide-excalidraw';
export {
  EXCALIDRAW_RENDERER_LOADER,
  preloadExcalidraw,
  type ExcalidrawRendererLoader,
} from './lib/renderer-loader';
export type {
  ExcalidrawRenderer,
  ExcalidrawRendererCallbacks,
  ExcalidrawRendererFactory,
  ExcalidrawRenderProps,
} from './lib/renderer';
