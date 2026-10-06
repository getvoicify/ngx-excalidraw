import type { ComponentType, ReactNode } from 'react';
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import { once } from './once';
import type { ExcalidrawRendererFactory, ExcalidrawRenderProps } from './renderer';

export interface ReactBridgeModules {
  react: Pick<
    typeof import('react'),
    'Component' | 'createElement' | 'useCallback' | 'useEffect' | 'useMemo' | 'useRef'
  >;
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
  type ReportCrash = (error: unknown) => void;

  class ReportCrashes extends react.Component<
    { onError: ReportCrash; children?: ReactNode },
    { crashed: boolean }
  > {
    override state = { crashed: false };

    static getDerivedStateFromError() {
      return { crashed: true };
    }

    override componentDidCatch(error: unknown) {
      this.props.onError(error);
    }

    override render() {
      return this.state.crashed ? null : this.props.children;
    }
  }

  const HandOverOnceEditorCommits = ({ api, onApi }: { api: ApiRef; onApi: HandOver }) => {
    react.useEffect(() => {
      if (api.current) onApi(api.current);
    });
    return null;
  };

  const ExcalidrawHost = ({ props, onApi }: { props: ExcalidrawRenderProps; onApi: HandOver }) => {
    const api = react.useRef<ExcalidrawImperativeAPI | null>(null);
    const excalidrawAPI = react.useCallback((handedOver: ExcalidrawImperativeAPI) => {
      api.current = handedOver;
    }, []);
    const probe = react.useMemo(
      () => react.createElement(HandOverOnceEditorCommits, { api, onApi }),
      [onApi],
    );
    return react.createElement(Excalidraw, { ...props, excalidrawAPI }, probe);
  };

  return (host, callbacks) => {
    const root = reactDomClient.createRoot(host);
    const onApi = once(callbacks.onApi);
    return {
      render: (props) =>
        root.render(
          react.createElement(
            ReportCrashes,
            { onError: callbacks.onError },
            react.createElement(ExcalidrawHost, { props, onApi }),
          ),
        ),
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
