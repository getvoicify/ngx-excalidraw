import type { LibraryPersistedData } from '@excalidraw/excalidraw/data/library';
import type { ExcalidrawLibraryAdapter } from './library';

export function localStorageLibraryAdapter(
  key = 'ngx-excalidraw-library',
): ExcalidrawLibraryAdapter {
  return {
    load: () => {
      try {
        const stored: Partial<LibraryPersistedData> | null = JSON.parse(
          globalThis.localStorage.getItem(key) ?? 'null',
        );
        return Array.isArray(stored?.libraryItems) ? { libraryItems: stored.libraryItems } : null;
      } catch {
        return null;
      }
    },
    save: async (library) => globalThis.localStorage.setItem(key, JSON.stringify(library)),
  };
}
