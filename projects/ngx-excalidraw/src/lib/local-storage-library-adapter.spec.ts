import type { LibraryItems } from '@excalidraw/excalidraw/types';
import { localStorageLibraryAdapter } from './local-storage-library-adapter';

const items = [
  { id: 'box', status: 'published', created: 1, elements: [] },
] as unknown as LibraryItems;

describe('localStorageLibraryAdapter', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('loads back the library items it saved', async () => {
    const adapter = localStorageLibraryAdapter();

    await adapter.save({ libraryItems: items });

    expect(await adapter.load({ source: 'load' })).toEqual({ libraryItems: items });
  });

  it('keeps libraries saved under different keys apart', async () => {
    await localStorageLibraryAdapter('first').save({ libraryItems: items });

    expect(await localStorageLibraryAdapter('second').load({ source: 'load' })).toBeNull();
    expect(localStorage.getItem('first')).toBe(JSON.stringify({ libraryItems: items }));
  });

  it('stores under ngx-excalidraw-library unless told otherwise', async () => {
    await localStorageLibraryAdapter().save({ libraryItems: items });

    expect(JSON.parse(localStorage.getItem('ngx-excalidraw-library')!)).toEqual({
      libraryItems: items,
    });
  });

  it('loads nothing when nothing has been saved', async () => {
    expect(await localStorageLibraryAdapter().load({ source: 'load' })).toBeNull();
  });

  it('loads nothing instead of failing when the stored value is not valid JSON', async () => {
    localStorage.setItem('ngx-excalidraw-library', '{not json');

    expect(await localStorageLibraryAdapter().load({ source: 'load' })).toBeNull();
  });

  it('loads nothing when the stored JSON is not a library', async () => {
    localStorage.setItem('ngx-excalidraw-library', JSON.stringify({ libraryItems: 'nope' }));

    expect(await localStorageLibraryAdapter().load({ source: 'load' })).toBeNull();
  });

  it('loads nothing instead of failing when reading storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });

    expect(await localStorageLibraryAdapter().load({ source: 'load' })).toBeNull();
  });

  it('rejects a save that storage refuses, so Excalidraw can report it', async () => {
    const quotaExceeded = new DOMException('full', 'QuotaExceededError');
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw quotaExceeded;
      },
    });

    await expect(localStorageLibraryAdapter().save({ libraryItems: items })).rejects.toBe(
      quotaExceeded,
    );
  });

  it('never touches storage when it is created', () => {
    const touched: PropertyKey[] = [];
    vi.stubGlobal(
      'localStorage',
      new Proxy({}, { get: (_, property) => touched.push(property) && undefined }),
    );

    localStorageLibraryAdapter();

    expect(touched).toEqual([]);
  });

  it('loads nothing where no localStorage exists, as on the server', async () => {
    vi.stubGlobal('localStorage', undefined);

    expect(await localStorageLibraryAdapter().load({ source: 'load' })).toBeNull();
  });
});
