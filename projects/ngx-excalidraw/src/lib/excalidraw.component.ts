import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  OnDestroy,
  output,
  PLATFORM_ID,
  Renderer2,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  LibraryItems,
} from '@excalidraw/excalidraw/types';
import { APP_FIRST_SETTLED } from './app-settled';
import { EXCALIDRAW_LIBRARY } from './library';
import { LibraryOwnership } from './library-ownership';
import { EXCALIDRAW_CONFIG, pointExcalidrawAtAssets } from './provide-excalidraw';
import type {
  ExcalidrawRenderer,
  ExcalidrawRendererFactory,
  ExcalidrawRenderProps,
} from './renderer';
import { EXCALIDRAW_RENDERER_LOADER } from './renderer-loader';
import type { ExcalidrawSceneChange } from './scene-change';
import { once } from './once';
import { loadStylesheetOnce } from './stylesheet';

@Component({
  selector: 'ngx-excalidraw',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.ngx-excalidraw--no-main-menu]': '!mainMenu()',
  },
  styles: `
    :host {
      display: block;
      position: relative;
    }
    .ngx-excalidraw-placeholder {
      position: absolute;
      inset: 0;
    }
    :host(.ngx-excalidraw--no-main-menu) ::ng-deep .main-menu-trigger {
      display: none;
    }
  `,
  template: `
    @if (!mounted()) {
      <ng-content select="[placeholder]">
        <div class="ngx-excalidraw-placeholder" aria-busy="true"></div>
      </ng-content>
    }
  `,
})
export class ExcalidrawComponent implements OnDestroy {
  readonly initialData = input<ExcalidrawProps['initialData']>();
  readonly theme = input<ExcalidrawProps['theme']>();
  readonly viewModeEnabled = input(undefined, { transform: optionalBooleanAttribute });
  readonly zenModeEnabled = input(undefined, { transform: optionalBooleanAttribute });
  readonly gridModeEnabled = input(undefined, { transform: optionalBooleanAttribute });
  readonly objectsSnapModeEnabled = input(undefined, { transform: optionalBooleanAttribute });
  readonly langCode = input<ExcalidrawProps['langCode']>();
  readonly name = input<ExcalidrawProps['name']>();
  readonly UIOptions = input<ExcalidrawProps['UIOptions']>();
  readonly autoFocus = input(undefined, { transform: optionalBooleanAttribute });
  readonly handleKeyboardGlobally = input(undefined, { transform: optionalBooleanAttribute });
  readonly detectScroll = input(undefined, { transform: optionalBooleanAttribute });
  readonly libraryReturnUrl = input<ExcalidrawProps['libraryReturnUrl']>();
  readonly mainMenu = input(true, { transform: booleanAttribute });

  readonly api = output<ExcalidrawImperativeAPI>();
  readonly editorError = output<unknown>();
  readonly sceneChange = output<ExcalidrawSceneChange>();
  readonly libraryChange = output<LibraryItems>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly dom = inject(Renderer2);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(EXCALIDRAW_CONFIG);
  private readonly library = inject(EXCALIDRAW_LIBRARY);
  private readonly libraryOwnership = inject(LibraryOwnership);
  private readonly loadRenderer = inject(EXCALIDRAW_RENDERER_LOADER);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly appSettled = inject(APP_FIRST_SETTLED);
  private readonly bundle = resource({
    params: () => (this.isBrowser && this.appSettled()) || undefined,
    loader: ({ abortSignal }) => this.loadBundle(abortSignal),
  });

  private readonly mountFailure = signal<{ error: unknown } | null>(null);
  private readonly failure = computed(() => {
    const loadError = this.bundle.error();
    return loadError ? { error: loadError } : this.mountFailure();
  });

  protected readonly mounted = computed(() => this.bundle.hasValue() && !this.mountFailure());

