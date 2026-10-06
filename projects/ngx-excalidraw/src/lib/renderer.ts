import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import type { ExcalidrawSceneChange } from './scene-change';

export type ExcalidrawRenderProps = Omit<
  ExcalidrawProps,
  'excalidrawAPI' | 'children' | 'onChange'
>;

export interface ExcalidrawRendererCallbacks {
  onApi(api: ExcalidrawImperativeAPI): void;
  onError(error: unknown): void;
  onSceneChange(change: ExcalidrawSceneChange): void;
}

export interface ExcalidrawRenderer {
  render(props: ExcalidrawRenderProps): void;
  destroy(): void;
}

export type ExcalidrawRendererFactory = (
  host: HTMLElement,
  callbacks: ExcalidrawRendererCallbacks,
) => ExcalidrawRenderer;
