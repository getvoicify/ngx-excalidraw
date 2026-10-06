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
    const Excalidraw = ({ excalidrawAPI }: ExcalidrawProps) => {
      excalidrawAPI?.(api);
      handOversDuringRender.push(onApi.mock.calls.length);
      return react.createElement('div', { className: 'excalidraw' });
    };
    return { api, handOversDuringRender, Excalidraw };
  }

  it('hands the API over only once across re-renders', async () => {
    const onApi = vi.fn();
    const { Excalidraw } = excalidrawHandingOverDuringRender(onApi);
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, { onApi });

    await act(async () => renderer.render({}));
    await act(async () => renderer.render({ viewModeEnabled: true }));

    expect(onApi).toHaveBeenCalledTimes(1);
    await act(async () => renderer.destroy());
  });

  it('unmounts Excalidraw from the host on destroy', async () => {
    const { Excalidraw } = excalidrawHandingOverDuringRender(vi.fn());
    const renderer = createRendererFactory({ react, reactDomClient, Excalidraw })(host, {
      onApi: vi.fn(),
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
