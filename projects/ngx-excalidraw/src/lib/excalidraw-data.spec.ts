import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ExcalidrawElement, NonDeleted } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import {
  EXCALIDRAW_MODULE_LOADER,
  ExcalidrawData,
  type ExcalidrawDataModule,
} from './excalidraw-data';
import { provideExcalidraw } from './provide-excalidraw';

const elements = [{ id: 'rect', type: 'rectangle' }] as unknown as NonDeleted<ExcalidrawElement>[];
const appState = { viewBackgroundColor: '#fff' } as AppState;
const files = {} as BinaryFiles;
const assetWindow = window as Window & { EXCALIDRAW_ASSET_PATH?: string };

function fakeModule() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const blob = new Blob(['png']);
  return {
    svg,
    blob,
    module: {
      exportToSvg: vi.fn(() => Promise.resolve(svg)),
      exportToBlob: vi.fn(() => Promise.resolve(blob)),
      serializeAsJSON: vi.fn(() => '{"type":"excalidraw"}'),
      loadFromBlob: vi.fn(() => Promise.resolve({ elements: [], appState, files })),
      loadLibraryFromBlob: vi.fn(() => Promise.resolve([])),
    } as unknown as ExcalidrawDataModule &
      Record<keyof ExcalidrawDataModule, ReturnType<typeof vi.fn>>,
  };
}

function setUp(loader: () => Promise<ExcalidrawDataModule>, platform = 'browser', providers = []) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: EXCALIDRAW_MODULE_LOADER, useValue: loader },
      ...providers,
    ],
  });
  return TestBed.inject(ExcalidrawData);
}

describe('ExcalidrawData', () => {
  afterEach(() => {
    delete assetWindow.EXCALIDRAW_ASSET_PATH;
  });

  it('exports an SVG with the given options', async () => {
    const fake = fakeModule();
    const data = setUp(() => Promise.resolve(fake.module));
    const options = { elements, appState, files, exportPadding: 8 };
    await expect(data.exportToSvg(options)).resolves.toBe(fake.svg);
    expect(fake.module.exportToSvg).toHaveBeenCalledWith(options);
  });

  it('exports a blob with the given options', async () => {
    const fake = fakeModule();
    const data = setUp(() => Promise.resolve(fake.module));
    const options = { elements, appState, files, mimeType: 'image/png', quality: 0.9 };
    await expect(data.exportToBlob(options)).resolves.toBe(fake.blob);
    expect(fake.module.exportToBlob).toHaveBeenCalledWith(options);
  });

  it('serializes a scene as JSON', async () => {
    const fake = fakeModule();
    const data = setUp(() => Promise.resolve(fake.module));
    await expect(data.serializeAsJSON(elements, appState, files, 'local')).resolves.toBe(
      '{"type":"excalidraw"}',
    );
    expect(fake.module.serializeAsJSON).toHaveBeenCalledWith(elements, appState, files, 'local');
  });

  it('loads a scene from a blob against the local scene', async () => {
    const fake = fakeModule();
    const data = setUp(() => Promise.resolve(fake.module));
    const blob = new Blob(['{}']);
    await expect(data.loadFromBlob(blob, appState, elements)).resolves.toEqual({
      elements: [],
      appState,
      files,
    });
    expect(fake.module.loadFromBlob).toHaveBeenCalledWith(blob, appState, elements);
  });

  it('loads library items from a blob', async () => {
    const fake = fakeModule();
    const data = setUp(() => Promise.resolve(fake.module));
    const blob = new Blob(['{}']);
    await expect(data.loadLibraryFromBlob(blob)).resolves.toEqual([]);
    expect(fake.module.loadLibraryFromBlob).toHaveBeenCalledWith(blob);
  });

  it('passes the file handle a scene was opened from through to Excalidraw', async () => {
    const fake = fakeModule();
    const data = setUp(() => Promise.resolve(fake.module));
    const blob = new Blob(['{}']);
    const fileHandle = { kind: 'file', name: 'scene.excalidraw' } as FileSystemHandle;
    await data.loadFromBlob(blob, appState, elements, fileHandle);
    expect(fake.module.loadFromBlob).toHaveBeenCalledWith(blob, appState, elements, fileHandle);
  });

  it('marks imported library items with the requested status', async () => {
    const fake = fakeModule();
    const data = setUp(() => Promise.resolve(fake.module));
    const blob = new Blob(['{}']);
    await data.loadLibraryFromBlob(blob, 'published');
    expect(fake.module.loadLibraryFromBlob).toHaveBeenCalledWith(blob, 'published');
  });

  it('loads Excalidraw once across every call', async () => {
    const fake = fakeModule();
    const loader = vi.fn(() => Promise.resolve(fake.module));
    const data = setUp(loader);
    await data.exportToSvg({ elements, appState, files });
    await data.serializeAsJSON(elements, appState, files, 'database');
    await data.loadLibraryFromBlob(new Blob(['{}']));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retries loading Excalidraw on the next call after a failed load', async () => {
    const fake = fakeModule();
    const loader = vi
      .fn<() => Promise<ExcalidrawDataModule>>()
      .mockImplementationOnce(() => Promise.reject(new Error('chunk 404')))
      .mockImplementationOnce(() => Promise.resolve(fake.module));
    const data = setUp(loader);
    await expect(data.exportToSvg({ elements, appState, files })).rejects.toThrow('chunk 404');
    await expect(data.exportToSvg({ elements, appState, files })).resolves.toBe(fake.svg);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('exports with fonts served from the configured asset path', async () => {
    const fake = fakeModule();
    let assetPathDuringExport: string | undefined;
    fake.module.exportToSvg.mockImplementation(() => {
      assetPathDuringExport = assetWindow.EXCALIDRAW_ASSET_PATH;
      return Promise.resolve(fake.svg);
    });
    const data = setUp(() => Promise.resolve(fake.module), 'browser', [
      provideExcalidraw({ assetPath: '/excalidraw-assets/' }),
    ] as never[]);
    await data.exportToSvg({ elements, appState, files });
    expect(assetPathDuringExport).toBe('/excalidraw-assets/');
  });

  it('rejects every call on the server without loading Excalidraw', async () => {
    const loader = vi.fn(() => Promise.resolve(fakeModule().module));
    const data = setUp(loader, 'server');
    const blob = new Blob(['{}']);
    await Promise.all(
      [
        data.exportToSvg({ elements, appState, files }),
        data.exportToBlob({ elements, appState, files }),
        data.serializeAsJSON(elements, appState, files, 'local'),
        data.loadFromBlob(blob, null, null),
        data.loadLibraryFromBlob(blob),
      ].map((call) => expect(call).rejects.toThrow(/only in the browser/)),
    );
    expect(loader).not.toHaveBeenCalled();
  });
});
