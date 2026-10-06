import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withNoIncrementalHydration,
} from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideClientHydration(withEventReplay(), withNoIncrementalHydration()),
  ],
};
