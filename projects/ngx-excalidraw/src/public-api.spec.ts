import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as publicApi from './public-api';

describe('ngx-excalidraw public API', () => {
  it('exports exactly the documented runtime surface', () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      'EXCALIDRAW_LIBRARY',
      'EXCALIDRAW_MODULE_LOADER',
      'EXCALIDRAW_RENDERER_LOADER',
      'ExcalidrawComponent',
      'ExcalidrawData',
      'libraryUrlValidator',
      'localStorageLibraryAdapter',
      'preloadExcalidraw',
      'provideExcalidraw',
      'provideExcalidrawLibrary',
    ]);
  });

  it('exposes the injectable Excalidraw data utilities', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const data = TestBed.inject(publicApi.ExcalidrawData);
    await expect(data.loadLibraryFromBlob(new Blob())).rejects.toThrow(/only in the browser/);
  });

  it('lets apps replace the Excalidraw module behind the data utilities', async () => {
    const serializeAsJSON = () => '{"type":"excalidraw"}';
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: publicApi.EXCALIDRAW_MODULE_LOADER,
          useValue: () =>
            Promise.resolve({ serializeAsJSON } as unknown as publicApi.ExcalidrawDataModule),
        },
      ],
    });
    const data = TestBed.inject(publicApi.ExcalidrawData);
    await expect(data.serializeAsJSON([], {}, {}, 'local')).resolves.toBe('{"type":"excalidraw"}');
  });
});
