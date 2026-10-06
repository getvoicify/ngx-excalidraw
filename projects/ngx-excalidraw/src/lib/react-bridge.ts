import { once } from './once';
import type { ExcalidrawRendererFactory } from './renderer';

function commonJsExports<T extends object>(module: T): T {
  const fallback = (module as { default?: T }).default;
  return fallback && typeof fallback === 'object' ? fallback : module;
}

export async function loadExcalidrawRenderer(): Promise<ExcalidrawRendererFactory> {
  const [react, reactDomClient, { Excalidraw }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('@excalidraw/excalidraw'),
  ]);
  const { createElement } = commonJsExports(react);
  const { createRoot } = commonJsExports(reactDomClient);

  return (host, callbacks) => {
    const root = createRoot(host);
    const onApi = once(callbacks.onApi);
    return {
      render: (props) => root.render(createElement(Excalidraw, { ...props, excalidrawAPI: onApi })),
      destroy: () => root.unmount(),
    };
  };
}