  private readonly renderProps = computed(() =>
    definedOnly<ExcalidrawRenderProps>({
      theme: this.theme(),
      viewModeEnabled: this.viewModeEnabled(),
      zenModeEnabled: this.zenModeEnabled(),
      gridModeEnabled: this.gridModeEnabled(),
      langCode: this.langCode(),
      UIOptions: this.UIOptions(),
      libraryReturnUrl: this.libraryReturnUrl(),
    }),
  );
  private readonly mountOnlyProps = computed(() =>
    definedOnly<ExcalidrawRenderProps>({
      initialData: this.initialData(),
      objectsSnapModeEnabled: this.objectsSnapModeEnabled(),
      name: this.name(),
      autoFocus: this.autoFocus(),
      handleKeyboardGlobally: this.handleKeyboardGlobally(),
      detectScroll: this.detectScroll(),
    }),
  );
  private readonly editor = signal<ExcalidrawRenderer | null>(null);
  private readonly editorApi = signal<ExcalidrawImperativeAPI | null>(null);
  private readonly ownedLibrary = computed(() =>
    this.libraryOwnership.owner() === this ? this.library : undefined,
  );

  constructor() {
    effect((onCleanup) => {
      if (!this.bundle.hasValue() || this.mountFailure()) return;
      const createRenderer = this.bundle.value();
      try {
        const mounted = untracked(() => this.mountRenderer(createRenderer));
        const destroyRenderer = once(() => mounted.renderer.destroy());
        this.editor.set({
          render: (props, library) => mounted.renderer.render(props, library),
          destroy: destroyRenderer,
        });
        onCleanup(() => {
          destroyRenderer();
          this.editor.set(null);
          this.editorApi.set(null);
          this.dom.removeChild(this.host, mounted.element);
        });
      } catch (error) {
        this.mountFailure.set({ error });
      }
    });

    effect(() => {
      const editor = this.editor();
      if (!editor) return;
      const props = { ...this.renderProps(), ...untracked(this.mountOnlyProps) };
      const library = this.ownedLibrary();
      this.zone.runOutsideAngular(() => editor.render(props, library));
    });

    effect((onCleanup) => {
      if (this.library && this.editor()) onCleanup(this.libraryOwnership.claim(this));
    });

    effect(() => {
      const api = this.editorApi();
      if (api && !this.mainMenu()) untracked(() => this.closeMainMenu(api));
    });

    effect(() => {
      const failure = this.failure();
      if (failure) untracked(() => this.editorError.emit(failure.error));
    });
  }

  ngOnDestroy(): void {
    untracked(this.editor)?.destroy();
  }

  private async loadBundle(abortSignal: AbortSignal): Promise<ExcalidrawRendererFactory> {
    if (this.config.styleUrl) await loadStylesheetOnce(this.document, this.config.styleUrl);
    abortSignal.throwIfAborted();
    pointExcalidrawAtAssets(this.document, this.config);
    return this.loadRenderer();
  }

  private closeMainMenu(api: ExcalidrawImperativeAPI): void {
    if (api.getAppState().openMenu !== 'canvas') return;
    this.zone.runOutsideAngular(() => api.updateScene({ appState: { openMenu: null } }));
  }

  private mountRenderer(createRenderer: ExcalidrawRendererFactory) {
    return this.zone.runOutsideAngular(() => {
      const element: HTMLElement = this.dom.createElement('div');
      this.dom.addClass(element, 'ngx-excalidraw-mount');
      this.dom.setStyle(element, 'position', 'absolute');
      this.dom.setStyle(element, 'inset', '0');
      this.dom.appendChild(this.host, element);
      try {
        return {
          element,
          renderer: createRenderer(element, {
            onApi: (api) =>
              this.zone.run(() => {
                this.editorApi.set(api);
                this.api.emit(api);
              }),
            onError: (error) => this.zone.run(() => this.mountFailure.set({ error })),
            onSceneChange: (change) => {
              if (this.editor()) this.zone.run(() => this.sceneChange.emit(change));
            },
            onLibraryChange: (libraryItems) => {
              if (this.editor()) this.zone.run(() => this.libraryChange.emit(libraryItems));
            },
          }),
        };
      } catch (error) {
        this.dom.removeChild(this.host, element);
        throw error;
      }
    });
  }
}

function definedOnly<T extends object>(props: { [K in keyof T]: T[K] | undefined }): Partial<T> {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function optionalBooleanAttribute(value: unknown): boolean | undefined {
  return value === undefined ? undefined : booleanAttribute(value);
}
