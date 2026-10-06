import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withNoIncrementalHydration,
} from '@angular/platform-browser';
import {
  libraryUrlValidator,
  localStorageLibraryAdapter,
  provideExcalidraw,
  provideExcalidrawLibrary,
} from 'ngx-excalidraw';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideClientHydration(withEventReplay(), withNoIncrementalHydration()),
    provideExcalidraw({ styleUrl: 'excalidraw.css' }),
    provideExcalidrawLibrary({
      adapter: localStorageLibraryAdapter(),
      validateLibraryUrl: libraryUrlValidator(),
    }),
  ],
};
