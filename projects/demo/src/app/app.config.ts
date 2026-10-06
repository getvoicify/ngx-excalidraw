import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withNoIncrementalHydration,
} from '@angular/platform-browser';
import {
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
      validateLibraryUrl: (libraryUrl) => new URL(libraryUrl).origin === window.location.origin,
    }),
  ],
};
