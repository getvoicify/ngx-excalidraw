import type { ComponentType, ReactNode } from 'react';
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import type { ExcalidrawLibraryOptions } from './library';
import { once } from './once';
import {
  animationFrames,
  coalesceSceneChanges,
  pageHiddenEvents,
  type SceneChangeTriggers,
} from './scene-change';
import type { ExcalidrawRendererFactory, ExcalidrawRenderProps } from './renderer';

export interface ReactBridgeModules {
  react: Pick<
    typeof import('react'),
    | 'Component'
    | 'createElement'
    | 'Fragment'
    | 'useCallback'
    | 'useEffect'
    | 'useMemo'
    | 'useRef'
    | 'useState'
  >;
  reactDomClient: Pick<typeof import('react-dom/client'), 'createRoot'>;
  Excalidraw: ComponentType<ExcalidrawProps>;
  hashElementsVersion: typeof import('@excalidraw/excalidraw').hashElementsVersion;
  useHandleLibrary: typeof import('@excalidraw/excalidraw').useHandleLibrary;
}

export function commonJsExports<T extends object>(module: T): T {
  const fallback = (module as { default?: T }).default;
  return fallback && typeof fallback === 'object' ? fallback : module;
}

export function createRendererFactory(
  { react, reactDomClient, Excalidraw, hashElementsVersion, useHandleLibrary }: ReactBridgeModules,
  triggers: SceneChangeTriggers,
): ExcalidrawRendererFactory {
  type ApiRef = { current: ExcalidrawImperativeAPI | null };
  type HandOver = (api: ExcalidrawImperativeAPI) => void;
  type ReportCrash = (error: unknown) => void;
  type OnChange = NonNullable<ExcalidrawProps['onChange']>;
  type OnLibraryChange = NonNullable<ExcalidrawProps['onLibraryChange']>;

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

  const HandleLibrary = ({
    api,
    options,
  }: {
    api: ExcalidrawImperativeAPI | null;
    options: ExcalidrawLibraryOptions;
  }) => {
    useHandleLibrary({ excalidrawAPI: api, ...options });
    return null;
  };

  const ExcalidrawHost = ({
    props,
    onApi,
    onChange,
    onLibraryChange,
    library,
  }: {
    props: ExcalidrawRenderProps;
    onApi: HandOver;
    onChange: OnChange;
    onLibraryChange: OnLibraryChange;
    library?: ExcalidrawLibraryOptions;
  }) => {
    const api = react.useRef<ExcalidrawImperativeAPI | null>(null);
    const [committedApi, setCommittedApi] = react.useState<ExcalidrawImperativeAPI | null>(null);
    const excalidrawAPI = react.useCallback((handedOver: ExcalidrawImperativeAPI) => {
      api.current = handedOver;
    }, []);
    const handOver = react.useCallback(
      (committed: ExcalidrawImperativeAPI) => {
        setCommittedApi(committed);
        onApi(committed);
      },
      [onApi],
    );
    const probe = react.useMemo(
      () => react.createElement(HandOverOnceEditorCommits, { api, onApi: handOver }),
      [handOver],
    );
    const editor = react.useMemo(
      () =>
        react.createElement(
          Excalidraw,
          { ...props, excalidrawAPI, onChange, onLibraryChange },
          probe,
        ),
      [props, excalidrawAPI, onChange, onLibraryChange, probe],
    );
    return react.createElement(
      react.Fragment,
      null,
      editor,
      library && react.createElement(HandleLibrary, { api: committedApi, options: library }),
    );
  };

  return (host, callbacks) => {
    const root = reactDomClient.createRoot(host);
    const onApi = once(callbacks.onApi);
    const scene = coalesceSceneChanges({
      ...triggers,
      sceneVersion: hashElementsVersion,
      emit: callbacks.onSceneChange,
    });
    return {
      render: (props, library) =>
        root.render(
          react.createElement(
            ReportCrashes,
            { onError: callbacks.onError },
            react.createElement(ExcalidrawHost, {
              props,
              onApi,
              onChange: scene.onChange,
              onLibraryChange: callbacks.onLibraryChange,
              library,
            }),
          ),
        ),
      destroy: () => {
        scene.destroy();
        root.unmount();
      },
    };
  };
}

export async function loadExcalidrawRenderer(): Promise<ExcalidrawRendererFactory> {
  const [react, reactDomClient, { Excalidraw, hashElementsVersion, useHandleLibrary }] =
    await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('@excalidraw/excalidraw'),
    ]);
  return createRendererFactory(
    {
      react: commonJsExports(react),
      reactDomClient: commonJsExports(reactDomClient),
      Excalidraw,
      hashElementsVersion,
      useHandleLibrary,
    },
    { frames: animationFrames(window), pageHidden: pageHiddenEvents(window) },
  );
}
