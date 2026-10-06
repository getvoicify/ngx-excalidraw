import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { LibraryPersistenceAdapter } from '@excalidraw/excalidraw/data/library';

export type ExcalidrawLibraryAdapter = LibraryPersistenceAdapter;

export interface ExcalidrawLibraryOptions {
  adapter?: ExcalidrawLibraryAdapter;
  validateLibraryUrl?: (libraryUrl: string) => boolean;
}

export const EXCALIDRAW_LIBRARY = new InjectionToken<ExcalidrawLibraryOptions | undefined>(
  'EXCALIDRAW_LIBRARY',
  { providedIn: 'root', factory: () => undefined },
);

export function provideExcalidrawLibrary(
  options: ExcalidrawLibraryOptions = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: EXCALIDRAW_LIBRARY, useValue: options }]);
}
