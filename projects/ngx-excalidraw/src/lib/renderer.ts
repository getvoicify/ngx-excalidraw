import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  LibraryItems,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawLibraryOptions } from './library';
import type { ExcalidrawSceneChange } from './scene-change';

export type ExcalidrawRenderProps = Omit<
  ExcalidrawProps,
  'excalidrawAPI' | 'children' | 'onChange' | 'onLibraryChange'
>;

export interface ExcalidrawRendererCallbacks {
  onApi(api: ExcalidrawImperativeAPI): void;
  onError(error: unknown): void;
  onSceneChange(change: ExcalidrawSceneChange): void;
  onLibraryChange(libraryItems: LibraryItems): void;
  library?: ExcalidrawLibraryOptions;
}

export interface ExcalidrawRenderer {
  render(props: ExcalidrawRenderProps): void;
  destroy(): void;
}

export type ExcalidrawRendererFactory = (
  host: HTMLElement,
  callbacks: ExcalidrawRendererCallbacks,
) => ExcalidrawRenderer;
