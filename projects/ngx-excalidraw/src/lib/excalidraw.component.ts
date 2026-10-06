import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  NgZone,
  output,
  PLATFORM_ID,
  Renderer2,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { EXCALIDRAW_CONFIG } from './provide-excalidraw';
import type { ExcalidrawRendererFactory } from './renderer';
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
  readonly api = output<ExcalidrawImperativeAPI>();
  readonly loadError = output<unknown>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly dom = inject(Renderer2);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(EXCALIDRAW_CONFIG);
  private readonly loadRenderer = inject(EXCALIDRAW_RENDERER_LOADER);
  private readonly started = signal(false);
  private readonly bundle = resource({
    params: () => this.started() || undefined,
    loader: ({ abortSignal }) => this.loadBundle(abortSignal),
  });

  protected readonly mounted = computed(() => this.bundle.hasValue());

  constructor() {
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    afterNextRender(() => this.started.set(isBrowser));

    effect((onCleanup) => {
      if (!this.bundle.hasValue()) return;
      const createRenderer = this.bundle.value();
      const mountElement = untracked(() => this.mountRenderer(createRenderer));
      onCleanup(() => {
        mountElement.renderer.destroy();
        this.dom.removeChild(this.host, mountElement.element);
      });
    });

    effect(() => {
      const error = this.bundle.error();
      if (error) untracked(() => this.loadError.emit(error));
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
      const renderer = createRenderer(element, {
        onApi: (api) => this.zone.run(() => this.api.emit(api)),
      });
      renderer.render({});
      return { element, renderer };
    });
  }
}
