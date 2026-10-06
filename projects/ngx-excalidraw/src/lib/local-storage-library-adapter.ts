import type { LibraryPersistedData } from '@excalidraw/excalidraw/data/library';
import type { ExcalidrawLibraryAdapter } from './library';

export function localStorageLibraryAdapter(
  key = 'ngx-excalidraw-library',
): ExcalidrawLibraryAdapter {
  return {
    load: () => {
      try {
        return storedLibrary(key);
      } catch {
        return null;
      }
    },
    save: async (library) => {
      storedLibrary(key);
      globalThis.localStorage.setItem(key, JSON.stringify(library));
    },
  };
}

function storedLibrary(key: string): LibraryPersistedData | null {
  const raw = globalThis.localStorage.getItem(key);
  if (raw === null) return null;
  const stored: Partial<LibraryPersistedData> | null = JSON.parse(raw);
  if (!Array.isArray(stored?.libraryItems)) {
    throw new Error(`localStorage "${key}" holds something other than an Excalidraw library`);
  }
  return { libraryItems: stored.libraryItems };
}
