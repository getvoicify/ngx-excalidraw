import * as react from 'react';
import * as reactDomClient from 'react-dom/client';
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import { commonJsExports, createRendererFactory } from './react-bridge';

const { act } = react;

describe('React bridge', () => {
  let host: HTMLElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.body.appendChild(document.createElement('div'));
  });

  afterEach(() => host.remove());

  function excalidrawHandingOverDuringRender(onApi: ReturnType<typeof vi.fn>) {
    const api = { id: 'api' } as unknown as ExcalidrawImperativeAPI;
    const handOversDuringRender: number[] = [];
    const Excalidraw = ({ excalidrawAPI, children }: ExcalidrawProps) => {
      excalidrawAPI?.(api);
      handOversDuringRender.push(onApi.mock.calls.length);
      return react.createElement('div', { className: 'excalidraw' }, children);
    };
    return { api, handOversDuringRender, Excalidraw };
  }

  function excalidrawConstructingItsEditorAfterLoading() {
    const api = { id: 'late api' } as unknown as ExcalidrawImperativeAPI;
    let finishLoading = () => undefined as void;
    const Editor = ({ excalidrawAPI, children }: ExcalidrawProps) => {
      excalidrawAPI?.(api);
      return react.createElement('div', { className: 'excalidraw' }, children);
    };
    const Excalidraw = (props: ExcalidrawProps) => {
      const [loading, setLoading] = react.useState(true);
      finishLoading = () => setLoading(false);
      return loading ? null : react.createElement(Editor, props);
    };
    return { api, Excalidraw, finishLoading: () => finishLoading() };
  }

  it('hands the API over when Excalidraw constructs its editor in a later commit', async () => {
    const onApi = vi.fn();
    const { api, Excalidraw, finishLoading } = excalidrawConstructingItsEditorAfterLoading();
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi,
      onError: vi.fn(),
    });

    await act(async () => renderer.render({}));
    expect(onApi).not.toHaveBeenCalled();
    await act(async () => finishLoading());

    expect(onApi.mock.calls).toEqual([[api]]);
    await act(async () => renderer.destroy());
  });

  it('hands the API to Angular only after React has committed the render', async () => {
    const onApi = vi.fn();
    const { api, handOversDuringRender, Excalidraw } = excalidrawHandingOverDuringRender(onApi);
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi,
      onError: vi.fn(),
    });

    await act(async () => renderer.render({}));

    expect(handOversDuringRender).toEqual([0]);
    expect(onApi.mock.calls).toEqual([[api]]);
    await act(async () => renderer.destroy());
  });

  it('hands the API over only once across re-renders', async () => {
    const onApi = vi.fn();
    const { Excalidraw } = excalidrawHandingOverDuringRender(onApi);
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi,
      onError: vi.fn(),
    });

    await act(async () => renderer.render({}));
    await act(async () => renderer.render({ viewModeEnabled: true }));

    expect(onApi).toHaveBeenCalledTimes(1);
    await act(async () => renderer.destroy());
  });

  it('reports a crash inside Excalidraw through onError instead of letting it escape', async () => {
    const crash = new Error('Excalidraw crashed');
    const Excalidraw = () => {
      throw crash;
    };
    const onError = vi.fn();
    const escaped: unknown[] = [];
    const onWindowError = (event: ErrorEvent) => {
      escaped.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onWindowError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
        onApi: vi.fn(),
        onError,
      });

      await act(async () => renderer.render({})).then(
        () => undefined,
        (error: unknown) => {
          escaped.push(error);
        },
      );

      await vi.waitFor(() => expect(onError.mock.calls).toEqual([[crash]]));
      expect(escaped).toEqual([]);
      await act(async () => renderer.destroy());
    } finally {
      consoleError.mockRestore();
      window.removeEventListener('error', onWindowError);
    }
  });

  it('lets a memoized Excalidraw skip re-renders whose props are unchanged in value', async () => {
    let renders = 0;
    const Excalidraw = react.memo(({ children }: ExcalidrawProps) => {
      renders++;
      return react.createElement('div', { className: 'excalidraw' }, children);
    });
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi: vi.fn(),
      onError: vi.fn(),
    });
    await act(async () => renderer.render({ theme: 'light' }));
    const rendersAfterMount = renders;

    await act(async () => renderer.render({ theme: 'light' }));
    expect(renders).toBe(rendersAfterMount);

    await act(async () => renderer.render({ theme: 'dark' }));
    expect(renders).toBe(rendersAfterMount + 1);
    await act(async () => renderer.destroy());
  });

  it('unmounts Excalidraw from the host on destroy', async () => {
    const { Excalidraw } = excalidrawHandingOverDuringRender(vi.fn());
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi: vi.fn(),
      onError: vi.fn(),
    });
    await act(async () => renderer.render({}));
    expect(host.querySelector('.excalidraw')).not.toBeNull();

    await act(async () => renderer.destroy());

    expect(host.childElementCount).toBe(0);
  });
});

describe('commonJsExports', () => {
  it('unwraps a CommonJS module whose exports arrive only as the default export', () => {
    const exports = { createRoot: () => undefined };
    expect(commonJsExports({ default: exports } as unknown as typeof exports)).toBe(exports);
  });

  it('keeps an ES module namespace that already carries named exports', () => {
    const namespace = { createRoot: () => undefined };
    expect(commonJsExports(namespace)).toBe(namespace);
  });
});
