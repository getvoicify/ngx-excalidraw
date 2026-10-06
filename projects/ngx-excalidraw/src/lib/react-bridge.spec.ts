import * as react from 'react';
import * as reactDomClient from 'react-dom/client';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import {
  commonJsExports,
  createRendererFactory as createBridge,
  type ReactBridgeModules,
} from './react-bridge';
import type { FrameScheduler } from './scene-change';

const { act } = react;

describe('React bridge', () => {
  let host: HTMLElement;
  let frames: { scheduler: FrameScheduler; run(): void };
  let hashElementsVersion: ReturnType<typeof vi.fn>;

  function createRendererFactory(modules: Omit<ReactBridgeModules, 'hashElementsVersion'>) {
    return createBridge(
      { ...modules, hashElementsVersion: hashElementsVersion as never },
      frames.scheduler,
    );
  }

  function noSceneChanges() {
    return { onSceneChange: vi.fn() };
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.body.appendChild(document.createElement('div'));
    hashElementsVersion = vi.fn(() => 0);
    const pending: (() => void)[] = [];
    frames = {
      scheduler: {
        request: (callback) => pending.push(callback),
        cancel: (handle) => {
          pending[handle - 1] = () => undefined;
        },
      },
      run: () => pending.splice(0).forEach((callback) => callback()),
    };
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
      ...noSceneChanges(),
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
      ...noSceneChanges(),
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
      ...noSceneChanges(),
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
        ...noSceneChanges(),
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
    const onChanges = new Set<ExcalidrawProps['onChange']>();
    const Excalidraw = react.memo(({ children, onChange }: ExcalidrawProps) => {
      renders++;
      onChanges.add(onChange);
      return react.createElement('div', { className: 'excalidraw' }, children);
    });
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi: vi.fn(),
      onError: vi.fn(),
      ...noSceneChanges(),
    });
    await act(async () => renderer.render({ theme: 'light' }));
    const rendersAfterMount = renders;

    await act(async () => renderer.render({ theme: 'light' }));
    expect(renders).toBe(rendersAfterMount);

    await act(async () => renderer.render({ theme: 'dark' }));
    expect(renders).toBe(rendersAfterMount + 1);
    expect([...onChanges].map((onChange) => typeof onChange)).toEqual(['function']);
    await act(async () => renderer.destroy());
  });

  function excalidrawExposingOnChange() {
    const seen: { onChange: NonNullable<ExcalidrawProps['onChange']>[] } = { onChange: [] };
    const Excalidraw = ({ onChange, children }: ExcalidrawProps) => {
      if (onChange) seen.onChange.push(onChange);
      return react.createElement('div', { className: 'excalidraw' }, children);
    };
    const change = (elements: readonly ExcalidrawElement[], files = {} as BinaryFiles) =>
      seen.onChange.at(-1)!(elements as never, { scrollX: 0 } as AppState, files);
    return { seen, Excalidraw, change };
  }

  it('passes Excalidraw the same onChange across re-renders', async () => {
    const { seen, Excalidraw } = excalidrawExposingOnChange();
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi: vi.fn(),
      onError: vi.fn(),
      ...noSceneChanges(),
    });

    await act(async () => renderer.render({ theme: 'light' }));
    await act(async () => renderer.render({ theme: 'dark' }));

    expect(seen.onChange).toHaveLength(2);
    expect(new Set(seen.onChange).size).toBe(1);
    await act(async () => renderer.destroy());
  });

  it("reports the frame's latest scene with the version from Excalidraw's hash helper", async () => {
    const { Excalidraw, change } = excalidrawExposingOnChange();
    const onSceneChange = vi.fn();
    hashElementsVersion.mockReturnValue(42);
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi: vi.fn(),
      onError: vi.fn(),
      onSceneChange,
    });
    await act(async () => renderer.render({}));
    const latest = [{ id: 'b' }] as unknown as ExcalidrawElement[];

    change([{ id: 'a' }] as unknown as ExcalidrawElement[]);
    change(latest);
    expect(onSceneChange).not.toHaveBeenCalled();
    frames.run();

    expect(hashElementsVersion.mock.calls).toEqual([[latest]]);
    expect(onSceneChange.mock.calls).toEqual([
      [{ elements: latest, appState: { scrollX: 0 }, files: {}, version: 42 }],
    ]);
    await act(async () => renderer.destroy());
  });

  it('reports no scene change still pending when destroyed', async () => {
    const { Excalidraw, change } = excalidrawExposingOnChange();
    const onSceneChange = vi.fn();
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi: vi.fn(),
      onError: vi.fn(),
      onSceneChange,
    });
    await act(async () => renderer.render({}));

    change([]);
    await act(async () => renderer.destroy());
    frames.run();

    expect(onSceneChange).not.toHaveBeenCalled();
  });

  it('unmounts Excalidraw from the host on destroy', async () => {
    const { Excalidraw } = excalidrawHandingOverDuringRender(vi.fn());
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi: vi.fn(),
      onError: vi.fn(),
      ...noSceneChanges(),
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
