import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { memoizeUntilRejected } from './memoize-until-rejected';
import { EXCALIDRAW_CONFIG, pointExcalidrawAtAssets } from './provide-excalidraw';

type ExcalidrawModule = typeof import('@excalidraw/excalidraw');

export type ExcalidrawDataModule = Pick<
  ExcalidrawModule,
  'exportToSvg' | 'exportToBlob' | 'serializeAsJSON' | 'loadFromBlob' | 'loadLibraryFromBlob'
>;

type UtilityArgs<K extends keyof ExcalidrawDataModule> = Parameters<ExcalidrawDataModule[K]>;
type UtilityResult<K extends keyof ExcalidrawDataModule> = Promise<
  Awaited<ReturnType<ExcalidrawDataModule[K]>>
>;

export type ExcalidrawModuleLoader = () => Promise<ExcalidrawDataModule>;

export type ExportToSvgOptions = Parameters<ExcalidrawModule['exportToSvg']>[0];
export type ExportToBlobOptions = Parameters<ExcalidrawModule['exportToBlob']>[0];
export type RestoredScene = Awaited<ReturnType<ExcalidrawModule['loadFromBlob']>>;
export type LoadedLibraryItems = Awaited<ReturnType<ExcalidrawModule['loadLibraryFromBlob']>>;

export const EXCALIDRAW_MODULE_LOADER = new InjectionToken<ExcalidrawModuleLoader>(
  'EXCALIDRAW_MODULE_LOADER',
  { providedIn: 'root', factory: () => () => import('@excalidraw/excalidraw') },
);

const browserOnly = () =>
  Promise.reject<ExcalidrawDataModule>(
    new Error('ngx-excalidraw: Excalidraw data utilities run only in the browser'),
  );

@Injectable({ providedIn: 'root' })
export class ExcalidrawData {
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(EXCALIDRAW_CONFIG);
  private readonly loadModule = inject(EXCALIDRAW_MODULE_LOADER);
  private readonly excalidraw: ExcalidrawModuleLoader = isPlatformBrowser(inject(PLATFORM_ID))
    ? memoizeUntilRejected(() => {
        pointExcalidrawAtAssets(this.document, this.config);
        return this.loadModule();
      })
    : browserOnly;

  exportToSvg(...args: UtilityArgs<'exportToSvg'>): UtilityResult<'exportToSvg'> {
    return this.excalidraw().then((excalidraw) => excalidraw.exportToSvg(...args));
  }

  exportToBlob(...args: UtilityArgs<'exportToBlob'>): UtilityResult<'exportToBlob'> {
    return this.excalidraw().then((excalidraw) => excalidraw.exportToBlob(...args));
  }

  serializeAsJSON(...args: UtilityArgs<'serializeAsJSON'>): UtilityResult<'serializeAsJSON'> {
    return this.excalidraw().then((excalidraw) => excalidraw.serializeAsJSON(...args));
  }

  loadFromBlob(...args: UtilityArgs<'loadFromBlob'>): UtilityResult<'loadFromBlob'> {
    return this.excalidraw().then((excalidraw) => excalidraw.loadFromBlob(...args));
  }

  loadLibraryFromBlob(
    ...args: UtilityArgs<'loadLibraryFromBlob'>
  ): UtilityResult<'loadLibraryFromBlob'> {
    return this.excalidraw().then((excalidraw) => excalidraw.loadLibraryFromBlob(...args));
  }
}
