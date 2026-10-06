import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

export interface ExcalidrawConfig {
  styleUrl?: string;
  assetPath?: string;
}

export const EXCALIDRAW_CONFIG = new InjectionToken<ExcalidrawConfig>('EXCALIDRAW_CONFIG', {
  providedIn: 'root',
  factory: () => ({}),
});

export function provideExcalidraw(config: ExcalidrawConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: EXCALIDRAW_CONFIG, useValue: config }]);
}

export function pointExcalidrawAtAssets(document: Document, { assetPath }: ExcalidrawConfig): void {
  if (assetPath) {
    (document.defaultView as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH =
      assetPath;
  }
}
