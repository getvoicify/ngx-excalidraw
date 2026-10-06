import type { ComponentType } from 'react';
import type { ExcalidrawProps } from '@excalidraw/excalidraw/types';
import { once } from './once';
import type { ExcalidrawRendererFactory } from './renderer';

export interface ReactBridgeModules {
  react: Pick<typeof import('react'), 'createElement'>;
  reactDomClient: Pick<typeof import('react-dom/client'), 'createRoot'>;
  Excalidraw: ComponentType<ExcalidrawProps>;
}

export function commonJsExports<T extends object>(module: T): T {
  const fallback = (module as { default?: T }).default;
  return fallback && typeof fallback === 'object' ? fallback : module;
}

export function createRendererFactory({
  react,
  reactDomClient,
  Excalidraw,
}: ReactBridgeModules): ExcalidrawRendererFactory {
  return (host, callbacks) => {
    const root = reactDomClient.createRoot(host);
    const onApi = once(callbacks.onApi);
    return {
      render: (props) =>
        root.render(react.createElement(Excalidraw, { ...props, excalidrawAPI: onApi })),
      destroy: () => root.unmount(),
    };
  };
}

export async function loadExcalidrawRenderer(): Promise<ExcalidrawRendererFactory> {
  const [react, reactDomClient, { Excalidraw }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('@excalidraw/excalidraw'),
  ]);
  return createRendererFactory({
    react: commonJsExports(react),
    reactDomClient: commonJsExports(reactDomClient),
    Excalidraw,
  });
}
