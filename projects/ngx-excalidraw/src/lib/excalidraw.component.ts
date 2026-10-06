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
  output,
  PLATFORM_ID,
  Renderer2,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import { APP_FIRST_SETTLED } from './app-settled';
import { EXCALIDRAW_CONFIG } from './provide-excalidraw';
import type {
  ExcalidrawRenderer,
  ExcalidrawRendererFactory,
  ExcalidrawRenderProps,
} from './renderer';
import { EXCALIDRAW_RENDERER_LOADER } from './renderer-loader';
import { loadStylesheetOnce } from './stylesheet';

@Component({
  selector: 'ngx-excalidraw',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      position: relative;
    }
    .ngx-excalidraw-placeholder {
      position: absolute;
      inset: 0;
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
export class ExcalidrawComponent {
  readonly initialData = input<ExcalidrawProps['initialData']>();
  readonly theme = input<ExcalidrawProps['theme']>();
  readonly viewModeEnabled = input(undefined, { transform: booleanAttribute });
  readonly zenModeEnabled = input(undefined, { transform: booleanAttribute });
  readonly gridModeEnabled = input(undefined, { transform: booleanAttribute });
  readonly objectsSnapModeEnabled = input(undefined, { transform: booleanAttribute });
  readonly langCode = input<ExcalidrawProps['langCode']>();
  readonly name = input<ExcalidrawProps['name']>();
  readonly UIOptions = input<ExcalidrawProps['UIOptions']>();
  readonly autoFocus = input(undefined, { transform: booleanAttribute });
  readonly handleKeyboardGlobally = input(undefined, { transform: booleanAttribute });
  readonly detectScroll = input(undefined, { transform: booleanAttribute });

  readonly api = output<ExcalidrawImperativeAPI>();
  readonly loadError = output<unknown>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly dom = inject(Renderer2);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(EXCALIDRAW_CONFIG);
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
    definedOnly({
      theme: this.theme(),
      viewModeEnabled: this.viewModeEnabled(),
      zenModeEnabled: this.zenModeEnabled(),
      gridModeEnabled: this.gridModeEnabled(),
      objectsSnapModeEnabled: this.objectsSnapModeEnabled(),
      langCode: this.langCode(),
      name: this.name(),
      UIOptions: this.UIOptions(),
      autoFocus: this.autoFocus(),
      handleKeyboardGlobally: this.handleKeyboardGlobally(),
      detectScroll: this.detectScroll(),
    }),
  );
  private readonly editor = signal<ExcalidrawRenderer | null>(null);

  constructor() {
    effect((onCleanup) => {
      if (!this.bundle.hasValue() || this.mountFailure()) return;
      const createRenderer = this.bundle.value();
      try {
        const mounted = untracked(() => this.mountRenderer(createRenderer));
        this.editor.set(mounted.renderer);
        onCleanup(() => {
          this.editor.set(null);
          mounted.renderer.destroy();
          this.dom.removeChild(this.host, mounted.element);
        });
      } catch (error) {
        this.mountFailure.set({ error });
      }
    });

    effect(() => {
      const editor = this.editor();
      if (!editor) return;
      const props = {
        ...this.renderProps(),
        ...definedOnly({ initialData: untracked(this.initialData) }),
      };
      try {
        this.zone.runOutsideAngular(() => editor.render(props));
      } catch (error) {
        this.mountFailure.set({ error });
      }
    });

    effect(() => {
      const failure = this.failure();
      if (failure) untracked(() => this.loadError.emit(failure.error));
    });
  }

  private async loadBundle(abortSignal: AbortSignal): Promise<ExcalidrawRendererFactory> {
    if (this.config.styleUrl) await loadStylesheetOnce(this.document, this.config.styleUrl);
    abortSignal.throwIfAborted();
    if (this.config.assetPath) {
      (
        this.document.defaultView as Window & { EXCALIDRAW_ASSET_PATH?: string }
      ).EXCALIDRAW_ASSET_PATH = this.config.assetPath;
    }
    return this.loadRenderer();
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
            onApi: (api) => this.zone.run(() => this.api.emit(api)),
          }),
        };
      } catch (error) {
        this.dom.removeChild(this.host, element);
        throw error;
      }
    });
  }
}

function definedOnly<T extends object>(props: T): ExcalidrawRenderProps {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
}
