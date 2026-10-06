import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import { memoizeUntilRejected } from './memoize-until-rejected';
import { EXCALIDRAW_CONFIG, pointExcalidrawAtAssets } from './provide-excalidraw';

type ExcalidrawModule = typeof import('@excalidraw/excalidraw');

export type ExcalidrawDataModule = Pick<
  ExcalidrawModule,
  'exportToSvg' | 'exportToBlob' | 'serializeAsJSON' | 'loadFromBlob' | 'loadLibraryFromBlob'
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

  exportToSvg(options: ExportToSvgOptions): Promise<SVGSVGElement> {
    return this.excalidraw().then((excalidraw) => excalidraw.exportToSvg(options));
  }

  exportToBlob(options: ExportToBlobOptions): Promise<Blob> {
    return this.excalidraw().then((excalidraw) => excalidraw.exportToBlob(options));
  }

  serializeAsJSON(
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
    type: 'local' | 'database',
  ): Promise<string> {
    return this.excalidraw().then((excalidraw) =>
      excalidraw.serializeAsJSON(elements, appState, files, type),
    );
  }

  loadFromBlob(
    blob: Blob,
    localAppState: AppState | null,
    localElements: readonly ExcalidrawElement[] | null,
  ): Promise<RestoredScene> {
    return this.excalidraw().then((excalidraw) =>
      excalidraw.loadFromBlob(blob, localAppState, localElements),
    );
  }

  loadLibraryFromBlob(blob: Blob): Promise<LoadedLibraryItems> {
    return this.excalidraw().then((excalidraw) => excalidraw.loadLibraryFromBlob(blob));
  }
}
