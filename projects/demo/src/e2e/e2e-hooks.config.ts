import { ApplicationConfig, ApplicationRef, inject, provideAppInitializer } from '@angular/core';
import { filter, take } from 'rxjs';
import {
  EXCALIDRAW_RENDERER_LOADER,
  loadDefaultExcalidrawRenderer,
  type ExcalidrawImperativeAPI,
  type ExcalidrawRendererFactory,
} from '@getvoicify/ngx-excalidraw';

interface E2eHooks {
  __appFirstStableAt?: number;
  __excalidrawApi?: ExcalidrawImperativeAPI;
  __excalidrawApiEmissions?: number;
  __sceneChangeEmissions?: number;
}

const hooks = window as Window & E2eHooks;

const observed =
  (createRenderer: ExcalidrawRendererFactory): ExcalidrawRendererFactory =>
  (host, callbacks) =>
    createRenderer(host, {
      ...callbacks,
      onApi: (api) => {
        hooks.__excalidrawApi = api;
        hooks.__excalidrawApiEmissions = (hooks.__excalidrawApiEmissions ?? 0) + 1;
        callbacks.onApi(api);
      },
      onSceneChange: (change) => {
        hooks.__sceneChangeEmissions = (hooks.__sceneChangeEmissions ?? 0) + 1;
        callbacks.onSceneChange(change);
      },
    });

export const e2eHooksConfig: ApplicationConfig = {
  providers: [
    {
      provide: EXCALIDRAW_RENDERER_LOADER,
      useValue: () => loadDefaultExcalidrawRenderer().then(observed),
    },
    provideAppInitializer(() => {
      inject(ApplicationRef)
        .isStable.pipe(filter(Boolean), take(1))
        .subscribe(() => (hooks.__appFirstStableAt = performance.now()));
    }),
  ],
};
