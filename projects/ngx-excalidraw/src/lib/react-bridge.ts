import type { ComponentType } from 'react';
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import { once } from './once';
import type { ExcalidrawRendererFactory, ExcalidrawRenderProps } from './renderer';

export interface ReactBridgeModules {
  react: Pick<typeof import('react'), 'createElement' | 'useEffect' | 'useRef'>;
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
  type ApiRef = { current: ExcalidrawImperativeAPI | null };
  type HandOver = (api: ExcalidrawImperativeAPI) => void;

  const HandOverOnceEditorCommits = ({ api, onApi }: { api: ApiRef; onApi: HandOver }) => {
    react.useEffect(() => {
      if (api.current) onApi(api.current);
    });
    return null;
  };

  const ExcalidrawHost = ({ props, onApi }: { props: ExcalidrawRenderProps; onApi: HandOver }) => {
    const api = react.useRef<ExcalidrawImperativeAPI | null>(null);
    return react.createElement(
      Excalidraw,
      { ...props, excalidrawAPI: (handedOver) => (api.current = handedOver) },
      react.createElement(HandOverOnceEditorCommits, { api, onApi }),
    );
  };

  return (host, callbacks) => {
    const root = reactDomClient.createRoot(host);
    const onApi = once(callbacks.onApi);
    return {
      render: (props) => root.render(react.createElement(ExcalidrawHost, { props, onApi })),
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
