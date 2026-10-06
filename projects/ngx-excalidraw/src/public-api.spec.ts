import type * as ExcalidrawElementTypes from '@excalidraw/excalidraw/element/types';
import type * as ExcalidrawTypes from '@excalidraw/excalidraw/types';
import type * as NgxExcalidraw from './public-api';

describe('public API', () => {
  it('re-exports the Excalidraw types a consumer needs without importing @excalidraw/*', () => {
    expectTypeOf<NgxExcalidraw.ExcalidrawImperativeAPI>().toEqualTypeOf<ExcalidrawTypes.ExcalidrawImperativeAPI>();
    expectTypeOf<NgxExcalidraw.AppState>().toEqualTypeOf<ExcalidrawTypes.AppState>();
    expectTypeOf<NgxExcalidraw.BinaryFiles>().toEqualTypeOf<ExcalidrawTypes.BinaryFiles>();
    expectTypeOf<NgxExcalidraw.LibraryItems>().toEqualTypeOf<ExcalidrawTypes.LibraryItems>();
    expectTypeOf<NgxExcalidraw.ExcalidrawInitialDataState>().toEqualTypeOf<ExcalidrawTypes.ExcalidrawInitialDataState>();
    expectTypeOf<NgxExcalidraw.UIOptions>().toEqualTypeOf<ExcalidrawTypes.UIOptions>();
    expectTypeOf<NgxExcalidraw.ExcalidrawProps>().toEqualTypeOf<ExcalidrawTypes.ExcalidrawProps>();
    expectTypeOf<NgxExcalidraw.ExcalidrawElement>().toEqualTypeOf<ExcalidrawElementTypes.ExcalidrawElement>();
    expectTypeOf<NgxExcalidraw.NonDeletedExcalidrawElement>().toEqualTypeOf<ExcalidrawElementTypes.NonDeletedExcalidrawElement>();
    expectTypeOf<NgxExcalidraw.Theme>().toEqualTypeOf<ExcalidrawElementTypes.Theme>();
  });

  it('types the scene action options as Excalidraw 0.18 export options with appState overrides', () => {
    expectTypeOf<NgxExcalidraw.SceneSvgExportOptions>().not.toBeAny();
    expectTypeOf<NgxExcalidraw.SceneBlobExportOptions>().not.toBeAny();
    expectTypeOf<keyof NgxExcalidraw.SceneSvgExportOptions>().toEqualTypeOf<
      | 'appState'
      | 'exportPadding'
      | 'exportingFrame'
      | 'renderEmbeddables'
      | 'skipInliningFonts'
      | 'reuseImages'
    >();
    expectTypeOf<keyof NgxExcalidraw.SceneBlobExportOptions>().toEqualTypeOf<
      | 'appState'
      | 'exportPadding'
      | 'exportingFrame'
      | 'maxWidthOrHeight'
      | 'getDimensions'
      | 'mimeType'
      | 'quality'
    >();
    expectTypeOf<NgxExcalidraw.SceneExportAppState>().toEqualTypeOf<
      Partial<
        Pick<
          ExcalidrawTypes.AppState,
          | 'exportBackground'
          | 'exportWithDarkMode'
          | 'exportEmbedScene'
          | 'exportScale'
          | 'viewBackgroundColor'
          | 'frameRendering'
        >
      >
    >();
    expectTypeOf<NgxExcalidraw.SceneJsonType>().toEqualTypeOf<'local' | 'database'>();
  });
});
