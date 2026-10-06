import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import packageJson from '../package.json';
import * as publicApi from './public-api';
import { NGX_EXCALIDRAW_VERSION } from './public-api';

describe('ngx-excalidraw public API', () => {
  it('exposes the version declared in the library package.json', () => {
    expect(NGX_EXCALIDRAW_VERSION).toBe(packageJson.version);
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
