import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';

export type ExcalidrawRenderProps = Omit<ExcalidrawProps, 'excalidrawAPI' | 'children'>;

export interface ExcalidrawRendererCallbacks {
  onApi(api: ExcalidrawImperativeAPI): void;
  onError(error: unknown): void;
}

export interface ExcalidrawRenderer {
  render(props: ExcalidrawRenderProps): void;
  destroy(): void;
}

export type ExcalidrawRendererFactory = (
  host: HTMLElement,
  callbacks: ExcalidrawRendererCallbacks,
) => ExcalidrawRenderer;
